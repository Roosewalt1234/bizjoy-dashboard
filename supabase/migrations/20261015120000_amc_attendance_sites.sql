-- The mobile app needs the list of AMC sites to geofence attendance
-- against, but contracts_select only lets users with Contracts > View
-- read the table. Field staff don't have that, so RLS silently returned
-- zero rows and AMC staff could only ever match the FM site or an office.
-- This exposes just the fields the attendance screen needs (no values,
-- terms or pricing), for active contracts that have coordinates set.
create or replace function public.list_amc_attendance_sites()
returns table (id uuid, title text, contract_no text, customer_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.contract_no, c.customer_name
  from contracts c
  where c.status = 'Active'
    and c.site_lat is not null
    and c.site_lng is not null
  order by c.created_at desc;
$$;

revoke all on function public.list_amc_attendance_sites() from public, anon;
grant execute on function public.list_amc_attendance_sites() to authenticated;
