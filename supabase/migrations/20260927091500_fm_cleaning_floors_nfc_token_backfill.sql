-- Code review on the prior migration (20260927090000) caught a real inconsistency:
-- fm_cleaning_areas.nfc_token is NOT NULL DEFAULT gen_random_uuid() (auto-assigned the moment a
-- row exists), but fm_cleaning_floors.nfc_token was added nullable with no default. Left that
-- way, there would be no way for any floor to ever get a real token value to print onto a
-- physical tag - not a "assign later" design choice, just a gap. Backfill any existing null rows,
-- then require and default the column exactly like fm_cleaning_areas already does.

update public.fm_cleaning_floors
set nfc_token = gen_random_uuid()
where nfc_token is null;

alter table public.fm_cleaning_floors
  alter column nfc_token set default gen_random_uuid(),
  alter column nfc_token set not null;
