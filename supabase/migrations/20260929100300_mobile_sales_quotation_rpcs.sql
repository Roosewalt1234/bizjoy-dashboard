-- Mobile Quotation create/edit. quote_items has no cost/margin columns
-- (description/quantity/unit_price/amount only), so unlike Estimation this
-- is a full, unrestricted read/write surface - the RPC layer exists for
-- the mobile_sales permission check, ownership scoping, and server-side
-- total consistency, not for hiding anything.
--
-- Ownership: quotes are scoped by salesperson = current_employee_name(),
-- same convention as sales_leads (see mobile_can_touch_entity). salesperson
-- is ALWAYS derived server-side here, never trusted from a client
-- parameter - the same fix already applied to mobile_create_sales_lead.

-- The admin app lets the user type quote_number by hand; mobile instead
-- auto-generates one via next_doc_no, same as estimate_number.
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
  elsif kind = 'quote' then
    n := nextval('public.quote_no_seq');
    return 'QT-' || lpad(n::text, 4, '0');
  else
    raise exception 'unknown kind %', kind;
  end if;
end;
$$;

create sequence if not exists public.quote_no_seq;

create or replace function public.mobile_upsert_quote(
  p_id uuid,
  p_customer_name text,
  p_quote_date date,
  p_expiry_date date,
  p_project_name text,
  p_purchase_order text,
  p_terms text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_number text;
begin
  perform app_private.require_mobile_sales(case when p_id is null then 'add' else 'edit' end);

  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Customer name is required';
  end if;

  if p_id is null then
    select next_doc_no('quote') into v_number;
    insert into quotes (
      customer_name, quote_number, quote_date, expiry_date, project_name,
      purchase_order, terms, notes, salesperson, status, currency,
      subtotal, vat_amount, total
    ) values (
      trim(p_customer_name), v_number, p_quote_date, p_expiry_date, p_project_name,
      p_purchase_order, p_terms, p_notes, app_private.current_employee_name(), 'Pending Quotation', 'AED',
      0, 0, 0
    )
    returning id into v_id;
  else
    if not app_private.mobile_can_touch_entity('quote', p_id) then
      raise exception 'Quote not found or not accessible' using errcode = '42501';
    end if;

    update quotes set
      customer_name = trim(p_customer_name),
      quote_date = p_quote_date,
      expiry_date = p_expiry_date,
      project_name = p_project_name,
      purchase_order = p_purchase_order,
      terms = p_terms,
      notes = p_notes,
      updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Quote not found: %', p_id;
    end if;
  end if;

  return v_id;
end;
$$;

-- Recomputes subtotal/vat_amount(5%)/total from the current quote_items
-- rows, same VAT_RATE (0.05) as sales.tsx:208/2434-2436 - called after
-- every item upsert/delete so the header never drifts from its lines.
create or replace function app_private.recompute_quote_totals(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_subtotal numeric;
begin
  select coalesce(sum(amount), 0) into v_subtotal from quote_items where quote_id = p_quote_id;
  update quotes set
    subtotal = v_subtotal,
    vat_amount = round(v_subtotal * 0.05, 2),
    total = round(v_subtotal * 1.05, 2),
    updated_at = now()
  where id = p_quote_id;
end;
$$;

create or replace function public.mobile_upsert_quote_item(
  p_id uuid,
  p_quote_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_sort_order integer
) returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_amount numeric := round(coalesce(p_quantity, 0) * coalesce(p_unit_price, 0), 2);
  v_existing_quote_id uuid;
begin
  perform app_private.require_mobile_sales(case when p_id is null then 'add' else 'edit' end);

  if p_id is null then
    if not app_private.mobile_can_touch_entity('quote', p_quote_id) then
      raise exception 'Quote not found or not accessible' using errcode = '42501';
    end if;

    insert into quote_items (quote_id, sort_order, description, quantity, unit_price, amount)
    values (p_quote_id, coalesce(p_sort_order, 0), coalesce(p_description, ''), coalesce(p_quantity, 0), coalesce(p_unit_price, 0), v_amount)
    returning id into v_id;
  else
    select quote_id into v_existing_quote_id from quote_items where id = p_id;
    if v_existing_quote_id is null then
      raise exception 'Quote item not found: %', p_id;
    end if;
    if v_existing_quote_id <> p_quote_id then
      raise exception 'quote_id does not match the item''s actual quote';
    end if;
    if not app_private.mobile_can_touch_entity('quote', v_existing_quote_id) then
      raise exception 'Quote not found or not accessible' using errcode = '42501';
    end if;

    update quote_items set
      description = coalesce(p_description, ''),
      quantity = coalesce(p_quantity, 0),
      unit_price = coalesce(p_unit_price, 0),
      amount = v_amount,
      sort_order = coalesce(p_sort_order, sort_order),
      updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  perform app_private.recompute_quote_totals(p_quote_id);
  return v_id;
end;
$$;

create or replace function public.mobile_delete_quote_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_quote_id uuid;
begin
  perform app_private.require_mobile_sales('delete');

  select quote_id into v_quote_id from quote_items where id = p_id;
  if v_quote_id is null then
    raise exception 'Quote item not found: %', p_id;
  end if;
  if not app_private.mobile_can_touch_entity('quote', v_quote_id) then
    raise exception 'Quote not found or not accessible' using errcode = '42501';
  end if;

  delete from quote_items where id = p_id;
  perform app_private.recompute_quote_totals(v_quote_id);
end;
$$;

create or replace function public.mobile_list_quote_items(p_quote_id uuid)
returns table (id uuid, sort_order integer, description text, quantity numeric, unit_price numeric, amount numeric)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  if not app_private.mobile_can_touch_entity('quote', p_quote_id) then
    raise exception 'Quote not found or not accessible' using errcode = '42501';
  end if;

  return query
    select i.id, i.sort_order, i.description, i.quantity, i.unit_price, i.amount
    from quote_items i
    where i.quote_id = p_quote_id
    order by i.sort_order asc;
end;
$$;

create or replace function public.mobile_list_quotes()
returns table (
  id uuid, customer_name text, quote_number text, quote_date date, expiry_date date,
  project_name text, purchase_order text, terms text, notes text, status text,
  subtotal numeric, vat_amount numeric, total numeric, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  return query
    select q.id, q.customer_name, q.quote_number, q.quote_date, q.expiry_date,
           q.project_name, q.purchase_order, q.terms, q.notes, q.status,
           q.subtotal, q.vat_amount, q.total, q.created_at
    from quotes q
    where q.salesperson = app_private.current_employee_name()
    order by q.created_at desc;
end;
$$;

grant execute on function public.mobile_upsert_quote(uuid, text, date, date, text, text, text, text) to authenticated;
grant execute on function public.mobile_upsert_quote_item(uuid, uuid, text, numeric, numeric, integer) to authenticated;
grant execute on function public.mobile_delete_quote_item(uuid) to authenticated;
grant execute on function public.mobile_list_quote_items(uuid) to authenticated;
grant execute on function public.mobile_list_quotes() to authenticated;
