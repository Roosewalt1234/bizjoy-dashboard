# Operations Universe Phase 4b (Contract Financial Position) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a real contract answer "what's it worth / received / outstanding / overdue /
next payment due" using this codebase's existing payment-status logic (not a new formula), via
a new FINANCE drill-down that replaces the contract's current flat list of individual payment
nodes.

**Architecture:** Three new `CenterEntity` kinds — `contract-finance` (a contract's financial
summary), `payment-category` (received/outstanding/overdue for one contract), `payment` (a
single real payment) — follow the same "hub → category → item" shape already used for
Contracts (Phase 1) and Schedules (Phase 4a). A shared pure function `summarizePayments`
computes the four headline numbers from raw payment rows using this app's existing
`computeStatus`/`computePaymentStatus`/`classifyPayment` thresholds, reused verbatim.

**Tech Stack:** bizjoy-dashboard (TanStack Start + React Query + Supabase, project
`evcaehadjzoxtdlnmehk`), `@xyflow/react`.

**Design doc:**
`docs/superpowers/specs/2026-09-25-operations-universe-phase4b-contract-finance-design.md`

**Testing note:** same as every prior phase — no automated test runner in this repo (confirmed
again; `package.json` has no `test` script, no vitest/jest). Verified via `npx tsc --noEmit`,
`npx eslint`, direct SQL cross-checks against real data, and manual code trace-through. The
final task lists what a human needs to do for the real click-through this environment can't
perform (no login credentials for the deployed app), plus the mandatory financial cross-checks
the design doc's source data already grounds.

**Scope boundary (confirmed with the user this session, carried forward):** no AMC/FM
adapter-layer refactor — the existing inline `domain === "AMC" ? ... : ...` branching stays. No
filter-tab UI. No separate "Due" drill-down category (folded into Outstanding + a direct link
to the next payment). No VAT adjustment (the `vat_percent` column is unpopulated on every real
row). Phase 4a (Schedules) is not touched by any task in this plan. Fully read-only — nothing
here writes to the database.

---

### Task 1: New types — `contract-finance`, `payment-category`, `payment`

**Files:**
- Modify: `src/features/operations-universe/types.ts`
- Modify: `src/features/operations-universe/UniverseNodeComponent.tsx`

Both files are in one task because `UniverseNodeComponent.tsx`'s `ICONS` map is a **full**
`Record<EntityKind, ...>` (not `Partial`) — adding `"contract-finance"` to `EntityKind` without
also adding its `ICONS` entry in the same commit leaves the repo mid-broken for no reason (this
exact mistake happened once already in Phase 4a's Task 1 and had to be patched immediately
after).

- [ ] **Step 1: Add the three `CenterEntity` variants**

Find the `CenterEntity` union in `types.ts`:

```ts
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "customer"; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "ppm-visit"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "employee"; id: string; name: string; position?: string };
```

Replace it with (three new lines inserted after `ppm-visit`, everything else unchanged):

```ts
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "customer"; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "ppm-visit"; domain: ContractDomain; id: string }
  | { kind: "contract-finance"; domain: ContractDomain; id: string }
  | { kind: "payment-category"; domain: ContractDomain; contractId: string; category: "received" | "outstanding" | "overdue" }
  | { kind: "payment"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "employee"; id: string; name: string; position?: string };
```

- [ ] **Step 2: Add `"contract-finance"` to `EntityKind`**

Find:

```ts
export type EntityKind =
  | "today"
  | "contracts-hub"
  | "staff-hub"
  | "schedules-hub"
  | "category"
  | "contract"
  | "customer"
  | "work-order"
  | "ppm-visit"
  | "invoice"
  | "payment"
  | "service-report"
  | "manpower"
  | "timeline-event"
  | "employee-info"
  | "staff-category"
  | "staff-member"
  | "staff-detail"
  | "schedule-category";
```

Replace it with (one new line, after `"ppm-visit"`):

```ts
export type EntityKind =
  | "today"
  | "contracts-hub"
  | "staff-hub"
  | "schedules-hub"
  | "category"
  | "contract"
  | "customer"
  | "work-order"
  | "ppm-visit"
  | "contract-finance"
  | "invoice"
  | "payment"
  | "service-report"
  | "manpower"
  | "timeline-event"
  | "employee-info"
  | "staff-category"
  | "staff-member"
  | "staff-detail"
  | "schedule-category";
```

(`"payment"` and `"category"` already exist as `EntityKind` members — reused for the new
`payment`/`payment-category` screens, no new visual kinds needed for those two.)

- [ ] **Step 3: Add the three `centerEntityKey` cases**

Find the `case "ppm-visit":` line in `centerEntityKey` and the `case "staff-category":` line
right after it:

```ts
    case "ppm-visit":
      return `ppm-visit:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
```

Replace it with (three new cases inserted between them):

```ts
    case "ppm-visit":
      return `ppm-visit:${center.domain}:${center.id}`;
    case "contract-finance":
      return `contract-finance:${center.domain}:${center.id}`;
    case "payment-category":
      return `payment-category:${center.domain}:${center.contractId}:${center.category}`;
    case "payment":
      return `payment:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
```

- [ ] **Step 4: Add the `"contract-finance"` icon and color**

In `UniverseNodeComponent.tsx`, add `Wallet` to the `lucide-react` import:

```ts
import {
  Sparkles,
  FileText,
  Users,
  CalendarClock,
  Layers,
  Building2,
  Wrench,
  CalendarCheck,
  Receipt,
  Banknote,
  ClipboardCheck,
  HardHat,
  Clock,
  User,
  UserCircle2,
  Info,
  ListChecks,
  Wallet,
} from "lucide-react";
```

Find the `ICONS` map and add the new entry right after `"ppm-visit": CalendarCheck,`:

```ts
const ICONS: Record<EntityKind, React.ComponentType<{ className?: string }>> = {
  today: Sparkles,
  "contracts-hub": FileText,
  "staff-hub": Users,
  "schedules-hub": CalendarClock,
  category: Layers,
  contract: FileText,
  customer: Building2,
  "work-order": Wrench,
  "ppm-visit": CalendarCheck,
  "contract-finance": Wallet,
  invoice: Receipt,
  payment: Banknote,
  "service-report": ClipboardCheck,
  manpower: HardHat,
  "timeline-event": Clock,
  "employee-info": User,
  "staff-category": Users,
  "staff-member": UserCircle2,
  "staff-detail": Info,
  "schedule-category": ListChecks,
};
```

Find the `COLORS` map and add the new entry in the same position:

```ts
const COLORS: Partial<Record<EntityKind, string>> = {
  today: "#e8b44a",
  "contracts-hub": "#7ec699",
  "staff-hub": "#5b6270",
  "schedules-hub": "#5b6270",
  category: "#5b9bd5",
  contract: "#7ec699",
  customer: "#b48ee8",
  "work-order": "#e89a4a",
  "ppm-visit": "#4ac6c6",
  "contract-finance": "#d4af37",
  invoice: "#e8c14a",
  payment: "#5fc27e",
  "service-report": "#8a93e8",
  manpower: "#4ac6a0",
  "timeline-event": "#8a93a3",
  "employee-info": "#8a93a3",
  "staff-category": "#5b9bd5",
  "staff-member": "#e8a5c4",
  "staff-detail": "#8a93a3",
  "schedule-category": "#5b9bd5",
};
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo. Nothing constructs the three new `CenterEntity`
variants yet, and `ICONS`/`COLORS` are updated in the same commit as the `EntityKind` addition,
so this should compile cleanly — unlike Phase 4a's Task 1, this task is designed to never leave
the repo mid-broken.

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/types.ts src/features/operations-universe/UniverseNodeComponent.tsx
git commit -m "$(cat <<'EOF'
feat: add contract-finance, payment-category, and payment CenterEntity types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared payment-status logic, FINANCE replaces the flat payment list

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — add
  `computePaymentStatus`/`summarizePayments`, modify `fetchContractConnections`'s payment query
  and ring-node construction.

- [ ] **Step 1: Add the shared payment-status helpers**

Add these two functions directly after `formatAttendanceTime` (near the top of the file, before
`fetchContractCategoryCounts`):

```ts
function computePaymentStatus(
  paymentDate: string | null,
  receivedDate: string | null,
): "Received" | "Not Yet Due" | "Due" | "Overdue" {
  if (receivedDate) return "Received";
  if (!paymentDate) return "Not Yet Due";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(paymentDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}

interface PaymentRow {
  id: string;
  value: number | null;
  paymentDate: string | null;
  receivedDate: string | null;
}

interface PaymentSummary {
  received: number;
  outstanding: number;
  overdue: number;
  nextPayment: { id: string; value: number; date: string } | null;
}

function summarizePayments(payments: PaymentRow[]): PaymentSummary {
  let received = 0;
  let outstanding = 0;
  let overdue = 0;

  const unpaidWithDate = payments
    .filter((p) => !p.receivedDate && p.paymentDate)
    .sort((a, b) => (a.paymentDate ?? "").localeCompare(b.paymentDate ?? ""));
  const nextPayment =
    unpaidWithDate.length > 0
      ? {
          id: unpaidWithDate[0].id,
          value: unpaidWithDate[0].value ?? 0,
          date: unpaidWithDate[0].paymentDate as string,
        }
      : null;

  for (const payment of payments) {
    const value = payment.value ?? 0;
    const status = computePaymentStatus(payment.paymentDate, payment.receivedDate);
    if (status === "Received") {
      received += value;
    } else if (status === "Due" || status === "Overdue") {
      // "Outstanding" matches this app's own established meaning
      // (accounts-outstanding.tsx:139): Due + Overdue only. A "Not Yet Due" future
      // installment isn't outstanding yet - it just isn't due, and belongs in neither bucket.
      outstanding += value;
      if (status === "Overdue") overdue += value;
    }
  }

  return { received, outstanding, overdue, nextPayment };
}
```

This is this codebase's existing payment-status formula (`computeStatus` in
`src/components/contracts-page.tsx:163-172`, `computePaymentStatus` in
`src/features/fm-contracts/fm-contracts-api.ts:61-70`, `classifyPayment` in
`src/routes/_authenticated/accounts-outstanding.tsx:34-45` — all three compute the same thing
from `payment_date`/`received_date`, never the stale stored `status` column) — reused verbatim,
not reinvented.

- [ ] **Step 2: Add `received_date` to `fetchContractConnections`'s payment query**

Find (inside `fetchContractConnections`'s `Promise.all`):

```ts
    supabase
      .from(paymentTable)
      .select("id, value, status, payment_date")
      .eq("contract_id", contractId)
      .order("payment_date", { ascending: true }),
```

Replace it with (only `received_date` added to the select):

```ts
    supabase
      .from(paymentTable)
      .select("id, value, status, payment_date, received_date")
      .eq("contract_id", contractId)
      .order("payment_date", { ascending: true }),
```

- [ ] **Step 3: Replace the flat payment-node loop with one FINANCE summary node**

Find (this is the loop that currently pushes one non-clickable node per payment — do NOT
confuse this with the *second*, unrelated loop further down that builds `timelineEvents` from
`paymentsRes.data` for the contract's timeline — that one stays untouched):

```ts
  for (const payment of paymentsRes.data ?? []) {
    ringOne.push({
      id: `payment:${payment.id}`,
      data: {
        kind: "payment",
        label: payment.status ?? "Payment",
        sublabel: payment.value != null ? `AED ${payment.value}` : undefined,
        clickable: false,
        groupKey: "payment",
        relationshipReason: `This payment was received against this contract.`,
      },
    });
  }
```

Replace it with:

```ts
  const contractPayments = (paymentsRes.data ?? []).map((p) => ({
    id: p.id,
    value: p.value,
    paymentDate: p.payment_date,
    receivedDate: p.received_date,
  }));
  const paymentSummary = summarizePayments(contractPayments);
  if (contractPayments.length > 0 || contract.value != null) {
    const financeSublabel =
      paymentSummary.outstanding > 0 ? `AED ${paymentSummary.outstanding} outstanding` : "Fully paid";
    ringOne.push({
      id: `contract-finance:${domain}:${contractId}`,
      data: {
        kind: "contract-finance",
        label: "FINANCE",
        sublabel: financeSublabel,
        exception: paymentSummary.overdue > 0,
        clickable: true,
        center: { kind: "contract-finance", domain, id: contractId },
        groupKey: "finance",
        relationshipReason: `${contract.title ?? "This contract"}'s financial position.`,
      },
    });
  }
```

(The `if` gate matches the design doc's rule exactly: FINANCE is shown whenever there's
*something* real to say — either payment rows exist, or the contract at least has a real
value — and omitted only when both are absent, e.g. the one real FM contract today, which has
neither. `contract.value` is already available in this function's scope from the earlier
`contractRes` query.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 5: Cross-check against real data**

Using the Supabase MCP tool (name contains `execute_sql`; load via ToolSearch if not visible)
against project `evcaehadjzoxtdlnmehk`, pick a real AMC contract with multiple payments (e.g.
`59e6cd61-76b2-4505-9b03-d93744b11a57`, "Jairajesh, La Rosa 2, V-316", value 4095) and compute
by hand:

```sql
select id, value, payment_date, received_date
from contract_payments
where contract_id = '59e6cd61-76b2-4505-9b03-d93744b11a57'
order by payment_date;
```

For each row, apply the `computePaymentStatus` logic from Step 1 by hand (received_date set →
Received; else compare `payment_date` to today) and confirm your running Received/Outstanding/
Overdue totals match what `summarizePayments` would compute. Also check a contract with zero
payments (e.g. `a9e46e2f-6f2c-4582-a3e9-2994cd4d74c4`, "BENJAMIN", value 3500) — confirm the
FINANCE node would still appear (since `contract.value` is non-null) with sublabel "Fully paid"
(since `outstanding` is 0 when there are no payment rows at all).

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: contract's ring shows a real FINANCE summary instead of a flat payment list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Real `contract-finance` screen

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — add
  `fetchContractFinanceConnections`, wire its routing case.

- [ ] **Step 1: Add `fetchContractFinanceConnections`**

Add this function directly after `fetchContractConnections` (before `fetchWorkOrderConnections`):

```ts
async function fetchContractFinanceConnections(
  domain: "AMC" | "FM",
  contractId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const contractTable = domain === "AMC" ? "contracts" : "fm_contracts";
  const paymentTable = domain === "AMC" ? "contract_payments" : "fm_contract_payments";

  const [contractRes, paymentsRes] = await Promise.all([
    supabase.from(contractTable).select("id, title, value").eq("id", contractId).maybeSingle(),
    supabase
      .from(paymentTable)
      .select("id, value, payment_date, received_date")
      .eq("contract_id", contractId)
      .order("payment_date", { ascending: true }),
  ]);

  if (contractRes.error) throw contractRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const contract = contractRes.data;
  if (!contract) throw new Error("Contract not found");

  const payments = (paymentsRes.data ?? []).map((p) => ({
    id: p.id,
    value: p.value,
    paymentDate: p.payment_date,
    receivedDate: p.received_date,
  }));
  const summary = summarizePayments(payments);

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  if (payments.length === 0) {
    ringOne.push({
      id: `contract-finance-empty:${contractId}`,
      data: {
        kind: "staff-detail",
        label: "No payment records available",
        clickable: false,
        groupKey: "finance-empty",
      },
    });
  } else {
    ringOne.push({
      id: `payment-category:${domain}:${contractId}:received`,
      data: {
        kind: "category",
        label: "Received",
        sublabel: `AED ${summary.received}`,
        clickable: true,
        center: { kind: "payment-category", domain, contractId, category: "received" },
        groupKey: "received",
        relationshipReason: "Payments already received under this contract.",
      },
    });
    ringOne.push({
      id: `payment-category:${domain}:${contractId}:outstanding`,
      data: {
        kind: "category",
        label: "Outstanding",
        sublabel: `AED ${summary.outstanding}`,
        clickable: true,
        center: { kind: "payment-category", domain, contractId, category: "outstanding" },
        groupKey: "outstanding",
        relationshipReason: "Payments not yet received under this contract.",
      },
    });
    if (summary.overdue > 0) {
      ringOne.push({
        id: `payment-category:${domain}:${contractId}:overdue`,
        data: {
          kind: "category",
          label: "Overdue",
          sublabel: `AED ${summary.overdue}`,
          exception: true,
          clickable: true,
          center: { kind: "payment-category", domain, contractId, category: "overdue" },
          groupKey: "overdue",
          relationshipReason: "Overdue payments under this contract.",
        },
      });
    }
    if (summary.nextPayment) {
      ringOne.push({
        id: `payment:${domain}:${summary.nextPayment.id}`,
        data: {
          kind: "payment",
          label: "Next Payment",
          sublabel: `AED ${summary.nextPayment.value} · ${summary.nextPayment.date}`,
          clickable: true,
          center: { kind: "payment", domain, id: summary.nextPayment.id },
          groupKey: "next-payment",
          relationshipReason: "The next payment due on this contract.",
        },
      });
    }
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Contract Value", value: contract.value != null ? `AED ${contract.value}` : "-" },
    { label: "Received", value: `AED ${summary.received}` },
    { label: "Outstanding", value: `AED ${summary.outstanding}` },
    { label: "Overdue", value: `AED ${summary.overdue}` },
    {
      label: "Next Payment",
      value: summary.nextPayment
        ? `AED ${summary.nextPayment.value} — ${summary.nextPayment.date}`
        : "-",
    },
  ];

  return {
    centerLabel: "FINANCE",
    centerSublabel: contract.title ?? "",
    centerDetail,
    ringOne,
  };
}
```

- [ ] **Step 2: Wire the `contract-finance` routing case**

Add this to the routing switch inside `useUniverseGraph`'s `queryFn`, directly after the
`ppm-visit` case and before the `customer` case:

```ts
      if (centerEntity.kind === "contract-finance") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractFinanceConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "contract-finance",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `contract-finance:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail,
        };
      }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo (nothing else in the plan touches
`payment-category`/`payment` CenterEntity kinds yet, but `fetchContractFinanceConnections`
constructing them as `center` values type-checks fine against Task 1's already-landed types —
they just have no routing handler yet, which is fine since nothing navigates there until Tasks
4-5 land).

- [ ] **Step 4: Cross-check against real data**

Reuse the same contract from Task 2's Step 5 (`59e6cd61-...`, 2 Received + 2 Not Yet Due, 0
Due, 0 Overdue). Confirm the ring this function would build: a "Received" node (AED 2047.50),
an "Outstanding" node showing **AED 0** (its 2 unpaid payments are both `Not Yet Due`, which
doesn't count as outstanding under the corrected definition — see Task 2), no "Overdue" node
(0 overdue payments), and a "Next Payment" node for whichever of the 2 `Not Yet Due` payments
has the earlier `payment_date` (Next Payment is independent of the Outstanding definition — it
surfaces the soonest unpaid installment regardless of whether it's technically "due" yet).

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: real contract-finance screen with Received/Outstanding/Overdue/Next Payment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Real `payment-category` screen

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — add
  `fetchPaymentsInCategory`, wire its routing case.

- [ ] **Step 1: Add `fetchPaymentsInCategory`**

Add this function directly after `fetchContractFinanceConnections`:

```ts
async function fetchPaymentsInCategory(
  domain: "AMC" | "FM",
  contractId: string,
  category: "received" | "outstanding" | "overdue",
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const paymentTable = domain === "AMC" ? "contract_payments" : "fm_contract_payments";
  const { data, error } = await supabase
    .from(paymentTable)
    .select("id, value, payment_date, received_date")
    .eq("contract_id", contractId)
    .order("payment_date", { ascending: true });
  if (error) throw error;

  const filtered = (data ?? []).filter((p) => {
    const status = computePaymentStatus(p.payment_date, p.received_date);
    if (category === "received") return status === "Received";
    if (category === "overdue") return status === "Overdue";
    // "outstanding" matches summarizePayments' definition (Due + Overdue only, not
    // "Not Yet Due" future installments) - see Task 2's corrected computePaymentStatus.
    return status === "Due" || status === "Overdue";
  });

  const ringOne: { id: string; data: UniverseNodeData }[] = filtered.map((p) => ({
    id: `payment:${domain}:${p.id}`,
    data: {
      kind: "payment",
      label: p.value != null ? `AED ${p.value}` : "Payment",
      sublabel: p.received_date ?? p.payment_date ?? undefined,
      exception: category === "overdue",
      clickable: true,
      center: { kind: "payment", domain, id: p.id },
      groupKey: category,
      relationshipReason: `This payment is ${category} on this contract.`,
    },
  }));

  if (ringOne.length === 0) {
    const labels: Record<string, string> = {
      received: "No received payments",
      outstanding: "No outstanding payments",
      overdue: "No overdue payments",
    };
    ringOne.push({
      id: `payment-category-empty:${domain}:${contractId}:${category}`,
      data: {
        kind: "staff-detail",
        label: labels[category],
        clickable: false,
        groupKey: category,
      },
    });
  }

  return ringOne;
}
```

(`category !== "received"` covers `"outstanding"`, which by definition is every non-received
row regardless of due timing — matching the design doc's Outstanding definition exactly.)

- [ ] **Step 2: Wire the `payment-category` routing case**

Add this to the routing switch, directly after the `contract-finance` case (added in Task 3)
and before the `customer` case:

```ts
      if (centerEntity.kind === "payment-category") {
        const ringOne = await fetchPaymentsInCategory(
          centerEntity.domain,
          centerEntity.contractId,
          centerEntity.category,
        );
        const labels: Record<string, string> = {
          received: "Received",
          outstanding: "Outstanding",
          overdue: "Overdue",
        };
        const centerData: UniverseNodeData = {
          kind: "category",
          label: labels[centerEntity.category] ?? centerEntity.category,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `payment-category:${centerEntity.domain}:${centerEntity.contractId}:${centerEntity.category}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 4: Cross-check against real data**

Using the same contract as before (2 `Received`, 2 `Not Yet Due`, 0 `Due`, 0 `Overdue`), confirm
`fetchPaymentsInCategory(..., "outstanding")` would return the single empty-state leaf ("No
outstanding payments") — its 2 unpaid rows are both `Not Yet Due`, which the corrected
definition excludes from "outstanding" — and `fetchPaymentsInCategory(..., "overdue")` would
likewise return its own empty-state leaf ("No overdue payments"). Separately, find a real
contract with at least one payment in `Due` or `Overdue` status:

```sql
select contract_id, payment_date, value
from contract_payments
where received_date is null and payment_date < current_date
limit 5;
```

For each row, apply `computePaymentStatus`'s corrected (midnight-normalized) formula by hand to
confirm which are genuinely `Due` (1-15 days past `payment_date`) vs `Overdue` (16+ days), and
confirm that contract's "Outstanding" and "Overdue" categories would show real, non-empty
results.

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: real Received/Outstanding/Overdue payment lists per contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Real `payment` screen

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — add
  `fetchPaymentConnections`, wire its routing case.

- [ ] **Step 1: Add `fetchPaymentConnections`**

Add this function directly after `fetchPaymentsInCategory`:

```ts
async function fetchPaymentConnections(
  domain: "AMC" | "FM",
  paymentId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const paymentTable = domain === "AMC" ? "contract_payments" : "fm_contract_payments";
  const { data: payment, error } = await supabase
    .from(paymentTable)
    .select("id, contract_id, value, payment_date, received_date")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!payment) throw new Error("Payment not found");

  const status = computePaymentStatus(payment.payment_date, payment.received_date);

  // contract_id is NOT NULL on both contract_payments and fm_contract_payments (confirmed
  // against the live schema) - unlike work_orders/fm_work_orders' nullable contract_id, no
  // gate is needed here; a real payment row always has a real contract to link back to.
  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: `contract:${domain}:${payment.contract_id}`,
      data: {
        kind: "contract",
        label: "Back to Contract",
        clickable: true,
        center: { kind: "contract", domain, id: payment.contract_id },
        groupKey: "contract",
        relationshipReason: "This payment was made against this contract.",
      },
    },
  ];

  const centerDetail: CenterDetailField[] = [
    { label: "Amount", value: payment.value != null ? `AED ${payment.value}` : "-" },
    { label: "Payment Date", value: payment.payment_date ?? "-" },
    { label: "Received Date", value: payment.received_date ?? "Not yet received" },
    { label: "Status", value: status },
  ];

  return {
    centerLabel: payment.value != null ? `AED ${payment.value}` : "Payment",
    centerSublabel: status,
    centerDetail,
    ringOne,
  };
}
```

- [ ] **Step 2: Wire the `payment` routing case**

Add this to the routing switch, directly after the `payment-category` case (added in Task 4)
and before the `customer` case:

```ts
      if (centerEntity.kind === "payment") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchPaymentConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "payment",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `payment:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail,
        };
      }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo. This is the first point where all three new
CenterEntity kinds (`contract-finance`, `payment-category`, `payment`) are fully wired
end-to-end — Contract → FINANCE → Received/Outstanding/Overdue → a real payment → back to
Contract should now be a complete, working loop.

Run: `npx eslint src/features/operations-universe/useUniverseNodes.ts`

Expected: no new warnings.

- [ ] **Step 4: Cross-check against real data**

Pick one real payment id from Task 4's cross-check output and confirm via the Supabase MCP tool
that `select id, contract_id, value, payment_date, received_date from contract_payments where
id = '<that id>'` returns a row whose `contract_id` matches the contract you started from —
this is what the "Back to Contract" node links to, completing the full Contract → FINANCE →
category → payment → Contract loop.

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: a real payment becomes a graph center, linking back to its contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Detail panel auto-opens for the new financial screens

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx`

- [ ] **Step 1: Add `"contract-finance"` and `"payment"` to `DETAIL_ENTITY_KINDS`**

Find:

```ts
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "ppm-visit",
  "employee",
  "customer",
];
```

Replace it with:

```ts
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "ppm-visit",
  "contract-finance",
  "payment",
  "employee",
  "customer",
];
```

(`"payment-category"` is intentionally NOT added — like `contract-category`/`schedule-category`
before it, it's a listing screen with `centerDetail: undefined`, not a detail screen.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

Run: `npx eslint src/features/operations-universe/OperationsUniverse.tsx`

Expected: no new warnings.

- [ ] **Step 3: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
fix: FINANCE and payment detail panels auto-open on navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Financial cross-checks and manual verification checklist

Per the brief's explicit requirement (§19), this task is mandatory, not optional — it's the
"prove the numbers are right" step, not just a UI smoke test. This environment cannot log into
the deployed app as a real authenticated user (`/universe` redirects to `/auth`, which needs
real Google or email/password credentials this environment doesn't have), so the UI
click-through parts are a checklist for a human; the financial cross-checks are SQL-verifiable
right now and must actually be run, not skipped.

**Files:** none — this task produces no code changes.

- [ ] **Step 1: AMC contract with payments — full cross-check**

Using the Supabase MCP tool against project `evcaehadjzoxtdlnmehk`, for contract
`59e6cd61-76b2-4505-9b03-d93744b11a57` ("Jairajesh, La Rosa 2, V-316"): confirm `contracts.value
= 4095`, confirm the 4 real payment rows, and confirm your Task 2/3 cross-checks already
computed Received = AED 2047.50, Outstanding = AED 0 (its other 2 payments are `Not Yet Due`,
which the corrected definition excludes), Overdue = AED 0. Report whether the app's numbers
matched the source data.

- [ ] **Step 2: Contract with no payment records — empty state**

For contract `a9e46e2f-6f2c-4582-a3e9-2994cd4d74c4` ("BENJAMIN", value 3500, 0 payments):
confirm the FINANCE node would show (value is non-null) with "Fully paid" sublabel, and clicking
in would show the "No payment records available" leaf, not a fabricated AED 0 payment record.

- [ ] **Step 3: Contract with multiple payment records — aggregation**

Already covered by Step 1 (4 real payment rows) — confirm the aggregation summed correctly
across all 4, not just the first or last.

- [ ] **Step 4: Fully paid contract — outstanding = 0**

Find a real AMC contract where every payment has a `received_date` set:

```sql
select c.id, c.title, c.value
from contracts c
where not exists (
  select 1 from contract_payments cp where cp.contract_id = c.id and cp.received_date is null
)
and exists (select 1 from contract_payments cp where cp.contract_id = c.id)
limit 3;
```

For one result, confirm Outstanding would compute to AED 0 and no "Overdue" ring node would
appear (per the `summary.overdue > 0` gate in Task 3).

- [ ] **Step 5: Overdue contract — verify overdue logic**

```sql
select contract_id, payment_date, value
from contract_payments
where received_date is null and payment_date < current_date - interval '15 days'
limit 3;
```

For one result, confirm it would classify as `Overdue` per `computePaymentStatus`, contribute to
that contract's Overdue sum, and appear in that contract's `payment-category` "overdue" list
with `exception: true`.

- [ ] **Step 6: FM contract — honest empty state**

Confirm again that `fm_contracts` has exactly 1 real row with `value = NULL` and
`fm_contract_payments` has 0 rows for it. Confirm the FINANCE node would NOT appear at all on
this contract's ring (both gates in Task 2's `if (contractPayments.length > 0 || contract.value
!= null)` are false) — this is the correct, honest behavior for a contract with genuinely
nothing financial to show, not a bug.

- [ ] **Step 7: Manual browser checklist (for a human with real credentials)**

- Contract → FINANCE → RECEIVED → a real payment → Contract (Journey A)
- Contract → FINANCE → OUTSTANDING (Journey B)
- Contract → FINANCE → OVERDUE → a real overdue payment, where such data exists (Journey C)
- Contract → OPERATIONS-equivalent (Work Order → Employee → Contract, existing Phase 1/3a
  behavior) → FINANCE (Journey D)
- A fully-paid contract → FINANCE → Outstanding AED 0 → no false Overdue warning (Journey E)
- Regression: STAFF, Customer/Search (Phase 3a/3c), and SCHEDULES (Phase 4a) all still work
  exactly as before — this plan didn't touch any of their code paths except the one intentional
  change to `fetchContractConnections`'s payment ring nodes.
- Mobile: repeat Journey A at mobile width — no overlapping nodes, readable AED figures,
  tappable targets, usable bottom-sheet context panel, Back / Return to Today both work.

State plainly in the completion report whether this step was actually performed with a real
login, or whether it remains outstanding for the user to do themselves — per the brief's
explicit instruction (§31), never claim UI verification that didn't happen.
