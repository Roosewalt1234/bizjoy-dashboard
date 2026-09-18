# AMC Scheduling Calendar — design spec

Date: 2026-09-18
Status: Approved by user, ready for implementation planning
Repo: `bizjoy-dashboard`

## Problem

AMC contracts have no real scheduling system today. Looking at the live
data: `contracts` has `ppm_1_date`..`ppm_4_date` and water tank/AC duct
cleaning date columns, but only 4 of 46 AMC contracts have any of them
filled in, and there's no UI exposing the PPM dates at all. AMC work
orders have a `scheduled_date` column that's never set — the AMC Work
Orders form doesn't even have a field for it. The one real recurring
maintenance system that exists (`ppm_schedules` + `ppm_visits`, with
frequency, assigned team, and visit-status tracking) only works for FM
contracts today — its `contract_id` columns have a foreign key pointing
specifically at `fm_contracts`, and all 12 existing rows belong to FM.

The user wants a proper AMC scheduling capability, visualized the way
Google Calendar shows a month/week grid, with the ability to schedule
new work directly from the calendar.

## Design

### 1. New page: AMC Scheduling

A new route, `/amc-scheduling`, added to the sidebar's "AMC Contracts"
group (alongside AMC Contracts, AMC Work Orders, AMC Work Completion
Reports) — mirroring where FM's PPM Planner (`/fm-ppm`) sits in the FM
Projects group.

The page has a **List / Calendar** toggle at the top (same pattern
already used elsewhere in this app for switching views), defaulting to
Calendar. Calendar has its own **Month / Week** toggle, defaulting to
Month — both views render the same underlying event data, just laid out
differently.

### 2. Data sources — three event types, one calendar

The calendar aggregates three kinds of AMC events, each visually
distinguished by a color-coded chip:

1. **PPM Visits** (new) — recurring maintenance visits, generated from a
   schedule (frequency + interval, e.g. "every 3 months") the same way
   FM's PPM Planner works today. Each visit has a planned date, an
   assigned team, and a status (Planned/Completed/Overdue etc.).
2. **Water Tank / AC Duct Cleaning** (existing columns) — one event per
   contract per type, read directly from `contracts.water_tank_cleaning_date`
   / `contracts.ac_duct_cleaning_date`. Not a repeatable series — each
   contract has at most one of each.
3. **AMC Work Orders** — any row in `work_orders` with a `scheduled_date`
   set, shown alongside the planned maintenance so the calendar reflects
   reactive/ad-hoc callouts too, not just planned PPM.

### 3. New database tables: `amc_ppm_schedules` and `amc_ppm_visits`

`ppm_schedules`/`ppm_visits` cannot be reused as-is — their `contract_id`
foreign key points at `fm_contracts`, and retrofitting them (relaxing the
FK, adding a module-type discriminator column) would mean altering
tables that already hold live FM production data, for a system that's
supposed to be additive. Consistent with how this schema already
separates FM and AMC everywhere else (`fm_contracts`/`contracts`,
`fm_work_orders`/`work_orders`, `fm_service_reports`/`service_reports`,
...), this adds two new, independent tables mirroring the FM ones'
shape, but pointed at the AMC `contracts` table:

- `amc_ppm_schedules`: `id`, `contract_id` (FK → `contracts`),
  `asset_id` (nullable — AMC doesn't have the same asset-register depth
  FM does, so this stays optional), `schedule_name`, `frequency`,
  `interval_months`, `start_date`, `end_date`, `active`, `instructions`,
  `assigned_employee_id`, `created_at`, `updated_at` — same columns as
  `ppm_schedules`, same meaning.
- `amc_ppm_visits`: `id`, `ppm_schedule_id` (FK → `amc_ppm_schedules`),
  `contract_id` (FK → `contracts`), `planned_date`, `due_date`,
  `assigned_team`, `status`, `work_order_id` (nullable FK → `work_orders`
  — an AMC visit can spawn a real work order, same relationship FM has),
  `completed_at`, `notes`, `created_at`, `updated_at` — same shape as
  `ppm_visits`, minus the FM-specific `service_report_id`/photo columns
  (AMC's completion-report system is separate; a photo/report trail on
  visits isn't part of this feature and can be added later if needed).
- Both get the same RLS pattern as their FM counterparts (admin/`service`
  or `contracts` module permission — mirrors the existing
  `fm_ppm_schedules`-equivalent policies).

### 4. Filling the AMC Work Order scheduling gap

The AMC Work Orders create/edit form (`amc-work-orders.tsx`) has no
`scheduled_date` field today even though the column exists and is
already displayed read-only elsewhere. This adds a date input to that
form, so both the calendar's "click a day" flow and the normal AMC Work
Orders page can set it.

### 5. Interaction: click a day, pick a type, use the real form

Clicking an empty calendar day opens a small picker: choose the AMC
contract, then choose what to schedule (PPM Visit / Water Tank Cleaning
/ AC Duct Cleaning / Work Order). Each choice opens the actual existing
(or newly-added) form for that item — the AMC PPM visit form, the
contract's cleaning-date field, or the AMC Work Order form — pre-filled
with the clicked date. No new, separate "quick add" form is invented;
the calendar is a launcher for forms that already do the real work,
consistent with how validation, permissions, and side effects
(generating visits from a schedule, etc.) already work.

Clicking an existing chip opens that same underlying item (the PPM
visit, the work order, or the contract's cleaning-date field) for
viewing/editing — never a calendar-only duplicate view of the data.

### 6. Calendar rendering

Built as a plain React component (no calendar library dependency) since
this app doesn't have one and the requirements are simple: a month grid
(6 rows × 7 columns, leading/trailing days from adjacent months shown
dimmed) and a week grid (7 columns, one row). Each cell lists its day's
events as small colored chips (color by event type, per §2); a day with
more than ~3 events shows the first few plus a "+N more" affordance
that expands the day. Today's date is highlighted, matching the
Google-Calendar visual convention the user asked for.

### 7. What does NOT change

- FM's PPM Planner, `ppm_schedules`, and `ppm_visits` are completely
  untouched — no shared tables, no shared code paths.
- The AMC Work Orders and AMC Contracts list/table pages are unchanged
  beyond the one new `scheduled_date` field on the work order form; the
  calendar is an additional page, not a replacement.
- No drag-and-drop rescheduling in this pass (explicitly deferred per
  the user's choice of "view + click to schedule").

## Verification plan

- `npx tsc --noEmit -p .` after each change.
- Manual: create an AMC PPM schedule, confirm it generates visits that
  appear on the calendar in the right month/week cells.
- Manual: click an empty day, schedule a Water Tank Cleaning for a
  contract, confirm it's reflected both on the calendar and on that
  contract's record.
- Manual: click an empty day, create an AMC Work Order with that
  scheduled date, confirm it appears on the calendar and in the normal
  AMC Work Orders list.
- Manual: switch between Month/Week and List/Calendar and confirm the
  same underlying data renders consistently in all four combinations.
