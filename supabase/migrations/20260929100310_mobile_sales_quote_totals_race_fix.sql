-- recompute_quote_totals did a plain SELECT sum(...) followed by a separate
-- UPDATE with no row lock, so two concurrent item mutations on the same
-- quote could interleave under READ COMMITTED: each computes its subtotal
-- from a snapshot missing the other's yet-uncommitted insert, and the
-- second writer to commit overwrites the first's total with a stale value.
-- Locking the quotes row up front serializes the whole read-then-write per
-- quote, closing the race.
create or replace function app_private.recompute_quote_totals(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_subtotal numeric;
begin
  perform 1 from quotes where id = p_quote_id for update;

  select coalesce(sum(amount), 0) into v_subtotal from quote_items where quote_id = p_quote_id;
  update quotes set
    subtotal = v_subtotal,
    vat_amount = round(v_subtotal * 0.05, 2),
    total = round(v_subtotal * 1.05, 2),
    updated_at = now()
  where id = p_quote_id;
end;
$$;
