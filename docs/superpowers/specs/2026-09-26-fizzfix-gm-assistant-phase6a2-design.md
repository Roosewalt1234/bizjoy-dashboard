# FizzFix GM Assistant Phase 6A-2: Tap-to-Talk Voice — Design

## Context

Phase 6A-1 shipped a private, read-only, admin-gated GM Assistant with a working text
pipeline: `GmAssistant.tsx` (draggable widget) → `askAssistant` server function → deterministic
intent registry / OpenAI intent-classification fallback → real FizzFix data → answer +
validated navigation command. Phase 6A-2 adds tap-to-talk voice *input* on top of that pipeline
— it is explicitly not a second assistant. Voice only changes how the question text is
produced; every question, spoken or typed, is resolved by the exact same `askAssistant` call,
the same intent registry, the same navigation-command validation, and the same write-action
refusal.

**Explicitly out of scope for 6A-2** (per the brief): speech output/TTS, always-on/wake-word
listening, meeting transcription/archiving, any voice-specific navigation shortcut, any change
to `askAssistant`, `intents.ts`, or the navigation-command union.

## Model configuration (approved: keep `gpt-6-luna`, verified live)

The brief's premise — that `gpt-6-luna` should be replaced by `gpt-5.6-luna` — does not hold up
against OpenAI's current live documentation, checked directly for this phase (not assumed from
training data): both models are real, but `gpt-5.6-luna` is the **older** (Feb 2026) and **more
expensive** ($0.20/$1.20 per MTok) of the two, while `gpt-6-luna` (May 2026, $0.10/$0.50 per
MTok, already in use since 6A-1) remains the correct choice on both cost and recency grounds. The
model is **not** changed. The other half of the brief's instruction — make it configurable
rather than hardcoded — is adopted regardless of which model wins:

```ts
// src/lib/gm-assistant/ai-provider.ts
const MODEL = process.env.GM_ASSISTANT_TEXT_MODEL ?? "gpt-6-luna";
```

**Transcription model (verified live):** `gpt-transcribe` — OpenAI's file-based (not
realtime/streaming) transcription model, the correct fit for "record one short discrete clip,
then transcribe once" rather than continuous streaming. Confirmed endpoint:
`POST https://api.openai.com/v1/audio/transcriptions`, multipart form fields `file` + `model`,
response `{ text: string }`, pricing $0.0045/minute. Also configurable, not hardcoded:

```ts
const MODEL = process.env.GM_ASSISTANT_TRANSCRIBE_MODEL ?? "gpt-transcribe";
```

## No second assistant architecture

Voice contributes exactly one new capability: turning a short audio clip into text. That text is
handed to the *existing*, unmodified `send(question: string)` function already in
`GmAssistant.tsx`, which already displays it as a user chat bubble and already calls
`askAssistant({ question, context: universeContext })`. Concretely:

```
[Browser: MediaRecorder captures audio]
        ↓ (tap Stop)
[Browser: base64-encode the clip]
        ↓
[Server: transcribeAudio({ audioBase64, mimeType }) → { text }]   ← NEW, standalone
        ↓
[Browser: send(text)]                                              ← EXISTING, untouched
        ↓
[Server: askAssistant({ question: text, context })]                ← EXISTING, untouched
        ↓
[Existing intent registry → real data → answer/navigation]         ← EXISTING, untouched
```

This structurally guarantees items 13/14/19/20 of the brief (identical navigation protocol,
identical context resolution, identical write-action refusal, zero special trust for
transcribed text) — there is no code path where transcribed text is treated differently from
typed text, because after the moment `transcribeAudio` returns, it *is* typed text as far as the
rest of the system is concerned.

## Audio transport (approved: base64 inside the existing `createServerFn` contract)

`createServerFn`'s `.inputValidator` only accepts JSON-serializable input — no native multipart
support. Rather than standing up a separate multipart-accepting route (a second auth/admin-gate
surface to maintain, and a deviation from every other server call in this codebase), the short
clip (bounded to 45 seconds, see below — realistically tens of KB to low hundreds of KB of
opus-encoded audio) is base64-encoded client-side and sent as a plain string field, matching how
every other `askFn`/server-fn call in this app already shapes its input:

```ts
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { audioBase64: string; mimeType: string }) => input)
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    await assertAdmin(context);
    const audioBuffer = Buffer.from(data.audioBase64, "base64");
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error("Recording too long — please keep questions under 45 seconds.");
    }
    const text = await transcriptionProvider.transcribeAudio(audioBuffer, data.mimeType);
    return { text: text.trim() };
  });
```

`MAX_AUDIO_BYTES` is a generous byte ceiling consistent with 45 seconds of opus audio (defense
in depth only — the client-side timer described below is the primary, UX-visible limit; this
guards against a modified/replayed request, not normal use).

## Transcription abstraction

New file, `src/lib/gm-assistant/transcription-provider.ts`, mirroring `ai-provider.ts`'s existing
shape so the component/server-function code never depends on a specific model or vendor:

```ts
export interface TranscriptionProvider {
  transcribeAudio(audio: Buffer, mimeType: string): Promise<string>;
}

export const openAiTranscriptionProvider: TranscriptionProvider = {
  async transcribeAudio(audio, mimeType) {
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mimeType }), "clip.webm");
    form.append("model", MODEL);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
    const body: { text?: string } = await response.json();
    return body.text ?? "";
  },
};
```

Plain `fetch`, no SDK — the same deliberate choice 6A-1 made for `ai-provider.ts` (edge-runtime
safe under Cloudflare Workers' `nodejs_compat`, zero new dependency). `OPENAI_API_KEY` is reused
from 6A-1 (same provider, same secret) — no new env var for the key itself, only for the two
model-name overrides above.

## Audio capture

New hook, `src/features/gm-assistant/useVoiceRecorder.ts`, wrapping the native `MediaRecorder`
API (zero new dependency). State machine:

```
idle → requesting-permission → listening → stopping → done
                              ↘ canceled            ↗
                              ↘ error (permission-denied | unsupported | transcription-failed)
```

- **Permission/support check happens before ever prompting the OS.** Unsupported
  (`!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined"`) is detected
  first and never attempts `getUserMedia`. A genuine `getUserMedia` rejection is treated as
  permission-denied.
- **Format:** `audio/webm;codecs=opus` via `MediaRecorder.isTypeSupported`, falling back to the
  browser's default supported type if unavailable.
- **In-memory only.** Chunks accumulate in an array via `ondataavailable`; nothing is written to
  disk, IndexedDB, or Supabase storage at any point. On `cancel()`, tracks are stopped, the chunk
  array is discarded, and the hook resets to `idle` with **zero network request** — satisfying
  item 8 exactly.
- **Max duration: 45 seconds** — the documented midpoint of the brief's own "30-60 seconds"
  guidance for short GM questions ("this is NOT a meeting recorder"). Enforced primarily
  client-side via a timer that auto-triggers Stop at 45s (visible countdown in the UI, see
  below); the server's `MAX_AUDIO_BYTES` check is defense-in-depth only, not the primary
  mechanism.

## Widget UI states

`GmAssistant.tsx` gains a mic button (`lucide-react`'s `Mic`/`Square`/`Loader2` — already a
project dependency, no new package) in the existing input row, and a status strip above that row
that is invisible in the idle state (today's layout is unchanged when voice isn't active):

| Hook state | Status strip | Mic button |
|---|---|---|
| `idle` | (hidden) | `Mic` icon, tappable |
| `requesting-permission` | (hidden, brief) | `Mic` icon |
| `listening` | "🔴 Listening…" + **Stop** + **Cancel** | `Square` icon (tap = Stop) |
| `stopping`/transcribing | "Transcribing…" | `Loader2` spinner, disabled |
| `error: transcription-failed` (network/API failure, or an empty/whitespace transcript) | short message + **Try Again** (→ `idle`) | `Mic` icon |
| `error: permission-denied` | *"Microphone access is blocked. You can enable it in your browser settings or type your question."* | `Mic` icon (each tap re-attempts, since the browser setting may since have changed) |
| `error: unsupported` | *"Voice input isn't supported on this device/browser. You can still type your question."* | not rendered at all (feature-detected up front, so no dead button is ever shown) |

**Transcript preview (item 12):** once `transcribeAudio` resolves, its text is passed straight
into the existing `send(text)`, which already renders it as a user chat bubble *before* calling
`askAssistant` — no new rendering path needed, this is a direct consequence of the "no second
assistant architecture" decision above.

**Processing indicator.** 6A-1 has no visible state between submit and answer (just a disabled
input) — the brief's own explicit state list now calls out "Processing" by name, so a small
"Thinking…" bubble is added, shown whenever `sending` is true. This reuses the exact existing
`sending` boolean and benefits typed questions too; it is not a new mechanism.

**Mobile.** No new responsive work needed: `GmAssistant.tsx` already renders its panel as a
bottom `Sheet` on mobile (`useIsMobile`), so the mic button/status strip live inside that
existing sheet. The mic flow never focuses the text `<input>`, so no software keyboard appears
during listening. All controls are plain tap targets — no hover dependency anywhere.

## Latency instrumentation (approved: console.debug only, never in the UI or response payload)

Extends 6A-1's implicit `fetchedAt`-only signal into a per-stage breakdown, logged, never
returned to the client as data or rendered:

- Client: `console.debug("[gm-assistant:voice] capture", { ms })` — recording start → stop.
- Client: `console.debug("[gm-assistant:voice] transcribe", { ms })` — `transcribeAudio` round
  trip.
- Client: `console.debug("[gm-assistant:voice] total", { ms })` — mic tap → `send()`'s promise
  resolving (spans transcription + the existing `askAssistant` call).
- Server: `transcribeAudio`'s handler logs its own provider-call duration the same way.

This is strictly additive logging around existing calls — no new state, no new response fields.

## Cost control

45-second client-side cap (see above) is the primary cost control, chosen because it is
generous enough for any realistic GM question ("What needs my attention?", "Who's on-site at
Park View 48 today?") while remaining clearly incompatible with recording a meeting. The server's
byte-size ceiling exists only to reject a malformed/replayed request that bypassed the client
timer, not as a normal-use limit.

## Preserved from 6A-1 (unchanged)

- Admin-only gating (`assertAdmin`, server-enforced).
- The write-action refusal pseudo-intent, checked before any AI call.
- The 5-member `NavigationCommand` union and its server-side validation.
- The out-of-scope refusal and prompt-injection framing.
- `OPENAI_API_KEY` handling: unprefixed, server-only, read via `process.env` inside the
  transcription provider — never sent to or readable from the browser.

## Files

- Modify: `src/lib/gm-assistant/ai-provider.ts` (env-configurable `MODEL`)
- New: `src/lib/gm-assistant/transcription-provider.ts`
- Modify: `src/lib/gm-assistant.functions.ts` (add `transcribeAudio`)
- New: `src/features/gm-assistant/useVoiceRecorder.ts`
- Modify: `src/features/gm-assistant/GmAssistant.tsx` (mic button, status strip, Thinking…
  indicator, wiring `useVoiceRecorder`'s transcript into the existing `send()`)
- New env vars: `GM_ASSISTANT_TEXT_MODEL` (server-only, optional), `GM_ASSISTANT_TRANSCRIBE_MODEL`
  (server-only, optional) — both fall back to the values above when unset; no new secret (reuses
  `OPENAI_API_KEY`)

## Verification approach

No test runner in this repo (consistent with every prior phase): `npx tsc --noEmit`,
`npx eslint`, `npm run build`, plus a manual trace-through of acceptance scenarios A-G from the
brief. Two things genuinely cannot be verified in this environment: a live microphone/OpenAI
transcription call and authenticated browser testing (no credentials available here) — both will
be stated explicitly as known limitations in the completion report, never claimed as done. The
built client bundle will be grepped for the literal secret env var names as a final check that no
credential leaked into browser-shipped code.
