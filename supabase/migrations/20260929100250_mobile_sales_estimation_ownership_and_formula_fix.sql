-- Fixes two issues found in code review of the Estimation RPCs (Task 3):
-- 1. mobile_upsert_estimate_item's UPDATE branch recomputed sell_amount
--    using the hardcoded 15% material markup default instead of the row's
--    actual stored material_markup_pct, silently corrupting the price for
--    any line the office had customized away from the default.
-- 2. None of the id-based operations (mobile_upsert_estimate's UPDATE,
--    mobile_upsert_estimate_item's UPDATE, mobile_delete_estimate_item,
--    mobile_list_estimate_items) checked that the estimate belonged to the
--    caller's own scope (the same scope mobile_list_estimates() already
--    establishes) - any mobile_sales-permitted user could touch any
--    estimate by UUID. mobile_update_sales_lead (Task 2) had the identical
--    gap for leads - fixed here too.

create or replace function app_private.mobile_can_touch_estimate(p_estimate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1 from estimates e
    where e.id = p_estimate_id
      and (
        e.lead_id is null
        or e.lead_id in (select l.id from sales_leads l where l.salesperson = app_private.current_employee_name())
      )
  );
$$;

create or replace function public.mobile_upsert_estimate(
  p_id uuid,
  p_lead_id uuid,
  p_customer_name text,
  p_estimate_date date,
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
    select next_doc_no('estimate') into v_number;
    insert into estimates (lead_id, customer_name, estimate_number, estimate_date, notes, status)
    values (p_lead_id, trim(p_customer_name), v_number, p_estimate_date, p_notes, 'Draft')
    returning id into v_id;
  else
    if not app_private.mobile_can_touch_estimate(p_id) then
      raise exception 'Estimate not found or not accessible' using errcode = '42501';
    end if;

    update estimates set
      lead_id = p_lead_id,
      customer_name = trim(p_customer_name),
      estimate_date = p_estimate_date,
      notes = p_notes,
      updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Estimate not found: %', p_id;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.mobile_upsert_estimate_item(
  p_id uuid,
  p_estimate_id uuid,
  p_description text,
  p_material_cost numeric,
  p_labor_hours numeric,
  p_labor_rate numeric,
  p_sort_order integer
) returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
  v_material_cost numeric := coalesce(p_material_cost, 0);
  v_labor_hours numeric := coalesce(p_labor_hours, 0);
  v_labor_rate numeric := coalesce(p_labor_rate, 0);
  v_material_markup_pct numeric;
  v_subcontractor_cost numeric;
  v_subcontractor_markup_pct numeric;
  v_apply_overhead boolean;
  v_overhead_pct numeric;
  v_material_sell numeric;
  v_labor_sell numeric;
  v_subcont_sell numeric;
  v_sell_amount numeric;
  v_existing record;
begin
  perform app_private.require_mobile_sales(case when p_id is null then 'add' else 'edit' end);

  if p_id is null then
    if not app_private.mobile_can_touch_estimate(p_estimate_id) then
      raise exception 'Estimate not found or not accessible' using errcode = '42501';
    end if;

    -- Same defaults as emptyEstimateItem() in sales.tsx - mobile never
    -- collects or sees these.
    v_material_markup_pct := 15;
    v_subcontractor_cost := 0;
    v_subcontractor_markup_pct := 15;
    v_apply_overhead := true;
    v_overhead_pct := 25;
  else
    select estimate_id, material_markup_pct, subcontractor_cost, subcontractor_markup_pct, apply_overhead, overhead_pct
    into v_existing
    from estimate_items
    where id = p_id;

    if not found then
      raise exception 'Estimate item not found: %', p_id;
    end if;
    if v_existing.estimate_id <> p_estimate_id then
      raise exception 'estimate_id does not match the item''s actual estimate';
    end if;
    if not app_private.mobile_can_touch_estimate(v_existing.estimate_id) then
      raise exception 'Estimate not found or not accessible' using errcode = '42501';
    end if;

    -- Recompute from the CURRENT stored markup/overhead, not the defaults
    -- above, so an office-adjusted markup isn't silently reset or, worse,
    -- silently overwritten with the wrong material markup (the bug fixed
    -- here).
    v_material_markup_pct := v_existing.material_markup_pct;
    v_subcontractor_cost := v_existing.subcontractor_cost;
    v_subcontractor_markup_pct := v_existing.subcontractor_markup_pct;
    v_apply_overhead := v_existing.apply_overhead;
    v_overhead_pct := v_existing.overhead_pct;
  end if;

  -- Same formula as computeLineSellAmount() in sales.tsx:252-259.
  v_material_sell := v_material_cost * (1 + v_material_markup_pct / 100);
  v_labor_sell := v_labor_hours * v_labor_rate;
  v_subcont_sell := v_subcontractor_cost * (1 + v_subcontractor_markup_pct / 100);
  v_sell_amount := round(
    (v_material_sell + v_labor_sell + v_subcont_sell)
      * (case when v_apply_overhead then 1 + v_overhead_pct / 100 else 1 end),
    2
  );

  if p_id is null then
    insert into estimate_items (
      estimate_id, sort_order, description, material_cost, material_markup_pct,
      labor_hours, labor_rate, subcontractor_cost, subcontractor_markup_pct,
      apply_overhead, overhead_pct, sell_amount
    ) values (
      p_estimate_id, coalesce(p_sort_order, 0), coalesce(p_description, ''), v_material_cost,
      v_material_markup_pct, v_labor_hours, v_labor_rate, v_subcontractor_cost,
      v_subcontractor_markup_pct, v_apply_overhead, v_overhead_pct, v_sell_amount
    )
    returning id into v_id;
  else
    update estimate_items set
      description = coalesce(p_description, ''),
      material_cost = v_material_cost,
      labor_hours = v_labor_hours,
      labor_rate = v_labor_rate,
      sort_order = coalesce(p_sort_order, sort_order),
      sell_amount = v_sell_amount,
      updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Estimate item not found: %', p_id;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.mobile_delete_estimate_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_estimate_id uuid;
begin
  perform app_private.require_mobile_sales('delete');

  select estimate_id into v_estimate_id from estimate_items where id = p_id;
  if v_estimate_id is null then
    raise exception 'Estimate item not found: %', p_id;
  end if;
  if not app_private.mobile_can_touch_estimate(v_estimate_id) then
    raise exception 'Estimate not found or not accessible' using errcode = '42501';
  end if;

  delete from estimate_items where id = p_id;
end;
$$;

create or replace function public.mobile_list_estimate_items(p_estimate_id uuid)
returns table (id uuid, sort_order integer, description text, material_cost numeric, labor_hours numeric, labor_rate numeric)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  if not app_private.mobile_can_touch_estimate(p_estimate_id) then
    raise exception 'Estimate not found or not accessible' using errcode = '42501';
  end if;

  return query
    select i.id, i.sort_order, i.description, i.material_cost, i.labor_hours, i.labor_rate
    from estimate_items i
    where i.estimate_id = p_estimate_id
    order by i.sort_order asc;
end;
$$;

create or replace function public.mobile_update_sales_lead(
  p_id uuid,
  p_lead_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_lead_type text,
  p_estimated_value numeric,
  p_expected_close_date date,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_updated_id uuid;
begin
  perform app_private.require_mobile_sales('edit');

  if coalesce(trim(p_lead_name), '') = '' then
    raise exception 'Lead name is required';
  end if;

  update sales_leads set
    lead_name = trim(p_lead_name),
    company = p_company,
    phone = p_phone,
    email = p_email,
    lead_type = p_lead_type,
    estimated_value = p_estimated_value,
    expected_close_date = p_expected_close_date,
    notes = p_notes,
    updated_at = now()
  where id = p_id
    and salesperson = app_private.current_employee_name()
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Lead not found or not accessible' using errcode = '42501';
  end if;
end;
$$;
