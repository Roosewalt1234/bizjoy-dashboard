-- Purchase Management: vendors, purchase orders, bills, line items and payments made.
--
-- Every purchase is classified as a Project cost (FM or AMC contract), an Asset
-- (capex) or an Operational expense (opex), and carries a payment method
-- (PEMO / Cash / Bank Transfer / Credit). Saving a bill posts one Expense row to
-- the Ledger (accounts_transactions) tagged with the project, so purchase costs
-- show against the contract, and a PEMO bill also gets its pemo_transactions row.
--
-- All writes go through SECURITY DEFINER RPCs with plain-named parameters that
-- accept a name, number or id for vendors/contracts/cards, so AI agents can
-- create entries without looking up ids first. Errors are written for humans.
--
-- Additive only: new tables, sequences, functions, one extra SELECT policy on
-- pemo_cards, and 'purchase' added to pemo_transactions' allowed sources.
-- Data module for RLS: 'purchase'.

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------
create sequence if not exists public.vendor_code_seq;
create sequence if not exists public.purchase_order_seq;
create sequence if not exists public.purchase_bill_seq;
create sequence if not exists public.vendor_payment_seq;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique default ('V-' || lpad(nextval('public.vendor_code_seq')::text, 5, '0')),
  name text not null,
  company_name text,
  contact_person text,
  email text,
  phone text,
  trn text,
  address text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  bank_name text,
  bank_account_name text,
  bank_iban text,
  opening_balance numeric(14,2) not null default 0,
  notes text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_name_unique on public.vendors (lower(name));

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique default ('PO-' || lpad(nextval('public.purchase_order_seq')::text, 5, '0')),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'Issued' check (status in ('Draft', 'Issued', 'Billed', 'Cancelled')),
  classification text not null check (classification in ('project', 'capex', 'opex')),
  project_type text check (project_type in ('FM', 'AMC')),
  contract_id uuid,
  asset_name text,
  asset_category text,
  expense_category text,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_orders_vendor_idx on public.purchase_orders (vendor_id);

create table public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique default ('BILL-' || lpad(nextval('public.purchase_bill_seq')::text, 5, '0')),
  vendor_bill_ref text,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  bill_date date not null default current_date,
  due_date date not null default current_date,
  classification text not null check (classification in ('project', 'capex', 'opex')),
  project_type text check (project_type in ('FM', 'AMC')),
  contract_id uuid,
  asset_name text,
  asset_category text,
  expense_category text,
  payment_method text not null check (payment_method in ('PEMO', 'Cash', 'Bank Transfer', 'Credit')),
  pemo_card_id uuid references public.pemo_cards(id) on delete set null,
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'Unpaid' check (status in ('Unpaid', 'Partially Paid', 'Paid', 'Void')),
  accounts_transaction_id uuid references public.accounts_transactions(id) on delete set null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_bills_vendor_idx on public.purchase_bills (vendor_id);
create index purchase_bills_contract_idx on public.purchase_bills (contract_id);

create table public.purchase_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  bill_id uuid references public.purchase_bills(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  vat_rate numeric(5,2) not null default 5 check (vat_rate >= 0),
  amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  check ((purchase_order_id is null) <> (bill_id is null))
);
create index purchase_line_items_po_idx on public.purchase_line_items (purchase_order_id);
create index purchase_line_items_bill_idx on public.purchase_line_items (bill_id);

create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique default ('PAY-' || lpad(nextval('public.vendor_payment_seq')::text, 5, '0')),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  bill_id uuid not null references public.purchase_bills(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('PEMO', 'Cash', 'Bank Transfer', 'Cheque')),
  pemo_card_id uuid references public.pemo_cards(id) on delete set null,
  pemo_transaction_id uuid references public.pemo_transactions(id) on delete set null,
  reference text,
  notes text,
  -- true for the payment written automatically when a bill is paid on the spot
  -- (PEMO / Cash / Bank Transfer); it follows the bill and cannot be deleted alone.
  is_auto boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index vendor_payments_bill_idx on public.vendor_payments (bill_id);
create index vendor_payments_vendor_idx on public.vendor_payments (vendor_id);

-- ---------------------------------------------------------------------------
-- updated_at + audit triggers
-- ---------------------------------------------------------------------------
create trigger vendors_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();
create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create trigger purchase_bills_updated_at before update on public.purchase_bills
  for each row execute function public.set_updated_at();

create trigger audit_vendors after insert or update or delete on public.vendors
  for each row execute function public.log_audit_event();
create trigger audit_purchase_orders after insert or update or delete on public.purchase_orders
  for each row execute function public.log_audit_event();
create trigger audit_purchase_bills after insert or update or delete on public.purchase_bills
  for each row execute function public.log_audit_event();
create trigger audit_purchase_line_items after insert or update or delete on public.purchase_line_items
  for each row execute function public.log_audit_event();
create trigger audit_vendor_payments after insert or update or delete on public.vendor_payments
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------------
-- RLS: module 'purchase', same four-policy shape as every other module table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['vendors', 'purchase_orders', 'purchase_bills', 'purchase_line_items', 'vendor_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app_private.can((select auth.uid()), ''purchase'', ''view'')))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app_private.can((select auth.uid()), ''purchase'', ''add'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app_private.can((select auth.uid()), ''purchase'', ''edit''))) with check ((select app_private.can((select auth.uid()), ''purchase'', ''edit'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app_private.can((select auth.uid()), ''purchase'', ''delete'')))', t || '_delete', t);
  end loop;
end $$;

-- PEMO bills and PEMO vendor payments write pemo_transactions rows with source 'purchase'.
alter table public.pemo_transactions drop constraint pemo_transactions_source_check;
alter table public.pemo_transactions add constraint pemo_transactions_source_check
  check (source = any (array['manual', 'ledger', 'openclaw', 'purchase']));

-- Purchase users pick a PEMO card on PEMO bills without needing Accounts access.
create policy pemo_cards_purchase_select on public.pemo_cards for select to authenticated
  using ((select app_private.can((select auth.uid()), 'purchase', 'view')));

-- ---------------------------------------------------------------------------
-- Internal helpers (app_private, not callable over the API)
-- ---------------------------------------------------------------------------
create or replace function app_private.purchase_require(_action text)
returns void
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not app_private.can(auth.uid(), 'purchase', _action) then
    raise exception 'You do not have % permission for Purchase Management.', _action;
  end if;
end $$;

create or replace function app_private.is_uuid(_v text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select _v ~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' $$;

-- Vendor by id, vendor code (V-00001) or exact name (case-insensitive).
create or replace function app_private.purchase_resolve_vendor(_vendor text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_ref text := btrim(coalesce(_vendor, ''));
begin
  if v_ref = '' then
    raise exception 'Vendor is required (give the vendor name, vendor code or id).';
  end if;
  if app_private.is_uuid(v_ref) then
    select id into v_id from vendors where id = v_ref::uuid;
  end if;
  if v_id is null then
    select id into v_id from vendors where lower(vendor_code) = lower(v_ref) or lower(name) = lower(v_ref) limit 1;
  end if;
  if v_id is null then
    raise exception 'No vendor found matching "%". Create the vendor first with create_vendor.', v_ref;
  end if;
  return v_id;
end $$;

-- FM contract (fm_contracts) or AMC contract (contracts) by id, contract number or exact title.
create or replace function app_private.purchase_resolve_contract(_project_type text, _contract text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_ref text := btrim(coalesce(_contract, ''));
  v_count integer;
begin
  if _project_type not in ('FM', 'AMC') then
    raise exception 'Project type must be FM or AMC for a project purchase.';
  end if;
  if v_ref = '' then
    raise exception 'Contract is required for a project purchase (give the contract number, title or id).';
  end if;
  if _project_type = 'FM' then
    if app_private.is_uuid(v_ref) then
      select id into v_id from fm_contracts where id = v_ref::uuid;
    end if;
    if v_id is null then
      select count(*), min(id::text)::uuid into v_count, v_id from fm_contracts
        where lower(contract_no) = lower(v_ref) or lower(title) = lower(v_ref);
    end if;
  else
    if app_private.is_uuid(v_ref) then
      select id into v_id from contracts where id = v_ref::uuid;
    end if;
    if v_id is null then
      select count(*), min(id::text)::uuid into v_count, v_id from contracts
        where lower(contract_no) = lower(v_ref) or lower(title) = lower(v_ref);
    end if;
  end if;
  if coalesce(v_count, 1) > 1 then
    raise exception 'More than one % contract matches "%". Use the contract number or id.', _project_type, v_ref;
  end if;
  if v_id is null then
    raise exception 'No % contract found matching "%".', _project_type, v_ref;
  end if;
  return v_id;
end $$;

-- PEMO card by id or label.
create or replace function app_private.purchase_resolve_pemo_card(_card text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_ref text := btrim(coalesce(_card, ''));
begin
  if v_ref = '' then
    raise exception 'A PEMO card is required when the payment method is PEMO (give the card label or id).';
  end if;
  if app_private.is_uuid(v_ref) then
    select id into v_id from pemo_cards where id = v_ref::uuid;
  end if;
  if v_id is null then
    select id into v_id from pemo_cards where lower(label) = lower(v_ref) limit 1;
  end if;
  if v_id is null then
    raise exception 'No PEMO card found matching "%".', v_ref;
  end if;
  return v_id;
end $$;

-- Validates the classification fields; returns the resolved contract id (or null).
create or replace function app_private.purchase_check_classification(
  _classification text, _project_type text, _contract text,
  _asset_name text, _expense_category text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if _classification = 'project' then
    return app_private.purchase_resolve_contract(_project_type, _contract);
  elsif _classification = 'capex' then
    if btrim(coalesce(_asset_name, '')) = '' then
      raise exception 'Asset name is required for an asset (capex) purchase.';
    end if;
  elsif _classification = 'opex' then
    if btrim(coalesce(_expense_category, '')) = '' then
      raise exception 'Expense category is required for an operational expense (opex) purchase.';
    end if;
  else
    raise exception 'Classification must be project, capex (asset) or opex (operational expense).';
  end if;
  return null;
end $$;

-- Replaces a document's line items from a JSON array; returns subtotal / vat / total.
create or replace function app_private.purchase_write_items(_po_id uuid, _bill_id uuid, _items jsonb)
returns table (subtotal numeric, vat_amount numeric, total numeric)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  it jsonb;
  i integer := 0;
  v_qty numeric;
  v_price numeric;
  v_rate numeric;
  v_amount numeric;
  v_vat numeric;
  v_sub numeric := 0;
  v_vat_total numeric := 0;
begin
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'At least one line item is required: [{"description": "...", "quantity": 1, "unit_price": 100, "vat_rate": 5}].';
  end if;
  if _po_id is not null then
    delete from purchase_line_items where purchase_order_id = _po_id;
  else
    delete from purchase_line_items where bill_id = _bill_id;
  end if;
  for it in select * from jsonb_array_elements(_items) loop
    i := i + 1;
    if btrim(coalesce(it->>'description', '')) = '' then
      raise exception 'Line % needs a description.', i;
    end if;
    v_qty := coalesce(nullif(it->>'quantity', '')::numeric, 1);
    v_price := coalesce(nullif(it->>'unit_price', '')::numeric, 0);
    v_rate := coalesce(nullif(it->>'vat_rate', '')::numeric, 5);
    if v_qty <= 0 then raise exception 'Line % quantity must be more than 0.', i; end if;
    if v_price < 0 then raise exception 'Line % unit price cannot be negative.', i; end if;
    v_amount := round(v_qty * v_price, 2);
    v_vat := round(v_amount * v_rate / 100, 2);
    insert into purchase_line_items (purchase_order_id, bill_id, position, description, quantity, unit_price, vat_rate, amount, vat_amount)
    values (_po_id, _bill_id, i, btrim(it->>'description'), v_qty, v_price, v_rate, v_amount, v_vat);
    v_sub := v_sub + v_amount;
    v_vat_total := v_vat_total + v_vat;
  end loop;
  return query select v_sub, v_vat_total, v_sub + v_vat_total;
end $$;

-- Recomputes amount_paid and status from the bill's payments.
create or replace function app_private.purchase_refresh_bill(_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from vendor_payments where bill_id = _bill_id;
  update purchase_bills
     set amount_paid = v_paid,
         status = case
           when status = 'Void' then 'Void'
           when v_paid >= total and total > 0 then 'Paid'
           when v_paid > 0 then 'Partially Paid'
           else 'Unpaid'
         end
   where id = _bill_id;
end $$;

-- One-line label used on the Ledger / PEMO rows.
create or replace function app_private.purchase_label(_bill purchase_bills)
returns text
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_vendor text;
  v_detail text;
begin
  select name into v_vendor from vendors where id = _bill.vendor_id;
  v_detail := case _bill.classification
    when 'project' then _bill.project_type || ' project'
    when 'capex' then 'Asset: ' || coalesce(_bill.asset_name, '')
    else 'Opex: ' || coalesce(_bill.expense_category, '')
  end;
  return 'Purchase ' || _bill.bill_number || ' · ' || coalesce(v_vendor, '') || ' · ' || v_detail;
end $$;

revoke all on function app_private.purchase_require(text) from public;
revoke all on function app_private.purchase_resolve_vendor(text) from public;
revoke all on function app_private.purchase_resolve_contract(text, text) from public;
revoke all on function app_private.purchase_resolve_pemo_card(text) from public;
revoke all on function app_private.purchase_check_classification(text, text, text, text, text) from public;
revoke all on function app_private.purchase_write_items(uuid, uuid, jsonb) from public;
revoke all on function app_private.purchase_refresh_bill(uuid) from public;
revoke all on function app_private.purchase_label(purchase_bills) from public;

-- ---------------------------------------------------------------------------
-- Public RPCs (the web UI and AI agents both use these)
-- ---------------------------------------------------------------------------

create or replace function public.create_vendor(
  p_name text,
  p_company_name text default null,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_trn text default null,
  p_address text default null,
  p_payment_terms_days integer default 30,
  p_bank_name text default null,
  p_bank_account_name text default null,
  p_bank_iban text default null,
  p_opening_balance numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v vendors;
begin
  perform app_private.purchase_require('add');
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Vendor name is required.';
  end if;
  if exists (select 1 from vendors where lower(name) = lower(btrim(p_name))) then
    raise exception 'A vendor named "%" already exists.', btrim(p_name);
  end if;
  insert into vendors (name, company_name, contact_person, email, phone, trn, address, payment_terms_days,
                       bank_name, bank_account_name, bank_iban, opening_balance, notes)
  values (btrim(p_name), nullif(btrim(p_company_name), ''), nullif(btrim(p_contact_person), ''),
          nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_trn), ''),
          nullif(btrim(p_address), ''), coalesce(p_payment_terms_days, 30),
          nullif(btrim(p_bank_name), ''), nullif(btrim(p_bank_account_name), ''), nullif(btrim(p_bank_iban), ''),
          coalesce(p_opening_balance, 0), nullif(btrim(p_notes), ''))
  returning * into v;
  return jsonb_build_object('id', v.id, 'vendor_code', v.vendor_code, 'name', v.name);
end $$;

create or replace function public.save_purchase_order(
  p_vendor text,
  p_classification text,
  p_items jsonb,
  p_project_type text default null,
  p_contract text default null,
  p_asset_name text default null,
  p_asset_category text default null,
  p_expense_category text default null,
  p_order_date date default null,
  p_expected_date date default null,
  p_notes text default null,
  p_purchase_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_vendor uuid;
  v_contract uuid;
  v_class text := lower(btrim(coalesce(p_classification, '')));
  v_po purchase_orders;
  t record;
begin
  perform app_private.purchase_require(case when p_purchase_order_id is null then 'add' else 'edit' end);
  v_vendor := app_private.purchase_resolve_vendor(p_vendor);
  v_contract := app_private.purchase_check_classification(v_class, p_project_type, p_contract, p_asset_name, p_expense_category);

  if p_purchase_order_id is null then
    insert into purchase_orders (vendor_id, order_date, expected_date, classification, project_type, contract_id,
                                 asset_name, asset_category, expense_category, notes)
    values (v_vendor, coalesce(p_order_date, current_date), p_expected_date, v_class,
            case when v_class = 'project' then p_project_type end, v_contract,
            case when v_class = 'capex' then nullif(btrim(p_asset_name), '') end,
            case when v_class = 'capex' then nullif(btrim(p_asset_category), '') end,
            case when v_class = 'opex' then nullif(btrim(p_expense_category), '') end,
            nullif(btrim(p_notes), ''))
    returning * into v_po;
  else
    select * into v_po from purchase_orders where id = p_purchase_order_id for update;
    if v_po.id is null then raise exception 'Purchase order not found.'; end if;
    if v_po.status in ('Billed', 'Cancelled') then
      raise exception 'Purchase order % is % and can no longer be edited.', v_po.po_number, lower(v_po.status);
    end if;
    update purchase_orders
       set vendor_id = v_vendor,
           order_date = coalesce(p_order_date, order_date),
           expected_date = p_expected_date,
           classification = v_class,
           project_type = case when v_class = 'project' then p_project_type end,
           contract_id = v_contract,
           asset_name = case when v_class = 'capex' then nullif(btrim(p_asset_name), '') end,
           asset_category = case when v_class = 'capex' then nullif(btrim(p_asset_category), '') end,
           expense_category = case when v_class = 'opex' then nullif(btrim(p_expense_category), '') end,
           notes = nullif(btrim(p_notes), '')
     where id = v_po.id
    returning * into v_po;
  end if;

  select * into t from app_private.purchase_write_items(v_po.id, null, p_items);
  update purchase_orders set subtotal = t.subtotal, vat_amount = t.vat_amount, total = t.total where id = v_po.id;
  return jsonb_build_object('id', v_po.id, 'po_number', v_po.po_number, 'total', t.total);
end $$;

create or replace function public.save_purchase_bill(
  p_vendor text,
  p_classification text,
  p_payment_method text,
  p_items jsonb,
  p_project_type text default null,
  p_contract text default null,
  p_asset_name text default null,
  p_asset_category text default null,
  p_expense_category text default null,
  p_pemo_card text default null,
  p_bill_date date default null,
  p_due_date date default null,
  p_vendor_bill_ref text default null,
  p_notes text default null,
  p_purchase_order_id uuid default null,
  p_bill_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_vendor uuid;
  v_terms integer;
  v_contract uuid;
  v_card uuid;
  v_class text := lower(btrim(coalesce(p_classification, '')));
  v_method text := btrim(coalesce(p_payment_method, ''));
  v_date date := coalesce(p_bill_date, current_date);
  v_bill purchase_bills;
  v_old purchase_bills;
  v_ledger_id uuid;
  v_label text;
  t record;
begin
  perform app_private.purchase_require(case when p_bill_id is null then 'add' else 'edit' end);
  if v_method not in ('PEMO', 'Cash', 'Bank Transfer', 'Credit') then
    raise exception 'Payment method must be PEMO, Cash, Bank Transfer or Credit.';
  end if;
  v_vendor := app_private.purchase_resolve_vendor(p_vendor);
  select payment_terms_days into v_terms from vendors where id = v_vendor;
  v_contract := app_private.purchase_check_classification(v_class, p_project_type, p_contract, p_asset_name, p_expense_category);
  if v_method = 'PEMO' then
    v_card := app_private.purchase_resolve_pemo_card(p_pemo_card);
  end if;

  if p_bill_id is null then
    insert into purchase_bills (vendor_id, purchase_order_id, vendor_bill_ref, bill_date, due_date, classification,
                                project_type, contract_id, asset_name, asset_category, expense_category,
                                payment_method, pemo_card_id, notes)
    values (v_vendor, p_purchase_order_id, nullif(btrim(p_vendor_bill_ref), ''), v_date,
            case when v_method = 'Credit' then coalesce(p_due_date, v_date + v_terms) else v_date end,
            v_class, case when v_class = 'project' then p_project_type end, v_contract,
            case when v_class = 'capex' then nullif(btrim(p_asset_name), '') end,
            case when v_class = 'capex' then nullif(btrim(p_asset_category), '') end,
            case when v_class = 'opex' then nullif(btrim(p_expense_category), '') end,
            v_method, v_card, nullif(btrim(p_notes), ''))
    returning * into v_bill;
    if p_purchase_order_id is not null then
      update purchase_orders set status = 'Billed' where id = p_purchase_order_id;
    end if;
  else
    select * into v_old from purchase_bills where id = p_bill_id for update;
    if v_old.id is null then raise exception 'Bill not found.'; end if;
    if v_old.status = 'Void' then raise exception 'Bill % is void and cannot be edited.', v_old.bill_number; end if;
    if v_old.payment_method <> v_method then
      raise exception 'The payment method of bill % cannot be changed (it is %). Void the bill and create a new one.', v_old.bill_number, v_old.payment_method;
    end if;
    update purchase_bills
       set vendor_id = v_vendor,
           vendor_bill_ref = nullif(btrim(p_vendor_bill_ref), ''),
           bill_date = v_date,
           due_date = case when v_method = 'Credit' then coalesce(p_due_date, v_date + v_terms) else v_date end,
           classification = v_class,
           project_type = case when v_class = 'project' then p_project_type end,
           contract_id = v_contract,
           asset_name = case when v_class = 'capex' then nullif(btrim(p_asset_name), '') end,
           asset_category = case when v_class = 'capex' then nullif(btrim(p_asset_category), '') end,
           expense_category = case when v_class = 'opex' then nullif(btrim(p_expense_category), '') end,
           pemo_card_id = v_card,
           notes = nullif(btrim(p_notes), '')
     where id = p_bill_id
    returning * into v_bill;
  end if;

  select * into t from app_private.purchase_write_items(null, v_bill.id, p_items);
  if v_method = 'Credit' and t.total < v_bill.amount_paid then
    raise exception 'The new total (%) is less than the % already paid on bill %.', t.total, v_bill.amount_paid, v_bill.bill_number;
  end if;
  update purchase_bills set subtotal = t.subtotal, vat_amount = t.vat_amount, total = t.total
   where id = v_bill.id returning * into v_bill;
  v_label := app_private.purchase_label(v_bill);

  -- Ledger: one Expense row per bill, tagged with the project. Mapping follows the
  -- Ledger's own form: payment_type Credit/Cash/PEMO, payment_method only for paid ones.
  if v_bill.accounts_transaction_id is null then
    insert into accounts_transactions (type, currency, transaction_date, description, amount, project_type,
                                       contract_id, payment_type, payment_method, pemo_card_id)
    values ('Expense', 'AED', v_bill.bill_date, v_label, v_bill.total, v_bill.project_type, v_bill.contract_id,
            case v_method when 'Credit' then 'Credit' when 'PEMO' then 'PEMO' else 'Cash' end,
            case v_method when 'Credit' then null else v_method end,
            v_card)
    returning id into v_ledger_id;
    update purchase_bills set accounts_transaction_id = v_ledger_id where id = v_bill.id;
  else
    v_ledger_id := v_bill.accounts_transaction_id;
    update accounts_transactions
       set transaction_date = v_bill.bill_date, description = v_label, amount = v_bill.total,
           project_type = v_bill.project_type, contract_id = v_bill.contract_id, pemo_card_id = v_card
     where id = v_ledger_id;
  end if;

  -- Paid on the spot: one automatic payment for the full amount, kept in step with the total.
  if v_method <> 'Credit' then
    if exists (select 1 from vendor_payments where bill_id = v_bill.id and is_auto) then
      update vendor_payments
         set amount = v_bill.total, payment_date = v_bill.bill_date, vendor_id = v_bill.vendor_id, pemo_card_id = v_card
       where bill_id = v_bill.id and is_auto;
    elsif v_bill.total > 0 then
      insert into vendor_payments (vendor_id, bill_id, payment_date, amount, payment_method, pemo_card_id, is_auto, reference)
      values (v_bill.vendor_id, v_bill.id, v_bill.bill_date, v_bill.total, v_method, v_card, true, v_bill.vendor_bill_ref);
    end if;
  end if;

  -- PEMO bills mirror into PEMO Management, linked through the Ledger row like a Ledger PEMO expense.
  if v_method = 'PEMO' then
    if exists (select 1 from pemo_transactions where accounts_transaction_id = v_ledger_id) then
      update pemo_transactions
         set occurred_on = v_bill.bill_date, amount = v_bill.total, description = v_label, card_id = v_card,
             invoice_ref = v_bill.vendor_bill_ref
       where accounts_transaction_id = v_ledger_id;
    else
      insert into pemo_transactions (occurred_on, amount, description, card_id, source, accounts_transaction_id, invoice_ref, category)
      values (v_bill.bill_date, v_bill.total, v_label, v_card, 'purchase', v_ledger_id, v_bill.vendor_bill_ref,
              case v_class when 'project' then 'Project' when 'capex' then 'Asset' else v_bill.expense_category end);
    end if;
  end if;

  perform app_private.purchase_refresh_bill(v_bill.id);
  select * into v_bill from purchase_bills where id = v_bill.id;
  return jsonb_build_object('id', v_bill.id, 'bill_number', v_bill.bill_number, 'total', v_bill.total,
                            'status', v_bill.status, 'due_date', v_bill.due_date,
                            'ledger_transaction_id', v_bill.accounts_transaction_id);
end $$;

create or replace function public.record_vendor_payment(
  p_bill text,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default null,
  p_pemo_card text default null,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_bill purchase_bills;
  v_ref text := btrim(coalesce(p_bill, ''));
  v_method text := btrim(coalesce(p_payment_method, ''));
  v_card uuid;
  v_pemo uuid;
  v_pay vendor_payments;
begin
  perform app_private.purchase_require('add');
  if app_private.is_uuid(v_ref) then
    select * into v_bill from purchase_bills where id = v_ref::uuid for update;
  end if;
  if v_bill.id is null then
    select * into v_bill from purchase_bills
     where lower(bill_number) = lower(v_ref) or lower(vendor_bill_ref) = lower(v_ref)
     order by created_at desc limit 1 for update;
  end if;
  if v_bill.id is null then raise exception 'No bill found matching "%" (use the bill number, e.g. BILL-00001).', v_ref; end if;
  if v_bill.status = 'Void' then raise exception 'Bill % is void.', v_bill.bill_number; end if;
  if v_bill.payment_method <> 'Credit' then
    raise exception 'Bill % was already paid by % when it was recorded.', v_bill.bill_number, v_bill.payment_method;
  end if;
  if v_method not in ('PEMO', 'Cash', 'Bank Transfer', 'Cheque') then
    raise exception 'Payment method must be PEMO, Cash, Bank Transfer or Cheque.';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be more than 0.'; end if;
  if p_amount > v_bill.total - v_bill.amount_paid then
    raise exception 'Payment of % is more than the % still owed on bill %.', p_amount, v_bill.total - v_bill.amount_paid, v_bill.bill_number;
  end if;
  if v_method = 'PEMO' then
    v_card := app_private.purchase_resolve_pemo_card(p_pemo_card);
    insert into pemo_transactions (occurred_on, amount, description, card_id, source, invoice_ref, category)
    values (coalesce(p_payment_date, current_date), p_amount, 'Payment for ' || app_private.purchase_label(v_bill),
            v_card, 'purchase', v_bill.vendor_bill_ref, 'Vendor payment')
    returning id into v_pemo;
  end if;
  insert into vendor_payments (vendor_id, bill_id, payment_date, amount, payment_method, pemo_card_id, pemo_transaction_id, reference, notes)
  values (v_bill.vendor_id, v_bill.id, coalesce(p_payment_date, current_date), p_amount, v_method, v_card, v_pemo,
          nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''))
  returning * into v_pay;
  perform app_private.purchase_refresh_bill(v_bill.id);
  select * into v_bill from purchase_bills where id = v_bill.id;
  return jsonb_build_object('id', v_pay.id, 'payment_number', v_pay.payment_number, 'bill_number', v_bill.bill_number,
                            'bill_status', v_bill.status, 'balance_due', v_bill.total - v_bill.amount_paid);
end $$;

create or replace function public.delete_vendor_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_pay vendor_payments;
begin
  perform app_private.purchase_require('delete');
  select * into v_pay from vendor_payments where id = p_payment_id;
  if v_pay.id is null then raise exception 'Payment not found.'; end if;
  if v_pay.is_auto then
    raise exception 'Payment % was made with the bill itself; void the bill instead.', v_pay.payment_number;
  end if;
  delete from vendor_payments where id = v_pay.id;
  if v_pay.pemo_transaction_id is not null then
    delete from pemo_transactions where id = v_pay.pemo_transaction_id;
  end if;
  perform app_private.purchase_refresh_bill(v_pay.bill_id);
  return jsonb_build_object('deleted', v_pay.payment_number);
end $$;

-- Voids a bill: removes its Ledger row (and PEMO mirror) and its automatic payment.
-- Bills with recorded vendor payments must have those payments deleted first.
create or replace function public.void_purchase_bill(p_bill_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_bill purchase_bills;
begin
  perform app_private.purchase_require('delete');
  select * into v_bill from purchase_bills where id = p_bill_id for update;
  if v_bill.id is null then raise exception 'Bill not found.'; end if;
  if v_bill.status = 'Void' then return jsonb_build_object('bill_number', v_bill.bill_number, 'status', 'Void'); end if;
  if exists (select 1 from vendor_payments where bill_id = v_bill.id and not is_auto) then
    raise exception 'Bill % has recorded payments. Delete those payments first, then void the bill.', v_bill.bill_number;
  end if;
  delete from vendor_payments where bill_id = v_bill.id and is_auto;
  if v_bill.accounts_transaction_id is not null then
    delete from pemo_transactions where accounts_transaction_id = v_bill.accounts_transaction_id;
    delete from accounts_transactions where id = v_bill.accounts_transaction_id;
  end if;
  update purchase_bills
     set status = 'Void', amount_paid = 0, accounts_transaction_id = null,
         notes = concat_ws(E'\n', notes, 'Voided' || coalesce(': ' || nullif(btrim(p_reason), ''), ''))
   where id = v_bill.id;
  if v_bill.purchase_order_id is not null then
    update purchase_orders set status = 'Issued'
     where id = v_bill.purchase_order_id
       and not exists (select 1 from purchase_bills b where b.purchase_order_id = v_bill.purchase_order_id and b.status <> 'Void');
  end if;
  return jsonb_build_object('bill_number', v_bill.bill_number, 'status', 'Void');
end $$;

comment on function public.create_vendor is
  'Purchase Management: create a vendor. Only p_name is required; payment terms default to 30 days. Returns {id, vendor_code, name}.';
comment on function public.save_purchase_order is
  'Purchase Management: create (or, with p_purchase_order_id, edit) a purchase order. p_vendor = vendor name, code or id. p_classification = project | capex | opex. project needs p_project_type (FM|AMC) + p_contract (contract number, title or id); capex needs p_asset_name; opex needs p_expense_category. p_items = [{"description","quantity","unit_price","vat_rate"(default 5)}].';
comment on function public.save_purchase_bill is
  'Purchase Management: record (or, with p_bill_id, edit) a vendor bill and post it to the Ledger against its project. Same vendor/classification/items rules as save_purchase_order. p_payment_method = PEMO | Cash | Bank Transfer | Credit; PEMO needs p_pemo_card (card label or id); Credit bills fall due after the vendor payment terms unless p_due_date is given. Pass p_purchase_order_id to bill a purchase order.';
comment on function public.record_vendor_payment is
  'Purchase Management: pay a Credit bill fully or in part. p_bill = bill number (BILL-00001), vendor bill ref or id. p_payment_method = PEMO | Cash | Bank Transfer | Cheque; PEMO needs p_pemo_card.';
comment on function public.delete_vendor_payment is 'Purchase Management: delete a recorded vendor payment.';
comment on function public.void_purchase_bill is 'Purchase Management: void a bill and remove its Ledger entry.';

revoke all on function public.create_vendor(text, text, text, text, text, text, text, integer, text, text, text, numeric, text) from public, anon;
revoke all on function public.save_purchase_order(text, text, jsonb, text, text, text, text, text, date, date, text, uuid) from public, anon;
revoke all on function public.save_purchase_bill(text, text, text, jsonb, text, text, text, text, text, text, date, date, text, text, uuid, uuid) from public, anon;
revoke all on function public.record_vendor_payment(text, numeric, text, date, text, text, text) from public, anon;
revoke all on function public.delete_vendor_payment(uuid) from public, anon;
revoke all on function public.void_purchase_bill(uuid, text) from public, anon;
grant execute on function public.create_vendor(text, text, text, text, text, text, text, integer, text, text, text, numeric, text) to authenticated;
grant execute on function public.save_purchase_order(text, text, jsonb, text, text, text, text, text, date, date, text, uuid) to authenticated;
grant execute on function public.save_purchase_bill(text, text, text, jsonb, text, text, text, text, text, text, date, date, text, text, uuid, uuid) to authenticated;
grant execute on function public.record_vendor_payment(text, numeric, text, date, text, text, text) to authenticated;
grant execute on function public.delete_vendor_payment(uuid) to authenticated;
grant execute on function public.void_purchase_bill(uuid, text) to authenticated;
