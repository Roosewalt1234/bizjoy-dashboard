# PEMO Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Payment Type/Method/Card fields to the Add Expense form (linking a PEMO-paid expense to a new PEMO transaction record), and build a new PEMO Management page tracking PEMO cards, deposits, and card-spend transactions — designed so an external automation (OpenClaw) can insert transaction rows directly via Supabase with minimal required fields.

**Architecture:** One migration creates three new tables (`pemo_cards`, `pemo_deposits`, `pemo_transactions`) and adds three nullable columns to `accounts_transactions`. The Ledger page gains three new form fields and a follow-up insert into `pemo_transactions` when an expense is paid via PEMO. A new dedicated page (`pemo-management.tsx`, following the same hand-rolled-page pattern as `accounts.tsx`) manages the three new tables directly.

**Tech Stack:** TanStack Start + React + `@tanstack/react-query`, Supabase JS client, shadcn/ui components.

**Testing approach:** No test runner exists in this repo. Each task ends with `npx tsc --noEmit` (baseline clean, 0 errors) plus manual verification via `npm run dev`.

---

## File Structure

**New file:**
- `src/routes/_authenticated/pemo-management.tsx` — Cards/Deposits/Transactions management, balance summary.

**Modified files:**
- `src/routes/_authenticated/accounts.tsx` — add Payment Type/Method/Card fields (Expense-only) and the linked-insert-on-save logic.
- `src/components/app-sidebar.tsx` — add a third child under the "Accounts" group.
- `src/integrations/supabase/types.ts` — regenerated in Task 1.

**Database:**
- One migration applied via the Supabase MCP `apply_migration` tool (this project's established convention — no local `supabase/migrations/*.sql` files are hand-written here).

---

### Task 1: Create the PEMO tables and extend `accounts_transactions`

**Files:**
- Database: new migration `phase_31_pemo_management`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Confirm current shape**

Run with the Supabase MCP `execute_sql` tool (`project_id: "evcaehadjzoxtdlnmehk"`):

```sql
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('pemo_cards', 'pemo_deposits', 'pemo_transactions');
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'accounts_transactions' order by ordinal_position;
```

Expected: zero rows from the first query (none of the three tables exist yet); the second query's column list should NOT yet include `payment_type`/`payment_method`/`pemo_card_id`.

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: "evcaehadjzoxtdlnmehk"`, `name: "phase_31_pemo_management"`, and this `query` (note the ordering: `pemo_cards` must exist before `accounts_transactions.pemo_card_id` can reference it, and `pemo_transactions` references both `pemo_cards` and `accounts_transactions`, so it comes last):

```sql
create table public.pemo_cards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  employee_id uuid references public.employees(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pemo_deposits (
  id uuid primary key default gen_random_uuid(),
  deposited_on date not null default current_date,
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.accounts_transactions
  add column payment_type text check (payment_type in ('Credit', 'Cash')),
  add column payment_method text check (payment_method in ('PEMO', 'Bank Transfer', 'Cash')),
  add column pemo_card_id uuid references public.pemo_cards(id);

create table public.pemo_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  amount numeric not null,
  description text,
  category text,
  card_id uuid references public.pemo_cards(id),
  source text not null default 'manual' check (source in ('manual', 'ledger', 'openclaw')),
  accounts_transaction_id uuid references public.accounts_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pemo_cards enable row level security;
alter table public.pemo_deposits enable row level security;
alter table public.pemo_transactions enable row level security;

create policy "pemo_cards_select" on public.pemo_cards for select to authenticated using (app_private.can(auth.uid(), 'accounts', 'view'));
create policy "pemo_cards_insert" on public.pemo_cards for insert to authenticated with check (app_private.can(auth.uid(), 'accounts', 'add'));
create policy "pemo_cards_update" on public.pemo_cards for update to authenticated using (app_private.can(auth.uid(), 'accounts', 'edit')) with check (app_private.can(auth.uid(), 'accounts', 'edit'));
create policy "pemo_cards_delete" on public.pemo_cards for delete to authenticated using (app_private.can(auth.uid(), 'accounts', 'delete'));

create policy "pemo_deposits_select" on public.pemo_deposits for select to authenticated using (app_private.can(auth.uid(), 'accounts', 'view'));
create policy "pemo_deposits_insert" on public.pemo_deposits for insert to authenticated with check (app_private.can(auth.uid(), 'accounts', 'add'));
create policy "pemo_deposits_update" on public.pemo_deposits for update to authenticated using (app_private.can(auth.uid(), 'accounts', 'edit')) with check (app_private.can(auth.uid(), 'accounts', 'edit'));
create policy "pemo_deposits_delete" on public.pemo_deposits for delete to authenticated using (app_private.can(auth.uid(), 'accounts', 'delete'));

create policy "pemo_transactions_select" on public.pemo_transactions for select to authenticated using (app_private.can(auth.uid(), 'accounts', 'view'));
create policy "pemo_transactions_insert" on public.pemo_transactions for insert to authenticated with check (app_private.can(auth.uid(), 'accounts', 'add'));
create policy "pemo_transactions_update" on public.pemo_transactions for update to authenticated using (app_private.can(auth.uid(), 'accounts', 'edit')) with check (app_private.can(auth.uid(), 'accounts', 'edit'));
create policy "pemo_transactions_delete" on public.pemo_transactions for delete to authenticated using (app_private.can(auth.uid(), 'accounts', 'delete'));

grant select, insert, update, delete on public.pemo_cards to authenticated;
grant select, insert, update, delete on public.pemo_deposits to authenticated;
grant select, insert, update, delete on public.pemo_transactions to authenticated;
grant all on public.pemo_cards to service_role;
grant all on public.pemo_deposits to service_role;
grant all on public.pemo_transactions to service_role;
```

- [ ] **Step 3: Verify the new shape**

```sql
select table_name, column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name in ('pemo_cards', 'pemo_deposits', 'pemo_transactions')
order by table_name, ordinal_position;

select column_name, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'accounts_transactions'
and column_name in ('payment_type', 'payment_method', 'pemo_card_id');

select policyname, roles, cmd from pg_policies where tablename in ('pemo_cards', 'pemo_deposits', 'pemo_transactions') order by tablename, policyname;
```

Expected: all three new tables with their columns as specified; `accounts_transactions` has the three new nullable columns; 4 policies per new table (select/insert/update/delete), all `roles: {authenticated}`.

- [ ] **Step 4: Regenerate TypeScript types**

Use the Supabase MCP `generate_typescript_types` tool (`project_id: "evcaehadjzoxtdlnmehk"`). Write the full returned content to `src/integrations/supabase/types.ts` (overwrite the whole file).

- [ ] **Step 5: Confirm the new tables/fields are typed**

```bash
grep -n "pemo_cards\|pemo_deposits\|pemo_transactions" src/integrations/supabase/types.ts
grep -n "payment_type\|payment_method\|pemo_card_id" src/integrations/supabase/types.ts
```

Expected: entries for all three new tables (each with `Row`/`Insert`/`Update`/`Relationships` sections), and `payment_type`/`payment_method`/`pemo_card_id` inside the `accounts_transactions` block.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (this is a purely additive schema change; nothing existing references the new tables/columns yet).

- [ ] **Step 7: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: create PEMO tables and add payment fields to accounts_transactions"
```

---

### Task 2: Add Payment Type/Method/Card fields to the Add Expense form

**Files:**
- Modify: `src/routes/_authenticated/accounts.tsx`

- [ ] **Step 1: Extend `LedgerForm` and `emptyForm`**

Find:

```tsx
type LedgerForm = {
  transaction_date: string;
  description: string;
  amount: string;
  project_type: ProjectType | "none";
  contract_id: string;
};

const emptyForm: LedgerForm = {
  transaction_date: "",
  description: "",
  amount: "",
  project_type: "none",
  contract_id: "",
};
```

Replace with:

```tsx
type LedgerForm = {
  transaction_date: string;
  description: string;
  amount: string;
  project_type: ProjectType | "none";
  contract_id: string;
  payment_type: "Credit" | "Cash" | "";
  payment_method: "PEMO" | "Bank Transfer" | "Cash" | "";
  pemo_card_id: string;
};

const emptyForm: LedgerForm = {
  transaction_date: "",
  description: "",
  amount: "",
  project_type: "none",
  contract_id: "",
  payment_type: "",
  payment_method: "",
  pemo_card_id: "",
};
```

- [ ] **Step 2: Add a `PemoCardOption` type and `cardLabel` helper**

Find:

```tsx
function contractLabel(c: ContractOption): string {
  return (c.contract_no ? `${c.contract_no} - ` : "") + (c.customer_name ?? c.title ?? "Untitled");
}
```

Add directly after it:

```tsx

type PemoCardOption = {
  id: string;
  label: string;
  employees: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
};

function cardLabel(c: PemoCardOption): string {
  const emp = c.employees;
  const empName = emp ? emp.full_name ?? [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null;
  return empName ? `${c.label} - ${empName}` : c.label;
}
```

- [ ] **Step 3: Add the PEMO cards lookup query**

Find:

```tsx
  const { data: amcContracts = [] } = useQuery({
    queryKey: ["ledger-amc-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id, title, contract_no, customer_name");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });
```

Add directly after it:

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

- [ ] **Step 4: Populate the new fields when editing**

Find:

```tsx
  function openEdit(row: any) {
    setEditing(row);
    setActiveType(row.type === "Income" ? "Income" : "Expense");
    setForm({
      transaction_date: row.transaction_date ?? "",
      description: row.description ?? "",
      amount: row.amount != null ? String(row.amount) : "",
      project_type: (row.project_type as ProjectType) ?? "none",
      contract_id: row.contract_id ?? "",
    });
    setOpen(true);
  }
```

Replace with:

```tsx
  function openEdit(row: any) {
    setEditing(row);
    setActiveType(row.type === "Income" ? "Income" : "Expense");
    setForm({
      transaction_date: row.transaction_date ?? "",
      description: row.description ?? "",
      amount: row.amount != null ? String(row.amount) : "",
      project_type: (row.project_type as ProjectType) ?? "none",
      contract_id: row.contract_id ?? "",
      payment_type: (row.payment_type as LedgerForm["payment_type"]) ?? "",
      payment_method: (row.payment_method as LedgerForm["payment_method"]) ?? "",
      pemo_card_id: row.pemo_card_id ?? "",
    });
    setOpen(true);
  }
```

- [ ] **Step 5: Add setters that clear dependent fields**

Find:

```tsx
  function setProjectType(v: string) {
    setForm((f) => ({ ...f, project_type: v as ProjectType | "none", contract_id: "" }));
  }
```

Add directly after it:

```tsx

  function setPaymentType(v: string) {
    setForm((f) => ({ ...f, payment_type: v as LedgerForm["payment_type"], payment_method: "", pemo_card_id: "" }));
  }

  function setPaymentMethod(v: string) {
    setForm((f) => ({ ...f, payment_method: v as LedgerForm["payment_method"], pemo_card_id: "" }));
  }
```

- [ ] **Step 6: Update `save()` to include the new fields and create the linked PEMO transaction**

Find:

```tsx
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      transaction_date: form.transaction_date || null,
      description: form.description || null,
      amount: form.amount === "" ? null : Number(form.amount),
      project_type: form.project_type === "none" ? null : form.project_type,
      contract_id: form.project_type === "none" ? null : form.contract_id || null,
    };
    // Type/currency are only set on create - editing an existing entry never changes what
    // button originally created it or its currency, both of which are fixed at creation time.
    if (!editing) {
      payload.type = activeType;
      payload.currency = "AED";
    }
    try {
      if (editing) {
        const { error } = await supabase.from("accounts_transactions").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await supabase.from("accounts_transactions").insert(payload);
        if (error) throw error;
        toast.success("Created");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
```

Replace with:

```tsx
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const isExpense = activeType === "Expense";
    const paymentMethod = isExpense && form.payment_type === "Cash" ? form.payment_method : "";
    const payload: any = {
      transaction_date: form.transaction_date || null,
      description: form.description || null,
      amount: form.amount === "" ? null : Number(form.amount),
      project_type: form.project_type === "none" ? null : form.project_type,
      contract_id: form.project_type === "none" ? null : form.contract_id || null,
      payment_type: isExpense && form.payment_type ? form.payment_type : null,
      payment_method: paymentMethod || null,
      pemo_card_id: paymentMethod === "PEMO" && form.pemo_card_id ? form.pemo_card_id : null,
    };
    // Type/currency are only set on create - editing an existing entry never changes what
    // button originally created it or its currency, both of which are fixed at creation time.
    if (!editing) {
      payload.type = activeType;
      payload.currency = "AED";
    }
    try {
      let insertedId: string | null = null;
      if (editing) {
        const { error } = await supabase.from("accounts_transactions").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { data: inserted, error } = await supabase
          .from("accounts_transactions")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        insertedId = inserted?.id ?? null;
        toast.success("Created");
      }
      // Linking: a newly-created PEMO expense also gets its own row in pemo_transactions,
      // so PEMO Management and the Ledger stay in sync from a single entry point. This only
      // happens on create - editing an existing entry never re-syncs or deletes a prior link.
      if (!editing && payload.pemo_card_id && insertedId) {
        const { error: pemoError } = await supabase.from("pemo_transactions").insert({
          occurred_on: payload.transaction_date,
          amount: payload.amount,
          description: payload.description,
          card_id: payload.pemo_card_id,
          source: "ledger",
          accounts_transaction_id: insertedId,
        });
        if (pemoError) {
          toast.error("Expense saved, but the linked PEMO record failed - add it manually in PEMO Management.");
        }
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
```

- [ ] **Step 7: Add the new fields to the form JSX**

Find:

```tsx
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <DialogFooter>
```

Replace with:

```tsx
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            {activeType === "Expense" && (
              <>
                <div className="space-y-1">
                  <Label>Payment Type</Label>
                  <Select value={form.payment_type} onValueChange={setPaymentType}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Credit">Credit</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.payment_type === "Cash" && (
                  <div className="space-y-1">
                    <Label>Payment Method</Label>
                    <Select value={form.payment_method} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEMO">PEMO</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.payment_method === "PEMO" && (
                  <div className="space-y-1">
                    <Label>Card</Label>
                    <Select value={form.pemo_card_id} onValueChange={(v) => setForm({ ...form, pemo_card_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a card..." /></SelectTrigger>
                      <SelectContent>
                        {pemoCards.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{cardLabel(c)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <DialogFooter>
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Manual verification**

Run `npm run dev`. Open Accounts → Ledger → Add Expense. Confirm: Payment Type appears with no default selection; picking "Credit" shows nothing further; picking "Cash" reveals Payment Method; picking "PEMO" as the method reveals a Card dropdown listing active PEMO cards (empty list is fine if Task 1's tables have no cards yet). Save an expense with Payment Method = PEMO and a card selected — confirm success, and separately confirm (via Supabase or the PEMO Management page once Task 3 lands) that a matching `pemo_transactions` row was created with `source = 'ledger'`. Confirm Add Invoice's dialog never shows any of these three fields. Confirm editing an existing Expense does not re-trigger a second linked PEMO insert.

- [ ] **Step 10: Commit**

```bash
git add src/routes/_authenticated/accounts.tsx
git commit -m "feat: add Payment Type/Method/Card to expenses, link PEMO expenses to pemo_transactions"
```

---

### Task 3: Build the PEMO Management page

**Files:**
- Create: `src/routes/_authenticated/pemo-management.tsx`

- [ ] **Step 1: Create the route file**

```tsx
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pemo-management")({
  component: PemoManagementPage,
});

type EmployeeOption = { id: string; full_name: string | null; first_name: string | null; last_name: string | null };

type PemoCard = {
  id: string;
  label: string;
  employee_id: string | null;
  active: boolean;
};

type PemoDeposit = {
  id: string;
  deposited_on: string;
  amount: number;
  note: string | null;
};

type PemoTransaction = {
  id: string;
  occurred_on: string;
  amount: number;
  description: string | null;
  category: string | null;
  card_id: string | null;
  source: "manual" | "ledger" | "openclaw";
};

function employeeName(e: EmployeeOption | undefined | null): string {
  if (!e) return "Unassigned";
  return e.full_name ?? [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unassigned";
}

function fmtAED(n: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
}

function sourceBadgeClasses(source: string): string {
  if (source === "openclaw") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (source === "ledger") return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
}

function PemoManagementPage() {
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["pemo-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, full_name, first_name, last_name").order("first_name");
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["pemo_cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_cards").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PemoCard[];
    },
  });

  const { data: deposits = [] } = useQuery({
    queryKey: ["pemo_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_deposits").select("*").order("deposited_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PemoDeposit[];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["pemo_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pemo_transactions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PemoTransaction[];
    },
  });

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const totalDeposited = useMemo(() => deposits.reduce((sum, d) => sum + Number(d.amount), 0), [deposits]);
  const totalSpent = useMemo(() => transactions.reduce((sum, t) => sum + Number(t.amount), 0), [transactions]);
  const balance = totalDeposited - totalSpent;

  const [cardFilter, setCardFilter] = useState("all");
  const filteredTransactions = useMemo(
    () => (cardFilter === "all" ? transactions : transactions.filter((t) => t.card_id === cardFilter)),
    [transactions, cardFilter],
  );

  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<PemoCard | null>(null);
  const [cardForm, setCardForm] = useState({ label: "", employee_id: "", active: true });

  function openNewCard() {
    setEditingCard(null);
    setCardForm({ label: "", employee_id: "", active: true });
    setCardOpen(true);
  }
  function openEditCard(c: PemoCard) {
    setEditingCard(c);
    setCardForm({ label: c.label, employee_id: c.employee_id ?? "", active: c.active });
    setCardOpen(true);
  }
  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    const payload = { label: cardForm.label, employee_id: cardForm.employee_id || null, active: cardForm.active };
    try {
      if (editingCard) {
        const { error } = await supabase.from("pemo_cards").update(payload).eq("id", editingCard.id);
        if (error) throw error;
        toast.success("Card updated");
      } else {
        const { error } = await supabase.from("pemo_cards").insert(payload);
        if (error) throw error;
        toast.success("Card added");
      }
      setCardOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_cards"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeCard(id: string) {
    const { error } = await supabase.from("pemo_cards").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_cards"] });
  }

  const [depositOpen, setDepositOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<PemoDeposit | null>(null);
  const [depositForm, setDepositForm] = useState({ deposited_on: "", amount: "", note: "" });

  function openNewDeposit() {
    setEditingDeposit(null);
    setDepositForm({ deposited_on: "", amount: "", note: "" });
    setDepositOpen(true);
  }
  function openEditDeposit(d: PemoDeposit) {
    setEditingDeposit(d);
    setDepositForm({ deposited_on: d.deposited_on, amount: String(d.amount), note: d.note ?? "" });
    setDepositOpen(true);
  }
  async function saveDeposit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      deposited_on: depositForm.deposited_on || null,
      amount: depositForm.amount === "" ? null : Number(depositForm.amount),
      note: depositForm.note || null,
    };
    try {
      if (editingDeposit) {
        const { error } = await supabase.from("pemo_deposits").update(payload).eq("id", editingDeposit.id);
        if (error) throw error;
        toast.success("Deposit updated");
      } else {
        const { error } = await supabase.from("pemo_deposits").insert(payload);
        if (error) throw error;
        toast.success("Deposit added");
      }
      setDepositOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_deposits"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeDeposit(id: string) {
    const { error } = await supabase.from("pemo_deposits").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_deposits"] });
  }

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<PemoTransaction | null>(null);
  const [txForm, setTxForm] = useState({ occurred_on: "", amount: "", description: "", category: "", card_id: "" });

  function openNewTx() {
    setEditingTx(null);
    setTxForm({ occurred_on: "", amount: "", description: "", category: "", card_id: "" });
    setTxOpen(true);
  }
  function openEditTx(t: PemoTransaction) {
    setEditingTx(t);
    setTxForm({
      occurred_on: t.occurred_on,
      amount: String(t.amount),
      description: t.description ?? "",
      category: t.category ?? "",
      card_id: t.card_id ?? "",
    });
    setTxOpen(true);
  }
  async function saveTx(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      occurred_on: txForm.occurred_on || null,
      amount: txForm.amount === "" ? null : Number(txForm.amount),
      description: txForm.description || null,
      category: txForm.category || null,
      card_id: txForm.card_id || null,
    };
    try {
      if (editingTx) {
        const { error } = await supabase.from("pemo_transactions").update(payload).eq("id", editingTx.id);
        if (error) throw error;
        toast.success("Transaction updated");
      } else {
        payload.source = "manual";
        const { error } = await supabase.from("pemo_transactions").insert(payload);
        if (error) throw error;
        toast.success("Transaction added");
      }
      setTxOpen(false);
      qc.invalidateQueries({ queryKey: ["pemo_transactions"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }
  async function removeTx(id: string) {
    const { error } = await supabase.from("pemo_transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["pemo_transactions"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PEMO Management</h1>
        <p className="text-muted-foreground">Track PEMO card spend, deposits, and account balance.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Deposited</p>
          <p className="text-2xl font-bold">{fmtAED(totalDeposited)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-bold">{fmtAED(totalSpent)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="text-2xl font-bold">{fmtAED(balance)}</p>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Cards</h2>
          <Button size="sm" onClick={openNewCard}><Plus className="h-4 w-4 mr-2" /> Add Card</Button>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No cards yet.</TableCell></TableRow>
              ) : cards.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.label}</TableCell>
                  <TableCell>{employeeName(c.employee_id ? employeesById.get(c.employee_id) : null)}</TableCell>
                  <TableCell>{c.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditCard(c)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeCard(c.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Deposits</h2>
          <Button size="sm" onClick={openNewDeposit}><Plus className="h-4 w-4 mr-2" /> Add Deposit</Button>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No deposits yet.</TableCell></TableRow>
              ) : deposits.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.deposited_on}</TableCell>
                  <TableCell>{fmtAED(Number(d.amount))}</TableCell>
                  <TableCell>{d.note ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditDeposit(d)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this deposit?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeDeposit(d.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Transactions</h2>
          <div className="flex items-center gap-2">
            <Select value={cardFilter} onValueChange={setCardFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cards</SelectItem>
                {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={openNewTx}><Plus className="h-4 w-4 mr-2" /> Add Transaction</Button>
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No transactions yet.</TableCell></TableRow>
              ) : filteredTransactions.map((t) => {
                const card = t.card_id ? cardsById.get(t.card_id) : null;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.occurred_on}</TableCell>
                    <TableCell>{card?.label ?? "—"}</TableCell>
                    <TableCell>{t.description ?? "—"}</TableCell>
                    <TableCell>{t.category ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("font-medium", sourceBadgeClasses(t.source))}>{t.source}</Badge></TableCell>
                    <TableCell className="text-right">{fmtAED(Number(t.amount))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditTx(t)}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeTx(t.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCard ? "Edit Card" : "Add Card"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCard} className="space-y-3">
            <div className="space-y-1">
              <Label>Label *</Label>
              <Input required value={cardForm.label} onChange={(e) => setCardForm({ ...cardForm, label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select value={cardForm.employee_id || undefined} onValueChange={(v) => setCardForm({ ...cardForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox checked={cardForm.active} onCheckedChange={(v) => setCardForm({ ...cardForm, active: Boolean(v) })} />
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCardOpen(false)}>Cancel</Button>
              <Button type="submit">{editingCard ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingDeposit ? "Edit Deposit" : "Add Deposit"}</DialogTitle></DialogHeader>
          <form onSubmit={saveDeposit} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" required value={depositForm.deposited_on} onChange={(e) => setDepositForm({ ...depositForm, deposited_on: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea rows={2} value={depositForm.note} onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
              <Button type="submit">{editingDeposit ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingTx ? "Edit Transaction" : "Add Transaction"}</DialogTitle></DialogHeader>
          <form onSubmit={saveTx} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" required value={txForm.occurred_on} onChange={(e) => setTxForm({ ...txForm, occurred_on: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Card</Label>
              <Select value={txForm.card_id || undefined} onValueChange={(v) => setTxForm({ ...txForm, card_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a card..." /></SelectTrigger>
                <SelectContent>
                  {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxOpen(false)}>Cancel</Button>
              <Button type="submit">{editingTx ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, navigate directly to `/pemo-management` (the nav link is added in Task 4). Confirm: three stat cards (Total Deposited, Total Spent, Balance — all AED 0 initially); add a Card (e.g. "Card 1", assign an employee), add a Deposit (e.g. AED 5000), add a manual Transaction against that card — confirm the stat cards update correctly (Balance = Deposited − Spent) and the Transaction shows a slate "manual" badge. If Task 2 already created a `pemo_transactions` row via a linked Ledger expense, confirm it appears here with a blue "ledger" badge. Confirm the Card filter narrows the transaction list. Confirm edit/delete work on all three sections.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/pemo-management.tsx
git commit -m "feat: add PEMO Management page (cards, deposits, transactions, balance)"
```

---

### Task 4: Add PEMO Management to the sidebar

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Add the third child**

Find:

```tsx
    children: [
      { title: "Ledger", url: "/accounts", module: "accounts" },
      { title: "Outstanding Amounts", url: "/accounts-outstanding", module: "accounts" },
    ],
```

Replace with:

```tsx
    children: [
      { title: "Ledger", url: "/accounts", module: "accounts" },
      { title: "Outstanding Amounts", url: "/accounts-outstanding", module: "accounts" },
      { title: "PEMO Management", url: "/pemo-management", module: "accounts" },
    ],
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Confirm the Accounts group now shows three children: Ledger, Outstanding Amounts, PEMO Management. Confirm clicking PEMO Management navigates correctly and highlights only that sub-item (not Ledger or Outstanding Amounts) — this exercises the exact-match-plus-nested-prefix `isActive` logic already fixed for this group in the Outstanding Amounts feature, so it should already behave correctly with no further changes needed here.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add PEMO Management to the Accounts nav group"
```

---

## Self-Review Notes

- **Spec coverage:** Data Model (Task 1), Expense form fields + linking (Task 2), PEMO Management UI (Task 3), and the nav entry (Task 4) map 1:1 to every section of the spec.
- **AMC isolation:** No task in this plan touches `public.contracts` or `public.fm_contracts` at all — this entire feature lives in `accounts_transactions` (already established as a shared, neutral table) plus three brand-new PEMO tables.
- **OpenClaw-friendliness verified against the schema:** every column in `pemo_transactions` except `amount` is nullable, and `source` defaults to `'manual'` so an insert omitting it doesn't fail — an external tool can insert with just `{amount, occurred_on}` at minimum, matching the spec's explicit requirement.
- **Type consistency:** `PemoCard`/`PemoDeposit`/`PemoTransaction` shapes in Task 3 match the columns created in Task 1 exactly; `payment_type`/`payment_method`/`pemo_card_id` in Task 2 match the same three enum values used in Task 1's check constraints (`Credit`/`Cash` and `PEMO`/`Bank Transfer`/`Cash`).
- **Linking logic correctness:** Task 2's `save()` only creates a `pemo_transactions` row `if (!editing && payload.pemo_card_id && insertedId)` — i.e. only on a fresh Expense create where a PEMO card was actually selected, never on edit, matching the spec's explicit non-goal ("no edit-time re-sync").
- **Ordering:** Task 1 must precede Tasks 2 and 3 (both read/write the new schema). Task 2 and Task 3 have no code dependency on each other (Task 2's linked insert works whether or not the PEMO Management UI exists yet — it's a plain `.insert()` against a table Task 1 already created) but are sequenced with the form change first since it's the smaller, more foundational piece. Task 4 (nav) can technically run any time after Task 3's route exists, and is sequenced last since it's purely cosmetic wiring.
