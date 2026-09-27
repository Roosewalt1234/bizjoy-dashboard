-- Wing item-list + per-room task checklist: two new catalog entries (Doors/Louvers, provisioned
-- onto a wing the same way Corridor/Staircase/etc. already are), a new per-room-type task catalog
-- (keyed by the specific room type via area_catalog_id, since the coarse area_type column can't
-- distinguish Corridor from Staircase - both are 'utility_room'), and an append-only completion
-- log.

insert into public.fm_cleaning_area_catalog (name, area_type, sort_order)
values
  ('Doors', 'utility_room', (select coalesce(max(sort_order), 0) + 1 from public.fm_cleaning_area_catalog)),
  ('Louvers', 'utility_room', (select coalesce(max(sort_order), 0) + 2 from public.fm_cleaning_area_catalog));

create table public.fm_cleaning_task_catalog (
  id uuid primary key default gen_random_uuid(),
  area_catalog_id uuid not null references public.fm_cleaning_area_catalog(id),
  task_name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index fm_cleaning_task_catalog_area_catalog_id_idx
  on public.fm_cleaning_task_catalog(area_catalog_id);

alter table public.fm_cleaning_task_catalog enable row level security;

-- Read-only reference data - any authenticated user can read it, same trust level as the
-- sibling fm_cleaning_area_catalog it's keyed against. No insert/update/delete policy: this
-- plan seeds it via migration only: an admin-editable catalog screen is a separate, future task.
create policy fm_cleaning_task_catalog_select
  on public.fm_cleaning_task_catalog for select
  using (true);

-- Seed task lists, looked up by each room-type's existing name rather than hardcoded UUIDs (safer
-- than pasting live-database ids into a migration file - names in fm_cleaning_area_catalog are
-- unique per room-type today, confirmed live via a direct query before writing this migration).
with seed(area_name, task_name, seed_order) as (
  values
    ('Corridor', 'Litter Picking', 1),
    ('Corridor', 'Dry Mop', 2),
    ('Corridor', 'Wet Mop', 3),
    ('Corridor', 'Scrubbing', 4),
    ('Dustbin Chute Room', 'Inspection', 1),
    ('Dustbin Chute Room', 'Litter Picking', 2),
    ('Dustbin Chute Room', 'Wet Mop', 3),
    ('Dustbin Chute Room', 'Deep Cleaning', 4),
    ('Electrical Meter Room', 'Cleaning', 1),
    ('Water Meter Room', 'Cleaning', 1),
    ('Fire Extinguisher Room', 'Cleaning', 1),
    ('Staircase', 'Litter Picking', 1),
    ('Staircase', 'Deep Cleaning', 2),
    ('Louvers', 'Cleaning', 1),
    ('Doors', 'Dusting', 1)
)
insert into public.fm_cleaning_task_catalog (area_catalog_id, task_name, sort_order)
select c.id, seed.task_name, seed.seed_order
from seed
join public.fm_cleaning_area_catalog c on c.name = seed.area_name;

create table public.fm_cleaning_task_completions (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.fm_cleaning_areas(id),
  task_catalog_id uuid not null references public.fm_cleaning_task_catalog(id),
  employee_id uuid not null references public.employees(id),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index fm_cleaning_task_completions_area_task_idx
  on public.fm_cleaning_task_completions(area_id, task_catalog_id, completed_at);

alter table public.fm_cleaning_task_completions enable row level security;

-- Read policy mirrors fm_cleaning_areas_select/fm_cleaning_schedules_select (both `using (true)`,
-- confirmed live via pg_policies before writing this migration) - this is low-sensitivity
-- operational data (who cleaned what, when), same trust level as the schedules/areas it's about.
create policy fm_cleaning_task_completions_select
  on public.fm_cleaning_task_completions for select
  using (true);

-- Insert policy mirrors fm_work_orders_self_insert exactly (confirmed live via pg_policies): an
-- employee may only log a completion under their own employee_id, verified via auth_user_id, and
-- only while not terminated. No broader admin-permission bypass is added (unlike
-- fm_work_orders_insert's additional app_private.can(...) grant for admin-created work orders) -
-- this table is inherently a per-employee action log, never something filed on someone else's
-- behalf.
create policy fm_cleaning_task_completions_self_insert
  on public.fm_cleaning_task_completions for insert
  with check (
    exists (
      select 1 from public.employees e
      where e.id = fm_cleaning_task_completions.employee_id
        and e.auth_user_id = auth.uid()
        and e.status <> 'Terminated'
    )
  );
