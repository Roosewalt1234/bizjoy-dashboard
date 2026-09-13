# Payment Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Payment Receipt" button to the Ledger page that records an Income entry either against an outstanding AMC/FM invoice (marking it received, same as Outstanding Amounts tracks) or as an advance payment against a quotation.

**Architecture:** One migration adds three nullable columns to `accounts_transactions` (`receipt_type`, a polymorphic `payment_schedule_id`, and a real-FK `quote_id`). The Ledger page (`accounts.tsx`) gains a third dialog, reusing the exact same outstanding-payment query/classification logic already built for `/accounts-outstanding`, plus a new read of `quotes`. Saving inserts the Ledger row and, for the invoice case, updates the matching `contract_payments`/`fm_contract_payments` row's `received_date` — the same mechanism the AMC/FM contract pages already use.

**Tech Stack:** TanStack Start + React + `@tanstack/react-query`, Supabase JS client, shadcn/ui components.

**Testing approach:** No test runner exists in this repo. Each task ends with `npx tsc --noEmit` (baseline clean, 0 errors) plus manual verification via `npm run dev`.

---

## File Structure

**Modified files:**
- `src/routes/_authenticated/accounts.tsx` — add the Payment Receipt button, dialog, and save logic.
- `src/integrations/supabase/types.ts` — regenerated in Task 1.

**Database:**
- One migration applied via the Supabase MCP `apply_migration` tool.

---

### Task 1: Add receipt-linking columns to `accounts_transactions`

**Files:**
- Database: new migration `phase_34_payment_receipt`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Confirm current shape**

Run with the Supabase MCP `execute_sql` tool (`project_id: "evcaehadjzoxtdlnmehk"`):

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'accounts_transactions'
and column_name in ('receipt_type', 'payment_schedule_id', 'quote_id');
```

Expected: zero rows (none of these columns exist yet).

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: "evcaehadjzoxtdlnmehk"`, `name: "phase_34_payment_receipt"`, and this `query`:

```sql
alter table public.accounts_transactions
  add column receipt_type text check (receipt_type in ('invoice', 'advance')),
  add column payment_schedule_id uuid,
  add column quote_id uuid references public.quotes(id);
```

- [ ] **Step 3: Verify the new shape**

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'accounts_transactions'
and column_name in ('receipt_type', 'payment_schedule_id', 'quote_id');
```

Expected: `receipt_type` (text, nullable), `payment_schedule_id` (uuid, nullable, no FK — it's polymorphic, resolved via the row's own `project_type`), `quote_id` (uuid, nullable, FK to `quotes`).

- [ ] **Step 4: Regenerate TypeScript types**

Use the Supabase MCP `generate_typescript_types` tool (`project_id: "evcaehadjzoxtdlnmehk"`). Write the full returned content to `src/integrations/supabase/types.ts`.

- [ ] **Step 5: Confirm the new fields are typed**

```bash
grep -n "receipt_type\|payment_schedule_id\|quote_id" src/integrations/supabase/types.ts
```

Expected: all three appear inside the `accounts_transactions` table's `Row`/`Insert`/`Update` shapes, and `quote_id`'s foreign-key relationship to `quotes` appears in that table's `Relationships`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: add receipt_type/payment_schedule_id/quote_id to accounts_transactions"
```

---

### Task 2: Add the Payment Receipt button and dialog

**Files:**
- Modify: `src/routes/_authenticated/accounts.tsx`

- [ ] **Step 1: Add new types after `PemoCardOption`/`cardLabel`**

Find:

```tsx
function cardLabel(c: PemoCardOption): string {
  const emp = c.employees;
  const empName = emp ? emp.full_name ?? [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null;
  return empName ? `${c.label} - ${empName}` : c.label;
}
```

Add directly after it:

```tsx

type OutstandingScheduleOption = {
  id: string;
  type: "AMC" | "FM";
  contractId: string;
  label: string;
  amount: number;
  dueDate: string;
};

// Mirrors the exact "outstanding" definition already used on the Outstanding Amounts page
// (src/routes/_authenticated/accounts-outstanding.tsx): no received_date, and the due date is
// strictly before today (today itself is "Not Yet Due", not outstanding).
function isOutstanding(paymentDate: string | null, receivedDate: string | null): boolean {
  if (receivedDate || !paymentDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(paymentDate);
  target.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
}

type QuoteOption = {
  id: string;
  quote_number: string | null;
  customer_name: string | null;
  total: number | null;
};

type ReceiptForm = {
  transaction_date: string;
  receipt_type: "invoice" | "advance" | "";
  payment_schedule_id: string;
  quote_id: string;
  amount: string;
  description: string;
};

const emptyReceiptForm: ReceiptForm = {
  transaction_date: "",
  receipt_type: "",
  payment_schedule_id: "",
  quote_id: "",
  amount: "",
  description: "",
};
```

- [ ] **Step 2: Add the new queries inside `LedgerPage`**

Find:

```tsx
  const { data: pemoCards = [] } = useQuery({
    queryKey: ["ledger-pemo-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pemo_cards")
        .select("id, label, employees:employee_id(full_name, first_name, last_name)")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as PemoCardOption[];
    },
  });
```

Add directly after it:

```tsx

  const { data: amcOutstanding = [] } = useQuery({
    queryKey: ["receipt-outstanding-amc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments")
        .select("id, contract_id, payment_date, received_date, value, contracts:contract_id(title, contract_no, customer_name)")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: fmOutstanding = [] } = useQuery({
    queryKey: ["receipt-outstanding-fm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contract_payments")
        .select("id, contract_id, payment_date, received_date, value, fm_contracts:contract_id(title, contract_no, customer_name)")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["receipt-quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, customer_name, total")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuoteOption[];
    },
  });

  const outstandingSchedules = useMemo<OutstandingScheduleOption[]>(() => {
    const amc = (amcOutstanding as any[])
      .filter((p) => isOutstanding(p.payment_date, p.received_date))
      .map((p) => ({
        id: p.id as string,
        type: "AMC" as const,
        contractId: p.contract_id as string,
        label: `AMC - ${p.contracts?.contract_no ?? p.contracts?.customer_name ?? "Untitled"} - Due ${p.payment_date}`,
        amount: Number(p.value) || 0,
        dueDate: p.payment_date as string,
      }));
    const fm = (fmOutstanding as any[])
      .filter((p) => isOutstanding(p.payment_date, p.received_date))
      .map((p) => ({
        id: p.id as string,
        type: "FM" as const,
        contractId: p.contract_id as string,
        label: `FM - ${p.fm_contracts?.contract_no ?? p.fm_contracts?.customer_name ?? "Untitled"} - Due ${p.payment_date}`,
        amount: Number(p.value) || 0,
        dueDate: p.payment_date as string,
      }));
    return [...amc, ...fm].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [amcOutstanding, fmOutstanding]);
```

- [ ] **Step 3: Add Payment Receipt dialog state and handlers**

Find:

```tsx
  function setPaymentMethod(v: string) {
    setForm((f) => ({ ...f, payment_method: v as LedgerForm["payment_method"], pemo_card_id: "" }));
  }
```

Add directly after it:

```tsx

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>(emptyReceiptForm);

  function openNewReceipt() {
    setReceiptForm(emptyReceiptForm);
    setReceiptOpen(true);
  }

  function setReceiptType(v: string) {
    setReceiptForm((f) => ({ ...f, receipt_type: v as ReceiptForm["receipt_type"], payment_schedule_id: "", quote_id: "", amount: "" }));
  }

  function pickSchedule(v: string) {
    const sched = outstandingSchedules.find((s) => s.id === v);
    setReceiptForm((f) => ({ ...f, payment_schedule_id: v, amount: sched ? String(sched.amount) : f.amount }));
  }

  async function saveReceipt(e: React.FormEvent) {
    e.preventDefault();
    const selectedSchedule = outstandingSchedules.find((s) => s.id === receiptForm.payment_schedule_id);
    const payload: any = {
      transaction_date: receiptForm.transaction_date || null,
      description: receiptForm.description || null,
      amount: receiptForm.amount === "" ? null : Number(receiptForm.amount),
      type: "Income",
      currency: "AED",
      receipt_type: receiptForm.receipt_type || null,
      project_type: receiptForm.receipt_type === "invoice" && selectedSchedule ? selectedSchedule.type : null,
      contract_id: receiptForm.receipt_type === "invoice" && selectedSchedule ? selectedSchedule.contractId : null,
      payment_schedule_id: receiptForm.receipt_type === "invoice" ? receiptForm.payment_schedule_id || null : null,
      quote_id: receiptForm.receipt_type === "advance" ? receiptForm.quote_id || null : null,
    };
    try {
      const { error } = await supabase.from("accounts_transactions").insert(payload);
      if (error) throw error;
      toast.success("Payment receipt recorded");
      // Best-effort follow-up: mark the settled installment as received, the same way the
      // AMC/FM contract pages already do. If this fails, the receipt itself is still saved -
      // matching the same insert-then-best-effort-update pattern used for PEMO linking.
      if (receiptForm.receipt_type === "invoice" && selectedSchedule) {
        const table = selectedSchedule.type === "AMC" ? "contract_payments" : "fm_contract_payments";
        const { error: scheduleError } = await supabase
          .from(table)
          .update({ received_date: receiptForm.transaction_date || null })
          .eq("id", selectedSchedule.id);
        if (scheduleError) {
          toast.error("Receipt saved, but marking the invoice as received failed - update it manually.");
        }
      }
      setReceiptOpen(false);
      qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
      qc.invalidateQueries({ queryKey: ["receipt-outstanding-amc"] });
      qc.invalidateQueries({ queryKey: ["receipt-outstanding-fm"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
```

- [ ] **Step 4: Add the "Payment Receipt" button**

Find:

```tsx
          <Button onClick={() => openNew("Expense")}><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
          <Button onClick={() => openNew("Income")}><Plus className="h-4 w-4 mr-2" /> Add Invoice</Button>
        </div>
      </div>
```

Replace with:

```tsx
          <Button onClick={() => openNew("Expense")}><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
          <Button onClick={() => openNew("Income")}><Plus className="h-4 w-4 mr-2" /> Add Invoice</Button>
          <Button variant="outline" onClick={openNewReceipt}><Plus className="h-4 w-4 mr-2" /> Payment Receipt</Button>
        </div>
      </div>
```

- [ ] **Step 5: Add the Payment Receipt dialog JSX**

Find (the closing of the existing Expense/Invoice `Dialog`, right before the `<Card>` that renders the Ledger table):

```tsx
      </Dialog>

      <Card>
        <Table>
```

Replace with:

```tsx
      </Dialog>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveReceipt} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input
                type="date"
                required
                value={receiptForm.transaction_date}
                onChange={(e) => setReceiptForm({ ...receiptForm, transaction_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={receiptForm.receipt_type} onValueChange={setReceiptType}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Against Invoice</SelectItem>
                  <SelectItem value="advance">Advance Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {receiptForm.receipt_type === "invoice" && (
              <div className="space-y-1">
                <Label>Outstanding Invoice</Label>
                <Select value={receiptForm.payment_schedule_id} onValueChange={pickSchedule}>
                  <SelectTrigger><SelectValue placeholder="Select an outstanding invoice..." /></SelectTrigger>
                  <SelectContent>
                    {outstandingSchedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label} - AED {s.amount.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {receiptForm.receipt_type === "advance" && (
              <div className="space-y-1">
                <Label>Quotation</Label>
                <Select value={receiptForm.quote_id} onValueChange={(v) => setReceiptForm({ ...receiptForm, quote_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a quotation..." /></SelectTrigger>
                  <SelectContent>
                    {quotes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.quote_number ?? "Untitled"} - {q.customer_name ?? "Unknown"} (AED {Number(q.total ?? 0).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={receiptForm.amount}
                onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={receiptForm.description}
                onChange={(e) => setReceiptForm({ ...receiptForm, description: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReceiptOpen(false)}>Cancel</Button>
              <Button type="submit">Save Receipt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev`. Open Ledger → "Payment Receipt". Confirm:
- Picking "Against Invoice" shows the Outstanding Invoice dropdown, populated with the same rows Outstanding Amounts currently shows (AMC has real outstanding rows today; FM has none yet, which is expected).
- Picking one pre-fills Amount with that installment's value; Amount stays editable.
- Picking "Advance Payment" instead shows the Quotation dropdown listing all 171 quotes.
- Save a receipt against a real outstanding AMC installment. Confirm: a new Income row appears in the Ledger; the `contract_payments` row's `received_date` is now set (check directly via Supabase, or via `/accounts-outstanding` — that installment should no longer appear there after refresh).
- Save an advance-payment receipt against a quotation. Confirm it creates a Ledger Income row and does NOT touch any payment-schedule table.
- Confirm the regular "Add Expense"/"Add Invoice" flows are completely unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/routes/_authenticated/accounts.tsx
git commit -m "feat: add Payment Receipt (against invoice or advance payment) to the Ledger"
```

---

## Self-Review Notes

- **Spec coverage:** The button, the Type toggle, the outstanding-invoice list (reusing Outstanding Amounts' own classification logic), the quotations list, the pre-fill behavior, the Ledger insert, and the best-effort `received_date` update all map 1:1 to the spec's Goals section.
- **AMC isolation:** `contract_payments` (AMC) is only ever read via `.select()` and, for the one settled row, updated via `.update({ received_date: ... }).eq("id", ...)` — the exact same narrow write pattern already used by the existing AMC contract page to mark a payment received. No AMC contract data, `contracts` table rows, or any other AMC-specific file is touched.
- **Reused logic, not duplicated drift:** `isOutstanding`'s threshold (`target < today`, today itself not yet outstanding) is a byte-for-byte port of the same logic already shipped on `/accounts-outstanding`, so a row that's "outstanding" there is exactly the same row that's selectable here — no risk of the two pages disagreeing about what counts as due.
- **Type consistency:** `ReceiptForm.receipt_type` (`"invoice" | "advance" | ""`) matches the DB check constraint from Task 1 exactly; `OutstandingScheduleOption.type`/`contractId` map directly onto the `project_type`/`contract_id` columns already used by the Ledger's earlier project-linking feature, so a receipt-created row displays in the main Ledger list exactly like any other project-linked row (Task 2 doesn't need to touch the list-rendering code at all).
- **Known limitation, inherited, not fixed here:** `quotes` is gated by the `sales` module permission, not `accounts` — a user with Accounts access but not Sales access will see an empty Quotation dropdown, the same class of cross-module permission gap already documented for Outstanding Amounts and the Ledger's project picker.
