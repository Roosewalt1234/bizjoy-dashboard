-- Attendance access follows User Permissions only.
--
-- Removes the "anyone" insert/update policies. Writers are now:
--   attendance_logs_insert / _update   dashboard users with contracts:add / contracts:edit
--   attendance_logs_self_*             field staff, own rows only, and only with
--                                      the Mobile Attendance permission
--   anna_business_executor             Anna (unchanged)
-- The midnight auto-checkout runs as SECURITY DEFINER and is unaffected.
drop policy if exists "Allow public insert to attendance_logs" on public.attendance_logs;
drop policy if exists "Allow public update to attendance_logs" on public.attendance_logs;

drop policy if exists attendance_logs_self_select on public.attendance_logs;
drop policy if exists attendance_logs_self_insert on public.attendance_logs;
drop policy if exists attendance_logs_self_update on public.attendance_logs;

create policy attendance_logs_self_select on public.attendance_logs
  for select to authenticated
  using (
    app_private.can(auth.uid(), 'mobile_attendance', 'view')
    and exists (
      select 1 from public.employees e
      where e.id = attendance_logs.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  );

create policy attendance_logs_self_insert on public.attendance_logs
  for insert to authenticated
  with check (
    app_private.can(auth.uid(), 'mobile_attendance', 'view')
    and exists (
      select 1 from public.employees e
      where e.id = attendance_logs.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  );

create policy attendance_logs_self_update on public.attendance_logs
  for update to authenticated
  using (
    app_private.can(auth.uid(), 'mobile_attendance', 'view')
    and exists (
      select 1 from public.employees e
      where e.id = attendance_logs.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  )
  with check (
    app_private.can(auth.uid(), 'mobile_attendance', 'view')
    and exists (
      select 1 from public.employees e
      where e.id = attendance_logs.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  );

-- FM site list for the mobile app: site details only, no value, billing,
-- payment terms, NFC token or remarks. Replaces field staff reading
-- fm_contracts directly (the public fm_contracts_self_select policy is
-- dropped in a follow-up migration once the mobile app uses this).
create or replace function public.list_fm_attendance_sites()
returns table (
  id uuid,
  title text,
  contract_no text,
  customer_id uuid,
  customer_name text,
  site_name text,
  site_address text,
  site_lat numeric,
  site_lng numeric,
  status text,
  start_date date,
  end_date date
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  select c.id, c.title, c.contract_no, c.customer_id, c.customer_name,
         c.site_name, c.site_address, c.site_lat::numeric, c.site_lng::numeric,
         c.status, c.start_date, c.end_date
  from public.fm_contracts c
  where app_private.can(auth.uid(), 'contracts', 'view')
     or app_private.can(auth.uid(), 'mobile_attendance', 'view')
     or app_private.can(auth.uid(), 'mobile_report_snag', 'view')
     or app_private.can(auth.uid(), 'mobile_variation_job', 'view')
  order by c.created_at desc;
$$;

revoke all on function public.list_fm_attendance_sites() from public, anon;
grant execute on function public.list_fm_attendance_sites() to authenticated;
