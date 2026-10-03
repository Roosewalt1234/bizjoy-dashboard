alter table public.work_orders
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

create unique index if not exists work_orders_quote_id_key
  on public.work_orders (quote_id) where quote_id is not null;

create or replace function public.create_work_order_for_won_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ids uuid[];
  v_customer_id uuid;
  v_work text;
  v_notes text;
begin
  if new.status is distinct from 'Won & Activated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;
  if exists (select 1 from public.work_orders where quote_id = new.id) then
    return new;
  end if;

  -- Link the customer only when the name matches exactly one customer.
  select array_agg(c.id) into v_ids
  from public.customers c
  where new.customer_name is not null
    and (lower(c.display_name) = lower(new.customer_name)
         or lower(c.company_name) = lower(new.customer_name));
  if array_length(v_ids, 1) = 1 then
    v_customer_id := v_ids[1];
  end if;

  -- Quote line items become the work requested, one per item (same
  -- separator the work order screens split on).
  select string_agg(
           qi.description || ' (Qty ' || trim(trailing '.' from trim(trailing '0' from qi.quantity::text)) || ')',
           E'\n---\n' order by qi.sort_order, qi.created_at)
    into v_work
  from public.quote_items qi
  where qi.quote_id = new.id;

  v_notes := concat_ws(E'\n',
    'Auto-created from Quotation ' || coalesce(new.quote_number, new.id::text) || ' (Won & Activated).',
    case when new.quote_type is not null then 'Quote type: ' || new.quote_type end,
    case when new.purchase_order is not null and new.purchase_order <> '' then 'Purchase order: ' || new.purchase_order end,
    case when new.salesperson is not null and new.salesperson <> '' then 'Salesperson: ' || new.salesperson end,
    case when new.total is not null then 'Quote total: ' || coalesce(new.currency, 'AED') || ' ' || new.total::text end,
    case when new.terms is not null and new.terms <> '' then E'Terms:\n' || new.terms end,
    case when new.notes is not null and new.notes <> '' then E'Quote notes:\n' || new.notes end
  );

  insert into public.work_orders (
    quote_id, module_type, customer_id, customer_name, location,
    problem_reported, work_requested, notes, status, priority, requested_date
  ) values (
    new.id, 'AMC', v_customer_id, new.customer_name, new.project_name,
    coalesce(nullif(new.subject, ''), nullif(new.project_name, ''),
             'Work as per quotation ' || coalesce(new.quote_number, '')),
    v_work, v_notes, 'Open', 'Medium', current_date
  )
  on conflict (quote_id) where quote_id is not null do nothing;

  return new;
end;
$function$;

drop trigger if exists quotes_create_work_order on public.quotes;
create trigger quotes_create_work_order
after insert or update of status on public.quotes
for each row execute function public.create_work_order_for_won_quote();
