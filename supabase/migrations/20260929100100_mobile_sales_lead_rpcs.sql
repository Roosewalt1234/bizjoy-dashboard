-- Mobile Lead create/update/list. Unlike create_variation_job_lead (which
-- exists for a different, permission-free flow), these check mobile_sales
-- specifically and write the fields the mobile Sales/Lead screen collects.

create or replace function public.mobile_create_sales_lead(
  p_lead_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_lead_type text,
  p_estimated_value numeric,
  p_expected_close_date date,
  p_notes text,
  p_salesperson text
) returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_id uuid;
begin
  perform app_private.require_mobile_sales('add');

  if coalesce(trim(p_lead_name), '') = '' then
    raise exception 'Lead name is required';
  end if;

  insert into sales_leads (
    lead_name, company, phone, email, lead_type, estimated_value,
    expected_close_date, notes, salesperson, stage, source, currency
  ) values (
    trim(p_lead_name), p_company, p_phone, p_email, p_lead_type, p_estimated_value,
    p_expected_close_date, p_notes, p_salesperson, 'New Lead / Inquiry',
    'Sales Mobile App', 'AED'
  )
  returning id into v_id;

  return v_id;
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
  where id = p_id;
end;
$$;

-- Scoped to the caller's own leads (matched by salesperson display name,
-- the same free-text field create_variation_job_lead already writes -
-- there's no proper FK to an employee here, so this is a name match, not
-- an id join).
create or replace function public.mobile_list_sales_leads()
returns table (
  id uuid, lead_name text, company text, phone text, email text,
  lead_type text, estimated_value numeric, expected_close_date date,
  notes text, stage text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.require_mobile_sales('view');

  return query
    select l.id, l.lead_name, l.company, l.phone, l.email, l.lead_type,
           l.estimated_value, l.expected_close_date, l.notes, l.stage, l.created_at
    from sales_leads l
    where l.salesperson = app_private.current_employee_name()
    order by l.created_at desc;
end;
$$;

grant execute on function public.mobile_create_sales_lead(text, text, text, text, text, numeric, date, text, text) to authenticated;
grant execute on function public.mobile_update_sales_lead(uuid, text, text, text, text, text, numeric, date, text) to authenticated;
grant execute on function public.mobile_list_sales_leads() to authenticated;
