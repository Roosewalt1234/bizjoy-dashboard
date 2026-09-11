# Ledger Project Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Ledger entry optionally link to a specific FM or AMC contract via a cascading Project Type → Project dropdown, remove the now-redundant Type/Currency form fields, and convert the Ledger page from the generic `CrudModule` to its own dedicated component so it can own this cross-field logic.

**Architecture:** One migration adds `project_type`/`contract_id` to `accounts_transactions` and drops the unused `category` column. `src/components/crud-module.tsx` reverts to its pre-`addButtons` state (that feature was added only for the Ledger's two-button need and becomes dead code once Ledger stops using it). `src/routes/_authenticated/accounts.tsx` is rewritten as a standalone page — its own query, dialog, and table — following the same shape as `src/routes/_authenticated/hr.tsx`.

**Tech Stack:** TanStack Start + React + `@tanstack/react-query`, Supabase JS client, shadcn/ui components.

**Testing approach:** No test runner exists in this repo. Each task ends with `npx tsc --noEmit` (baseline clean, 0 errors) plus manual verification via `npm run dev`.

---

## File Structure

**Modified files:**
- `src/components/crud-module.tsx` — reverted to its state before the `addButtons` feature (restores the single "Add" button/`DialogTrigger`, removes `AddButtonDef`/`activeCreate`). `projects.tsx`, its only remaining consumer, is unaffected either way since it never used `addButtons`.
- `src/routes/_authenticated/accounts.tsx` — full rewrite from a `CrudModule` wrapper to a standalone page component.

**Database:**
- One migration applied via the Supabase MCP `apply_migration` tool (`project_id: "evcaehadjzoxtdlnmehk"`), matching this project's established convention (no local `supabase/migrations/*.sql` files are hand-written for this project — see `list_migrations`).

---

### Task 1: Migrate `accounts_transactions` and regenerate types

**Files:**
- Database: new migration `phase_30_accounts_transactions_project_link`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Confirm current shape and emptiness**

Run with the Supabase MCP `execute_sql` tool (`project_id: "evcaehadjzoxtdlnmehk"`):

```sql
select count(*) from public.accounts_transactions;
select column_name from information_schema.columns where table_schema='public' and table_name='accounts_transactions' order by ordinal_position;
```

Expected: `count = 0`, and the column list includes `category` but not `project_type`/`contract_id` yet. (If the count is not 0, STOP and report BLOCKED — this migration drops a column and the plan assumes there is no data to lose. Do not proceed with a destructive `drop column` against a table that turns out to have rows.)

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: "evcaehadjzoxtdlnmehk"`, `name: "phase_30_accounts_transactions_project_link"`, and this `query`:

```sql
alter table public.accounts_transactions
  drop column category,
  add column project_type text check (project_type in ('FM', 'AMC')),
  add column contract_id uuid;
```

- [ ] **Step 3: Verify the new shape**

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='accounts_transactions'
order by ordinal_position;
```

Expected: no `category` column; `project_type` (`text`, nullable) and `contract_id` (`uuid`, nullable) both present.

- [ ] **Step 4: Regenerate TypeScript types**

Use the Supabase MCP `generate_typescript_types` tool (`project_id: "evcaehadjzoxtdlnmehk"`). Write the full returned content to `src/integrations/supabase/types.ts` (overwrite the whole file — it's generated, not hand-edited).

- [ ] **Step 5: Confirm the new fields are typed and the old one is gone**

```bash
grep -n "project_type\|contract_id\|category" src/integrations/supabase/types.ts
```

Find the `accounts_transactions` table's block specifically (search for `accounts_transactions:` first, then look at the surrounding ~20 lines) and confirm `project_type`/`contract_id` appear there and `category` does not.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors ARE expected at this point, specifically in `src/routes/_authenticated/accounts.tsx` (it still references the old `category`/`currency` fields via `CrudModule`'s `fields` array, which will no longer match the new column types once `category` is gone from the generated types). This is fine — Task 3 rewrites that file. Do not attempt to fix `accounts.tsx` in this task; just confirm the ONLY errors are in that one file (skim the error output's file paths) and note this in your report.

- [ ] **Step 7: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types for accounts_transactions project linking"
```

---

### Task 2: Revert the `addButtons` feature in `CrudModule`

**Files:**
- Modify: `src/components/crud-module.tsx` (full revert to its pre-`addButtons` content)

- [ ] **Step 1: Replace the file's full contents**

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { useEffect } from "react";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};

type Props = {
  title: string;
  description: string;
  table: string;
  fields: FieldDef[];
  listColumns: string[];
  createTitle?: string;
};

export function CrudModule({ title, description, table, fields, listColumns, createTitle }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [page, setPage] = useState(1);


  const { data: rows = [], isLoading } = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)(table).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows, page);


  function openNew() {
    setEditing(null);
    const initial: any = {};
    fields.forEach((f) => { initial[f.key] = f.type === "number" ? "" : ""; });
    setForm(initial);
    setOpen(true);
  }
  function openEdit(row: any) {
    setEditing(row);
    setForm({ ...row });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {};
    fields.forEach((f) => {
      let v = form[f.key];
      if (v === "") v = null;
      if (f.type === "number" && v != null) v = Number(v);
      payload[f.key] = v;
    });
    try {
      if (editing) {
        const { error } = await (supabase.from as any)(table).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Updated");
      } else {
        const { error } = await (supabase.from as any)(table).insert(payload);
        if (error) throw error;
        toast.success("Created");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: [table] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    }
  }

  async function remove(id: string) {
    const { error } = await (supabase.from as any)(table).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: [table] });
  }

  const columnLabels = Object.fromEntries(fields.map((f) => [f.key, f.label]));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename={title.toLowerCase().replace(/\s+/g, "-")}
            rows={rows}
            columns={listColumns.map((c) => ({ key: c, label: columnLabels[c] ?? c }))}
            sheetName={title}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${title}` : (createTitle ?? `New ${title}`)}</DialogTitle>
            </DialogHeader>
            <form onSubmit={save} className="space-y-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label>{f.label}{f.required && " *"}</Label>
                  {f.type === "textarea" ? (
                    <Textarea rows={3} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  ) : f.type === "select" ? (
                    <Select value={form[f.key] ?? ""} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      step={f.type === "number" ? "0.01" : undefined}
                      required={f.required}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">{editing ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {listColumns.map((c) => <TableHead key={c}>{columnLabels[c] ?? c}</TableHead>)}
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={listColumns.length + 1} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={listColumns.length + 1} className="text-center py-8 text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : pageRows.map((r) => (
              <TableRow key={r.id}>
                {listColumns.map((c) => <TableCell key={c}>{r[c] ?? "—"}</TableCell>)}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: still errors in `src/routes/_authenticated/accounts.tsx` only (it currently passes `addButtons`, a prop this reverted `CrudModule` no longer accepts — on top of the Task 1 errors about `category`). Confirm `src/routes/_authenticated/projects.tsx` produces no new errors (it never used `addButtons`, so this revert should be invisible to it).

- [ ] **Step 3: Commit**

```bash
git add src/components/crud-module.tsx
git commit -m "revert: remove addButtons from CrudModule (dead code once Ledger stops using it)"
```

---

### Task 3: Rebuild the Ledger page as a dedicated component

**Files:**
- Modify: `src/routes/_authenticated/accounts.tsx` (full rewrite)

- [ ] **Step 1: Replace the file's full contents**

```tsx
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: LedgerPage,
});

type ProjectType = "FM" | "AMC";

type ContractOption = {
  id: string;
  title: string | null;
  contract_no: string | null;
  customer_name: string | null;
};

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

function projectBadgeClasses(type: ProjectType): string {
  return type === "FM"
    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200"
    : "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200";
}

function contractLabel(c: ContractOption): string {
  return (c.contract_no ? `${c.contract_no} - ` : "") + (c.customer_name ?? c.title ?? "Untitled");
}

function LedgerPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<LedgerForm>(emptyForm);
  const [activeType, setActiveType] = useState<"Income" | "Expense">("Expense");
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["accounts_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: fmContracts = [] } = useQuery({
    queryKey: ["ledger-fm-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fm_contracts").select("id, title, contract_no, customer_name");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });

  const { data: amcContracts = [] } = useQuery({
    queryKey: ["ledger-amc-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id, title, contract_no, customer_name");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });

  const contractsById = useMemo(() => {
    const map = new Map<string, ContractOption>();
    for (const c of fmContracts) map.set(c.id, c);
    for (const c of amcContracts) map.set(c.id, c);
    return map;
  }, [fmContracts, amcContracts]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows as any[], page);

  function openNew(type: "Income" | "Expense") {
    setEditing(null);
    setActiveType(type);
    setForm(emptyForm);
    setOpen(true);
  }

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

  function setProjectType(v: string) {
    setForm((f) => ({ ...f, project_type: v as ProjectType | "none", contract_id: "" }));
  }

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

  async function remove(id: string) {
    const { error } = await supabase.from("accounts_transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["accounts_transactions"] });
  }

  const projectOptions: ContractOption[] =
    form.project_type === "FM" ? fmContracts : form.project_type === "AMC" ? amcContracts : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">Track income and expenses.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="accounts"
            rows={rows as any[]}
            columns={[
              { key: "transaction_date", label: "Date" },
              { key: "type", label: "Type" },
              { key: "description", label: "Description" },
              { key: "amount", label: "Amount" },
              { key: "currency", label: "Currency" },
              { key: "project_type", label: "Project Type" },
            ]}
            sheetName="Accounts"
          />
          <Button onClick={() => openNew("Expense")}><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
          <Button onClick={() => openNew("Income")}><Plus className="h-4 w-4 mr-2" /> Add Invoice</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Transaction" : activeType === "Income" ? "New Invoice" : "New Expense"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input
                type="date"
                required
                value={form.transaction_date}
                onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={setProjectType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="FM">FM</SelectItem>
                  <SelectItem value="AMC">AMC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.project_type !== "none" && (
              <div className="space-y-1">
                <Label>Project</Label>
                <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                  <SelectContent>
                    {projectOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{contractLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => {
              const contract = r.contract_id ? contractsById.get(r.contract_id) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.transaction_date ?? "—"}</TableCell>
                  <TableCell>{r.type ?? "—"}</TableCell>
                  <TableCell>
                    {r.project_type && contract ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("font-medium", projectBadgeClasses(r.project_type))}>
                          {r.project_type}
                        </Badge>
                        <span>{contractLabel(contract)}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{r.description ?? "—"}</TableCell>
                  <TableCell>{r.amount != null ? `AED ${Number(r.amount).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
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
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean, no errors. This resolves the errors left over from Tasks 1 and 2.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Open Accounts → Ledger. Confirm:
- Two buttons: "Add Expense" and "Add Invoice" (no generic "Add").
- Opening either shows: Date, Project Type (None/FM/AMC), Description, Amount — no Type or Currency field visible.
- Picking "FM" for Project Type reveals a Project dropdown listing FM contracts (e.g. "48PS-FM-2026 - UBM Owners Association Management Services LLC"); picking "AMC" instead lists AMC contracts; picking back to "None" hides the Project dropdown and clears any prior selection.
- Saving an entry with Project Type left at "None" succeeds and shows "—" in the Project column.
- Saving an entry with a project selected shows an FM (blue) or AMC (purple) badge plus the contract's name in the Project column.
- Editing an existing entry does not offer a way to change its Type (Income/Expense) or Currency, and saving an edit doesn't alter those fields (spot-check via Supabase or by reopening the edit dialog and confirming the row's `type`/`currency` are unchanged).
- Deleting a row still works.
- The Export button still downloads a spreadsheet.
- Separately, confirm the Projects page (`/projects`) still works exactly as before (still uses `CrudModule`'s single "Add" button) — this whole feature should be invisible to it.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/accounts.tsx
git commit -m "feat: link Ledger entries to FM/AMC projects, drop Type/Currency fields from the form"
```

---

## Self-Review Notes

- **Spec coverage:** Data Model (Task 1), `CrudModule` cleanup (Task 2), and the new dedicated page with cascading Project Type/Project, no Type/Currency fields, and the updated list view (Task 3) map 1:1 to every section of the spec.
- **AMC isolation:** `contracts` (AMC) is only ever read via `.select("id, title, contract_no, customer_name")` in Task 3 — no insert/update/delete against it anywhere in this plan. The only table modified by the migration is `accounts_transactions`, which is neither an AMC nor FM table.
- **Type/edit-safety consistency:** `payload.type`/`payload.currency` are only set inside `if (!editing)` in Task 3's `save()`, so editing an existing row can never change what type it was created as or its currency — matching the spec's implicit requirement (Type is "implied by which button was clicked," which only makes sense at creation time) even though the spec didn't spell out the edit case explicitly; this plan makes that behavior concrete rather than leaving it ambiguous.
- **Ordering:** Task 1 must precede Task 3 (the new page reads columns Task 1 creates). Task 2 has no code dependency on Task 1 or Task 3, but is sequenced second since it's the smaller, unrelated cleanup — Task 3 could in principle run before Task 2 without breaking, but doing the revert first keeps `crud-module.tsx` stable before the last task's larger rewrite.
