-- mobile_create_sales_lead's body was already fixed (20260929100150) to
-- ignore p_salesperson and derive it server-side via current_employee_name(),
-- but the parameter itself was left in the signature - unlike
-- mobile_upsert_quote, which was built fresh without one. This left a
-- vestigial required 9th parameter that the mobile client (built against
-- the corrected, 8-param design intent) doesn't send, breaking the RPC
-- call at runtime. Drop and recreate with the real 8-param signature,
-- matching mobile_upsert_quote's pattern exactly.

drop function if exists public.mobile_create_sales_lead(text, text, text, text, text, numeric, date, text, text);

create or replace function public.mobile_create_sales_lead(
  p_lead_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_lead_type text,
  p_estimated_value numeric,
  p_expected_close_date date,
  p_notes text
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

grant execute on function public.mobile_create_sales_lead(text, text, text, text, text, numeric, date, text) to authenticated;
