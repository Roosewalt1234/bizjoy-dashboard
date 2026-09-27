-- Floor-level NFC tags (mirrors the existing per-area nfc_token pattern) and a structured
-- floor/area link on fm_work_orders, so a scanned floor/room tag can reliably query "every
-- work order here" instead of fuzzy-matching the existing free-text location column.

alter table public.fm_cleaning_floors
  add column nfc_token uuid unique;

alter table public.fm_work_orders
  add column floor_id uuid references public.fm_cleaning_floors(id),
  add column area_id uuid references public.fm_cleaning_areas(id);

create index fm_work_orders_floor_id_idx on public.fm_work_orders(floor_id) where floor_id is not null;
create index fm_work_orders_area_id_idx on public.fm_work_orders(area_id) where area_id is not null;

-- Registers the new "Scan" mobile page in the same permission list every other mobile page
-- already goes through (app_private.can(auth.uid(), 'mobile_floor_scan', 'view')), so it's
-- gated the same way the Attendance/Pending Jobs/etc. cards already are - not shown by default,
-- an admin grants it per employee via whatever UI already manages the other mobile_* keys.
create or replace function public.get_my_mobile_permissions()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
  select coalesce(array_agg(m.key), '{}'::text[])
  from (values
    ('mobile_attendance'),
    ('mobile_pending_jobs'),
    ('mobile_schedule'),
    ('mobile_report_snag'),
    ('mobile_variation_job'),
    ('mobile_completion_report'),
    ('mobile_floor_scan')
  ) as m(key)
  where app_private.can(auth.uid(), m.key, 'view');
$function$;
