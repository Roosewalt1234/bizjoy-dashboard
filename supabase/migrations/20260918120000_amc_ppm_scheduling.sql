-- Recurring AMC maintenance schedules and their generated visits. Mirrors
-- the existing ppm_schedules/ppm_visits tables' shape and RLS pattern,
-- but as new, independent tables rather than retrofitting those — their
-- contract_id foreign keys are pinned specifically to fm_contracts and
-- all 12 existing rows belong to FM contracts today. AMC has no
-- per-asset register (contract_assets/contract_line_items/
-- service_categories are all FK'd to fm_contracts only), so unlike the
-- FM tables these have no asset_id/service_category_id/
-- contract_line_item_id columns — scheduling here is contract-level.

create table public.amc_ppm_schedules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  schedule_name text not null,
  frequency text,
  interval_months integer,
  start_date date,
  end_date date,
  active boolean not null default true,
  instructions text,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.amc_ppm_visits (
  id uuid primary key default gen_random_uuid(),
  ppm_schedule_id uuid references public.amc_ppm_schedules(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  planned_date date not null,
  due_date date,
  assigned_team text,
  status text not null default 'Planned',
  work_order_id uuid references public.work_orders(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index amc_ppm_schedules_contract_id_idx on public.amc_ppm_schedules(contract_id);
create index amc_ppm_visits_contract_id_idx on public.amc_ppm_visits(contract_id);
create index amc_ppm_visits_schedule_id_idx on public.amc_ppm_visits(ppm_schedule_id);
create index amc_ppm_visits_planned_date_idx on public.amc_ppm_visits(planned_date);

alter table public.amc_ppm_schedules enable row level security;
alter table public.amc_ppm_visits enable row level security;

-- Same permission model as ppm_schedules/ppm_visits: the "contracts"
-- module's view/add/edit/delete permissions gate everything. No
-- employee-self policies (unlike ppm_visits' self-insert/self-update) —
-- there's no AMC mobile-app employee flow this feeds today, so that
-- dimension isn't needed.
create policy amc_ppm_schedules_select on public.amc_ppm_schedules
  for select using (app_private.can(auth.uid(), 'contracts', 'view'));
create policy amc_ppm_schedules_insert on public.amc_ppm_schedules
  for insert with check (app_private.can(auth.uid(), 'contracts', 'add'));
create policy amc_ppm_schedules_update on public.amc_ppm_schedules
  for update using (app_private.can(auth.uid(), 'contracts', 'edit'))
  with check (app_private.can(auth.uid(), 'contracts', 'edit'));
create policy amc_ppm_schedules_delete on public.amc_ppm_schedules
  for delete using (app_private.can(auth.uid(), 'contracts', 'delete'));

create policy amc_ppm_visits_select on public.amc_ppm_visits
  for select using (app_private.can(auth.uid(), 'contracts', 'view'));
create policy amc_ppm_visits_insert on public.amc_ppm_visits
  for insert with check (app_private.can(auth.uid(), 'contracts', 'add'));
create policy amc_ppm_visits_update on public.amc_ppm_visits
  for update using (app_private.can(auth.uid(), 'contracts', 'edit'))
  with check (app_private.can(auth.uid(), 'contracts', 'edit'));
create policy amc_ppm_visits_delete on public.amc_ppm_visits
  for delete using (app_private.can(auth.uid(), 'contracts', 'delete'));
