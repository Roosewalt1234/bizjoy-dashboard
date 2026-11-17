-- mobile_list_sales_leads previously scoped rows to
--   where l.salesperson = app_private.current_employee_name()
-- i.e. a strict equality on the free-text salesperson field against the
-- caller's employee full_name. In practice that field is far too inconsistent
-- to scope by: most leads carry a NULL salesperson (created via the dashboard /
-- bulk import, which never sets it) and a single person's name is stored under
-- several spellings (e.g. "Devika", "Devika " with a trailing space, and the
-- full "DEVIKA MADATHIPARAMBIL BAIJU"). The net effect was that the mobile
-- Sales screen - the Leads tab and the Estimation "Link to a Lead" dropdown,
-- which both read this RPC - showed almost nothing: every NULL-salesperson lead
-- was invisible to everyone, and named leads only matched the exact spelling.
--
-- Per the team's decision, the mobile Sales screen should list ALL leads
-- regardless of who the salesperson is. We drop the row filter entirely while
-- keeping the require_mobile_sales('view') permission gate, so access is still
-- controlled by the mobile_sales permission, just no longer partitioned by the
-- unreliable salesperson string.
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
    order by l.created_at desc;
end;
$$;
