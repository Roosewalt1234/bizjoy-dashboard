# FM Work Orders Page Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing work order numbers on mobile-created FM work orders, replace two hardcoded
dropdown lists with FM-specific ones (Service Type, plus a new Request Type filter), and redesign
the Actions column from a row of icon buttons into a single "⋮" dropdown menu — all scoped to FM
Work Orders only (`fm_work_orders` table, `FmWorkOrdersListPage`, `FmWorkOrderModal`).

**Architecture:** One database migration (trigger + one-time backfill) applied directly via the
Supabase MCP tool (this project's established convention — no local migration files exist for any
prior migration this session), one new small constants file shared by the list and the modal, and
targeted edits to the two existing FM-work-orders feature files. No shared constants
(`SERVICE_TYPES`, `SLA_REQUEST_TYPES`) and no AMC files/tables are touched.

**Tech Stack:** TanStack Start (React), Supabase (Postgres + supabase-js), shadcn/ui (`Select`,
`DropdownMenu`, `AlertDialog`), lucide-react icons, TanStack Query.

**Standing project rule:** `public.contracts` and `public.work_orders` (AMC) must never be
modified. This plan only touches `public.fm_work_orders` and two files under
`src/features/fm-work-orders/`.

**Testing approach (matches every prior task this session):** no test runner exists in this repo.
Verification is `npx tsc --noEmit` plus manual verification via `npm run dev` — there is no
mobile-app or live-login access in this environment, so manual verification is done by inspecting
the rendered page and, where needed, using SQL to simulate a mobile-app insert.

---

### Task 1: Database — auto-fill `wo_no` on insert, backfill existing blank rows

**Files:** none (Supabase-managed remote migration only, applied via the `apply_migration` MCP
tool against project `evcaehadjzoxtdlnmehk` — matching this session's established convention of
having no local `supabase/migrations/*.sql` files). Also regenerates
`src/integrations/supabase/types.ts` (routine after every migration this session, even though this
particular migration adds no new columns — regenerating keeps the generator's own bookkeeping
consistent with prior phases).

Live counts already confirmed against the database: `next_doc_no('work_order')` exists and returns
values like `'WO-0001'` from the shared `work_order_no_seq` sequence (the same one AMC's
`work_orders` table also draws from for web-created rows). 19 of 23 existing `fm_work_orders` rows
currently have a blank `wo_no`.

- [ ] **Step 1: Apply the migration**

Call the `apply_migration` MCP tool with `project_id: "evcaehadjzoxtdlnmehk"`,
`name: "phase_35_fm_work_order_no_fix"`, and this `query`:

```sql
-- Backfill existing blank wo_no values, oldest first, using the same shared
-- next_doc_no('work_order') sequence the web form already uses.
do $$
declare
  r record;
begin
  for r in
    select id from public.fm_work_orders
    where wo_no is null or wo_no = ''
    order by created_at asc
  loop
    update public.fm_work_orders
    set wo_no = public.next_doc_no('work_order')
    where id = r.id;
  end loop;
end $$;

-- Auto-fill wo_no on any future insert that omits it (mobile app today; any
-- future client tomorrow). Web-created rows already set wo_no before insert,
-- so this trigger is a no-op for them.
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

drop trigger if exists fm_work_orders_fill_wo_no on public.fm_work_orders;
create trigger fm_work_orders_fill_wo_no
before insert on public.fm_work_orders
for each row
execute function public.fill_fm_work_order_no();
```

- [ ] **Step 2: Verify the backfill**

Call `execute_sql` with `project_id: "evcaehadjzoxtdlnmehk"` and:

```sql
select count(*) as total, count(*) filter (where wo_no is null or wo_no = '') as blank
from public.fm_work_orders;
```

Expected: `blank` is now `0`.

- [ ] **Step 3: Verify the trigger fires on an insert that omits `wo_no`**

Call `execute_sql` with `project_id: "evcaehadjzoxtdlnmehk"` and:

```sql
insert into public.fm_work_orders (customer_name, status, priority)
values ('__trigger_test__', 'Open', 'Medium')
returning id, wo_no;
```

Expected: the returned `wo_no` is a non-null `WO-####` string, not `null`.

- [ ] **Step 4: Clean up the test row**

Call `execute_sql` with `project_id: "evcaehadjzoxtdlnmehk"` and:

```sql
delete from public.fm_work_orders where customer_name = '__trigger_test__';
```

- [ ] **Step 5: Regenerate TypeScript types**

Call the `generate_typescript_types` MCP tool with `project_id: "evcaehadjzoxtdlnmehk"` and save
the result to `src/integrations/supabase/types.ts` (overwrite in place, matching every prior
phase this session).

- [ ] **Step 6: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: auto-fill fm_work_orders.wo_no on insert, backfill existing blank rows"
```

(No other files change in this task — the migration itself lives only in Supabase's remote
migration history, per this project's established convention.)

---

### Task 2: Add FM-only Service Type and Request Type constants

**Files:**
- Create: `src/features/fm-work-orders/fm-work-order-constants.ts`

- [ ] **Step 1: Write the constants file**

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

export const FM_WORK_ORDER_REQUEST_TYPES = [
  "Reactive",
  "Complementary",
  "PBL",
] as const;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (the file isn't imported anywhere yet, so this just confirms valid syntax).

- [ ] **Step 3: Commit**

```bash
git add src/features/fm-work-orders/fm-work-order-constants.ts
git commit -m "feat: add FM-only Service Type and Request Type constants for work orders"
```

---

### Task 3: FM Work Orders list — new dropdowns + Actions redesign

**Files:**
- Modify: `src/features/fm-work-orders/fm-work-orders-list.tsx`

This task depends on Task 2 (imports the new constants file). It does not depend on Task 1.

- [ ] **Step 1: Swap imports**

In `src/features/fm-work-orders/fm-work-orders-list.tsx`, replace:

```tsx
import { CheckCircle2, Clock, Pause, Play, Plus, Pencil, Trash2, Eye, Wrench, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, woStatusClasses, woPriorityClasses, splitItems } from "@/lib/work-orders";
```

with:

```tsx
import { CheckCircle2, Clock, Pause, Play, Plus, Pencil, Trash2, Eye, Wrench, ClipboardCheck, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { WO_STATUS, woStatusClasses, woPriorityClasses, splitItems } from "@/lib/work-orders";
import { FM_WORK_ORDER_SERVICE_TYPES, FM_WORK_ORDER_REQUEST_TYPES } from "./fm-work-order-constants";
```

(`SERVICE_TYPES` is dropped entirely from this file — nothing else in it uses the shared list.)

Also add the `DropdownMenu` import. Immediately after the existing `AlertDialog` import block
(the one ending `} from "@/components/ui/alert-dialog";`), add:

```tsx
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

- [ ] **Step 2: Add `requestTypeFilter` state**

Replace:

```tsx
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
```

with:

```tsx
  const [typeFilter, setTypeFilter] = useState("all");
  const [requestTypeFilter, setRequestTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
```

- [ ] **Step 3: Filter by request type in the existing `filtered` `useMemo`**

Replace:

```tsx
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders as any[]).filter((r) => {
      if (typeFilter !== "all" && r.service_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.wo_no, r.customer_name, r.technician_name, r.location, r.contract_assets?.asset_tag, r.service_categories?.name]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q));
    });
  }, [orders, search, typeFilter, statusFilter]);
```

with:

```tsx
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders as any[]).filter((r) => {
      if (typeFilter !== "all" && r.service_type !== typeFilter) return false;
      if (requestTypeFilter !== "all" && r.request_type !== requestTypeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.wo_no, r.customer_name, r.technician_name, r.location, r.contract_assets?.asset_tag, r.service_categories?.name]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q));
    });
  }, [orders, search, typeFilter, requestTypeFilter, statusFilter]);
```

- [ ] **Step 4: Swap the Service Type filter's options and add the Request Type filter**

Replace:

```tsx
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Service type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
```

with:

```tsx
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Service type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {FM_WORK_ORDER_SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={requestTypeFilter} onValueChange={(v) => { setRequestTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Request type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All request types</SelectItem>
            {FM_WORK_ORDER_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
```

- [ ] **Step 5: Verify it compiles (dropdowns only, Actions redesign is the next step)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Rename `timestampActions` to `timestampActionItems` and change its buttons to menu items**

Replace the entire function (currently returning a `<>` of `<Button>` elements):

```tsx
  function timestampActions(order: any) {
    const now = new Date().toISOString();
    const paused = Boolean(order.delay_reason || order.sla_exclusion_reason);
    const responseStatus = calculateSlaStatus({ dueAt: order.response_due_at, actualAt: now, paused });
    const completionStatus = calculateSlaStatus({ dueAt: order.completion_due_at, actualAt: now, paused });
    return (
      <>
        <Button size="sm" variant="outline" title="Acknowledge" onClick={() => logSlaEvent(order, "Acknowledged", { status: "In Progress" })}>
          <Clock className="h-3 w-3 mr-1" /> Ack
        </Button>
        <Button
          size="sm" variant="outline" title="Mark responded"
          onClick={() => logSlaEvent(order, "Responded", { responded_at: now, response_sla_status: responseStatus, status: "In Progress" })}
        >
          Responded
        </Button>
        <Button size="sm" variant="outline" title="Mark arrived" onClick={() => logSlaEvent(order, "Arrived", { arrived_at: now, status: "In Progress" })}>
          Arrived
        </Button>
        <Button
          size="sm" variant="outline" title="Mark completed"
          onClick={() => logSlaEvent(order, "Completed", { completed_at: now, completion_sla_status: completionStatus, status: "Completed" })}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" /> Done
        </Button>
        <Button
          size="sm" variant="outline" title="Pause SLA"
          onClick={() => logSlaEvent(order, "Paused", { delay_reason: order.delay_reason || "Paused", response_sla_status: "Paused", completion_sla_status: "Paused" })}
        >
          <Pause className="h-3 w-3" />
        </Button>
        <Button
          size="sm" variant="outline" title="Resume SLA"
          onClick={() => logSlaEvent(order, "Resumed", {
            delay_reason: null,
            sla_exclusion_reason: null,
            response_sla_status: calculateSlaStatus({ dueAt: order.response_due_at, actualAt: order.responded_at }),
            completion_sla_status: calculateSlaStatus({ dueAt: order.completion_due_at, actualAt: order.completed_at }),
          })}
        >
          <Play className="h-3 w-3" />
        </Button>
      </>
    );
  }
```

with:

```tsx
  function timestampActionItems(order: any) {
    const now = new Date().toISOString();
    const paused = Boolean(order.delay_reason || order.sla_exclusion_reason);
    const responseStatus = calculateSlaStatus({ dueAt: order.response_due_at, actualAt: now, paused });
    const completionStatus = calculateSlaStatus({ dueAt: order.completion_due_at, actualAt: now, paused });
    return (
      <>
        <DropdownMenuItem onClick={() => logSlaEvent(order, "Acknowledged", { status: "In Progress" })}>
          <Clock className="h-4 w-4" /> Acknowledge
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => logSlaEvent(order, "Responded", { responded_at: now, response_sla_status: responseStatus, status: "In Progress" })}
        >
          Mark Responded
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logSlaEvent(order, "Arrived", { arrived_at: now, status: "In Progress" })}>
          Mark Arrived
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => logSlaEvent(order, "Completed", { completed_at: now, completion_sla_status: completionStatus, status: "Completed" })}
        >
          <CheckCircle2 className="h-4 w-4" /> Mark Completed
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => logSlaEvent(order, "Paused", { delay_reason: order.delay_reason || "Paused", response_sla_status: "Paused", completion_sla_status: "Paused" })}
        >
          <Pause className="h-4 w-4" /> Pause SLA
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => logSlaEvent(order, "Resumed", {
            delay_reason: null,
            sla_exclusion_reason: null,
            response_sla_status: calculateSlaStatus({ dueAt: order.response_due_at, actualAt: order.responded_at }),
            completion_sla_status: calculateSlaStatus({ dueAt: order.completion_due_at, actualAt: order.completed_at }),
          })}
        >
          <Play className="h-4 w-4" /> Resume SLA
        </DropdownMenuItem>
      </>
    );
  }
```

- [ ] **Step 7: Replace the Actions column header width**

Replace:

```tsx
              <TableHead className="w-80 text-right">Actions</TableHead>
```

with:

```tsx
              <TableHead className="text-right">Actions</TableHead>
```

- [ ] **Step 8: Replace the Actions cell body with the dropdown menu**

Replace:

```tsx
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {timestampActions(r)}
                      <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(r)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {can("service", "add") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Create work completion report"
                          onClick={() => navigate({ to: "/fm-service-reports", search: { wo: r.id } as any })}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                      )}
                      {can("service", "edit") && (
                        <Button size="icon" variant="ghost" title="Edit / reassign / reschedule" onClick={() => modal.openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can("service", "delete") && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete work order?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
```

with:

```tsx
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" title="Actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {timestampActionItems(r)}
                        <DropdownMenuItem onClick={() => setViewing(r)}>
                          <Eye className="h-4 w-4" /> View
                        </DropdownMenuItem>
                        {can("service", "add") && (
                          <DropdownMenuItem onClick={() => navigate({ to: "/fm-service-reports", search: { wo: r.id } as any })}>
                            <ClipboardCheck className="h-4 w-4" /> Create Work Completion Report
                          </DropdownMenuItem>
                        )}
                        {can("service", "edit") && (
                          <DropdownMenuItem onClick={() => modal.openEdit(r)}>
                            <Pencil className="h-4 w-4" /> Edit / Reassign / Reschedule
                          </DropdownMenuItem>
                        )}
                        {can("service", "delete") && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete work order?</AlertDialogTitle>
                                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
```

Note: the `AlertDialogTrigger asChild` wraps a `DropdownMenuItem` with
`onSelect={(e) => e.preventDefault()}` — this is the standard Radix pattern for nesting an
AlertDialog inside a DropdownMenu. Without `preventDefault()` on `onSelect`, the dropdown menu
closes (and unmounts its content) the instant the item is selected, before the AlertDialog gets a
chance to open.

- [ ] **Step 9: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (`Wrench` import stays in use via the Service Type badge; no other imports
become unused — double-check `Button`, `Eye`, `ClipboardCheck`, `Pencil`, `Trash2` are all still
referenced, since they're now used inside `DropdownMenuItem`s instead of as standalone buttons.)

- [ ] **Step 10: Commit**

```bash
git add src/features/fm-work-orders/fm-work-orders-list.tsx
git commit -m "feat: FM-only service/request type filters and dropdown-menu actions on FM Work Orders"
```

---

### Task 4: FM Work Order create/edit form — swap dropdown sources

**Files:**
- Modify: `src/features/fm-work-orders/fm-work-order-modal.tsx`

This task depends on Task 2 (imports the new constants file). Independent of Tasks 1 and 3.

- [ ] **Step 1: Swap imports**

Replace:

```tsx
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, WO_PRIORITY, splitItems } from "@/lib/work-orders";
import { SLA_REQUEST_TYPES } from "@/lib/fm-sla";
```

with:

```tsx
import { WO_STATUS, WO_PRIORITY, splitItems } from "@/lib/work-orders";
import { FM_WORK_ORDER_SERVICE_TYPES, FM_WORK_ORDER_REQUEST_TYPES } from "./fm-work-order-constants";
```

- [ ] **Step 2: Swap the Service Type select's options**

Replace:

```tsx
              <div className="space-y-1">
                <Label>Service Type</Label>
                <Select value={form.service_type || undefined} onValueChange={(v) => set("service_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
```

with:

```tsx
              <div className="space-y-1">
                <Label>Service Type</Label>
                <Select value={form.service_type || undefined} onValueChange={(v) => set("service_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {FM_WORK_ORDER_SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
```

- [ ] **Step 3: Swap the Request Type select's options**

Replace:

```tsx
              <div className="space-y-1">
                <Label>Request Type</Label>
                <Select value={form.request_type || undefined} onValueChange={(v) => set("request_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Request type" /></SelectTrigger>
                  <SelectContent>
                    {SLA_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
```

with:

```tsx
              <div className="space-y-1">
                <Label>Request Type</Label>
                <Select value={form.request_type || undefined} onValueChange={(v) => set("request_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Request type" /></SelectTrigger>
                  <SelectContent>
                    {FM_WORK_ORDER_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
```

Note: `pickPpmVisit` (line ~197) still sets `request_type: "PPM"` directly when a PPM visit is
picked — that's an explicit string assignment, not sourced from this dropdown's option list, so it
is untouched and continues to work exactly as before (per the spec's Non-goals: PPM-sourced work
orders are an accepted exception to the new 3-value list).

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/fm-work-orders/fm-work-order-modal.tsx
git commit -m "feat: use FM-only service/request type options in the FM Work Order form"
```

---

### Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean, no errors, across all four tasks' combined changes.

- [ ] **Step 2: Manual verification via `npm run dev`**

Using the Browser tooling against the running dev server, confirm:
- The FM Work Orders page loads without console errors.
- The Service Type filter shows exactly: Cleaning, Plumbing, Electrical, Carpentry, Masonry, Air
  Condition, Home Plans (plus "All service types").
- A new Request Type filter is present, showing exactly: Reactive, Complementary, PBL (plus "All
  request types"), and narrows the list correctly when a value is picked.
- The Actions column renders as a single "⋮" button per row; clicking it opens a menu listing
  Acknowledge, Mark Responded, Mark Arrived, Mark Completed, Pause SLA, Resume SLA, View, Create
  Work Completion Report, Edit / Reassign / Reschedule, and Delete (last three gated by
  permissions as before).
- Opening "New Work Order" shows the same two new option lists in its Service Type and Request
  Type fields.
- Query the database directly (`select wo_no from fm_work_orders order by created_at desc limit
  25`) to confirm no row has a blank `wo_no` post-backfill.

- [ ] **Step 3: Report back**

Summarize the four changes to the user and proceed to `superpowers:finishing-a-development-branch`
(verify `tsc`, ask push-vs-keep-local via `AskUserQuestion`, matching every prior feature this
session).
