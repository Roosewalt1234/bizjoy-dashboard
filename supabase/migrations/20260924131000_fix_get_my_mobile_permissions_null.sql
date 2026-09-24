-- get_my_mobile_permissions() returned NULL (not '{}') when the calling
-- user had zero granted mobile modules, because array_agg() over zero rows
-- is NULL. A mobile client checking Array.isArray(data) before trusting a
-- fresh fetch would then fall through to a stale cache instead of
-- recognizing "nothing granted" - most visible when an admin revokes
-- everything and the employee should immediately lose all card access.
create or replace function public.get_my_mobile_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(array_agg(m.key), '{}'::text[])
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
