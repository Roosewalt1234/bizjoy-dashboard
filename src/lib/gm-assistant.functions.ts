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

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string; context?: AssistantContext }) => input)
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    await assertAdmin(context);

    const question = data.question.trim();

    if (!question) {
      return { answer: "Ask me something about FizzFix operations.", suggestions: [] };
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
