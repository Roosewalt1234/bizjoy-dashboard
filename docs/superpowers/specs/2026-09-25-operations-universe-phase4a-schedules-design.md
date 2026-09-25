# Operations Universe Phase 4a: Real Schedules/PPM — Design

## Context

Phase 4's brief has two objectives: (A) replace the SCHEDULES branch's fictional `DEMO_JOBS`
data with real schedule/PPM data, and (B) add a real Contract Financial Position. Per the
user's confirmed decisions, these ship as separate sub-phases — **this document is 4a
(Schedules) only**; Contract Financial Position is 4b, a separate spec/plan.

## Grounding: what the real schema actually supports

Verified live against project `evcaehadjzoxtdlnmehk` and this codebase's existing code, not
assumed:

- **PPM data is sparse and entirely FM-side**: `ppm_visits` (FM, FK → `fm_contracts`) has 12
  rows, all for one contract ("Park View 48"), all under one of that contract's 6
  `ppm_schedules` rows. `amc_ppm_visits` (AMC, FK → `contracts`) has **0 rows** — completely
  unpopulated. Status values: `Planned` (10) and `Converted` (2). `due_date` mirrors
  `planned_date` exactly in every sampled row. `assigned_team`/`completed_by_employee_id` are
  **null on all 12 rows** — there is no reliable way to attribute an unconverted PPM visit to
  an employee.
- **Work orders' `scheduled_date` is barely populated**: only 2 of ~38 `fm_work_orders` rows
  have a non-null `scheduled_date`, and both are the same 2 rows already `Converted` from
  `ppm_visits` (linked via `ppm_visits.work_order_id`). AMC `work_orders` has 1 row total,
  `scheduled_date` null. **A schedule view spanning both PPM visits and work orders must
  exclude any PPM visit whose `work_order_id` is set** — its work order already represents it;
  counting both would double-count exactly these 2 real items.
- **An existing page already solves this exact categorization** — `src/routes/_authenticated/
  fm-daily-operations.tsx` computes "due today / due this week / overdue" for PPM visits via
  `ppmDate(v) = v.due_date ?? v.planned_date`, excluding `["Completed","Closed","Verified"]`
  statuses. This document reuses that exact date-derivation logic, with one deliberate
  refinement: it additionally excludes any visit with a non-null `work_order_id` (matching the
  double-counting concern above) rather than relying solely on the status field, since
  `"Converted"` is not in that page's own done-list and would otherwise double-count the 2 real
  converted visits alongside their spawned work orders.
- **Real overdue count today: 2** (one PPM visit, `planned_date`/`due_date` 2026-08-01; the 2
  converted-to-work-order items, which are also schedule-overdue by `scheduled_date`). **Real
  upcoming count: 8** (the remaining `Planned` PPM visits, dated out to 2027 — small enough
  that no sub-grouping by time window is needed, same reasoning already applied to not
  paginating Contracts' 46-row AMC category).
- **"Unassigned" is not a meaningful category**: since `assigned_team`/`completed_by_employee_id`
  are null on 100% of real PPM visits, every visit would fall into it — it wouldn't distinguish
  anything. Not built, per the brief's own "don't create categories that cannot be backed by
  actual data" rule (this isn't unreliable data, it's just non-discriminating).

## Decisions already made (via user Q&A this session)

1. Phase 4 ships as separate sub-phases; this document covers 4a (Schedules) only.
2. Finance's (4b's) UI pattern will be a drill-down node reusing the existing click-to-recenter
   model, not new filter tabs — noted here because it sets the pattern this document also
   follows for Schedules: **no new "filter tabs that don't navigate" UI is introduced anywhere
   in Phase 4.**

## What this document builds

### SCHEDULES hub categories: TODAY / UPCOMING / OVERDUE

The existing `ScheduleCategory` type narrows from `"today" | "unassigned" | "tomorrow" |
"attention"` (demo-era categories) to `"today" | "upcoming" | "overdue"` — matching what the
real data can actually support. No AMC/FM split at the hub level (matching how STAFF already
browses employees domain-blind) — categories merge both domains internally; AMC's PPM tables
simply contribute zero rows today, same as everywhere else in this app.

A shared function computes the real merged item set:
1. Query `ppm_visits` and `amc_ppm_visits`, both domains, where `work_order_id IS NULL` (the
   double-counting exclusion above) and status is not a "done" status.
2. Query `work_orders` and `fm_work_orders`, both domains, where `scheduled_date IS NOT NULL`
   and status is not `Completed`/`Cancelled`.
3. Bucket each item into `today` / `upcoming` / `overdue` by comparing its date
   (`due_date ?? planned_date` for PPM; `scheduled_date` for work orders) against today's date.

### Scheduled item nodes — no duplicate representations

Per the brief's explicit "do not create duplicate representations of work orders" rule: a
schedule item backed by a real work order renders with `kind: "work-order"` and routes to the
**existing** `work-order` CenterEntity (unchanged from Phase 1/3c) — not a new node type. A
schedule item that's still a raw, unconverted PPM visit renders with the existing `kind:
"ppm-visit"` (already defined, currently only used as a non-clickable ring label) and routes to
a **new** `ppm-visit` CenterEntity, `{ kind: "ppm-visit"; domain: ContractDomain; id: string }`.

### `ppm-visit` centered view

Ring: one "Back to Contract" node (same pattern as work order's existing back-link).
`centerDetail`: planned date, due date, status, notes. No employee/technician node is
fabricated — real data never has one for an unconverted visit, and showing an empty "Assigned:
—" would misrepresent a relationship that doesn't exist, versus simply not showing the node at
all (consistent with how a work order with no technician already shows no employee node today).

### Contract → Schedule (bidirectional, reusing what's already on the ring)

`fetchContractConnections` already puts every PPM visit directly on the contract's ring
(currently `clickable: false`, label "PPM Visit"). This becomes clickable, using the exact same
work-order-or-ppm-visit routing described above — so "Contract → Schedule" is not a new
intermediate screen, it's the existing ring nodes gaining real navigation, exactly mirroring
how Phase 3c made the existing (already-present) customer label clickable rather than adding a
new node. The label improves from the generic "PPM Visit" to the visit's real due date, and
gains `exception: true` when overdue (matching how work-order nodes already show exception).

### TODAY hub: no changes in 4a

The brief's §10 asks for a real count sublabel ("8 today · 2 attention") on the TODAY screen's
SCHEDULES hub tile. **Not built in 4a** — today, TODAY shows zero real counts on any of its
three hub tiles (CONTRACTS/STAFF/SCHEDULES all have static descriptive sublabels only), so
adding counts to only one tile would be inconsistent, and the brief's own §27 explicitly warns
against fetching data at TODAY's initial load. This is deferred, not dropped — worth revisiting
once/if Contract Finance (4b) raises the same question for a second hub tile, as a single
decision covering both rather than two inconsistent one-off additions.

### Full demo-data cleanup (this phase, not later)

Once Schedules is real, nothing in the app needs `DEMO_JOBS`/`DEMO_STAFF`/
`SUITABLE_STAFF_FOR_JOB`/`buildScheduleJobDetail`/the `schedule-job` CenterEntity variant, or
the `DEMO_DATA_KINDS`/"(Example)" banner mechanism in `OperationsUniverse.tsx` (`DEMO_STAFF` was
only kept alive through 3a/3c because Schedules still needed it) — all of it is deleted in this
phase. This is the natural conclusion of the pattern already used when Phase 3a deleted
`buildStaffCategoryMembers`/`buildStaffMemberDetail` as dead code once Staff went real. The
`schedule-job` **EntityKind** (visual kind, icon/color mapping) is also removed since nothing
constructs a node with that kind once real items use `work-order`/`ppm-visit` kinds instead.
`prototypeData.ts` is deleted entirely. This directly satisfies the brief's own completion-
report requirement to confirm no `(Example)`/`DEMO_JOBS` data remains visible anywhere.

## Out of scope for this document (explicitly deferred)

- Contract Financial Position — Phase 4b, separate spec.
- TODAY hub real counts — deferred per above, pending a combined decision with 4b.
- Time-window sub-grouping for UPCOMING (Tomorrow/7-days/Later) — only 8 real items today,
  doesn't need it; revisit if the real count grows.
- Search extension to schedule/PPM identifiers (brief §21) — not requested as part of 4a's
  scope by the user; revisit if wanted later.
