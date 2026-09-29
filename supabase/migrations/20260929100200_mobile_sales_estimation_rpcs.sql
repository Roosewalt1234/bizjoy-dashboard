-- The load-bearing part of this feature: mobile can write/read only
-- description/material_cost/labor_hours/labor_rate on estimate_items.
-- material_markup_pct, subcontractor_cost, subcontractor_markup_pct,
-- apply_overhead, overhead_pct, and sell_amount are NEVER selected or
-- returned by any function here - mobile_upsert_estimate_item applies the
-- same defaults emptyEstimateItem() uses in the admin app
-- (material_markup_pct=15, subcontractor_cost=0, subcontractor_markup_pct=15,
-- apply_overhead=true, overhead_pct=25) and computes sell_amount itself
-- using the identical formula computeLineSellAmount() uses
-- (sales.tsx:252-259), but does not return it - a caller who supplied the
-- cost inputs could otherwise back-calculate the hidden markup/overhead.

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
    update estimates set
      lead_id = p_lead_id,
      customer_name = trim(p_customer_name),
      estimate_date = p_estimate_date,
      notes = p_notes,
      updated_at = now()
    where id = p_id
    returning id into v_id;
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
  -- Same defaults as emptyEstimateItem() in sales.tsx - mobile never
  -- collects or sees these.
  v_material_markup_pct constant numeric := 15;
  v_subcontractor_cost constant numeric := 0;
  v_subcontractor_markup_pct constant numeric := 15;
  v_apply_overhead constant boolean := true;
  v_overhead_pct constant numeric := 25;
  v_material_sell numeric;
  v_labor_sell numeric;
  v_subcont_sell numeric;
  v_sell_amount numeric;
begin
  perform app_private.require_mobile_sales(case when p_id is null then 'add' else 'edit' end);

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
      -- Markup/overhead/subcontractor fields are intentionally left
      -- untouched on update - if the office has since adjusted them,
      -- a mobile edit to cost/labor shouldn't silently reset them back
      -- to defaults. sell_amount is recomputed from the CURRENT stored
      -- markup/overhead, not the defaults above, so it stays accurate.
      sell_amount = round(
        (v_material_sell + v_labor_sell
          + (subcontractor_cost * (1 + subcontractor_markup_pct / 100)))
          * (case when apply_overhead then 1 + overhead_pct / 100 else 1 end),
        2
      ),
      updated_at = now()
    where id = p_id
    returning id into v_id;
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
begin
  perform app_private.require_mobile_sales('delete');
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

  return query
    select i.id, i.sort_order, i.description, i.material_cost, i.labor_hours, i.labor_rate
    from estimate_items i
    where i.estimate_id = p_estimate_id
    order by i.sort_order asc;
end;
$$;

-- No salesperson/creator column exists on estimates - scope to the
-- caller's own leads' estimates, plus any estimate with no lead_id at all
-- (a standalone estimate can't be attributed to a specific salesperson
-- either way).
create or replace function public.mobile_list_estimates()
returns table (
  id uuid, lead_id uuid, customer_name text, estimate_number text,
  estimate_date date, status text, notes text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  return query
    select e.id, e.lead_id, e.customer_name, e.estimate_number, e.estimate_date,
           e.status, e.notes, e.created_at
    from estimates e
    where e.lead_id is null
       or e.lead_id in (
         select l.id from sales_leads l where l.salesperson = app_private.current_employee_name()
       )
    order by e.created_at desc;
end;
$$;

grant execute on function public.mobile_upsert_estimate(uuid, uuid, text, date, text) to authenticated;
grant execute on function public.mobile_upsert_estimate_item(uuid, uuid, text, numeric, numeric, numeric, integer) to authenticated;
grant execute on function public.mobile_delete_estimate_item(uuid) to authenticated;
grant execute on function public.mobile_list_estimate_items(uuid) to authenticated;
grant execute on function public.mobile_list_estimates() to authenticated;
