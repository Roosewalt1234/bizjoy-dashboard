import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/users.functions";
import type { AssistantContext, AssistantResponse } from "@/lib/gm-assistant/types";
import {
  INTENTS,
  findMatchingIntent,
  findIntentByName,
  getCachedIntentName,
  cacheIntentName,
  OUT_OF_SCOPE_ANSWER,
} from "@/lib/gm-assistant/intents";
import { openAiProvider } from "@/lib/gm-assistant/ai-provider";
import { openAiTranscriptionProvider } from "@/lib/gm-assistant/transcription-provider";
import { findMatchingAction, getEmployeeDisplayName, workOrderTable } from "@/lib/gm-assistant/actions";
import { verifyActionToken } from "@/lib/gm-assistant/action-tokens";

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string; context?: AssistantContext }) => input)
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    await assertAdmin(context);

    const question = data.question.trim();

    if (!question) {
      return { answer: "Ask me something about FizzFix operations.", suggestions: [] };
    }

    // Checked BEFORE the deterministic intent registry (and therefore before
    // write_action_requested, which lives inside that registry) - a matched action produces a
    // preview/confirmation token instead of an answer. Every other write-shaped phrase still
    // falls through unchanged to the existing intent registry and its own refusal/out-of-scope
    // handling below.
    const action = findMatchingAction(question);
    if (action) {
      try {
        const result = await action.buildPreview(question, data.context, context.supabase, context.userId);
        return {
          answer: result.answer,
          suggestions: result.suggestions,
          pendingAction: result.pendingAction,
          // Only stamped when a real preview was actually built from a live record read - not on
          // a refusal ("open a work order first") or a clarifying "which one do you mean?" reply.
          fetchedAt: result.pendingAction ? new Date().toISOString() : undefined,
        };
      } catch (error) {
        console.error("[gm-assistant:action] buildPreview failed", error);
        return {
          answer: "I couldn't prepare that action right now. Please try again.",
          suggestions: [],
        };
      }
    }

    let intent = findMatchingIntent(question);

    if (!intent) {
      const intentNames = INTENTS.map((definition) => definition.name);
      const cachedName = getCachedIntentName(question);
      let rawName: string;
      if (cachedName) {
        rawName = cachedName;
      } else {
        try {
          rawName = await openAiProvider.classifyIntent(
            question,
            intentNames,
            data.context?.displayLabel,
          );
        } catch {
          // A provider failure (bad model id, outage, quota, timeout) must degrade gracefully,
          // not surface a raw OpenAI error to the GM as if it were an application bug - this is
          // a distinct, honest message from OUT_OF_SCOPE_ANSWER, since the question itself may
          // well have been in scope; we just couldn't classify it right now.
          return {
            answer:
              'I\'m having trouble understanding that right now. Try rephrasing, or ask something like "What needs my attention?"',
            suggestions: [],
          };
        }
      }
      // Never trust the model's raw output as automatically safe - validate against the real,
      // known intent-name list before using it for anything.
      const resolvedName = intentNames.includes(rawName) ? rawName : "unsupported";
      if (!cachedName) cacheIntentName(question, resolvedName);

      if (resolvedName === "out_of_scope" || resolvedName === "unsupported") {
        return { answer: OUT_OF_SCOPE_ANSWER, suggestions: [] };
      }
      intent = findIntentByName(resolvedName);
    }

    if (!intent) {
      return { answer: OUT_OF_SCOPE_ANSWER, suggestions: [] };
    }

    // fetchedAt is only stamped here, on the path that actually ran a real data query - a
    // refusal or clarifying reply above never claims to reflect live data.
    const result = await intent.run(question, data.context, context.supabase);
    return {
      answer: result.answer,
      navigation: result.navigation,
      suggestions: result.suggestions,
      fetchedAt: new Date().toISOString(),
    };
  });

// ~2MB is a generous ceiling for a <=45s opus-encoded clip - the client-side recording timer
// (useVoiceRecorder.ts, a later task) is the primary, UX-visible limit; this only guards against
// a malformed or replayed request that bypassed that timer, never normal use.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { audioBase64: string; mimeType: string }) => input)
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    await assertAdmin(context);

    const audioBuffer = Buffer.from(data.audioBase64, "base64");
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error("Recording too long - please keep questions under 45 seconds.");
    }

    const start = Date.now();
    let text: string;
    try {
      text = await openAiTranscriptionProvider.transcribeAudio(audioBuffer, data.mimeType);
    } catch (error) {
      // Logged server-side for diagnosis - the client's voice hook already masks any rejection
      // from this function behind a generic "transcription failed" UI state, so a raw provider
      // error would otherwise go unobserved rather than merely unseen by the GM.
      console.error("[gm-assistant:voice] transcription provider failed", error);
      throw new Error("Transcription failed. Please try again.");
    }
    console.debug("[gm-assistant:voice] server transcribe", { ms: Date.now() - start });

    return { text: text.trim() };
  });

export const confirmAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { actionToken: string }) => input)
  .handler(async ({ data, context }): Promise<{ success: boolean; answer: string }> => {
    await assertAdmin(context);

    const verification = verifyActionToken(data.actionToken, context.userId);
    if (!verification.valid) {
      if (verification.reason === "expired") {
        return {
          success: false,
          answer:
            "This confirmation has expired because the data may have changed. Please request the action again.",
        };
      }
      return {
        success: false,
        answer: "This confirmation is no longer valid. Please request the action again.",
      };
    }
    const payload = verification.payload;
    const table = workOrderTable(payload.domain);

    try {
      const { data: current, error: fetchError } = await context.supabase
        .from(table)
        .select("id, wo_no, technician_id, status")
        .eq("id", payload.workOrderId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!current) {
        return {
          success: false,
          answer: "I couldn't find that work order anymore. Please request the action again.",
        };
      }

      const currentValue =
        payload.action === "assign_technician" ? current.technician_id : current.status;
      if (currentValue !== payload.expectedCurrentValue) {
        return {
          success: false,
          answer:
            "This work order changed since the preview. Please review the latest assignment before continuing.",
        };
      }

      const previousTechnicianId = current.technician_id;
      const woLabel = current.wo_no ?? payload.workOrderId;

      if (payload.action === "assign_technician") {
        const technicianName = await getEmployeeDisplayName(context.supabase, payload.proposedNewValue);
        const { error: updateError } = await context.supabase
          .from(table)
          .update({ technician_id: payload.proposedNewValue, technician_name: technicianName })
          .eq("id", payload.workOrderId);
        if (updateError) throw updateError;
      } else {
        const { error: updateError } = await context.supabase
          .from(table)
          .update({ status: payload.proposedNewValue })
          .eq("id", payload.workOrderId);
        if (updateError) throw updateError;
      }

      const { data: verified, error: verifyError } = await context.supabase
        .from(table)
        .select("technician_id, technician_name, status")
        .eq("id", payload.workOrderId)
        .maybeSingle();
      if (verifyError) throw verifyError;

      const succeeded =
        payload.action === "assign_technician"
          ? verified?.technician_id === payload.proposedNewValue
          : verified?.status === payload.proposedNewValue;

      if (!succeeded) {
        return {
          success: false,
          answer:
            "The update was submitted but I couldn't verify the final state. Please check the work order.",
        };
      }

      // Byte-for-byte the same side effect FM's own existing save() already performs - notify
      // the technician only when the assignment actually changed, FM only (AMC's existing UI has
      // no equivalent notification, so the Assistant doesn't invent one for AMC either).
      if (
        payload.action === "assign_technician" &&
        payload.domain === "FM" &&
        payload.proposedNewValue !== previousTechnicianId
      ) {
        context.supabase.functions
          .invoke("send-push-notification", {
            body: {
              employeeId: payload.proposedNewValue,
              title: "New work assigned",
              body: `${woLabel} - work order assignment`,
              data: { type: "fm_work_order", id: payload.workOrderId },
            },
          })
          .catch((e) => console.error("[gm-assistant:action] push notification failed", e));
      }

      const answer =
        payload.action === "assign_technician"
          ? `Done. ${verified?.technician_name ?? "The technician"} is now assigned to ${woLabel}.`
          : `Done. ${woLabel} is now marked ${payload.proposedNewValue}.`;

      return { success: true, answer };
    } catch (error) {
      console.error("[gm-assistant:action] confirmAssistantAction failed", error);
      return {
        success: false,
        answer: "Something went wrong confirming that action. Please check the work order.",
      };
    }
  });
