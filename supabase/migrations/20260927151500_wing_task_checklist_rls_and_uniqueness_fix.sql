-- Code-quality review of 20260927150000_wing_task_checklist.sql found two real issues in the
-- live database (not fixed by editing the already-applied migration - a new forward migration
-- instead, matching this project's established convention):
--
-- 1. All three new RLS policies were created with no `to` clause, defaulting to PUBLIC. Every
--    sibling policy they claim to mirror (fm_cleaning_areas_select, fm_cleaning_schedules_select,
--    fm_work_orders_self_insert) is scoped `to authenticated`. Confirmed live: the anon role has
--    a blanket table-level SELECT grant (standard Supabase setup) and does NOT bypass RLS, so an
--    unauthenticated caller could currently read fm_cleaning_task_completions/
--    fm_cleaning_task_catalog. Rescoping to `authenticated` closes this.
--
-- 2. Neither fm_cleaning_area_catalog.name nor fm_cleaning_task_catalog(area_catalog_id,
--    task_name) had a uniqueness guarantee, despite the seed migration's own comments assuming
--    name-uniqueness. Confirmed live: no duplicates exist today, so these constraints are safe to
--    add now. This closes the "re-running the seed migration silently duplicates rows" risk
--    permanently, rather than only guarding the two inserts that already ran.

alter policy fm_cleaning_task_catalog_select
  on public.fm_cleaning_task_catalog
  to authenticated
  using (true);

alter policy fm_cleaning_task_completions_select
  on public.fm_cleaning_task_completions
  to authenticated
  using (true);

alter policy fm_cleaning_task_completions_self_insert
  on public.fm_cleaning_task_completions
  to authenticated
  with check (
    exists (
      select 1 from public.employees e
      where e.id = fm_cleaning_task_completions.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  );

alter table public.fm_cleaning_area_catalog
  add constraint fm_cleaning_area_catalog_name_key unique (name);

alter table public.fm_cleaning_task_catalog
  add constraint fm_cleaning_task_catalog_area_catalog_id_task_name_key unique (area_catalog_id, task_name);
