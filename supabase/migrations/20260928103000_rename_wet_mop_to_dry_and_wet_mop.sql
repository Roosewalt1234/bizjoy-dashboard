-- Renames the "Wet Mop" task catalog entry to "Dry & Wet Mop" everywhere it appears (Corridor,
-- Dustbin Chute Room). This is the same fm_cleaning_task_catalog table both the mobile app's
-- per-room checklist and the FM Cleaning Scheduler's Task dropdown read from, so this rename
-- takes effect in both places automatically - no application code change needed.
update public.fm_cleaning_task_catalog
set task_name = 'Dry & Wet Mop'
where task_name = 'Wet Mop';
