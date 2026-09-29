-- mobile_create_sales_lead previously trusted the client-supplied
-- p_salesperson string verbatim, untrimmed, while mobile_list_sales_leads
-- matches leads by strict equality against app_private.current_employee_name().
-- A whitespace/casing mismatch between the two meant a lead could silently
-- vanish from its own creator's list. Now the RPC ignores p_salesperson's
-- value and always derives it from current_employee_name(), guaranteeing
-- create and list always agree. The parameter stays in the signature so
-- callers don't need to change, but its value is no longer used.
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
    p_expected_close_date, p_notes, app_private.current_employee_name(), 'New Lead / Inquiry',
    'Sales Mobile App', 'AED'
  )
  returning id into v_id;

  return v_id;
end;
$$;
