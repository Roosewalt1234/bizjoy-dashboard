create or replace function public.fill_work_order_no()
returns trigger
language plpgsql
as $function$
begin
  if new.wo_no is null or new.wo_no = '' then
    new.wo_no := public.next_doc_no('work_order');
  end if;
  return new;
end;
$function$;

drop trigger if exists work_orders_fill_wo_no on public.work_orders;
create trigger work_orders_fill_wo_no
before insert on public.work_orders
for each row execute function public.fill_work_order_no();

update public.work_orders
set wo_no = public.next_doc_no('work_order')
where wo_no is null or wo_no = '';
