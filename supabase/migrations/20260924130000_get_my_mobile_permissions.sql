-- Tells the mobile app which of the six mobile-page permissions the calling
-- employee has been granted, reusing the same admin-bypass + user_permissions
-- lookup as app_private.can() (an admin gets every module; everyone else
-- needs an explicit granted row, matching the deny-by-default rollout).
create or replace function public.get_my_mobile_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, app_private
as $$
  select array_agg(m.key)
  from (values
    ('mobile_attendance'),
    ('mobile_pending_jobs'),
    ('mobile_schedule'),
    ('mobile_report_snag'),
    ('mobile_variation_job'),
    ('mobile_completion_report')
  ) as m(key)
  where app_private.can(auth.uid(), m.key, 'view');
$$;

grant execute on function public.get_my_mobile_permissions() to authenticated;
