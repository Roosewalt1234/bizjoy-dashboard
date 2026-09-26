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
