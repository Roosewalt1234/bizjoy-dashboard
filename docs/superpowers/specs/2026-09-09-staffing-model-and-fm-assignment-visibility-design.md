# Staffing Model Tag & FM Assignment Visibility — Design

## Problem

There's currently no way to tell, at a glance, which staffing model applies to an
employee, or which FM project(s)/building(s) they're currently on:

- **FM staff** are dedicated to one project for its full duration (a 6-month,
  1-year, 2-year contract). Each FM contract row (`fm_contracts`, e.g. "Parkside
  48") *is* the building/project — there is no separate "buildings" table to
  introduce.
- **AMC staff** are a shared pool: AMC jobs are one-day visits, and any AMC
  technician can be sent to any AMC contract. They are never dedicated to one
  AMC contract, so there is nothing to pre-assign for them.

The FM-side assignment mechanism (assign an employee to one or more FM
contracts, with start/end dates) **already exists**: `/fm-manpower`'s "Employee
Assignments" tab, backed by `contract_manpower_assignments` (FK'd to
`fm_contracts`, not to the AMC `contracts` table). It is currently unused (0
rows) and not surfaced anywhere outside that one page.

What's missing:
1. No way to record which staffing model (FM-dedicated vs. AMC-pool vs. both)
   applies to a given employee.
2. No visibility into an employee's current FM assignment(s) from HR — you'd
   have to know `/fm-manpower` exists and cross-reference manually.
3. The FM Manpower "Employee Assignments" employee picker doesn't distinguish
   staffing model, so an AMC-pool employee could be assigned to a year-long FM
   contract by mistake.

## Goals

- Let HR tag each employee's staffing model: `FM`, `AMC`, or `Both`.
- Surface that tag, and the employee's current FM contract assignment(s), in
  the HR employee list — no need to leave HR to answer "who is this person
  allocated to?"
- Keep the FM Manpower page's employee picker from encouraging a mismatch
  between an employee's staffing model and a long-duration FM assignment.

## Non-goals

- No new "AMC allocation" table or page. AMC techs are pooled by design; there
  is nothing to assign per contract.
- No changes to the AMC `contracts` table or any AMC-only code path. This
  entire feature touches only `employees` (shared HR table) and reads from the
  existing, already-FM-scoped `contract_manpower_assignments` /
  `fm_contracts` tables.
- No new building/site table under FM. "Building" = FM contract, full stop —
  the existing `fm_cleaning_towers` concept stays scoped to the Cleaning
  module as it is today and is unrelated to this feature.
- No access-control enforcement tied to the tag (e.g. it won't hide modules or
  restrict logins). It's an organizational/reporting attribute, same spirit as
  `position` or `department`.
- No automatic backfill/classification of existing employees (see Data Model
  below) — this is a manual, one-time HR task going forward.

## Data Model

Add one nullable column to the existing `employees` table:

```sql
alter table public.employees
  add column staffing_model text
  check (staffing_model in ('FM', 'AMC', 'Both'));
```

- Nullable, no default: existing employees start **unclassified**
  (`staffing_model IS NULL`). There's no reliable signal in existing data to
  auto-infer this (position/department values overlap between FM and AMC
  roles, and `contract_manpower_assignments` currently has 0 rows), so a
  guessed backfill would just create false confidence. HR tags employees
  manually over time; the HR list gets a filter for "Unclassified" to make
  that task trackable.
- No RLS/grant changes needed — `employees` already has policies covering
  `authenticated` access via `app_private.can(auth.uid(), 'hr', <action>)`,
  which already covers this new column.
- After migration, regenerate `src/integrations/supabase/types.ts` (via the
  Supabase MCP `generate_typescript_types` tool) so the new column is typed,
  consistent with how prior columns (e.g. `can_switch_projects`) were added.

## UI Changes

### 1. HR — Employee form (`src/components/employee-form.tsx`)

Add a "Staffing Model" `Select` (options: FM, AMC, Both — plus an
implicit "unset" state when nothing is chosen) in the Employee Details tab,
next to the existing "Mobile app device setup" field. Wired the same way as
the existing `status` select: `form.staffing_model`, included in the `payload`
sent to `supabase.from("employees").update/insert`.

### 2. HR — Employee list (`src/routes/_authenticated/hr.tsx`)

- New **Staffing Model** column showing a badge (`FM` / `AMC` / `Both` /
  `Unclassified` in a muted style for the null case).
- New **Assigned To** column: for employees with `staffing_model` of `FM` or
  `Both`, shows the FM contract(s) they're currently active on (joined from
  `contract_manpower_assignments` where `active = true`, showing
  `fm_contracts.contract_no`/`customer_name`, comma-separated if more than
  one). Shows "—" for AMC-only or unassigned employees. This is read-only in
  HR — editing an assignment still happens on `/fm-manpower`, avoiding two
  places that can write the same row.
- A new filter control (matching the existing pattern of other list filters
  in this codebase) to filter the list by Staffing Model, including an
  "Unclassified" option so HR can find and tag everyone over time.

Data fetching: one extra query alongside the existing `employees` query,
selecting `employee_id, contract_id, fm_contracts(contract_no, customer_name)`
from `contract_manpower_assignments` where `active = true`, grouped
client-side by `employee_id` — the same shape `/fm-manpower` already fetches,
just scoped to active rows and reused here for display only.

### 3. FM Manpower — Employee Assignments picker (`src/routes/_authenticated/fm-manpower.tsx`)

In `AssignmentDialog`'s Employee `Select`, filter the `employees` list to
exclude anyone explicitly tagged `AMC` (i.e. show `FM`, `Both`, and
unclassified/`null`). This stops an obvious mismatch (assigning a pooled AMC
technician to a year-long FM contract) without blocking anyone who simply
hasn't been tagged yet.

## Error Handling

Nothing new to handle beyond what the existing patterns already cover: the
`Select` component constrains `staffing_model` to the three valid values (no
free text), and the new "Assigned To" query follows the same
`try/toast.error` convention already used throughout `hr.tsx` and
`fm-manpower.tsx`.

## Testing Approach

No test runner exists in this repo (consistent with every prior feature here).
Verification is manual: apply the migration, regenerate types, run
`npx tsc` (or the repo's existing type-check script) as a smoke test, then
walk through the HR page and `/fm-manpower` in the dev server to confirm the
new field, column, and picker filter behave as described.
