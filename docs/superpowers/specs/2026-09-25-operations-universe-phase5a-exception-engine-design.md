# Operations Universe Phase 5a: Canonical Overdue Rule + Exception Engine — Design

## Context

Phase 5 adds a GM exception/intelligence layer on top of everything already real (Contracts,
Work Orders, Staff/Attendance, Schedules/PPM, Customers, Contract Finance). Per the brief's own
§5, one thing must be resolved before any exception detection is built: Phase 4a's known
`scheduled_date` vs `completion_due_at` inconsistency. This document (5a) covers only the rule
fix and a centralized exception-detection engine — no new UI. 5b (TODAY/ATTENTION UI, both-way
navigation) and 5c (search integration, Attention-Only mode, morning summary) are separate,
later specs.

## Canonical overdue rule (resolved, evidence-backed)

**`completion_due_at` (and its derived `completion_sla_status`) is the sole authoritative "must
be done by" field, app-wide.** Confirmed via:
- `src/lib/fm-sla.ts:96-115` (`calculateSlaStatus`) — the one function that computes SLA
  status everywhere in the app; always takes `completion_due_at`/`response_due_at`, never
  `scheduled_date`.
- `src/lib/fm-sla.ts:60-77` — for PPM/schedule-based policies, `completion_due_at` is *derived
  from* `scheduled_date` (end-of-day), confirming `scheduled_date` is an input, not a deadline.
- A backfill migration (`20260815114952_...sql:10-16`) that explicitly set
  `completion_due_at = scheduled_date + 23:59:59` for PPM Compliance rows — historical proof of
  the same relationship.
- Every real "overdue" badge shown to a user (`fm-work-orders-list.tsx`, `work-order-dialog.tsx`,
  `work-orders-page.tsx`'s `slaOf`) reads `completion_due_at`/`completion_sla_status`.
- `scheduled_date` only ever appears as a display fallback when `completion_due_at` is null.

**The bug**: `useUniverseNodes.ts`'s `fetchScheduleItems`/`fetchScheduleCounts` (Phase 4a) query
work orders by `scheduled_date IS NOT NULL` and categorize by comparing `scheduled_date` to
today — the only place in the codebase treating `scheduled_date` as a deadline. Everywhere else
(`fetchContractConnections`'s work-order ring nodes, `fetchWorkOrderConnections`) already
correctly uses `completion_due_at`.

**Fix**: change both functions' work-order query to filter on `completion_due_at IS NOT NULL`
instead of `scheduled_date IS NOT NULL`, and categorize by comparing `completion_due_at` to
`now()` (overdue if past; "today" if its calendar date matches today; else "upcoming") instead
of the `scheduled_date` string comparison. PPM-visit categorization is unaffected — it already
correctly uses `due_date`/`planned_date`, which are genuine visit dates, not SLA deadlines.

**Real-data impact**: minimal today (only 2 real work orders have `completion_due_at` set at
all, the same 2 PPM-converted ones already shown as overdue) — this is a correctness fix for
going forward and for the exception engine to be trustworthy, not a visible behavior change
right now.

## Exception engine architecture

New file: `src/features/operations-universe/exceptions.ts`. Exports a typed model and a set of
detector functions — "the graph consumes exceptions, it does not invent them" (brief §4).

```ts
export type ExceptionSeverity = "attention" | "important" | "critical";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";

export interface OperationalException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  target: CenterEntity;
  contractId?: string;
  contractDomain?: ContractDomain;
}
```

Every exception carries its own real navigation `target` (a `CenterEntity`, reusing types
already established across Phases 1-4b — no new navigation concept) and a `reason` string built
from real fetched values, never a generic template (matching brief §12's worked examples
exactly, e.g. `"This work order requires attention because its completion due date was 23
September and it remains open."`).

### Severity — explicit rules, not judgment calls

| Exception | Severity | Rule |
|---|---|---|
| Overdue Work Order | Critical if >30 days past `completion_due_at`, else Important | Escalates with age, matching real operational risk |
| Overdue PPM | Important | Operational, not immediately financial |
| Staff attendance issue | Important | Today's real operations at risk |
| Overdue Payment | Critical | Matches the brief's own §11 example verbatim |
| Expiring Contract (≤60 days) | Attention | Advance notice, not urgent yet |
| Data Quality / Reconciliation | Attention | Explicitly NOT a business emergency per brief §24/§25 |

### Detectors (one per exception type, each independently queryable and cross-checkable)

- **`detectOverdueWorkOrders()`** — AMC + FM work orders where `completion_due_at < now()` and
  status not in (Completed, Cancelled). `target: {kind: "work-order", domain, id}`.
- **`detectOverduePpm()`** — reuses the exact existing dedup rule from Phase 4a
  (`work_order_id IS NULL`, so a converted visit never double-fires alongside its own work
  order — re-verified against live data, currently 0 real collisions). `target: {kind:
  "ppm-visit", domain, id}`.
- **`detectStaffAttendanceIssues()`** — an active employee with at least one open assigned work
  order (any domain) and no `attendance_logs` row for today. Confirmed this is the real,
  reliable trigger — "assigned work *today* specifically" isn't meaningful given how little
  real `scheduled_date` data exists. `target: {kind: "employee", id, name, position}`.
- **`detectOverduePayments()`** — reuses Phase 4b's `computePaymentStatus` verbatim, one
  exception per contract with ≥1 genuinely Overdue payment (not per-payment, to match brief
  §10's aggregation principle at the source). `target: {kind: "contract-finance", domain, id}`.
- **`detectExpiringContracts()`** — AMC + FM contracts, `status = 'Active'`, `end_date` within
  60 days. `target: {kind: "contract", domain, id}`.
- **`detectReconciliationIssues()`** — contracts (AMC only today — FM has zero payment rows)
  whose payment-schedule total diverges from `contracts.value` by more than AED 1, category
  `"data-quality"`, EXCLUDED from financial-exception counts. `target: {kind: "contract", domain,
  id}`.

### Aggregation

- **`detectAllExceptions(): Promise<OperationalException[]>`** — runs all detectors in
  parallel, returns the flat list. This is what a later phase's ATTENTION screen consumes.
- **`detectExceptionCounts(): Promise<Record<ExceptionCategory, number>>`** — a lightweight
  sibling (columns-only queries, no reason-string construction), mirroring the established
  `fetchScheduleCounts`/`fetchScheduleItems` pattern from Phase 4a, for a future TODAY hub's
  count sublabels without paying full-detail fetch cost at the app's busiest screen.
- **`groupExceptionsByContract(exceptions): Map<string, OperationalException[]>`** — groups by
  `contractId` (domain-qualified key) so a later UI can show "Contract A · 4 issues" instead of
  4 separate nodes, per brief §10. Exceptions with no `contractId` (e.g. staff attendance) are
  excluded from this grouping — they're not contract-scoped.

No exception type is invented beyond what real data supports: schedule-conflict detection is
explicitly NOT built (confirmed no time-of-day column exists on either work-order table, so it's
unprovable, not just unimplemented).

## What this document does NOT build (deferred to 5b/5c)

- Any new graph screen, node, or ring — the engine is called and verified directly (SQL
  cross-checks + manual trace-through), not through the UI yet.
- TODAY hub sublabels, the ATTENTION concept itself, entity→exception reverse navigation.
- Search integration, Attention-Only mode, morning summary text generation.

## Verification approach

Same as every prior phase — no test runner exists in this repo. `npx tsc --noEmit`, `npx
eslint`, and for each of the 6 detectors: at least one real matching record (confirming true
positives) AND at least one real non-matching record (confirming no false positives), per the
brief's own explicit §27 requirement.
