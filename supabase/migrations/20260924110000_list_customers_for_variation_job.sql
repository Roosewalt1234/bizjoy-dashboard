-- Same access model as create_variation_job_lead: gated on "is this a
-- real, active employee account", not the 'customers' module permission
-- that direct table access would otherwise require. Without this, the
-- lead-creation RPC would work but the customer dropdown that feeds it
-- would silently return zero rows for any technician not separately
-- granted 'customers:view'.
create or replace function public.list_customers_for_variation_job()
returns table (id uuid, display_name text, company_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and coalesce(status, '') <> 'Terminated'
  ) then
    raise exception 'Not authorized: no active employee record for this account' using errcode = '42501';
  end if;

  return query
    select c.id, c.display_name, c.company_name
    from customers c
    order by c.display_name asc nulls last;
end;
$$;

grant execute on function public.list_customers_for_variation_job() to authenticated;
