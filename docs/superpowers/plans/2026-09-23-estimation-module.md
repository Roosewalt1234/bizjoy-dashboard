# Estimation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitize the cost-buildup estimation step (material/labor/
subcontractor cost → markup → overhead) that today only happens in a manual
Excel sheet, as a new "Estimates" tab on the Sales page, with a
"Convert to Quote" action that hands a fully-priced draft straight into the
existing quote-creation flow.

**Architecture:** Two new tables (`estimates`, `estimate_items`) mirroring
the shape of the existing `quotes`/`quote_items`. A new `EstimateDialog`
component (modeled directly on the existing `QuoteDialog` in the same file)
handles create/edit; a new `EstimatesList` component (modeled on the
existing `QuotesList`) handles the tab's table/toolbar. Conversion inserts
a real `quotes`/`quote_items` row pair and opens the *existing* `QuoteDialog`
in edit mode against it — no new quote-side code at all.

**Tech Stack:** React 19, TypeScript, TanStack Start/Router, Supabase,
Tailwind, shadcn/ui — all matching `sales.tsx`'s existing conventions
exactly (this plan's code is written to fit directly into that file).

**No test runner exists in this repo.** Verification is `tsc --noEmit`
plus a manual browser pass and direct DB checks against the live Supabase
project, matching how every other feature in this codebase has been
verified.

Spec: `docs/superpowers/specs/2026-09-23-estimation-module-design.md`

---

### Task 1: Database — `estimates` / `estimate_items` tables + doc numbering

**Executed directly by the controller (not delegated), matching this
project's established practice for schema changes — with explicit user
confirmation before applying.**

**Files:**
- Create: `supabase/migrations/20260923130000_estimation_module.sql`

- [ ] **Step 1: Write and apply the migration**

```sql
-- Mirrors quotes/quote_items in shape and RLS posture. Estimates are the
-- cost-buildup step that happens BEFORE a quote exists - material/labor/
-- subcontractor cost, marked up, with overhead - kept as its own
-- permanent record (not a disposable calculator) so a past price can
-- always be explained.
create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.sales_leads(id),
  customer_name text,
  estimate_number text,
  estimate_date date,
  status text not null default 'Draft',
  quote_id uuid references public.quotes(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  sort_order integer not null default 0,
  description text not null default '',
  material_cost numeric not null default 0,
  material_markup_pct numeric not null default 15,
  labor_hours numeric not null default 0,
  labor_rate numeric not null default 25,
  subcontractor_cost numeric not null default 0,
  subcontractor_markup_pct numeric not null default 15,
  apply_overhead boolean not null default true,
  overhead_pct numeric not null default 25,
  -- Computed client-side (material×markup + labor×rate + subcont×markup,
  -- then ×(1+overhead) unless apply_overhead is false) and written here on
  -- save, same convention as quote_items.amount - never a generated column.
  sell_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;

-- Same access shape as quotes/quote_items: any authenticated user with
-- the existing "sales" module permission. Reuses the same app_private.can
-- helper already governing quotes.
create policy "estimates_select" on public.estimates
  for select to authenticated
  using (app_private.can(auth.uid(), 'sales', 'view'));
create policy "estimates_insert" on public.estimates
  for insert to authenticated
  with check (app_private.can(auth.uid(), 'sales', 'add'));
create policy "estimates_update" on public.estimates
  for update to authenticated
  using (app_private.can(auth.uid(), 'sales', 'edit'))
  with check (app_private.can(auth.uid(), 'sales', 'edit'));
create policy "estimates_delete" on public.estimates
  for delete to authenticated
  using (app_private.can(auth.uid(), 'sales', 'delete'));

create policy "estimate_items_select" on public.estimate_items
  for select to authenticated
  using (app_private.can(auth.uid(), 'sales', 'view'));
create policy "estimate_items_insert" on public.estimate_items
  for insert to authenticated
  with check (app_private.can(auth.uid(), 'sales', 'add'));
create policy "estimate_items_update" on public.estimate_items
  for update to authenticated
  using (app_private.can(auth.uid(), 'sales', 'edit'))
  with check (app_private.can(auth.uid(), 'sales', 'edit'));
create policy "estimate_items_delete" on public.estimate_items
  for delete to authenticated
  using (app_private.can(auth.uid(), 'sales', 'delete'));

-- New doc-numbering kind, same pattern as work_order/service_report.
create sequence if not exists public.estimate_no_seq;

create or replace function public.next_doc_no(kind text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare n bigint;
begin
  if kind = 'work_order' then
    n := nextval('public.work_order_no_seq');
    return 'WO-' || lpad(n::text, 4, '0');
  elsif kind = 'service_report' then
    n := nextval('public.service_report_no_seq');
    return 'SR-' || lpad(n::text, 4, '0');
  elsif kind = 'estimate' then
    n := nextval('public.estimate_no_seq');
    return 'EST-' || lpad(n::text, 4, '0');
  else
    raise exception 'unknown kind %', kind;
  end if;
end;
$$;
```

**Verified directly against the live `quotes` table's real RLS policies**
(`app_private.can(auth.uid(), 'sales'::text, 'view'/'add'/'edit'/'delete'::text)`,
with matching `using`/`with_check` pairs on the update policy) — the SQL
above is an exact match, not a guess.

Ask the user to confirm via `AskUserQuestion` before applying.

- [ ] **Step 2: Verify**

```sql
select column_name, data_type from information_schema.columns
where table_name = 'estimates' order by ordinal_position;
select column_name, data_type from information_schema.columns
where table_name = 'estimate_items' order by ordinal_position;
select public.next_doc_no('estimate');
select public.next_doc_no('estimate');
```
Expected: columns match the table above; the two `next_doc_no` calls
return `EST-0001` then `EST-0002`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260923130000_estimation_module.sql
git commit -m "feat: add estimates/estimate_items tables and EST doc numbering"
```

---

### Task 2: Types, computation helper, and `EstimateDialog`

**Files:**
- Modify: `src/routes/_authenticated/sales.tsx`

- [ ] **Step 1: Add types and the computation helper**

Find (right after the existing `interface QuoteItem { ... }` block and
`const VAT_RATE = 0.05;` line):

```ts
interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const VAT_RATE = 0.05;
```

Add immediately after it:

```ts
interface Estimate {
  id: string;
  lead_id: string | null;
  customer_name: string | null;
  estimate_number: string | null;
  estimate_date: string | null;
  status: string | null;
  quote_id: string | null;
  notes: string | null;
}

interface EstimateItem {
  id?: string;
  description: string;
  material_cost: number;
  material_markup_pct: number;
  labor_hours: number;
  labor_rate: number;
  subcontractor_cost: number;
  subcontractor_markup_pct: number;
  apply_overhead: boolean;
  overhead_pct: number;
}

function emptyEstimateItem(): EstimateItem {
  return {
    description: "",
    material_cost: 0,
    material_markup_pct: 15,
    labor_hours: 0,
    labor_rate: 25,
    subcontractor_cost: 0,
    subcontractor_markup_pct: 15,
    apply_overhead: true,
    overhead_pct: 25,
  };
}

// Same formula chain as the reference Excel sheet (FF-VAR26-192):
// E=D×115%, H=G×25, J=I×115%, K=E+H+J, M=K×125% (skipped for
// pure-subcontract lines) - computed live here instead of via spreadsheet
// formulas.
function computeLineSellAmount(it: EstimateItem): number {
  const materialSell = (Number(it.material_cost) || 0) * (1 + (Number(it.material_markup_pct) || 0) / 100);
  const laborSell = (Number(it.labor_hours) || 0) * (Number(it.labor_rate) || 0);
  const subcontSell = (Number(it.subcontractor_cost) || 0) * (1 + (Number(it.subcontractor_markup_pct) || 0) / 100);
  const lineSubtotal = materialSell + laborSell + subcontSell;
  const withOverhead = it.apply_overhead ? lineSubtotal * (1 + (Number(it.overhead_pct) || 0) / 100) : lineSubtotal;
  return +withOverhead.toFixed(2);
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`, expect no new errors
  (these are unused additions at this point, which is fine — Step 3 uses
  them).

- [ ] **Step 3: Add the `EstimateDialog` component**

Find the end of the file — the closing `}` of `QuoteDialog` (the very
last lines of the file, after `DialogFooter`/`</Dialog>`):

```tsx
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {viewOnly ? "Close" : "Cancel"}
          </Button>
          {!viewOnly && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : quote ? "Update" : "Create"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Append this new component after it (still the last thing in the file):

```tsx

function EstimateDialog({
  open,
  onOpenChange,
  estimate,
  prefill,
  leadId,
  viewOnly,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  estimate: Estimate | null;
  prefill?: Partial<Estimate> | null;
  leadId?: string | null;
  viewOnly: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Estimate>>({});
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (estimate) {
      setForm(estimate);
      (supabase.from as any)("estimate_items")
        .select(
          "id, description, material_cost, material_markup_pct, labor_hours, labor_rate, subcontractor_cost, subcontractor_markup_pct, apply_overhead, overhead_pct",
        )
        .eq("estimate_id", estimate.id)
        .order("sort_order", { ascending: true })
        .then(({ data }: any) =>
          setItems(
            (data ?? []).map((r: any) => ({
              id: r.id,
              description: r.description ?? "",
              material_cost: Number(r.material_cost ?? 0),
              material_markup_pct: Number(r.material_markup_pct ?? 15),
              labor_hours: Number(r.labor_hours ?? 0),
              labor_rate: Number(r.labor_rate ?? 25),
              subcontractor_cost: Number(r.subcontractor_cost ?? 0),
              subcontractor_markup_pct: Number(r.subcontractor_markup_pct ?? 15),
              apply_overhead: r.apply_overhead ?? true,
              overhead_pct: Number(r.overhead_pct ?? 25),
            })),
          ),
        );
    } else {
      (supabase.rpc as any)("next_doc_no", { kind: "estimate" }).then(({ data }: any) => {
        setForm({
          estimate_number: data ?? "",
          estimate_date: new Date().toISOString().split("T")[0],
          customer_name: "",
          status: "Draft",
          notes: "",
          ...(prefill ?? {}),
        });
      });
      setItems([emptyEstimateItem()]);
    }
  }, [open, estimate]);

  function updateItem(idx: number, patch: Partial<EstimateItem>) {
    setItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      // Convenience default: a line that's pure subcontracted work (no
      // material/labor entered yet) skips overhead automatically the
      // moment a subcontractor cost is first typed in, matching the
      // reference sheet's behavior - but the checkbox stays fully
      // user-editable afterward, this only fires on that first transition.
      const enteringFirstSubcontCost =
        (Number(next[idx].subcontractor_cost) || 0) === 0 &&
        (Number(merged.subcontractor_cost) || 0) > 0 &&
        (Number(merged.material_cost) || 0) === 0 &&
        (Number(merged.labor_hours) || 0) === 0;
      if (enteringFirstSubcontCost && patch.subcontractor_cost !== undefined) {
        merged.apply_overhead = false;
      }
      next[idx] = merged;
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, emptyEstimateItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const sellAmounts = items.map(computeLineSellAmount);
  const subtotal = sellAmounts.reduce((s, a) => s + a, 0);
  const vat = +(subtotal * VAT_RATE).toFixed(2);
  const grandTotal = +(subtotal + vat).toFixed(2);

  async function save() {
    if (!form.estimate_number?.trim() || !form.customer_name?.trim()) {
      toast.error("Estimate number and customer name are required");
      return;
    }
    setSaving(true);
    const payload = {
      lead_id: leadId ?? estimate?.lead_id ?? null,
      estimate_number: form.estimate_number,
      estimate_date: form.estimate_date || null,
      customer_name: form.customer_name,
      status: form.status || "Draft",
      notes: form.notes || null,
    };
    let estimateId = estimate?.id;
    if (estimate) {
      const { error } = await (supabase.from as any)("estimates").update(payload).eq("id", estimate.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await (supabase.from as any)("estimates").insert(payload).select("id").single();
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      estimateId = data?.id;
    }

    if (estimateId) {
      await (supabase.from as any)("estimate_items").delete().eq("estimate_id", estimateId);
      const rows = items
        .filter((it) => it.description.trim())
        .map((it, i) => ({
          estimate_id: estimateId,
          sort_order: i,
          description: it.description,
          material_cost: Number(it.material_cost) || 0,
          material_markup_pct: Number(it.material_markup_pct) || 0,
          labor_hours: Number(it.labor_hours) || 0,
          labor_rate: Number(it.labor_rate) || 0,
          subcontractor_cost: Number(it.subcontractor_cost) || 0,
          subcontractor_markup_pct: Number(it.subcontractor_markup_pct) || 0,
          apply_overhead: it.apply_overhead,
          overhead_pct: Number(it.overhead_pct) || 0,
          sell_amount: computeLineSellAmount(it),
        }));
      if (rows.length) {
        const { error: itemsError } = await (supabase.from as any)("estimate_items").insert(rows);
        if (itemsError) {
          setSaving(false);
          toast.error(itemsError.message);
          return;
        }
      }
    }

    setSaving(false);
    toast.success(estimate ? "Updated" : "Created");
    onSaved();
  }

  const title = viewOnly ? "View Estimate" : estimate ? "Edit Estimate" : "Create Estimate";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Estimate number *</Label>
              <Input
                readOnly={viewOnly}
                value={form.estimate_number ?? ""}
                onChange={(e) => setForm({ ...form, estimate_number: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Estimate date</Label>
              <Input
                type="date"
                readOnly={viewOnly}
                value={form.estimate_date ?? ""}
                onChange={(e) => setForm({ ...form, estimate_date: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Input value={form.status ?? "Draft"} readOnly />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Customer name *</Label>
            <Input
              readOnly={viewOnly}
              value={form.customer_name ?? ""}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Cost buildup</Label>
              {!viewOnly && (
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  + Add Item
                </Button>
              )}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium min-w-[220px]">Description</th>
                    <th className="text-right px-2 py-2 font-medium w-24">Material</th>
                    <th className="text-right px-2 py-2 font-medium w-20">Mat. %</th>
                    <th className="text-right px-2 py-2 font-medium w-20">Labor Hrs</th>
                    <th className="text-right px-2 py-2 font-medium w-20">Labor Rate</th>
                    <th className="text-right px-2 py-2 font-medium w-24">Sub Cont</th>
                    <th className="text-right px-2 py-2 font-medium w-20">Sub %</th>
                    <th className="text-center px-2 py-2 font-medium w-16">OH?</th>
                    <th className="text-right px-2 py-2 font-medium w-16">OH %</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Sell Amount</th>
                    {!viewOnly && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-1 py-1">
                        <Input
                          readOnly={viewOnly}
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Line description"
                          className="border-0 shadow-none focus-visible:ring-0"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.material_cost}
                          onChange={(e) => updateItem(idx, { material_cost: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.material_markup_pct}
                          onChange={(e) => updateItem(idx, { material_markup_pct: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.labor_hours}
                          onChange={(e) => updateItem(idx, { labor_hours: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.labor_rate}
                          onChange={(e) => updateItem(idx, { labor_rate: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.subcontractor_cost}
                          onChange={(e) => updateItem(idx, { subcontractor_cost: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.subcontractor_markup_pct}
                          onChange={(e) => updateItem(idx, { subcontractor_markup_pct: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          disabled={viewOnly}
                          checked={it.apply_overhead}
                          onChange={(e) => updateItem(idx, { apply_overhead: e.target.checked })}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          readOnly={viewOnly}
                          value={it.overhead_pct}
                          onChange={(e) => updateItem(idx, { overhead_pct: Number(e.target.value) })}
                          className="border-0 shadow-none focus-visible:ring-0 text-right"
                        />
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums font-medium">
                        {computeLineSellAmount(it).toFixed(2)}
                      </td>
                      {!viewOnly && (
                        <td className="px-1 py-1 text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (5%)</span>
                  <span className="tabular-nums">{vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Grand Total (AED)</span>
                  <span className="tabular-nums">{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea
              readOnly={viewOnly}
              rows={4}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {viewOnly ? "Close" : "Cancel"}
          </Button>
          {!viewOnly && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : estimate ? "Update" : "Create"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Note for implementer:** `viewOnly` should be derived by the caller (Task
3) from `estimate.status === "Converted"` — a converted estimate is never
opened in an editable form, only "View Estimate".

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`, expect no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/sales.tsx
git commit -m "feat: add EstimateDialog with live cost-buildup calculation"
```

---

### Task 3: `EstimatesList` + the Convert-to-Quote flow + the new tab

**Files:**
- Modify: `src/routes/_authenticated/sales.tsx`

- [ ] **Step 1: Add `EstimatesList`**

Append this component at the very end of the file, after `EstimateDialog`
(added in Task 2):

```tsx

function EstimatesList() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | null>(null);
  const [viewEstimate, setViewEstimate] = useState<Estimate | null>(null);
  const [prefill, setPrefill] = useState<Partial<Estimate> | null>(null);
  const [prefillLeadId, setPrefillLeadId] = useState<string | null>(null);
  const [pickLeadOpen, setPickLeadOpen] = useState(false);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("estimates")
      .select("id, lead_id, customer_name, estimate_number, estimate_date, status, quote_id, notes")
      .order("estimate_date", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    else setEstimates((data as Estimate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function removeEstimate(id: string) {
    if (!confirm("Delete this estimate?")) return;
    const { error } = await (supabase.from as any)("estimates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  async function convertToQuote(est: Estimate) {
    if (est.status === "Converted") return;
    if (!confirm(`Convert ${est.estimate_number} to a quote?`)) return;

    const { data: itemRows, error: itemsErr } = await (supabase.from as any)("estimate_items")
      .select("description, sort_order, material_cost, material_markup_pct, labor_hours, labor_rate, subcontractor_cost, subcontractor_markup_pct, apply_overhead, overhead_pct")
      .eq("estimate_id", est.id)
      .order("sort_order", { ascending: true });
    if (itemsErr) return toast.error(itemsErr.message);

    let leadPrefill: Partial<Quote> = {};
    if (est.lead_id) {
      const { data: lead } = await (supabase.from as any)("sales_leads").select("*").eq("id", est.lead_id).maybeSingle();
      if (lead) {
        leadPrefill = {
          project_name: lead.company ?? "",
          quote_type: lead.lead_type ?? "",
          salesperson: lead.salesperson ?? "",
          subject: lead.lead_type ? `${lead.lead_type} - ${lead.lead_name}` : lead.lead_name,
        };
      }
    }

    const sellAmounts = (itemRows ?? []).map((r: any) => computeLineSellAmount(r as EstimateItem));
    const subtotal = sellAmounts.reduce((s: number, a: number) => s + a, 0);
    const vat = +(subtotal * VAT_RATE).toFixed(2);
    const grandTotal = +(subtotal + vat).toFixed(2);

    const quotePayload = {
      quote_number: est.estimate_number,
      quote_date: new Date().toISOString().split("T")[0],
      customer_name: est.customer_name,
      status: "Pending Quotation",
      currency: "AED",
      subtotal,
      vat_amount: vat,
      total: grandTotal,
      notes: est.notes ?? null,
      terms: DEFAULT_TERMS_TEXT,
      ...leadPrefill,
    };
    const { data: newQuote, error: quoteErr } = await (supabase.from as any)("quotes").insert(quotePayload).select("*").single();
    if (quoteErr) return toast.error(quoteErr.message);

    const quoteItemRows = (itemRows ?? []).map((r: any, i: number) => ({
      quote_id: newQuote.id,
      description: r.description,
      quantity: 1,
      unit_price: computeLineSellAmount(r as EstimateItem),
      amount: computeLineSellAmount(r as EstimateItem),
      sort_order: i,
    }));
    if (quoteItemRows.length) {
      const { error: qiErr } = await (supabase.from as any)("quote_items").insert(quoteItemRows);
      if (qiErr) return toast.error(qiErr.message);
    }

    const { error: updateErr } = await (supabase.from as any)("estimates")
      .update({ status: "Converted", quote_id: newQuote.id })
      .eq("id", est.id);
    if (updateErr) toast.error(`Quote created, but estimate wasn't marked converted: ${updateErr.message}`);

    toast.success("Converted to quote");
    load();

    setEditingQuoteFromConversion(newQuote as Quote);
  }

  // Reuses the existing QuoteDialog to let the user immediately polish the
  // freshly-converted quote (customer details, dates, terms) before it's
  // actually sent - the conversion hands off a priced starting point, not
  // a locked document.
  const [convertedQuote, setConvertedQuote] = useState<Quote | null>(null);
  function setEditingQuoteFromConversion(q: Quote) {
    setConvertedQuote(q);
  }

  const filtered = estimates.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.estimate_number?.toLowerCase().includes(s) ||
      e.customer_name?.toLowerCase().includes(s)
    );
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filtered, page);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search estimate #, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingEstimate(null);
            setViewEstimate(null);
            setPrefill(null);
            setPickLeadOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Create Estimate
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">{filtered.length} estimates</div>
      </div>

      <div className="border rounded-lg bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estimate #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No estimates found.</TableCell>
              </TableRow>
            ) : (
              pageRows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.estimate_number}</TableCell>
                  <TableCell>{e.estimate_date}</TableCell>
                  <TableCell>{e.customer_name}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "Converted" ? "default" : "outline"}>{e.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setViewEstimate(null);
                            setEditingEstimate(e);
                            setDialogOpen(true);
                          }}
                          disabled={e.status === "Converted"}
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingEstimate(null);
                            setViewEstimate(e);
                            setDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => convertToQuote(e)} disabled={e.status === "Converted"}>
                          <ArrowRightCircle className="h-4 w-4 mr-2" /> Convert to Quote
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => removeEstimate(e.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </div>

      <PickLeadForQuoteDialog
        open={pickLeadOpen}
        onOpenChange={setPickLeadOpen}
        onPicked={(lead) => {
          setPickLeadOpen(false);
          setPrefillLeadId(lead?.id ?? null);
          setPrefill(lead ? { customer_name: lead.lead_name } : {});
          setDialogOpen(true);
        }}
      />

      <EstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        estimate={viewEstimate ?? editingEstimate}
        prefill={prefill}
        leadId={prefillLeadId}
        viewOnly={!!viewEstimate || (editingEstimate?.status === "Converted")}
        onSaved={() => {
          setDialogOpen(false);
          setEditingEstimate(null);
          setViewEstimate(null);
          setPrefill(null);
          setPrefillLeadId(null);
          load();
        }}
      />

      <QuoteDialog
        open={!!convertedQuote}
        onOpenChange={(o) => { if (!o) setConvertedQuote(null); }}
        quote={convertedQuote}
        prefill={null}
        leadId={null}
        viewOnly={false}
        onSaved={() => setConvertedQuote(null)}
      />
    </div>
  );
}
```

**Note for implementer:** `PickLeadForQuoteDialog`, `QuoteDialog`,
`DEFAULT_TERMS_TEXT`, `Quote`, and every UI primitive used above already
exist earlier in this same file — this task adds no new imports.
Double-check `DEFAULT_TERMS_TEXT`'s exact name by searching the file (it's
referenced in `QuoteDialog`'s own default form state) before assuming it's
correct as spelled here.

- [ ] **Step 2: Wire the new tab into `SalesPage`**

Find:
```tsx
      <Tabs defaultValue="funnel" className="w-full">
        <TabsList>
          <TabsTrigger value="funnel">Sales Funnel</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
        </TabsList>
        <TabsContent value="funnel" className="mt-4">
          <FunnelBoard />
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">
          <QuotesList />
        </TabsContent>
      </Tabs>
```
Replace with:
```tsx
      <Tabs defaultValue="funnel" className="w-full">
        <TabsList>
          <TabsTrigger value="funnel">Sales Funnel</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
        </TabsList>
        <TabsContent value="funnel" className="mt-4">
          <FunnelBoard />
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">
          <QuotesList />
        </TabsContent>
        <TabsContent value="estimates" className="mt-4">
          <EstimatesList />
        </TabsContent>
      </Tabs>
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`, expect no errors. Pay
  particular attention to any error naming `DEFAULT_TERMS_TEXT` or
  `app_private.can` — both are call-sites into code this task assumes
  already exists; a typecheck failure there means the assumption was
  wrong and needs fixing against the real file/schema, not silenced.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/sales.tsx
git commit -m "feat: add Estimates tab with list, and Convert to Quote flow"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Recreate the FF-VAR26-192 line-4 numbers exactly**

In the dashboard (real login required — no dev-bypass exists here, same
limitation as every other bizjoy-dashboard feature this session), open
Sales → Estimates → Create Estimate, pick any lead, add one line:
material cost 1900, material markup 15%, labor hours 48, labor rate 25,
overhead 25% (leave subcontractor fields at 0). Confirm the computed
"Sell Amount" reads exactly **4,231.25** — the same number the Excel
sheet produces for this exact line.

- [ ] **Step 2: Confirm the overhead-skip default**

On a second line, leave material/labor at 0 and type a subcontractor
cost. Confirm the "OH?" checkbox auto-unchecks the moment that value is
entered, and that unchecking/rechecking it by hand still works normally
afterward.

- [ ] **Step 3: Convert to Quote**

Save the estimate as Draft, then use its row menu → "Convert to Quote".
Confirm: a new quote appears in the Quotes tab with a `quote_items` row
whose `unit_price`/`amount` is 4,231.25 for that line (query
`quote_items` directly if easier than reading the UI), the estimate's
own status flips to "Converted" and its Edit action becomes disabled, and
the cost inputs (material/labor/subcontractor figures) are nowhere
visible on the resulting quote — only the final sell price.

- [ ] **Step 4: Clean up**

Delete the test estimate, its converted quote, and any quote_items/
estimate_items rows created during this verification.
