-- fm_cleaning_schedules gains a required link to the same task catalog the mobile app's per-room
-- checklist already uses (fm_cleaning_task_catalog), so an admin can schedule a SPECIFIC task
-- (e.g. "Corridor - Wet Mop") instead of just a room + time window with no task concept.
--
-- The 2 pre-existing rows (created today, before this column existed) are deleted rather than
-- backfilled - there's no way to infer which task they were meant to represent, and the user
-- explicitly approved deleting them over guessing. Confirmed via a live row-count/content check
-- immediately before this migration was written that these are the only rows in the table.
delete from public.fm_cleaning_schedules;

alter table public.fm_cleaning_schedules
  add column task_catalog_id uuid not null references public.fm_cleaning_task_catalog(id);
