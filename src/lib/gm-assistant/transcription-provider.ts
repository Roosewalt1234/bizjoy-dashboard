// src/lib/gm-assistant/transcription-provider.ts
//
// Mirrors ai-provider.ts's shape: the calling code (the transcribeAudio server function) never
// depends on a specific transcription vendor or model.

export interface TranscriptionProvider {
  /** Returns the transcribed text (may be empty if no speech was detected). */
  transcribeAudio(audio: Buffer, mimeType: string): Promise<string>;
}

// OpenAI's transcription endpoint infers the audio container format primarily from the
// uploaded file's name/extension, not just its Content-Type - a fixed "clip.webm" filename
// would silently misdescribe a clip recorded in a fallback format (e.g. audio/mp4 on a browser
// that doesn't support the preferred audio/webm;codecs=opus).
function filenameFor(mimeType: string): string {
  const subtype = mimeType.split(";")[0]?.split("/")[1];
  const extension = subtype && /^[a-z0-9]+$/i.test(subtype) ? subtype : "webm";
  return `clip.${extension}`;
}

export const openAiTranscriptionProvider: TranscriptionProvider = {
  async transcribeAudio(audio, mimeType) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    // Read lazily (inside the function) rather than at module scope - this file has no
    // .server.ts suffix and is imported at the top of gm-assistant.functions.ts, which ships to
    // the client bundle, so a top-level process.env read here would run wherever the module
    // happens to be evaluated instead of only when this server-side-only function actually
    // runs. Same lazy-read convention this codebase already uses elsewhere for process.env (see
    // src/integrations/supabase/client.server.ts's Proxy, and ai-provider.ts's own MODEL read).
    //
    // File-based (not realtime/streaming) transcription model - the correct fit for "record one
    // short discrete clip, then transcribe once." Confirmed against
    // https://developers.openai.com/api/docs/models (2026-09-26).
    const model = process.env.GM_ASSISTANT_TRANSCRIBE_MODEL ?? "gpt-transcribe";

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), filenameFor(mimeType));
    form.append("model", model);

    // Shape confirmed against
    // https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
    // (2026-09-26): POST /v1/audio/transcriptions, multipart form fields `file` + `model`,
    // default (json) response body { text, languages, logprobs, usage } - we only need `text`.
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      // A provider incident with no bound would otherwise hang the whole transcribeAudio request.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Transcription request failed (${res.status}): ${text}`);
    }

    const body = (await res.json()) as { text?: string };
    return body.text ?? "";
  },
};
