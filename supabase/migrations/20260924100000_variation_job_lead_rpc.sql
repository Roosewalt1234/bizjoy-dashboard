-- Lets any logged-in mobile app user (FM or AMC field staff) create a
-- real sales_leads + lead_items record without needing the 'sales'
-- module permission that gates the dashboard's own direct table access -
-- the actual access control here is "is this a real, active employee
-- account", checked via employees.auth_user_id, not sales-module
-- permission. Stage and source are hard-coded by the function itself,
-- never trusted from the caller.
create or replace function public.create_variation_job_lead(
  p_customer_id uuid,
  p_lead_type text,
  p_expected_close_date date,
  p_salesperson text,
  p_remarks text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_lead_id uuid;
  v_item jsonb;
  v_idx int;
begin
  if not exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and coalesce(status, '') <> 'Terminated'
  ) then
    raise exception 'Not authorized: no active employee record for this account' using errcode = '42501';
  end if;

  select id, display_name, company_name, email, coalesce(mobile, phone) as phone
  into v_customer
  from customers
  where id = p_customer_id;

  if v_customer.id is null then
    raise exception 'Customer not found: %', p_customer_id;
  end if;

  insert into sales_leads (
    lead_name, company, email, phone, stage, source,
    currency, expected_close_date, salesperson, notes, lead_type
  ) values (
    v_customer.display_name, v_customer.company_name, v_customer.email, v_customer.phone,
    'New Lead / Inquiry', 'AMC Mobile App',
    'AED', p_expected_close_date, p_salesperson, p_remarks, p_lead_type
  )
  returning id into v_lead_id;

  for v_item, v_idx in
    select value, ordinality - 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality
  loop
    insert into lead_items (lead_id, sort_order, description, quantity)
    values (
      v_lead_id,
      v_idx,
      v_item->>'description',
      coalesce((v_item->>'quantity')::numeric, 1)
    );
  end loop;

  return v_lead_id;
end;
$$;

grant execute on function public.create_variation_job_lead(uuid, text, date, text, text, jsonb) to authenticated;
