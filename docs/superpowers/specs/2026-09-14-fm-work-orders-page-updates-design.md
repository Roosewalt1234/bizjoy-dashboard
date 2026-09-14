# FM Work Orders Page Updates — Design

## Context

Direct feedback on the FM Work Orders page (`src/features/fm-work-orders/fm-work-orders-list.tsx`,
route `src/routes/_authenticated/fm-work-orders.tsx`) after using it day-to-day, covering four
independent issues:

1. Work orders created by the mobile app show no work order number.
2. The "Service type" filter dropdown is hardcoded to a list that doesn't match the FM business
   (it's a list shared with FM Service Reports and AMC Work Orders).
3. There's no way to filter by request type.
4. The Actions column is a wall of icon buttons.

All four changes are scoped to **FM Work Orders only** — `fm_work_orders` table, the
`FmWorkOrdersListPage` list, and the `FmWorkOrderModal` create/edit form
(`src/features/fm-work-orders/fm-work-order-modal.tsx`). Nothing here touches `public.contracts`
or `public.work_orders` (the AMC tables/pages), or the shared constants those pages still use
(`SERVICE_TYPES` in `src/lib/service-reports.ts`, `SLA_REQUEST_TYPES` in `src/lib/fm-sla.ts`).

## Goal 1: Work Order Number

**Root cause (confirmed live against the database):** the web New/Edit Work Order form calls
`next_doc_no('work_order')` (a Postgres function returning `'WO-' || nextval('work_order_no_seq')`,
zero-padded) client-side and sets `wo_no` before inserting. The mobile app inserts into
`fm_work_orders` without doing this, so its rows get a `null` `wo_no`. A live count shows 19 of 23
existing `fm_work_orders` rows currently have a blank `wo_no`.

**Fix:** a `BEFORE INSERT` trigger on `fm_work_orders` that fills in `wo_no` via the same
`next_doc_no('work_order')` function whenever the incoming row's `wo_no` is null or empty. This:
- Fixes it for the mobile app, and any other future client, with no mobile-app code changes.
- Does not change web-form behavior: the web form already sets `wo_no` before insert, so the
  trigger's `IF NEW.wo_no IS NULL OR NEW.wo_no = ''` guard never fires for web-created rows.
- Shares the exact same sequence (`work_order_no_seq`) and prefix (`WO-####`) that AMC's
  `work_orders` table also draws from today — this is already how numbering works for
  web-created rows in both tables (interleaved), so the trigger doesn't introduce a new numbering
  scheme, it just closes a gap for one insert path on one FM table.
- Only touches `fm_work_orders`. `public.work_orders` (AMC) and `public.contracts` (AMC) are not
  modified in any way.

**Backfill:** a one-time `UPDATE` assigning `next_doc_no('work_order')` to every existing
`fm_work_orders` row where `wo_no` is null or empty, processed in `created_at` order so the
backfilled numbers reflect actual chronological creation order.

## Goal 2: Service Type — new FM-only list

Replace the hardcoded, shared `SERVICE_TYPES` list currently used by both the list's Service Type
filter and the create/edit form's Service Type field with a new FM-Work-Orders-only constant:

```ts
export const FM_WORK_ORDER_SERVICE_TYPES = [
  "Cleaning",
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Masonry",
  "Air Condition",
  "Home Plans",
] as const;
```

Applied in both places (per your confirmation, so filter values always match what's actually
stored on new work orders):
- `fm-work-orders-list.tsx`'s "Service type" filter `<Select>`.
- `fm-work-order-modal.tsx`'s "Service Type" `<Select>` (replacing its `SERVICE_TYPES` import).

`src/lib/service-reports.ts`'s `SERVICE_TYPES` constant itself is untouched — FM Service Reports
and AMC's `work-order-dialog.tsx` keep using it exactly as today.

## Goal 3: Request Type — new filter + FM-only list

New constant, same file as Goal 2's list:

```ts
export const FM_WORK_ORDER_REQUEST_TYPES = [
  "Reactive",
  "Complementary",
  "PBL",
] as const;
```

- **New filter dropdown** added to the filter bar in `fm-work-orders-list.tsx`, alongside the
  existing Search / Service type / Status filters. New `requestTypeFilter` state (default
  `"all"`), applied in the existing `filtered` `useMemo` the same way `typeFilter` and
  `statusFilter` already are.
- **Create/edit form**: `fm-work-order-modal.tsx`'s "Request Type" `<Select>` switches from
  `SLA_REQUEST_TYPES` to `FM_WORK_ORDER_REQUEST_TYPES`. The form's default value, `"Reactive"`,
  remains valid since it's in the new list too.

`src/lib/fm-sla.ts`'s `SLA_REQUEST_TYPES` constant itself is untouched — the SLA Policies page
(`fm-sla.tsx`), FM invoice/report aggregation (`fm-invoice.ts`, `fm-reports.ts`), and AMC's
`work-order-dialog.tsx` all keep using it exactly as today.

**Known, accepted consequence (not fixed here):** SLA policies are matched to a work order by
exact `request_type` string equality (`matchSlaPolicy` / `findSlaPolicy`, both already tolerant of
"no policy found"). A new FM work order tagged `"Complementary"` or `"PBL"` won't match any
existing SLA policy unless one is later created for that exact value — it'll behave exactly as
today's "no matching policy" case does (no SLA due dates get set, no error). Likewise, work orders
auto-created from a PPM visit (`fm-ppm-convert.ts`, which sets `request_type: "PPM"` directly and
does not go through this form) will no longer match any Request Type filter option except "All" —
same graceful degradation as the Service Type list swap. Neither is addressed as part of this
change.

## Goal 4: Actions column → dropdown menu

Replace the current row of ~10 icon/text buttons (`timestampActions` output plus View, Create
Report, Edit, Delete) with a single kebab-icon (`MoreVertical` from `lucide-react`) ghost button
that opens a shadcn `DropdownMenu` listing every one of those same actions as `DropdownMenuItem`
text entries, in the same order, gated by the same `can(...)` permission checks as today. No
action is added, removed, or behaviorally changed — this is a presentation-only change.

The Delete action keeps its existing confirmation step: the `AlertDialog` this session has already
used successfully nested inside other dialogs is instead nested inside the `DropdownMenu` here,
triggered from a `DropdownMenuItem` (`asChild` on `AlertDialogTrigger`, matching the established
nested-dialog pattern already used elsewhere in this codebase).

The Actions column header's fixed width (`w-80`, sized for ~10 buttons) shrinks to fit a single
icon button.

## Non-goals

- No changes to `public.contracts` or `public.work_orders` (AMC) — schema, data, or UI.
- No changes to the mobile app's source code (separate repository).
- No changes to `SERVICE_TYPES` (`src/lib/service-reports.ts`) or `SLA_REQUEST_TYPES`
  (`src/lib/fm-sla.ts`) themselves — both stay exactly as-is for every other page that uses them.
- No changes to SLA policy definitions or matching logic, despite the new Request Type values not
  having corresponding policies yet — documented above as an accepted consequence.
- No behavioral changes to any of the ten existing work-order actions (Ack/Responded/Arrived/
  Done/Pause/Resume/View/Report/Edit/Delete) — Goal 4 is a pure UI restyling.
- No changes to how `fm-ppm-convert.ts` auto-creates work orders from PPM visits (it sets
  `request_type: "PPM"` directly, bypassing the form entirely — untouched).

## Data Model

```sql
-- Backfill existing blank wo_no values, oldest first
update public.fm_work_orders
set wo_no = public.next_doc_no('work_order')
where wo_no is null or wo_no = ''
  and id in (
    select id from public.fm_work_orders
    where wo_no is null or wo_no = ''
    order by created_at asc
  );
```

(Backfill will be executed as a `for` loop over ordered rows in the actual migration, since a
single set-based `UPDATE` would call `next_doc_no()` once per row but not guarantee row-by-row
ordering guarantees across a single statement — the implementation plan will spell out the exact
`DO $$ ... $$` block.)

```sql
create or replace function public.fill_fm_work_order_no()
returns trigger
language plpgsql
as $$
begin
  if new.wo_no is null or new.wo_no = '' then
    new.wo_no := public.next_doc_no('work_order');
  end if;
  return new;
end;
$$;

create trigger fm_work_orders_fill_wo_no
before insert on public.fm_work_orders
for each row
execute function public.fill_fm_work_order_no();
```

## UI

**New constants file:** `src/features/fm-work-orders/fm-work-order-constants.ts`, exporting
`FM_WORK_ORDER_SERVICE_TYPES` and `FM_WORK_ORDER_REQUEST_TYPES` (both shown above).

**`fm-work-orders-list.tsx`:**
- Import the two new constants instead of `SERVICE_TYPES`.
- Add `requestTypeFilter` state + a third `<Select>` in the filter `<Card>`, using
  `FM_WORK_ORDER_REQUEST_TYPES`.
- Extend the `filtered` `useMemo` with a `requestTypeFilter` check against `r.request_type`.
- Replace the Actions `<TableCell>` body with a `DropdownMenu` (trigger: ghost icon button,
  `MoreVertical` icon) containing `DropdownMenuItem`s for each existing action, preserving each
  action's existing `can(...)` gate and click handler. Delete's `AlertDialog` nests inside a
  `DropdownMenuItem` via `asChild`.
- Shrink the Actions `<TableHead>`/`<TableCell>` width class from `w-80` to something list-item-
  appropriate (e.g. drop the fixed width, since it's now a single button).

**`fm-work-order-modal.tsx`:**
- Import `FM_WORK_ORDER_SERVICE_TYPES` instead of `SERVICE_TYPES` for the Service Type `<Select>`.
- Import `FM_WORK_ORDER_REQUEST_TYPES` instead of `SLA_REQUEST_TYPES` for the Request Type
  `<Select>`.

No other files change.

## Error Handling

No new error paths are introduced. The trigger runs inside the same transaction as the insert, so
a `next_doc_no()` failure (e.g. sequence exhaustion, not realistically expected) fails the insert
itself with a normal Postgres error surfaced through the existing Supabase error-handling paths in
both the web form and (whatever error handling the mobile app already has for a failed insert).

## Testing Approach

No test runner exists in this repo. Verification: `npx tsc --noEmit` clean, plus manual
verification via `npm run dev`:
- Confirm a work order inserted directly via SQL (simulating a mobile-app insert) with no `wo_no`
  gets one automatically.
- Confirm the 19 previously-blank rows now show a `WO-####` number after the backfill.
- Confirm the Service Type filter and New/Edit form both show exactly the 7 new options and no
  others.
- Confirm the new Request Type filter narrows the list correctly, and the New/Edit form's Request
  Type field shows exactly the 3 new options.
- Confirm the Actions column renders as a single "⋮" button per row, and clicking it opens a menu
  listing every action that used to be a separate button, each still gated by the same
  permissions and each still functioning identically (Ack/Responded/Arrived/Done/Pause/Resume all
  still call `logSlaEvent` with the same payloads; View/Report/Edit/Delete all still call the same
  handlers).
