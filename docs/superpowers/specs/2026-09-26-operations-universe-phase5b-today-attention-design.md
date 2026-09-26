# Operations Universe Phase 5b: TODAY / ATTENTION UI and Exception Navigation — Design

## Context

Phase 5a built a centralized, read-only exception-detection engine (`exceptions.ts`, six
detectors + aggregation helpers) but rendered nothing — no screen consumed it. Phase 5b's job is
to visually integrate that intelligence into the existing spatial Universe: a live ATTENTION
node reachable from TODAY, progressive disclosure down to individual exceptions, navigation from
an exception into the real business entity behind it, reverse navigation (entity → its active
exceptions), a deterministic morning summary, and an "Attention Only" review mode. Strictly
read-only — no fix/assign/complete actions (that's Phase 6). No new UI is invented where an
existing pattern already covers the need; every new screen reuses the established
hub → category → item shape already used by Schedules (Phase 4a) and Contracts (Phase 1).

## Item 1: Phase 4b (6) vs Phase 5a (5) reconciliation-count discrepancy — resolved

Both checks compare `contract.value` against `sum(contract_payments.value)` for AMC contracts,
but differ in **population** and **tolerance**:

- **Phase 4b's "6"**: its "Received + Remaining ≈ Contract Value" invariant ran only over the
  **44 AMC contracts that have both a value AND at least one existing payment row**, counting
  **any nonzero delta** (no materiality threshold) — 2 contracts summed to slightly *more* than
  value (−AED 0.06, −AED 0.01, pure rounding drift from summing many small installments), 4
  summed to *less* (+AED 0.25 rounding noise, plus 3 real mismatches: AED 105, AED 1837.47, AED
  2047.5). Reported as a soft, non-enforced tendency note in the Phase 4b design doc, never
  intended as a GM-facing alert list.
- **Phase 5a's "5"** (`detectReconciliationIssues`) deliberately changes two things: (a) an
  **AED 1 tolerance** filters out the 3 trivial rounding-noise deltas, leaving the 3 genuine
  mismatches; (b) a **broader population** — all 46 AMC contracts with a non-null value
  (`LEFT JOIN` + `COALESCE(0)`), not just the 44 that already have payment rows — which adds 2
  contracts that have a real contract value but **zero payment rows scheduled at all** (Alex La
  Quinta AED 3900, Benjamin AED 3500), a data-quality gap Phase 4b's narrower population silently
  missed since its check only ran where payments already existed to sum.

Net: 6 − 3 (rounding noise, filtered by tolerance) + 2 (missing-payment-schedule contracts,
newly caught) = **5**. **Phase 5a's rule and population are confirmed correct for the GM
exception engine** — a GM alert shouldn't fire on AED 0.01–0.25 rounding drift, and a contract
with no payment schedule at all is a more urgent data-quality gap than a small sum mismatch.
Neither rule is being changed as a result of this investigation; Phase 5a's 5 stands as the
canonical figure Phase 5b's UI consumes.

## Navigation architecture

Four new `CenterEntity` variants, each its own screen, reusing the existing one-ring-per-screen
shape (`layoutAround`) and the established pattern of one `EntityKind` serving both a root and a
leaf screen (as `schedule-category` already does):

```ts
| { kind: "attention"; category: ExceptionCategory | "__root__" }
| { kind: "attention-type"; category: ExceptionCategory; title: string }
| { kind: "exception"; id: string }
| { kind: "entity-attention"; target: CenterEntity }
```

1. **ATTENTION root** (`attention`, `category: "__root__"`). Center kind `attention-hub`. Ring:
   one node per non-empty `ExceptionCategory`, sublabel = live count, → screen 2.
2. **Category screen** (`attention`, real category). Center kind `attention-category`. Ring: one
   node per distinct exception `title` within that category with count > 0 (e.g. "Overdue Work
   Orders (2)", "Overdue PPM (2)" under Operations) → screen 3. Grouped by
   `OperationalException.title`, already stable per detector — no new grouping concept invented.
3. **Exception-type screen** (`attention-type`). Center kind `attention-category` (reused). Ring:
   the actual individual exceptions of that type, each a concise node (`recordLabel` /
   `recordSublabel`, see below) → screen 4.
4. **Exception-record screen** (`exception`). Center kind `exception`. `centerDetail` = the
   Issue/Why/Severity/Affected Entity/Relevant Date/Relevant Amount/Suggested Navigation fields
   (see below), built directly from the structured `OperationalException`, never an LLM. Ring:
   **exactly one node** — the target entity, reusing its own natural kind/color — clicking it
   lands on the real, already-existing entity screen. No parallel fake entity is ever created.

**Reverse navigation** (item 10) and **contract rollup** (item 11) reuse screen 3's shape via one
more variant: `entity-attention` (center kind `attention-category`, reused again). Ring:
exceptions scoped to one real entity — via `groupExceptionsByContract` for contract-like
targets, direct `target` id-match otherwise — → screen 4. This is what a "Contract → ATTENTION
(3)" or "Employee → ATTENTION (1)" ring node on an *existing* entity screen links to.

Total new `EntityKind` render-kinds: **3** (`attention-hub`, `attention-category`, `exception`),
added to both `ICONS` and `COLORS` in the same commit (the Phase 4a gotcha — a removed/added
`EntityKind` must update both maps together).

`centerEntityKey()` gains matching cases, including a recursive case for `entity-attention`'s
nested `target` (`entity-attention:${centerEntityKey(target)}`).

## `OperationalException` extension

Two small, additive extensions to the Phase 5a model — both optional fields, so no existing
consumer (detectors, aggregators, the already-shipped code) is affected:

```ts
export interface OperationalException {
  // ...unchanged existing fields (id, category, severity, title, reason, target, contractId,
  // contractDomain)...
  recordLabel: string;        // concise per-record label, e.g. "WO-123", "Villa 77", "Shankar"
  recordSublabel?: string;    // e.g. "32 days overdue", "Payment overdue", "No attendance"
  relevantDate?: string;      // e.g. completion_due_at, payment due date, contract end_date
  relevantAmount?: number;    // e.g. total overdue AED, reconciliation delta AED
}
```

Populated directly from data each detector already fetches (`wo.wo_no`, contract `title`,
employee name, etc.) — no new queries. `recordLabel`/`recordSublabel` feed screen 3's concise
node labels (item 7 explicitly forbids cramming the full `reason` string into a graph node);
`relevantDate`/`relevantAmount` feed screen 4's context panel as structured fields rather than
parsed out of the `reason` prose (which would be fragile and against the "consume structured
data, don't invent" principle). This is a deliberate, minimal extension of the already-shipped
Phase 5a engine, not a redesign of it.

## Shared exception-data plumbing (confirmed approach)

One shared react-query cache entry, key `["operational-exceptions"]`, `staleTime` ~60s:

- `OperationsUniverse.tsx` calls `useQuery(["operational-exceptions"], detectAllExceptions)`
  directly (always enabled, not gated by `isToday`) for TODAY's live ATTENTION count, hub
  sublabels, and the morning summary.
- `useUniverseGraph` obtains `const queryClient = useQueryClient()` in its own hook body. A new
  shared helper, `appendAttentionNode(ringOne, queryClient, centerEntity)`, calls
  `queryClient.fetchQuery(["operational-exceptions"], detectAllExceptions)` (reusing the same
  cache entry — no duplicate detector runs) and, only if the entity has ≥1 matching exception,
  pushes one `attention-hub` ring node onto the already-built `ringOne` array.

`appendAttentionNode` is called from the existing if-chain branches for `contract`,
`contract-finance`, `work-order`, `ppm-visit`, and `employee` — **as a post-processing step**,
with **zero changes** to those 5 existing fetcher functions' internals
(`fetchContractConnections` etc. stay byte-for-byte untouched), minimizing regression risk on
already-shipped Phase 1–4b code. Search integration (item 21) falls out of this for free, since
search navigation targets these same `CenterEntity`s — no separate search-specific code needed.

## Visual treatment

**Severity tiers** (item 15). `UniverseNodeData` gains an optional `severity?: ExceptionSeverity`,
set only by the `exception`/`attention-type` screens' ring nodes (existing kinds never set it).
`UniverseNodeComponent` consults it when present, layered on top of the existing binary
`exception` flag:
- `attention` → thin amber border, no glow
- `important` → medium orange border, subtle glow
- `critical` → the existing red border + glow treatment (unchanged)

Edges stay exactly as they are today (binary `active`/`attention` per `layoutAround`'s existing
logic, untouched) — severity nuance is node-level only.

**The ATTENTION node** (item 3) reflects the *worst* severity present among all live
exceptions, not just the raw count: 0 exceptions → calm neutral gray ("All clear"); ≥1, none
critical → amber; ≥1 critical → the existing red tone. Count sublabel always comes live from
`detectExceptionCounts()`'s total. This same worst-severity coloring applies everywhere the
`attention-hub` kind is reused — including the reverse-navigation "ATTENTION (N)" ring nodes on
existing entity screens — not just on TODAY.

**Branch indicators** (item 4), aggregated by category (no double-counting — each exception
belongs to exactly one `ExceptionCategory` by construction):
- STAFF ← `people` count
- SCHEDULES ← `operations` count (overdue work orders + overdue PPM combined)
- CONTRACTS ← `finance` + `contracts` + `data-quality` combined

Shown as `"${n} attention"` only when count > 0; at 0 the hub keeps its current calm sublabel —
no regression to the quiet default state. These hubs get the existing `exception: true`
red-ring treatment when count > 0, reusing what's already there rather than inventing a second
"subtle" style.

**Attention Only mode** (item 13). A toggle button next to the existing Back/breadcrumb bar.
Purely a render-time transform in `OperationsUniverse.tsx` over the already-computed
`nodes`/`edges` — no new fetching: when enabled, every node/edge where `!data.exception` (and
isn't the center) drops to ~25% opacity; exception-flagged nodes/edges stay full-strength. Works
on any screen, not just ATTENTION/TODAY. A persistent "NORMAL VIEW" control exits it. Session
state only (resets on reload) — a read-only inspection aid, not a persisted setting.

## Text generation

**Exception context panel** (item 8) — the `exception` screen's `centerDetail`:
`Issue` (title) → `Why` (reason) → `Severity` (capitalized) → `Affected Entity` (target's kind +
`recordLabel`, e.g. "Work Order · WO-123") → `Relevant Date` (when set) → `Relevant Amount`
(when set, AED-formatted) → `Suggested Navigation` (target's human label, as a read-only field —
the actual clickable affordance is the screen's one ring node, matching the existing
ppm-visit/payment precedent of detail-fields-plus-one-back-link).

**Morning summary** (item 12). New pure function in a new file, `attention-summary.ts` (kept
separate from `exceptions.ts` — detection logic vs. display-text logic are different
responsibilities):

```ts
export function buildMorningSummary(
  exceptions: OperationalException[],
): { operational: string; dataQuality?: string }
```

Groups by `title` using a fixed lookup table (`"Overdue Work Order"` → "overdue work order(s)",
`"Overdue PPM"` → "overdue PPM visit(s)", `"No Attendance Recorded"` → "staff attendance
issue(s)", `"Overdue Payment"` → "contract(s) with overdue payments", `"Expiring Contract"` →
"expiring contract(s)"), joins non-zero counts into one sentence, and reports `"Payment Schedule
Mismatch"` as a **separate trailing sentence** ("Data quality: 5 payment schedules require
reconciliation.") — never merged into the operational sentence, per item 12. All-zero case
returns "Nothing requires your attention today." No LLM. Rendered as a compact banner on the
TODAY screen only.

## Files

- Modify `types.ts` — 4 new `CenterEntity` variants, 3 new `EntityKind`s, matching
  `centerEntityKey()` cases, `UniverseNodeData.severity?`.
- Modify `exceptions.ts` — add `recordLabel`, `recordSublabel?`, `relevantDate?`,
  `relevantAmount?` to the interface; populate in all 6 detectors from data already fetched.
- New `attention-summary.ts` — `buildMorningSummary`.
- Modify `useUniverseNodes.ts` — 4 new fetcher functions + 4 new branches in `useUniverseGraph`'s
  if-chain; the shared `appendAttentionNode` helper wired into the 5 existing branches with zero
  changes to those fetchers' own internals; `useUniverseGraph` gains `useQueryClient()`.
- Modify `OperationsUniverse.tsx` — TODAY becomes live (`useQuery(["operational-exceptions"],
  detectAllExceptions)`, always-on); Attention Only toggle + dim transform; morning-summary
  banner; a loading affordance scoped to just the ATTENTION node (rest of TODAY renders
  immediately, unblocked — item 18).
- Modify `UniverseNodeComponent.tsx` — 3 new `ICONS`/`COLORS` entries added together; consumes
  `severity` when present.
- `layout.ts` — unchanged.

## Regression safety and scope boundary

The riskiest change is touching the shared `useUniverseGraph` if-chain to inject
`appendAttentionNode` into 5 existing branches. Final verification explicitly re-confirms STAFF,
CONTRACTS, SCHEDULES, FINANCE, SEARCH, HISTORY, and WHY-CONNECTED all still navigate and render
exactly as before, and that no demo data returns. Everything added is a new read-only screen or
an additive read-only query — no mutation, no write action anywhere (Phase 6's job).

## Verification approach

Same established approach — no test runner in this repo. `npx tsc --noEmit`, `npx eslint`, and
for each new UI aggregation (branch-indicator counts, morning summary, category/type groupings)
a direct comparison against `detectAllExceptions()`/`detectExceptionCounts()` output, never a
reimplementation of detection logic in React (item 17). Authenticated browser verification is
not possible in this environment (no credentials) — this will be stated explicitly in the
completion report, never claimed.
