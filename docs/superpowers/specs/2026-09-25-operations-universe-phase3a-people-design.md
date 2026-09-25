# Operations Universe Phase 3a: Real People/Staff Branch — Design

## Context

Operations Universe (`/universe`, `src/features/operations-universe/`) is an interactive
graph UI for browsing operational data. Phase 1 connected the Contracts and Work Orders
branches to real Supabase data. Phase 2 built out interaction polish (search, context panel,
mobile layout, "example data" banners marking the still-fictional branches). The Staff and
Schedules branches still run entirely on hardcoded fictional data
(`DEMO_STAFF`/`DEMO_JOBS` in `prototypeData.ts`).

Phase 3 replaces that fictional data with real data across three independent branches, built
and shipped as separate specs/plans in sequence: **3a — People** (this document),
**3b — Schedules/PPM**, **3c — Customers**, then **3d — Today dashboard + work order status
granularity + search extension + context panel polish**, which depends on 3a–3c existing.

This document covers **3a only**: replacing the STAFF hub's fictional data with real
`employees` + `attendance_logs` data.

## Grounding: what the real schema actually supports

Confirmed via live query against the Supabase project (2026-09-25), not from memory:

- `employees`: 20 active rows (`status='Active'` on all 20 — no inactive employees exist in
  the live data today, so an active/terminated filter has nothing to demonstrate against yet).
  Relevant columns: `id, full_name, first_name, last_name, position, phone, email,
  employment_type, staffing_model, status`. `department` is unset on all but one value
  (`NULL` or `'Operations'`) — not usable as a grouping axis. `staffing_model` is set on only
  9 of 20 employees — also too sparse to group by reliably.
- `attendance_logs`: real columns `id, employee_id (→employees), attendance_date, check_in,
  check_out, status, remarks, contract_id (→fm_contracts), amc_contract_id (→contracts),
  site_type`. Only two real `status` values exist in the data: `Present` and `Checked Out` —
  there is no stored "Absent" status. Only 6 of 20 employees have any attendance activity in
  the last 7 days; most employees will have no row for "today" at all. All of today's rows are
  FM-side (`amc_contract_id` null in every sampled row).
- `work_orders.technician_id` / `fm_work_orders.technician_id` both carry a real FK to
  `employees.id` (already used by the existing work-order → technician ring node). AMC has
  effectively no operational data (1 work order total, already Completed) — an employee's
  "currently assigned work orders" will in practice almost always mean FM work orders.
- `contract_manpower_assignments` (FM-only, employee → manpower plan → fm_contract) exists but
  has only 3 rows total. Per your decision, this is **out of scope for 3a** — too sparse to be
  worth building now, revisit later if it grows.

## Decisions already made (via user Q&A this session)

1. **Grouping**: flat list of all active employees directly off the STAFF hub — no
   intermediate category ring (position/attendance-based grouping rejected as either too
   sparse or better suited to a later phase).
2. **Employee detail ring nodes**: real relationships get real clickable ring nodes (today's
   attendance status, each currently-assigned open work order — clicking a work order
   navigates into the existing real work-order centered view). Everything else (position,
   staffing model, contact info) is context-panel-only text, not a ring node.
3. **No-attendance labeling**: an employee with no `attendance_logs` row for today is labeled
   *"No attendance recorded today"* — a neutral, factual label, not "Absent" (most employees
   don't use the attendance feature daily; treating silence as absence would misrepresent them).
4. **Manpower assignment ring node**: skipped for 3a (only 3 real rows exist across all 20
   employees — not worth building yet).

## Architecture

The codebase already has a real, wired-up `employee` CenterEntity
(`types.ts:15`, handled in `useUniverseNodes.ts:924-950`) reached today only via a work
order's assigned-technician ring node. It currently renders a placeholder ring node reading
*"Full profile — Attendance, skills, and live assignments arrive in Phase 3"*. **3a's job is
to fill in that placeholder with real data, and point the STAFF hub at the same CenterEntity**
instead of building a parallel real "staff-member" concept.

Concretely:

- The STAFF hub keeps its existing entry point — `{kind: 'staff-category', category:
  '__root__'}` — no `CenterEntity`/`EntityKind` type changes. Only `buildStaffCategoryRoot()`
  changes internally: instead of returning 3 fictional category nodes counted from
  `DEMO_STAFF`, it queries real employees and returns one ring node per employee.
- Each employee ring node keeps kind `staff-member` (existing pink/`UserCircle2` styling
  already defined in `UniverseNodeComponent.tsx`) but its `center` now points at the real
  `{kind: 'employee', id, name, position}` CenterEntity — the same one work-order technician
  nodes already use.
- The demo-only `staff-category` (non-root) and `staff-member` CenterEntity routing cases
  (`useUniverseNodes.ts:841-874`) are deleted, along with their backing functions
  `buildStaffCategoryMembers` and `buildStaffMemberDetail` — they become unreachable once the
  flat list routes straight to `employee`.
- The `employee` CenterEntity case (`useUniverseNodes.ts:924-950`) is replaced with a real
  `fetchEmployeeConnections(employeeId)` call.

### `fetchAllEmployees()` — STAFF hub ring

```
select id, full_name, first_name, last_name, position
from employees
where status = 'Active'
order by full_name
```

One ring node per row:
- `kind: 'staff-member'`
- `label`: `full_name ?? \`${first_name} ${last_name ?? ''}\`.trim()`
- `sublabel`: `position ?? undefined`
- `clickable: true`
- `center: { kind: 'employee', id, name: label, position }`
- `groupKey: 'member'`

### `fetchEmployeeConnections(employeeId)` — employee detail

Three queries in parallel:

1. **Employee row**: `select full_name, first_name, last_name, position, phone, email,
   employment_type, staffing_model from employees where id = :employeeId`.
2. **Today's attendance**: `select check_in, check_out, status from attendance_logs where
   employee_id = :employeeId and attendance_date = :today order by check_in desc limit 1`
   (`:today` computed the same way the existing overdue-date logic in this file does — UTC
   date, `YYYY-MM-DD`).
3. **Assigned open work orders**: both `work_orders` and `fm_work_orders`, `select id, wo_no,
   status, scheduled_date where technician_id = :employeeId and status not in ('Completed',
   'Cancelled') order by scheduled_date`.

Attendance status derivation (query 2's result):
- No row → label `"No attendance recorded today"`, no sublabel.
- Row with `status = 'Present'` (checked in, no checkout yet) → label `"Checked in"`, sublabel
  = formatted `check_in` time.
- Row with `status = 'Checked Out'` → label `"Checked out"`, sublabel = formatted `check_out`
  time.

Ring composition:
- One non-clickable node, `kind: 'staff-detail'`, the derived attendance label/sublabel above,
  `groupKey: 'attendance'`.
- One clickable `kind: 'work-order'` node per assigned open work order (both domains merged),
  `center: { kind: 'work-order', domain, id }`, `groupKey: 'work-order'`, `relationshipReason:
  "${name} is assigned to perform this work order."` — reuses the existing real work-order
  centered view unchanged.

`centerDetail` fields: Position, Employment Type, Staffing Model, Phone, Email.
`centerLabel` = full name. `centerSublabel` = position.

Zero assigned work orders is not an error — the ring simply shows only the attendance node,
matching the existing pattern elsewhere (e.g. a contract with no PPM visits).

## Necessary cleanup found while scoping this

`searchUniverse()` (`useUniverseNodes.ts:740-749`) currently name-matches against `DEMO_STAFF`
and returns results whose `center` is `{kind: 'staff-member', id}`. Once the `staff-member`
CenterEntity routing case is deleted (this phase), any such search result would hit the
`throw new Error(\`No handler yet for center entity kind: ${centerEntity.kind}\`)` fallback —
a real runtime error, not a cosmetic gap. This block is removed as part of 3a (not deferred to
3d's broader search work), since it is strictly dead/broken code once 3a ships, not a feature
being intentionally deferred.

`DEMO_STAFF` itself is **not** deleted from `prototypeData.ts` in 3a — it stays, because
`SUITABLE_STAFF_FOR_JOB` (used by the still-fictional Schedules branch's "suitable staff for
this job" suggestion) references `DEMO_STAFF` ids. It becomes fully unused once 3b ships and
replaces Schedules with real data; deleting it now would break 3b's starting point for no
benefit.

## Example-data banner

Whatever component currently renders the "this is example data" banner (recent commits:
`75170b8`, `de6d83a`) keys off which hub is being viewed — Staff and Schedules both show it
today. As part of 3a, the Staff hub stops showing that banner (it's real data now); Schedules
keeps showing it until 3b ships. The exact prop/condition needs to be located in
`OperationsUniverse.tsx` during implementation — it is not yet identified by file/line in this
design, but the change is a one-line condition update wherever it lives, not a design decision.

## Out of scope for 3a (explicitly deferred)

- Grouping/filtering the employee list by position, staffing model, or attendance (rejected —
  flat list chosen; may revisit in a later phase if the employee count grows).
- `contract_manpower_assignments` ring node (too sparse today, revisit later).
- Extending global search to match real employees by name (that's 3d's job — this phase only
  removes the now-broken demo search block, it does not add a replacement).
- Any AMC-side attendance handling beyond what falls out naturally from the query (the data
  simply doesn't exist yet — no special-casing needed, the same query structure works whether
  or not AMC attendance rows ever appear).
- Inactive/terminated employee filtering UI (no such employee exists in live data to test
  against; the `status = 'Active'` filter in the query is sufficient today).
