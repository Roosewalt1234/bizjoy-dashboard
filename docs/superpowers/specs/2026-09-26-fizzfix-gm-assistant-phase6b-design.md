# FizzFix GM Assistant Phase 6B: Controlled Write Actions — Design

## Context

Phases 1-6A-2 shipped a fully read-only Operations Universe graph and GM Assistant (text + voice).
Phase 6B is the final phase: it adds exactly two controlled write actions to the existing,
unmodified Assistant — assign/reassign a technician on a work order, and update a work order's
status — under a strict UNDERSTAND → PREVIEW → CONFIRM → EXECUTE → VERIFY → SHOW RESULT safety
model. Every other write-shaped request (payments, contracts, invoices, deletion, bulk
operations, customer edits, messaging) remains explicitly refused. No other part of the Universe
or Assistant is redesigned.

## Investigation findings (ground truth for this design)

- **Exactly two existing write paths, no others**: AMC work orders save via
  `src/components/work-order-dialog.tsx`'s `save()` (a full-form save recomputing
  `response_sla_status`/`completion_sla_status` via `findSlaPolicy`/`calculateDueTimes`/
  `calculateSlaStatus`). FM work orders save via `saveFmWorkOrder()` in
  `src/features/fm-work-orders/fm-work-orders-api.ts` — same SLA-recompute pattern, **plus** a
  real side effect: it fetches the previous `technician_id` before writing and, if it actually
  changed, calls `supabase.functions.invoke("send-push-notification", ...)`. AMC's dialog has no
  such notification. Neither path has a narrow "just reassign" or "just update status" function —
  both are full-form saves. Phase 6B does not reuse either save() function directly (they pull
  and recompute far more than this phase's narrow scope needs); it reuses the *real business
  rules* they encode (status vocabulary, eligibility, RLS, audit, the FM notification), the same
  way every prior read-only intent reused formulas rather than UI code.
- **The exception engine does not depend on SLA-status fields.**
  `src/features/operations-universe/exceptions.ts`'s `detectOverdueWorkOrders()` and
  `detectStaffAttendanceIssues()`'s open-workload count both key off `status` directly
  (`.not("status", "in", "(Completed,Cancelled)")`) plus `completion_due_at` — never
  `completion_sla_status`/`response_sla_status`. A narrow status-only or technician-only UPDATE
  is therefore fully sufficient for the exception engine and workload counts to update correctly.
  **Decision (confirmed): the new actions do not recompute SLA-status fields.** They remain
  whatever they were until someone next opens the full edit form — a known, accepted, narrow-scope
  limitation, not a correctness bug for anything this phase touches.
- **Status vocabulary**: `src/lib/work-orders.ts` exports
  `WO_STATUS = ["Open", "Scheduled", "In Progress", "Completed", "Cancelled"] as const`, shared by
  both AMC and FM dropdowns. This exact list is reused verbatim — no invented status.
- **Technician eligibility**: both existing pickers filter `employees` by `status = 'Active'`
  only (real values: `'Active' | 'On Leave' | 'Terminated'`). A `staffing_model` column exists but
  neither existing picker filters by it, so this phase doesn't invent that restriction either.
- **No real per-date availability data exists anywhere in this codebase.** The only genuine,
  reusable "busy" signal is "does this technician currently have open (`status NOT IN
  (Completed,Cancelled)`) work orders" — the exact pattern `detectStaffAttendanceIssues()` and
  `fetchEmployeeConnections()` already use. This phase surfaces that as an informational note only
  (never blocking), and does not fabricate a date-conflict check (per the brief's own instruction).
- **RLS is already fully compatible, zero new permission code needed.** Both `work_orders` and
  `fm_work_orders` gate `UPDATE` on `app_private.can(auth.uid(), 'service', 'edit')`, defined as
  `has_role(user_id, 'admin') OR (a user_permissions grant)`. Since the Assistant is already
  admin-only end to end (`assertAdmin`, unchanged since 6A-1), every Assistant user already
  satisfies this RLS check automatically — **as long as the mutation runs through the same
  per-request, JWT-authenticated `context.supabase` client every existing intent already uses for
  reads, never a service-role client.**
- **Audit is already fully automatic.** Both tables already have `audit_work_orders`/
  `audit_fm_work_orders` triggers (AFTER INSERT/UPDATE/DELETE) calling `log_audit_event()`, which
  inserts into `audit_log` with `table_name, record_id, action, user_id (via auth.uid()),
  user_name, user_email, old_data, new_data`, timestamped. This only captures the correct user
  identity when the UPDATE runs under the real per-request client (reinforcing the point above) —
  zero new audit code or tables are needed or should be added.
- **Universe/exception refresh already has an established mechanism to reuse.**
  `OperationsUniverse.tsx:538` already calls
  `queryClient.invalidateQueries({ queryKey: ["operational-exceptions"] })` (its own manual
  refresh action). `useUniverseNodes.ts:1749` uses `queryKey: ["universe-graph",
  centerEntityKey(centerEntity)]`. TanStack Query's `invalidateQueries` matches by key **prefix**
  by default, so invalidating with just `["universe-graph"]` (no second segment) covers whatever
  entity happens to be centered, without needing to reconstruct `centerEntityKey`.

## Action registry & confirmation-token architecture

A new file, `src/lib/gm-assistant/actions.ts`, defines a small, closed registry, structurally
parallel to the existing `IntentDefinition` registry but for writes:

```ts
interface ActionDefinition {
  name: "assign_technician" | "update_work_order_status";
  matches: (question: string) => boolean;
  buildPreview: (
    question: string,
    context: AssistantContext | undefined,
    supabase: SupabaseClient<Database>,
  ) => Promise<ActionPreviewResult>;
}
```

**No new database table.** A "pending action" is encoded entirely as a signed, opaque token —
never server-stored state — because this app runs on Cloudflare Workers, where in-process memory
is not reliably shared across requests (a risk this codebase already documents explicitly in
`universe-bridge.ts`'s own comments). The token is an HMAC-SHA256-signed, base64-encoded JSON
payload:

```ts
interface PendingActionPayload {
  action: "assign_technician" | "update_work_order_status";
  domain: "AMC" | "FM";
  workOrderId: string;
  expectedCurrentValue: string | null;   // technician_id, or status
  proposedNewValue: string;              // technician_id, or status
  userId: string;
  issuedAt: number;                      // epoch ms
  expiresAt: number;                     // epoch ms, issuedAt + 120_000
}
```

Signed with one new server-only env var, `GM_ASSISTANT_ACTION_SECRET`, via Node's `crypto` module
(available under Cloudflare's `nodejs_compat`, already relied on elsewhere in this file for
`Buffer`). If unset, action requests refuse gracefully with a clear message rather than throwing —
the same pattern already used for a missing `OPENAI_API_KEY`. Expiry is 120 seconds: short enough
to guard against stale state, long enough for a human to read the preview and tap Confirm.

**Two server functions**, both added to the existing `src/lib/gm-assistant.functions.ts`,
both admin-gated exactly like `askAssistant`/`transcribeAudio`:
- `askAssistant` (its own logic unchanged) — when a matched `ActionDefinition` fires instead of a
  read-only `IntentDefinition`, its result carries a `pendingAction` (token + human-readable
  preview) instead of computing an answer from live data.
- A new `confirmAssistantAction({ actionToken: string })` — the **only** function that can ever
  write. It accepts nothing but the token string. It: verifies the HMAC signature and expiry,
  verifies the token's `userId` matches the authenticated caller, re-fetches the work order's
  current `technician_id`/`status`, compares it against `expectedCurrentValue` (rejecting with a
  "changed since preview" message on mismatch), writes only the one proposed column via the
  per-request authenticated client (so RLS and the existing audit trigger apply automatically),
  re-fetches once more to verify the write landed, and only then reports success.

**Cancel is 100% client-side.** It discards the token from local widget state and never calls
`confirmAssistantAction` — zero network requests, trivially satisfying "Cancel must perform zero
writes." The token is never persisted or re-surfaced as text the GM could resubmit; it lives only
inside a button's `onClick` closure for that one rendered message.

## The two action definitions

**`assign_technician`** — matches phrasings like "assign X to this", "reassign to X", "change
technician to X" via deterministic regex (same style as `intents.ts`'s existing matchers).
Requires `context.centerEntity.kind === "work-order"` (the same requirement `work_order_assignee`
already uses) — otherwise: *"Open a work order first, then ask me to assign someone to it."*

The extracted name is matched against `employees` filtered by `status = 'Active'` (the exact
existing eligibility rule, no invented skill/staffing-model filtering). Zero matches → *"I
couldn't find an active employee named X."* Multiple matches → the same "which one do you mean?"
clarifying pattern `focus_entity_by_name` already uses, with suggestion chips, zero write. Exactly
one match → read the work order's real domain table (`work_orders` or `fm_work_orders`) for its
current `technician_id`/`technician_name`, and build:

```
Proposed Change
Work Order: WO-123
Current Technician: Shankar
New Technician: Sameer
```

(`— unassigned —` if none.) If the resolved employee already has open (`status NOT IN
(Completed,Cancelled)`) work orders — the one real reusable signal — a soft, informational,
never-blocking note is appended: *"Sameer already has 2 open work orders."*

**`update_work_order_status`** — matches phrasings like "mark this complete/done", "reopen this",
"cancel this job", "mark this in progress", mapped deterministically to the exact existing
`WO_STATUS` values, never an invented status. Same work-order-context requirement. Preview:

```
Proposed Change
Work Order: WO-123
Current Status: Open
New Status: Completed
```

Requesting the status the work order already has is rejected before ever building a token:
*"WO-123 is already marked Completed."*

**Execution.** Neither action recomputes SLA fields (see Decision above) — each is a narrow
one-or-two-column `UPDATE` via the authenticated per-request client. For `assign_technician` on
an **FM** work order only, execution also fetches the previous `technician_id` first and, if it
actually changed, invokes the exact same `send-push-notification` call FM's own UI already makes
— not a new side effect, the existing one. AMC assignment triggers nothing extra, matching AMC's
existing UI exactly.

## Widget UI, voice behavior, verification, and refusal routing

**Preview card.** `AssistantResponse` gains an optional
`pendingAction: { token: string; preview: string; actionLabel: string }`. In `GmAssistant.tsx`, a
message carrying `pendingAction` renders as a visually distinct card (border + light background,
not a plain chat bubble) with the preview text and **Confirm**/**Cancel** buttons, matching the
widget's existing inline-style convention. Only the most recent pending action is "live"; either
button clears it from state.

**Voice.** No new code needed — voice already reduces to the same `send(text)` path established
in 6A-2, so a spoken action request naturally produces the same preview card and never executes
by itself. Confirm is always the visible button tap; this phase does not build voice confirmation.

**Confirm outcomes:**
- **Success**: *"Done. Sameer is now assigned to WO-123."* — said only after the post-write
  re-fetch confirms the change actually landed.
- **Stale state**: *"This work order changed since the preview. Please review the latest
  assignment before continuing."* — zero write; a fresh preview is required.
- **Expired/invalid token**: *"This confirmation has expired because the data may have changed.
  Please request the action again."*
- **Verification failure** (write attempted but the post-write re-fetch doesn't show the expected
  value): *"The update was submitted but I couldn't verify the final state. Please check the work
  order."* — never claims success it can't confirm.

**Universe/exception refresh.** After a verified success, `GmAssistant.tsx` (already inside the
same `QueryClientProvider` as the rest of the app) calls
`queryClient.invalidateQueries({ queryKey: ["operational-exceptions"] })` and
`queryClient.invalidateQueries({ queryKey: ["universe-graph"] })` — reusing the exact invalidation
call `OperationsUniverse.tsx` already makes elsewhere, not a new mechanism. The centered entity
does not change, so the GM stays on the same work order while the graph refetches around them.

**Refusal routing.** The two `ActionDefinition` matchers are checked before the existing
`write_action_requested` intent (the same specific-before-broad ordering discipline 6A-1 already
uses). Anything not matching one of these two exact patterns still hits the existing blanket
refusal, unchanged. Confirmation itself never goes through intent-matching or the AI classifier —
it is a dedicated button calling a dedicated server function accepting only an opaque token, so
there is no path from model output (or from untrusted work-order text) to capability.

## Files

- New: `src/lib/gm-assistant/actions.ts` (action registry, token sign/verify, preview builders)
- Modify: `src/lib/gm-assistant/types.ts` (`pendingAction` field on `AssistantResponse`)
- Modify: `src/lib/gm-assistant/intents.ts` (route the two action patterns before
  `write_action_requested`; no change to any other intent)
- Modify: `src/lib/gm-assistant.functions.ts` (add `confirmAssistantAction`)
- Modify: `src/features/gm-assistant/GmAssistant.tsx` (preview card UI, Confirm/Cancel, Universe
  invalidation on success)
- New env var: `GM_ASSISTANT_ACTION_SECRET` (server-only, HMAC signing key for pending-action
  tokens)

## Verification approach

No test runner in this repo (consistent with every prior phase): `npx tsc --noEmit`, `npx eslint`,
`npm run build`, plus a manual trace-through of acceptance scenarios A-H from the brief, and a
final grep-based security review confirming only the two approved mutation columns are ever
written, no arbitrary table/field/SQL is reachable from model output, and every mutation requires
both server auth and a valid confirmation token. Two things cannot be verified in this
environment: real authenticated browser mutation testing and a live confirmation round-trip
against the real database (no login credentials here) — both will be stated explicitly as known
limitations in the completion report, never claimed as done.
