# Outstanding Amounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Outstanding Amounts" page that combines due/overdue payment rows from both AMC (`contract_payments`) and FM (`fm_contract_payments`) into one sorted, filterable, exportable list, and give the "Accounts" sidebar entry a child-nav structure to host it.

**Architecture:** One new route file fetches both payment tables in parallel (each with a nested select pulling the linked contract's title/customer name), classifies each row's age with a local copy of the same Due/Overdue threshold logic already used on the AMC and FM contract pages, merges and filters to outstanding-only rows, and renders stat cards + a table. The sidebar's flat "Accounts" entry becomes a two-child collapsible group, matching the existing "AMC Contracts"/"FM Projects" pattern exactly.

**Tech Stack:** TanStack Start + React + `@tanstack/react-query`, Supabase JS client, shadcn/ui components, lucide-react icons.

**Testing approach:** No test runner exists in this repo. Each task ends with `npx tsc --noEmit` (baseline is clean, 0 errors) plus a manual-verification section via `npm run dev`.

---

## File Structure

**New file:**
- `src/routes/_authenticated/accounts-outstanding.tsx` — the Outstanding Amounts page: two queries, a local status-classification helper, stat cards, a type filter, an export button, and the combined table.

**Modified file:**
- `src/components/app-sidebar.tsx` — convert the flat `Accounts` nav entry into a collapsible group with `Ledger` and `Outstanding Amounts` children.

---

### Task 1: Restructure the Accounts sidebar entry into a collapsible group

**Files:**
- Modify: `src/components/app-sidebar.tsx:54`

- [ ] **Step 1: Replace the flat Accounts entry**

Find (line 54 in `src/components/app-sidebar.tsx`):

```tsx
  { title: "Accounts", url: "/accounts", icon: Wallet, module: "accounts" },
```

Replace with:

```tsx
  {
    title: "Accounts",
    url: "/accounts",
    icon: Wallet,
    module: "accounts",
    children: [
      { title: "Ledger", url: "/accounts", module: "accounts" },
      { title: "Outstanding Amounts", url: "/accounts-outstanding", module: "accounts" },
    ],
  },
```

This follows the exact same shape as the existing `AMC Contracts` and `FM Projects` entries a few lines below it in the same `items` array — a `children` array of `{ title, url, module }` objects, gated the same way (`can(child.module, "view")` in the render logic further down this file, which needs no changes since it already handles any item with `children`).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. (The new `Outstanding Amounts` child points at a route that doesn't exist yet — this is fine, `Link to="/accounts-outstanding"` won't be type-checked against `routeTree.gen.ts` until Task 2 creates the route and TanStack Router's route tree is regenerated; if `tsc` does complain about an unknown route string at this step, that's expected and will resolve once Task 2's file exists — proceed to Task 2 rather than trying to fix it here.)

- [ ] **Step 3: Manual verification**

Run `npm run dev`, confirm the sidebar's "Accounts" entry is now collapsible (a chevron appears, clicking it expands to show "Ledger" and "Outstanding Amounts"), "Ledger" still opens the existing `/accounts` transactions page, and "Outstanding Amounts" is visible in the list even though clicking it will 404 until Task 2 is done.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: make Accounts a collapsible nav group with a Ledger child"
```

---

### Task 2: Build the Outstanding Amounts page

**Files:**
- Create: `src/routes/_authenticated/accounts-outstanding.tsx`

- [ ] **Step 1: Create the route file**

```tsx
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenu } from "@/components/export-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts-outstanding")({
  component: OutstandingAmountsPage,
  head: () => ({
    meta: [
      { title: "Outstanding Amounts | Fiz Fix ERP" },
      { name: "description", content: "Every due or overdue payment across AMC and FM contracts." },
      { property: "og:title", content: "Outstanding Amounts | Fiz Fix ERP" },
      { property: "og:description", content: "Combined AMC and FM outstanding payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type PaymentAge = { status: "Not Yet Due" | "Due" | "Overdue" | "Received"; daysSinceDue: number };

// Mirrors the exact thresholds already used by computeStatus (src/components/contracts-page.tsx)
// and computePaymentStatus (src/features/fm-contracts/fm-contracts-api.ts): 0 days late is still
// "Not Yet Due", 1-15 days late is "Due", 16+ is "Overdue". This local copy also returns the day
// count, which those two functions don't expose.
function classifyPayment(paymentDate: string, receivedDate: string): PaymentAge {
  if (receivedDate) return { status: "Received", daysSinceDue: 0 };
  if (!paymentDate) return { status: "Not Yet Due", daysSinceDue: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(paymentDate);
  target.setHours(0, 0, 0, 0);
  const daysSinceDue = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (daysSinceDue <= 0) return { status: "Not Yet Due", daysSinceDue: 0 };
  if (daysSinceDue <= 15) return { status: "Due", daysSinceDue };
  return { status: "Overdue", daysSinceDue };
}

function fmtAED(n: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n);
}

function statusBadgeClasses(status: "Due" | "Overdue"): string {
  return status === "Overdue"
    ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200"
    : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
}

function typeBadgeClasses(type: "AMC" | "FM"): string {
  return type === "FM"
    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200"
    : "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200";
}

type OutstandingRow = {
  id: string;
  type: "AMC" | "FM";
  contractTitle: string;
  customerName: string;
  paymentDate: string;
  daysSinceDue: number;
  status: "Due" | "Overdue";
  value: number;
};

function OutstandingAmountsPage() {
  const [typeFilter, setTypeFilter] = useState<"all" | "AMC" | "FM">("all");

  const {
    data: amcPayments = [],
    isLoading: amcLoading,
    isError: amcErrored,
  } = useQuery({
    queryKey: ["accounts-outstanding-amc-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments")
        .select("id, contract_id, payment_date, received_date, value, contracts:contract_id(title, contract_no, customer_name)")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: fmPayments = [],
    isLoading: fmLoading,
    isError: fmErrored,
  } = useQuery({
    queryKey: ["accounts-outstanding-fm-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contract_payments")
        .select("id, contract_id, payment_date, received_date, value, fm_contracts:contract_id(title, contract_no, customer_name)")
        .order("payment_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = amcLoading || fmLoading;
  const isError = amcErrored || fmErrored;

  const outstandingRows = useMemo<OutstandingRow[]>(() => {
    const amcRows = (amcPayments as any[]).map((p) => {
      const age = classifyPayment(p.payment_date, p.received_date);
      return {
        type: "AMC" as const,
        id: `AMC-${p.id}`,
        contractTitle: p.contracts?.title ?? p.contracts?.contract_no ?? "Untitled",
        customerName: p.contracts?.customer_name ?? "-",
        paymentDate: p.payment_date,
        value: Number(p.value) || 0,
        ...age,
      };
    });
    const fmRows = (fmPayments as any[]).map((p) => {
      const age = classifyPayment(p.payment_date, p.received_date);
      return {
        type: "FM" as const,
        id: `FM-${p.id}`,
        contractTitle: p.fm_contracts?.title ?? p.fm_contracts?.contract_no ?? "Untitled",
        customerName: p.fm_contracts?.customer_name ?? "-",
        paymentDate: p.payment_date,
        value: Number(p.value) || 0,
        ...age,
      };
    });

    return [...amcRows, ...fmRows]
      .filter((r): r is typeof r & { status: "Due" | "Overdue" } => r.status === "Due" || r.status === "Overdue")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "Overdue" ? -1 : 1;
        if (a.status === "Overdue") return b.daysSinceDue - a.daysSinceDue;
        return a.paymentDate.localeCompare(b.paymentDate);
      });
  }, [amcPayments, fmPayments]);

  const filteredRows = useMemo(
    () => (typeFilter === "all" ? outstandingRows : outstandingRows.filter((r) => r.type === typeFilter)),
    [outstandingRows, typeFilter],
  );

  const totalOutstanding = useMemo(() => outstandingRows.reduce((sum, r) => sum + r.value, 0), [outstandingRows]);
  const totalOverdue = useMemo(
    () => outstandingRows.filter((r) => r.status === "Overdue").reduce((sum, r) => sum + r.value, 0),
    [outstandingRows],
  );
  const totalDue = useMemo(
    () => outstandingRows.filter((r) => r.status === "Due").reduce((sum, r) => sum + r.value, 0),
    [outstandingRows],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outstanding Amounts</h1>
          <p className="text-muted-foreground">Every due or overdue payment across AMC and FM contracts.</p>
        </div>
        <ExportMenu
          filename="outstanding-amounts"
          sheetName="Outstanding Amounts"
          rows={filteredRows}
          columns={[
            { key: "type", label: "Type" },
            { key: "contractTitle", label: "Contract" },
            { key: "customerName", label: "Customer" },
            { key: "paymentDate", label: "Due Date" },
            { key: "daysSinceDue", label: "Days Since Due" },
            { key: "status", label: "Status" },
            { key: "value", label: "Amount (AED)" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/30 dark:to-background border-slate-100 dark:border-slate-800/40">
          <div className="p-3 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300"><Wallet className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold">{fmtAED(totalOutstanding)}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-red-50 to-white dark:from-red-950/30 dark:to-background border-red-100 dark:border-red-900/40">
          <div className="p-3 rounded-xl bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"><AlertCircle className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Overdue</p><p className="text-2xl font-bold">{fmtAED(totalOverdue)}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-background border-amber-100 dark:border-amber-900/40">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><Clock className="h-5 w-5" /></div>
          <div><p className="text-sm text-muted-foreground">Due</p><p className="text-2xl font-bold">{fmtAED(totalDue)}</p></div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="w-full sm:w-48">
          <Label htmlFor="filter-type" className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "AMC" | "FM")}>
            <SelectTrigger id="filter-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="FM">FM</SelectItem>
              <SelectItem value="AMC">AMC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Days Since Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Could not load outstanding amounts.</TableCell></TableRow>
            ) : isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nothing outstanding.</TableCell></TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline" className={cn("font-medium", typeBadgeClasses(r.type))}>{r.type}</Badge></TableCell>
                  <TableCell>{r.contractTitle}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>{r.paymentDate}</TableCell>
                  <TableCell>{r.daysSinceDue}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("font-medium", statusBadgeClasses(r.status))}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">{fmtAED(r.value)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
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

Run `npm run dev`, open Accounts → Outstanding Amounts (or navigate directly to `/accounts-outstanding`). Confirm:
- Three stat cards render: Total Outstanding, Overdue, Due — with AED-formatted amounts. Given the live data at spec-writing time (16 AMC rows Overdue summing ~86,477.50, 8 AMC rows Due summing ~40,682.50, 0 FM rows since `fm_contract_payments` is currently empty), Total Outstanding should show roughly AED 127,160, Overdue roughly AED 86,478, Due roughly AED 40,683 (exact figures will differ if data has changed since).
- The table lists only AMC rows today (FM has none yet), sorted Overdue-first (most days overdue at the top), each row showing a purple "AMC" type badge, a red "Overdue" or amber "Due" status badge, the contract's title/customer name, due date, and days-since-due count.
- The Type filter narrows to just AMC or just FM (FM will show "Nothing outstanding." until an FM contract gets a payment schedule).
- The Export button downloads a spreadsheet with the same rows/columns as the table.
- Navigating here from a fresh sign-in as a user with Accounts view permission works without errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/accounts-outstanding.tsx
git commit -m "feat: add Outstanding Amounts page combining AMC and FM due/overdue payments"
```

---

## Self-Review Notes

- **Spec coverage:** The spec's Goals (combined AMC+FM due/overdue list, summary totals, type filter, export, nav restructure) map directly to Task 2 (page) and Task 1 (nav). Non-goals (no new tables, no write actions, no AMC data changes) are respected — every query in Task 2 is a `select`, nothing writes to `contract_payments`, `fm_contract_payments`, `contracts`, or `fm_contracts`.
- **AMC isolation:** `contract_payments` is read (never written) via a plain `select`, exactly as the spec requires; `contracts` itself is never queried directly (only reached through the nested `contracts:contract_id(...)` embed for display fields). No AMC file is modified — only a new, separate route file and the shared sidebar are touched.
- **Threshold consistency:** `classifyPayment`'s day-diff logic in Task 2 is a byte-for-byte match (down to the `setHours(0,0,0,0)` normalization and the `<=0` / `<=15` branch points) of `computeStatus` (`contracts-page.tsx:163-172`) and `computePaymentStatus` (`fm-contracts-api.ts:59-68`), per the spec's explicit requirement that this page not invent a new definition of "outstanding."
- **Type consistency:** `OutstandingRow`'s shape (`type`, `contractTitle`, `customerName`, `paymentDate`, `daysSinceDue`, `status`, `value`) is used identically in the `outstandingRows` memo, the stat-card calculations, the `ExportMenu` columns, and the table cells — no naming drift between them.
- **Nav ordering:** Task 1 must run before Task 2's route is navigable from the sidebar, but Task 2's route file works standalone (reachable by direct URL) even if done first — the two tasks have no hard code dependency on each other, only a UX-completeness one, so they're sequenced in the more natural review order (nav shell first, then the page it points to).
