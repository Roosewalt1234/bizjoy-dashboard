-- Lets sales capture what a client actually wants (description + quantity)
-- at lead-intake time, before any pricing/estimation happens. No unit
-- price/amount columns on purpose - this is a requirement list, not a
-- costed line item.
create table if not exists public.lead_items (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  sort_order integer not null default 0,
  description text not null default '',
  quantity numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_items enable row level security;

create policy "lead_items_select" on public.lead_items
  for select to authenticated
  using (app_private.can(auth.uid(), 'sales', 'view'));
create policy "lead_items_insert" on public.lead_items
  for insert to authenticated
  with check (app_private.can(auth.uid(), 'sales', 'add'));
create policy "lead_items_update" on public.lead_items
  for update to authenticated
  using (app_private.can(auth.uid(), 'sales', 'edit'))
  with check (app_private.can(auth.uid(), 'sales', 'edit'));
create policy "lead_items_delete" on public.lead_items
  for delete to authenticated
  using (app_private.can(auth.uid(), 'sales', 'delete'));
