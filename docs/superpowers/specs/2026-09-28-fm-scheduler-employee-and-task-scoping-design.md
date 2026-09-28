# FM Cleaning Scheduler: Contract-Scoped Employees + Task Catalog — Design

**Status:** Approved by user, 2026-09-28. First of three sub-projects requested together (the
other two — a User Permissions "select all" button, and an AMC scheduling modal time-field +
contract-date auto-populate — are separate, deferred sub-projects with their own spec/plan cycles).

## Problem

In `src/features/fm-cleaning-scheduler/fm-cleaning-scheduler-workspace.tsx`'s Add/Edit Schedule
dialog:

1. The "Assigned cleaner" dropdown lists every employee system-wide (`fetchEmployeeOptions()` in
   `fm-cleaning-scheduler-api.ts:48-59` is a flat, unfiltered `employees` query), with no relation
   to which staff are actually assigned to the contract being scheduled.
2. A schedule entry has no concept of WHICH task is being scheduled — `fm_cleaning_schedules` only
   has `frequency_type`/`days_of_week`/`time_window_start/end`/`area_id`/`assigned_employee_id`/
   `active`. An admin can schedule "Corridor, daily, 2–3pm" but never specify that it's for Wet
   Mop vs. Dry Mop vs. Scrubbing — the same task catalog already built for the mobile app's
   per-room checklist (`fm_cleaning_task_catalog`) isn't connected to this admin-facing scheduler
   at all.

## Section A: Employee dropdown scoped to contract assignments

`fetchEmployeeOptions()` becomes scoped by the workspace's already-selected `contractId`
(`fm-cleaning-scheduler-workspace.tsx:86`, already in scope wherever the dropdown renders — no new
state needed). Query `contract_manpower_assignments` where `contract_id = contractId AND status =
'Active'` (the column's own documented default in the migration; the separately-added `active`
boolean column has no established meaning elsewhere in the codebase, so `status` is the reliable
signal to filter on), joined to `employees` for display names.

**Empty state:** `contract_manpower_assignments` currently has zero rows for every contract (no
admin has recorded manpower assignments yet, though a dedicated "FM Manpower" screen exists for
it — `fm-manpower.tsx`). If the scoped query returns zero rows for the selected contract, the
"Assigned cleaner" dropdown renders disabled with the message *"No staff assigned to this contract
yet — assign staff on the FM Manpower page first."* The dialog's Save button stays disabled in
this state. This affects every contract today until manpower assignments are entered — confirmed
as the intended behavior (block rather than silently fall back to the old unfiltered list).

## Section B: Task/activity field, required, scoped by room type

**Schema:** `fm_cleaning_schedules` gains `task_catalog_id uuid NOT NULL REFERENCES
fm_cleaning_task_catalog(id)`. Safe as a direct `NOT NULL` addition — the table currently has zero
rows, no backfill migration needed.

**Dialog flow:** the Task dropdown is disabled until a Utility Room is picked (the room's
`catalog_id` is already present in the in-memory `CleaningArea` object passed into the dialog —
`fm-cleaning-areas-api.ts:64-78`'s `select("*")` already includes it, no new fetch required). Once
a room is picked, the Task dropdown is populated from `fm_cleaning_task_catalog` where
`area_catalog_id` matches that room's `catalog_id`, filtered `active = true`, ordered by
`sort_order` — e.g. a Corridor room offers Litter Picking / Dry Mop / Wet Mop / Scrubbing; a
Dustbin Chute Room offers Inspection / Litter Picking / Wet Mop / Deep Cleaning. Changing the room
selection resets the task selection, since a different room type has a different task list.

If the picked room has no `catalog_id`, or its catalog has zero active tasks, the Task dropdown
shows *"No checklist configured for this room type."* and blocks saving — same empty-state pattern
as Section A's cleaner dropdown.

**Save button** stays disabled until both cleaner and task are selected (task is required, per
approved design).

**Display:** each schedule card in the workspace (currently "Room — Frequency, Time Window") also
shows the task name — e.g. "Corridor — Wet Mop — Daily, 2:00–3:00 PM".

**Editing an existing schedule** pre-populates the Task dropdown from that row's stored
`task_catalog_id`.

## What does NOT change

- The mobile app's task-checklist feature (`fm_cleaning_task_catalog`, `fm_cleaning_task_completions`,
  Schedule's combined feed): untouched — read-only reuse of the existing catalog table.
- `fm_cleaning_schedules`'s existing columns: unchanged, gaining only the one new required column.
- `contract_manpower_assignments` and the FM Manpower page: untouched — read-only.
- Every other tab/feature in the FM Cleaning Scheduler workspace unrelated to the Add/Edit
  Schedule dialog.

## Deferred (separate sub-projects, not part of this spec)

- User Permissions page: a "select all" button per row for the view/add/edit/delete checkboxes.
- AMC Scheduling modal: adding a time field alongside the date, and auto-populating scheduler
  dates from the selected contract's own start/end dates.
