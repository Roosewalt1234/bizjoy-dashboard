-- Mirrors quotes/quote_items in shape and RLS posture. Estimates are the
-- cost-buildup step that happens BEFORE a quote exists - material/labor/
-- subcontractor cost, marked up, with overhead - kept as its own
-- permanent record (not a disposable calculator) so a past price can
-- always be explained.
create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.sales_leads(id),
  customer_name text,
  estimate_number text,
  estimate_date date,
  status text not null default 'Draft',
  quote_id uuid references public.quotes(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  sort_order integer not null default 0,
  description text not null default '',
  material_cost numeric not null default 0,
  material_markup_pct numeric not null default 15,
  labor_hours numeric not null default 0,
  labor_rate numeric not null default 25,
  subcontractor_cost numeric not null default 0,
  subcontractor_markup_pct numeric not null default 15,
  apply_overhead boolean not null default true,
  overhead_pct numeric not null default 25,
  -- Computed client-side (material×markup + labor×rate + subcont×markup,
  -- then ×(1+overhead) unless apply_overhead is false) and written here on
  -- save, same convention as quote_items.amount - never a generated column.
  sell_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;

-- Same access shape as quotes/quote_items: any authenticated user with
-- the existing "sales" module permission. Reuses the same app_private.can
-- helper already governing quotes.
create policy "estimates_select" on public.estimates
  for select to authenticated
  using (app_private.can(auth.uid(), 'sales', 'view'));
create policy "estimates_insert" on public.estimates
  for insert to authenticated
  with check (app_private.can(auth.uid(), 'sales', 'add'));
create policy "estimates_update" on public.estimates
  for update to authenticated
  using (app_private.can(auth.uid(), 'sales', 'edit'))
  with check (app_private.can(auth.uid(), 'sales', 'edit'));
create policy "estimates_delete" on public.estimates
  for delete to authenticated
  using (app_private.can(auth.uid(), 'sales', 'delete'));

create policy "estimate_items_select" on public.estimate_items
  for select to authenticated
  using (app_private.can(auth.uid(), 'sales', 'view'));
create policy "estimate_items_insert" on public.estimate_items
  for insert to authenticated
  with check (app_private.can(auth.uid(), 'sales', 'add'));
create policy "estimate_items_update" on public.estimate_items
  for update to authenticated
  using (app_private.can(auth.uid(), 'sales', 'edit'))
  with check (app_private.can(auth.uid(), 'sales', 'edit'));
create policy "estimate_items_delete" on public.estimate_items
  for delete to authenticated
  using (app_private.can(auth.uid(), 'sales', 'delete'));

-- New doc-numbering kind, same pattern as work_order/service_report.
create sequence if not exists public.estimate_no_seq;

create or replace function public.next_doc_no(kind text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare n bigint;
begin
  if kind = 'work_order' then
    n := nextval('public.work_order_no_seq');
    return 'WO-' || lpad(n::text, 4, '0');
  elsif kind = 'service_report' then
    n := nextval('public.service_report_no_seq');
    return 'SR-' || lpad(n::text, 4, '0');
  elsif kind = 'estimate' then
    n := nextval('public.estimate_no_seq');
    return 'EST-' || lpad(n::text, 4, '0');
  else
    raise exception 'unknown kind %', kind;
  end if;
end;
$$;
