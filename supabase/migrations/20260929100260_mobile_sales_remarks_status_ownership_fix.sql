-- mobile_add_followup_remark, mobile_list_followup_remarks, and
-- mobile_change_entity_status (Task 1) had the identical ownership gap
-- just fixed for the Estimation RPCs: any mobile_sales-permitted user
-- could add a remark to, read the remark history of, or change the
-- status/stage of ANY lead/quote/estimate by id, not just their own.
-- This adds a generic ownership check reused by all three: leads/quotes
-- are scoped by salesperson = current_employee_name(), estimates reuse
-- the existing app_private.mobile_can_touch_estimate helper.

create or replace function app_private.mobile_can_touch_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if p_entity_type = 'lead' then
    return exists (
      select 1 from sales_leads
      where id = p_entity_id and salesperson = app_private.current_employee_name()
    );
  elsif p_entity_type = 'quote' then
    return exists (
      select 1 from quotes
      where id = p_entity_id and salesperson = app_private.current_employee_name()
    );
  elsif p_entity_type = 'estimate' then
    return app_private.mobile_can_touch_estimate(p_entity_id);
  else
    return false;
  end if;
end;
$$;

create or replace function public.mobile_add_followup_remark(
  p_entity_type text,
  p_entity_id uuid,
  p_remark text
) returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
begin
  perform app_private.require_mobile_sales('add');

  if p_entity_type not in ('lead', 'quote', 'estimate') then
    raise exception 'Invalid entity_type: %', p_entity_type;
  end if;
  if not app_private.mobile_can_touch_entity(p_entity_type, p_entity_id) then
    raise exception 'Record not found or not accessible' using errcode = '42501';
  end if;
  if coalesce(trim(p_remark), '') = '' then
    raise exception 'Remark cannot be empty';
  end if;

  insert into followup_remarks (entity_type, entity_id, remark, user_id, user_name)
  values (p_entity_type, p_entity_id, trim(p_remark), auth.uid(), app_private.current_employee_name())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.mobile_list_followup_remarks(
  p_entity_type text,
  p_entity_id uuid
) returns table (id uuid, remark text, user_name text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  if not app_private.mobile_can_touch_entity(p_entity_type, p_entity_id) then
    raise exception 'Record not found or not accessible' using errcode = '42501';
  end if;

  return query
    select f.id, f.remark, f.user_name, f.created_at
    from followup_remarks f
    where f.entity_type = p_entity_type
      and f.entity_id = p_entity_id
    order by f.created_at desc;
end;
$$;

create or replace function public.mobile_change_entity_status(
  p_entity_type text,
  p_entity_id uuid,
  p_new_status text,
  p_remark text default null
) returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_lead_quote_stages text[] := array[
    'New Lead / Inquiry', 'Contacted / Pitching', 'Site Survey Scheduled',
    'Survey Report Ready', 'Pending Quotation', 'Proposal / Quote Sent',
    'Negotiation', 'Pending Decision', 'Validity Expired', 'Won & Activated',
    'Invoiced', 'Closed Lost', 'Cancelled'
  ];
  v_updated_id uuid;
begin
  perform app_private.require_mobile_sales('edit');

  if not app_private.mobile_can_touch_entity(p_entity_type, p_entity_id) then
    raise exception 'Record not found or not accessible' using errcode = '42501';
  end if;

  if p_entity_type = 'lead' then
    if not (p_new_status = any(v_lead_quote_stages)) then
      raise exception 'Invalid lead stage: %', p_new_status;
    end if;
    update sales_leads set stage = p_new_status, updated_at = now() where id = p_entity_id returning id into v_updated_id;
  elsif p_entity_type = 'quote' then
    if not (p_new_status = any(v_lead_quote_stages)) then
      raise exception 'Invalid quote status: %', p_new_status;
    end if;
    update quotes set status = p_new_status, updated_at = now() where id = p_entity_id returning id into v_updated_id;
  elsif p_entity_type = 'estimate' then
    if p_new_status not in ('Draft', 'Converted') then
      raise exception 'Invalid estimate status: %', p_new_status;
    end if;
    update estimates set status = p_new_status, updated_at = now() where id = p_entity_id returning id into v_updated_id;
  else
    raise exception 'Invalid entity_type: %', p_entity_type;
  end if;

  if v_updated_id is null then
    raise exception 'Record not found: %', p_entity_id;
  end if;

  if coalesce(trim(p_remark), '') <> '' then
    insert into followup_remarks (entity_type, entity_id, remark, user_id, user_name)
    values (
      p_entity_type, p_entity_id,
      format('Status changed to "%s" — %s', p_new_status, trim(p_remark)),
      auth.uid(), app_private.current_employee_name()
    );
  end if;
end;
$$;
