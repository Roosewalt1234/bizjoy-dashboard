-- Adds the coordinate columns needed for GPS-geofenced attendance
-- check-in/out. All nullable: a NULL site_lat/site_lng on fm_contracts
-- means "not configured yet" and blocks check-in for that site until an
-- admin fills it in (see fm-contract-modal.tsx). The attendance_logs
-- columns are a permanent audit trail of the captured GPS reading for
-- every geofenced check-in/out.

alter table public.fm_contracts
  add column if not exists site_lat numeric,
  add column if not exists site_lng numeric;

alter table public.attendance_logs
  add column if not exists check_in_lat numeric,
  add column if not exists check_in_lng numeric,
  add column if not exists check_out_lat numeric,
  add column if not exists check_out_lng numeric;
