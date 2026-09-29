-- Adds the 'mobile_sales' key to the mobile permission gate, and adds the
-- shared status-change / remarks RPCs that Lead, Estimation, and Quotation
-- all use on mobile. Reuses the office's existing followup_remarks table
-- (previously lead/quote only) instead of a new table, per approved design.

create or replace function public.get_my_mobile_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(array_agg(m.key), '{}'::text[])
  from (values
    ('mobile_attendance'),
    ('mobile_pending_jobs'),
    ('mobile_schedule'),
    ('mobile_report_snag'),
    ('mobile_variation_job'),
    ('mobile_completion_report'),
    ('mobile_floor_scan'),
    ('mobile_sales')
  ) as m(key)
  where app_private.can(auth.uid(), m.key, 'view');
$$;

-- followup_remarks.entity_type was CHECK'd to ('lead','quote') only;
-- Estimation now uses the same log, so 'estimate' is added.
alter table public.followup_remarks
  drop constraint followup_remarks_entity_type_check;
alter table public.followup_remarks
  add constraint followup_remarks_entity_type_check
  check (entity_type in ('lead', 'quote', 'estimate'));

-- Every mobile Sales RPC in this and later migrations checks this first.
create or replace function app_private.require_mobile_sales(_action text)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and coalesce(status, '') <> 'Terminated'
  ) then
    raise exception 'Not authorized: no active employee record for this account' using errcode = '42501';
  end if;

  if not app_private.can(auth.uid(), 'mobile_sales', _action) then
    raise exception 'Not authorized: mobile_sales permission not granted' using errcode = '42501';
  end if;
end;
$$;

-- Resolves the calling employee's display name for attribution, same
-- fallback chain the admin app's own saveFollowup()/saveStatus() use.
create or replace function app_private.current_employee_name()
returns text
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(e.full_name, u.email, 'Unknown')
  from employees e
  join auth.users u on u.id = e.auth_user_id
  where e.auth_user_id = auth.uid()
  limit 1;
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

  return query
    select f.id, f.remark, f.user_name, f.created_at
    from followup_remarks f
    where f.entity_type = p_entity_type
      and f.entity_id = p_entity_id
    order by f.created_at desc;
end;
$$;

-- Validates p_new_status against the real allowed set for that entity type
-- before writing, so mobile can never invent a status the admin app's own
-- stage-coloring/kanban logic doesn't recognize.
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
begin
  perform app_private.require_mobile_sales('edit');

  if p_entity_type = 'lead' then
    if not (p_new_status = any(v_lead_quote_stages)) then
      raise exception 'Invalid lead stage: %', p_new_status;
    end if;
    update sales_leads set stage = p_new_status, updated_at = now() where id = p_entity_id;
  elsif p_entity_type = 'quote' then
    if not (p_new_status = any(v_lead_quote_stages)) then
      raise exception 'Invalid quote status: %', p_new_status;
    end if;
    update quotes set status = p_new_status, updated_at = now() where id = p_entity_id;
  elsif p_entity_type = 'estimate' then
    if p_new_status not in ('Draft', 'Converted') then
      raise exception 'Invalid estimate status: %', p_new_status;
    end if;
    update estimates set status = p_new_status, updated_at = now() where id = p_entity_id;
  else
    raise exception 'Invalid entity_type: %', p_entity_type;
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

grant execute on function public.mobile_add_followup_remark(text, uuid, text) to authenticated;
grant execute on function public.mobile_list_followup_remarks(text, uuid) to authenticated;
grant execute on function public.mobile_change_entity_status(text, uuid, text, text) to authenticated;
