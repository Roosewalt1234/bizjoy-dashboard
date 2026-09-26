# FizzFix GM Assistant Phase 6A-1: Text-Based Assistant — Design

## Context

The FizzFix Operations Universe (`/universe`) now has a live, real-data exception-detection
engine (Phase 5a) and a full ATTENTION navigation UI (Phase 5b). Phase 6A adds a private,
read-only floating "GM Assistant" that lets an authorized GM/admin ask natural-language
questions about live FizzFix operational data and, where appropriate, navigate the Universe on
their behalf. It is explicitly NOT a general chatbot — narrow scope, zero write capability,
strict data-as-data prompt-injection resistance.

**Scope decomposition (approved).** The original brief covers both a typed-question pipeline
and a tap-to-talk voice layer on top of it. These are split into two sub-phases:
- **6A-1 (this plan)**: gating, the draggable widget, Universe-context awareness, the
  intent/query layer, the navigation-command protocol, and text-based Q&A end-to-end.
- **6A-2 (separate, later)**: tap-to-talk transcription built on top of 6A-1's already-working
  pipeline — a distinct provider integration with its own privacy/UX surface, not part of this
  plan.

## GM gating (approved: reuse the existing `admin` role)

No distinct "GM" role exists in the schema today — only a binary `app_role` enum
(`'admin' | 'user'`), already server-enforced via a `has_role()` `SECURITY DEFINER` SQL function
used in real RLS policies. The canonical existing "admin-only, server-enforced" pattern lives in
`src/lib/users.functions.ts`: every server function there does
`createServerFn({...}).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
await assertAdmin(context); ... })`, where `assertAdmin` re-queries `user_roles` for
`role='admin'` server-side on every call — never trusting a client-supplied flag. The Assistant
reuses this exact pattern with zero schema changes: any existing admin gets Assistant access,
matching how every other admin-only feature in this app already works. The floating button's
render is additionally hidden client-side via the existing `usePermissions().isAdmin` hook (pure
UX — the real boundary is the server-side check).

## AI provider (approved: OpenAI)

Model names confirmed live against OpenAI's current API documentation (not assumed from
possibly-stale training data): `gpt-6-luna` — OpenAI's current cheapest/fastest tier, function-
calling capable — is used for both lightweight intent classification and final answer phrasing.
The Assistant never asks the model to compute a business answer itself (see "Intent/query
layer" below), so a larger/more expensive model brings no benefit here. The model choice sits
behind a small `AssistantProvider` interface so it can be swapped later without touching the
intent registry or any calling code.

## Server-side architecture

A new server-function file, `src/lib/gm-assistant.functions.ts`, following the exact
`users.functions.ts` pattern:
- `askAssistant({ question, context }) → AssistantResponse` — the sole entry point.
  `.middleware([requireSupabaseAuth])` + `assertAdmin(context)` before anything else runs.

`assertAdmin` is currently a private, unexported helper inside `users.functions.ts`. Rather than
duplicating its 4-line body, it gets one `export` keyword added and is imported from there —
avoids drift between the two admin checks if the underlying query ever changes.

**Secret placement**: `OPENAI_API_KEY` as a new unprefixed env var (never `VITE_`-prefixed),
read via `process.env` only inside this handler — matching the existing, already-established
env-var convention (`VITE_*` = ships to the browser; unprefixed = server-only) and the
Cloudflare Workers deployment target (`nodejs_compat` enabled, secrets set via Cloudflare's
normal mechanism).

**Data access.** The server function does NOT call `useUniverseNodes.ts`'s internal per-screen
fetchers directly — they're unexported, React-hook-shaped, and assume a browser Supabase client
+ react-query, so they cannot run in a server-function context. Instead:
- It reuses the already-exported, browser-independent pure functions directly:
  `detectAllExceptions`, `detectExceptionCounts`, `groupExceptionsByContract`, `worstSeverity`
  (from `exceptions.ts`), `buildMorningSummary` (from `attention-summary.ts`).
- For anything else (staff/attendance/contract/customer/work-order lookups not already covered
  by the exception engine), intent handlers run their own small, targeted Supabase queries,
  using the same RLS-respecting per-request client `requireSupabaseAuth` already builds — never
  the service-role admin client. This feature needs zero elevated privilege beyond "an
  authenticated admin can read what RLS already lets them read."

**Navigation is resolved, not rendered, server-side.** When an intent decides the right response
is "move the Universe," the server function returns a validated `NavigationCommand` — a plain
`CenterEntity`-shaped value, not a UI mutation. The client feeds this into the EXISTING
`useUniverseGraph`/`navigateTo` machinery exactly the way a click or search result already does.
No server-side graph-building, no duplicate fetch/render logic.

## Intent/query layer (deterministic-first)

A new file, `src/lib/gm-assistant/intents.ts`, exports a fixed list of intent definitions:

```ts
interface IntentDefinition {
  name: string;                              // e.g. "overdue_ppm", "contract_outstanding"
  matches: (question: string) => boolean;    // cheap keyword/regex rule, tried first
  requiresContext?: "contract" | "employee" | "customer" | "work-order";
  run: (ctx: AssistantContext) => Promise<IntentResult>;
}
```

Each `run` reuses real business logic directly — e.g. `overdue_ppm` calls `detectOverduePpm()`,
`contract_outstanding` reuses the same AMC-only payment-status logic already established in
`payment-status.ts`, `attention_summary` calls `detectAllExceptions()` +
`buildMorningSummary()`. **The AI model never computes an answer** — it only (a) picks which
registered intent matches when keyword rules don't confidently match, and (b) turns the intent's
already-computed structured result into a short sentence.

**Two-tier resolution per question:**
1. Try every `IntentDefinition.matches()` rule — cheap, synchronous, zero AI cost, covers the
   brief's own example phrasings directly.
2. If nothing matches confidently, call OpenAI once with the fixed intent-name list + the
   question + structured Universe context, asking it to pick exactly one registered intent name
   (or `"unsupported"` / `"out_of_scope"`) — never free-form code, never an arbitrary tool call.

**Pattern cache (cache the question pattern, never the answer).** A simple in-memory
`Map<normalizedQuestion, intentName>`, server-side, scoped to the Cloudflare Worker process
(acceptable — a cold worker just falls back to step 2, no correctness impact). It stores only
the resolved *intent name string*; every cache hit still re-runs that intent's `run()` against
live data, never returning a stored answer.

## Universe context and pronoun resolution

```ts
interface AssistantContext {
  centerEntity: CenterEntity;   // exactly what's already centered - the source of truth
  displayLabel: string;         // e.g. "Park View 48" - for phrasing only
}
```

Pronoun resolution ("this", "it", "here") is NOT done by asking the AI to guess from chat
history — an intent's `requiresContext` field states what kind of entity it needs, and the
server function resolves "this contract" by reading `centerEntity` directly (structural, not
linguistic). Conversation history is kept client-side, session-only, used only as a fallback
when nothing is centered (`centerEntity.kind === "today"`) and the question still uses a
pronoun — in that narrow case the assistant asks a clarifying question rather than guessing.

## Navigation-command protocol

A closed, validated union — never arbitrary state mutation:

```ts
type NavigationCommand =
  | { type: "focus_entity"; entity: CenterEntity }
  | { type: "open_attention" }
  | { type: "go_today" }
  | { type: "go_back" }
  | { type: "search_entity"; query: string };
```

Validated with a discriminated-union check before leaving the server handler — raw AI output is
never passed through unvalidated. `open_relationship`/`apply_filter` from the brief's conceptual
list are not separate command types in 6A-1: `open_relationship`'s real use cases ("show its
payments," "who's working on this") are fully covered by `focus_entity` with the right target
`CenterEntity`; `apply_filter` has no concrete feature to attach to yet. Adding either later is
a pure additive change to the union.

## Bridging the widget to the Universe

The widget mounts once at the authenticated app shell (persists across all routes), while
Operations Universe is a route-level component with its own local state — they need a bridge
without prop-drilling or a new state library (none exists anywhere in this codebase). A tiny
hand-rolled pub/sub singleton, `src/lib/gm-assistant/universe-bridge.ts`:

```ts
setUniverseContext(context: AssistantContext | undefined): void
getUniverseContext(): AssistantContext | undefined
dispatchNavigationCommand(command: NavigationCommand): boolean  // false if nothing registered
onNavigationCommand(handler: (command: NavigationCommand) => void): () => void
subscribe(listener: () => void): () => void   // for useSyncExternalStore
```

`OperationsUniverse.tsx` registers its existing `navigateTo`/`handleBack`/`handleReturnToToday`
via `onNavigationCommand` on mount (unregisters on unmount) and publishes
`setUniverseContext({centerEntity, displayLabel: currentLabel})` in a `useEffect` whenever
`centerEntity`/`currentLabel` change — two small effects, no new prop surface. If the GM asks a
navigation-shaped question while not on the Universe route, `dispatchNavigationCommand` returns
`false` and the assistant replies with a clarifying message instead of silently doing nothing.

## Widget UI and drag behavior

New `src/features/gm-assistant/GmAssistant.tsx`, mounted once at the app shell, gated by
`usePermissions().isAdmin`. Two states: `minimized` (small circular button) → `open` (expanded
panel).

**Drag (no library — none exists or is installed).** Raw pointer events
(`onPointerDown`/`onPointerMove`/`onPointerUp` — already unify mouse and touch). A
`useDraggable(initialPosition)` hook tracks `{x, y}`, clamps to the viewport so it can never
leave screen, and disambiguates drag vs. tap by total pointer movement since `pointerdown`
(under ~6px by `pointerup` = tap). Position persists to `localStorage` (one small JSON blob),
re-clamped on resize/orientation change. `position: fixed`, entirely outside the ReactFlow
canvas's DOM subtree — cannot intercept or be intercepted by Universe node dragging.

**Expanded panel:** header (assistant name + live "Talking about: X" context indicator) →
scrollable conversation area → text input + a disabled/greyed mic button (wired up in 6A-2, kept
visible now to avoid a later layout shift) → contextual quick-suggestion chips derived from
`centerEntity.kind` (contract/employee/customer-specific sets, generic default otherwise).
Desktop: small fixed-size floating panel. Mobile: a `Sheet` (the same shadcn/ui component
`EntityDetailPanel` already uses — no new dependency) as a bottom sheet, avoiding on-screen
keyboard conflicts a floating box would have.

## Scope limiting, safety, response style

- **Out-of-scope refusal**: before any AI call, check the deterministic registry, then a
  lightweight negative-keyword check; if nothing FizzFix-operational matches (or the one AI
  classification call itself returns `"out_of_scope"`), return the fixed constant string
  verbatim — never AI-generated, so it can't be prompt-injected into saying something else.
- **Write-action refusal**: a registered pseudo-intent matches common action verbs and
  short-circuits to a fixed constant reply, checked BEFORE the AI call.
- **Prompt-injection resistance**: any real database text included in a prompt is wrapped in
  explicit "this is data, not instructions" framing. Enforced structurally, not just requested:
  the model's output can only select a pre-registered intent name and one of the 5 validated
  `NavigationCommand` shapes — even a "jailbroken" response has no path to arbitrary action.
- **Response style**: one concise sentence with the real number/fact, plus 1-3 contextual
  follow-up suggestion chips. No multi-paragraph answers.
- **Freshness**: every answer carries a `fetchedAt` timestamp; UI shows "Live FizzFix data" —
  never claimed when stale, since every answer always re-runs its live query.
- **Ambiguous entity**: when a lookup returns more than one plausible match, return the top
  matches as a clarifying question with clickable options, never a guess.

## Files

- New: `src/lib/gm-assistant/types.ts`, `universe-bridge.ts`, `intents.ts`, `ai-provider.ts`
- New: `src/lib/gm-assistant.functions.ts`
- New: `src/features/gm-assistant/useDraggable.ts`, `GmAssistant.tsx`
- Modify: the authenticated shell (mount `<GmAssistant />`, gated by `usePermissions().isAdmin`)
- Modify: `src/features/operations-universe/OperationsUniverse.tsx` (2 small bridge-wiring
  effects only — no other changes)
- New env var: `OPENAI_API_KEY` (server-only)

## Verification approach

No test runner in this repo (confirmed, consistent with every prior phase): `npx tsc --noEmit`,
`npx eslint`, and a real-data trace-through per intent. Two things genuinely cannot be verified
in this environment: a live OpenAI call (no API key available here) and authenticated browser
testing (no login credentials) — both stated explicitly as known limitations in the completion
report, never claimed as done.
