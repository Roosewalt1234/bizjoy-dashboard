-- Apply before enabling EVA_CRM_CATALOG_ENABLED. This does not grant any
-- table access or modify existing RLS policies or the legacy pilot helper.
-- This narrowly scoped SECURITY DEFINER wrapper is needed because app_private
-- is deliberately not exposed through PostgREST. It returns a boolean only.
begin;
create or replace function public.eva_crm_can_read(module_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
 select auth.uid() is not null
 and case
   when module_name = 'settings' then app_private.has_role(auth.uid(), 'admin'::public.app_role)
   when module_name in ('customers','sales','accounts','contracts','projects','service','hr','purchase')
     then app_private.can(auth.uid(), module_name, 'view')
   else false
 end;
$$;
revoke all on function public.eva_crm_can_read(text) from public, anon;
grant execute on function public.eva_crm_can_read(text) to authenticated;
comment on function public.eva_crm_can_read(text) is
 'EVA read-only module gate. Caller JWT and existing app_private permissions remain authoritative.';
commit;
