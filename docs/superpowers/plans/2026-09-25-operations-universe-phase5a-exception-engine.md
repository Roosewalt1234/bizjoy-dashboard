# Operations Universe Phase 5a (Canonical Overdue Rule + Exception Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Schedules branch's work-order overdue detection to use `completion_due_at`
(the app's real, confirmed-authoritative deadline field) instead of `scheduled_date`, then
build a centralized, typed exception-detection engine (`exceptions.ts`) covering operational,
staff, financial, contract, and data-quality exceptions — no new UI yet, that's Phase 5b.

**Architecture:** A new `src/features/operations-universe/exceptions.ts` exports an
`OperationalException` model and one detector function per exception type, each an independent,
directly-callable async function returning real data with a real per-record reason string. A
top-level `detectAllExceptions()` aggregates all six; `groupExceptionsByContract()` supports
future contract-level rollup display. Nothing in this file renders UI — a later phase's TODAY/
ATTENTION screen will call these functions the same way existing screens call
`fetchContractConnections` etc.

**Tech Stack:** bizjoy-dashboard (TanStack Start + Supabase, project `evcaehadjzoxtdlnmehk`).

**Design doc:**
`docs/superpowers/specs/2026-09-25-operations-universe-phase5a-exception-engine-design.md`

**Testing note:** same as every prior phase — no automated test runner in this repo (confirmed
again; `package.json` has no `test` script, no vitest/jest). Verified via `npx tsc --noEmit`,
`npx eslint`, and — per the brief's own explicit requirement — for each detector, at least one
real matching record (true positive) AND at least one real non-matching record (false-positive
guard), not just a happy-path check.

**Scope boundary:** No new graph screens, nodes, or TODAY/ATTENTION UI in this plan — that's
Phase 5b. Schedule-conflict detection is explicitly NOT built (confirmed no time-of-day column
exists on either work-order table). Nothing in Phase 1/3a/3c/4a/4b's existing UI is touched
except the one confirmed bug fix in Task 1. Fully read-only.

---

### Task 1: Fix the canonical overdue rule for work orders in the Schedules branch

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — add
  `categorizeByDeadline`, update `fetchScheduleCounts` and `fetchScheduleItems`'s work-order
  sections.

- [ ] **Step 1: Add a deadline-based categorizer alongside the existing date-based one**

Find:

```ts
function categorizeByDate(todayStr: string, dateStr: string): "today" | "upcoming" | "overdue" {
  if (dateStr === todayStr) return "today";
  return dateStr < todayStr ? "overdue" : "upcoming";
}
```

Add directly after it:

```ts

function categorizeByDeadline(
  todayStr: string,
  deadlineIso: string,
): "today" | "upcoming" | "overdue" {
  const deadline = new Date(deadlineIso);
  if (deadline.getTime() < Date.now()) return "overdue";
  const deadlineDateStr = deadline.toISOString().slice(0, 10);
  return deadlineDateStr === todayStr ? "today" : "upcoming";
}
```

(`categorizeByDate` stays exactly as-is — PPM visits use real planned/due *dates*, not SLA
deadlines, so their categorization is correct as it already is. `categorizeByDeadline` is only
for work orders, which have a real deadline *instant* — `completion_due_at` — not just a date.
Checking "is the deadline instant already past" first, before falling back to a same-day
check, correctly handles a deadline that's today but already passed as `"overdue"`, not
`"today"`.)

- [ ] **Step 2: Fix `fetchScheduleCounts`'s work-order query and categorization**

Find:

```ts
    supabase
      .from("work_orders")
      .select("scheduled_date")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("scheduled_date")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);

  if (fmPpmRes.error) throw fmPpmRes.error;
  if (amcPpmRes.error) throw amcPpmRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const counts = { today: 0, upcoming: 0, overdue: 0 };

  for (const visit of [...(fmPpmRes.data ?? []), ...(amcPpmRes.data ?? [])]) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    counts[categorizeByDate(todayStr, date)]++;
  }
  for (const wo of [...(amcWosRes.data ?? []), ...(fmWosRes.data ?? [])]) {
    if (!wo.scheduled_date) continue;
    counts[categorizeByDate(todayStr, wo.scheduled_date)]++;
  }

  return counts;
}
```

Replace it with (the two work-order `select`/`.not` lines change from `scheduled_date` to
`completion_due_at`, and the final work-order loop uses the new categorizer):

```ts
    supabase
      .from("work_orders")
      .select("completion_due_at")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("completion_due_at")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);

  if (fmPpmRes.error) throw fmPpmRes.error;
  if (amcPpmRes.error) throw amcPpmRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const counts = { today: 0, upcoming: 0, overdue: 0 };

  for (const visit of [...(fmPpmRes.data ?? []), ...(amcPpmRes.data ?? [])]) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    counts[categorizeByDate(todayStr, date)]++;
  }
  for (const wo of [...(amcWosRes.data ?? []), ...(fmWosRes.data ?? [])]) {
    if (!wo.completion_due_at) continue;
    counts[categorizeByDeadline(todayStr, wo.completion_due_at)]++;
  }

  return counts;
}
```

- [ ] **Step 3: Fix `fetchScheduleItems`'s work-order query, categorization, and labels**

Find (the two `Promise.all` query entries for `work_orders`/`fm_work_orders`):

```ts
    supabase
      .from("work_orders")
      .select("id, wo_no, scheduled_date, status")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, scheduled_date, status")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
```

Replace it with:

```ts
    supabase
      .from("work_orders")
      .select("id, wo_no, completion_due_at, status")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, completion_due_at, status")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
```

Find the AMC work-order loop:

```ts
  for (const wo of amcWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorizeByDate(todayStr, wo.scheduled_date);
    items.push({
      category,
      date: wo.scheduled_date,
      node: {
        id: `work-order:AMC:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "AMC", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is scheduled for ${wo.scheduled_date}.`,
        },
      },
    });
  }
```

Replace it with:

```ts
  for (const wo of amcWosRes.data ?? []) {
    if (!wo.completion_due_at) continue;
    const category = categorizeByDeadline(todayStr, wo.completion_due_at);
    const dueDateStr = wo.completion_due_at.slice(0, 10);
    items.push({
      category,
      date: wo.completion_due_at,
      node: {
        id: `work-order:AMC:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "AMC", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is due by ${dueDateStr}.`,
        },
      },
    });
  }
```

Find the FM work-order loop (identical shape, domain `"FM"`):

```ts
  for (const wo of fmWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorizeByDate(todayStr, wo.scheduled_date);
    items.push({
      category,
      date: wo.scheduled_date,
      node: {
        id: `work-order:FM:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "FM", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is scheduled for ${wo.scheduled_date}.`,
        },
      },
    });
  }
```

Replace it with:

```ts
  for (const wo of fmWosRes.data ?? []) {
    if (!wo.completion_due_at) continue;
    const category = categorizeByDeadline(todayStr, wo.completion_due_at);
    const dueDateStr = wo.completion_due_at.slice(0, 10);
    items.push({
      category,
      date: wo.completion_due_at,
      node: {
        id: `work-order:FM:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "FM", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is due by ${dueDateStr}.`,
        },
      },
    });
  }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 5: Cross-check against real data**

Using the Supabase MCP tool (name contains `execute_sql`; load via ToolSearch if not visible)
against project `evcaehadjzoxtdlnmehk`, run:

```sql
select id, wo_no, completion_due_at, status from fm_work_orders
where completion_due_at is not null and status not in ('Completed','Cancelled');

select id, wo_no, completion_due_at, status from work_orders
where completion_due_at is not null and status not in ('Completed','Cancelled');
```

Expected: exactly 2 real rows total (both FM, the two PPM-converted work orders from Phase 4a),
both with `completion_due_at` months in the past — confirming both would categorize as
`"overdue"` under the new logic, exactly as they already did under the old (buggy but
coincidentally-matching) `scheduled_date`-based logic. This confirms the fix changes the
*mechanism* without breaking today's real behavior — the entire point of fixing this before
building exceptions on top of it.

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
fix: SCHEDULES uses completion_due_at (the app's real overdue deadline) not scheduled_date

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Exception engine — types, operational detectors (work orders, PPM)

**Files:**
- Create: `src/features/operations-universe/exceptions.ts`

- [ ] **Step 1: Create the file with the exception model and the two operational detectors**

```ts
import { supabase } from "@/integrations/supabase/client";
import type { CenterEntity, ContractDomain } from "./types";

export type ExceptionSeverity = "attention" | "important" | "critical";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";

export interface OperationalException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  target: CenterEntity;
  contractId?: string;
  contractDomain?: ContractDomain;
}

export async function detectOverdueWorkOrders(): Promise<OperationalException[]> {
  const now = Date.now();

  const [amcRes, fmRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_no, completion_due_at, contract_id")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, completion_due_at, contract_id")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);
  if (amcRes.error) throw amcRes.error;
  if (fmRes.error) throw fmRes.error;

  const workOrders = [
    ...(amcRes.data ?? []).map((wo) => ({ ...wo, domain: "AMC" as const })),
    ...(fmRes.data ?? []).map((wo) => ({ ...wo, domain: "FM" as const })),
  ];

  const exceptions: OperationalException[] = [];
  for (const wo of workOrders) {
    if (!wo.completion_due_at) continue;
    const dueAt = new Date(wo.completion_due_at).getTime();
    if (dueAt >= now) continue;
    const daysOverdue = Math.floor((now - dueAt) / 86400000);
    exceptions.push({
      id: `operations:overdue-work-order:${wo.domain}:${wo.id}`,
      category: "operations",
      severity: daysOverdue > 30 ? "critical" : "important",
      title: "Overdue Work Order",
      reason: `${wo.wo_no ?? "This work order"} requires attention because its completion due date was ${wo.completion_due_at.slice(0, 10)} and it remains open.`,
      target: { kind: "work-order", domain: wo.domain, id: wo.id },
      contractId: wo.contract_id ?? undefined,
      contractDomain: wo.contract_id ? wo.domain : undefined,
    });
  }
  return exceptions;
}

export async function detectOverduePpm(): Promise<OperationalException[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [fmRes, amcRes] = await Promise.all([
    supabase
      .from("ppm_visits")
      .select("id, planned_date, due_date, contract_id, work_order_id, status")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("amc_ppm_visits")
      .select("id, planned_date, due_date, contract_id, work_order_id, status")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
  ]);
  if (fmRes.error) throw fmRes.error;
  if (amcRes.error) throw amcRes.error;

  const visits = [
    ...(fmRes.data ?? []).map((v) => ({ ...v, domain: "FM" as const })),
    ...(amcRes.data ?? []).map((v) => ({ ...v, domain: "AMC" as const })),
  ];

  const exceptions: OperationalException[] = [];
  for (const visit of visits) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date || date >= todayStr) continue;
    exceptions.push({
      id: `operations:overdue-ppm:${visit.domain}:${visit.id}`,
      category: "operations",
      severity: "important",
      title: "Overdue PPM",
      reason: `This PPM visit was due on ${date} and remains unresolved.`,
      target: { kind: "ppm-visit", domain: visit.domain, id: visit.id },
      contractId: visit.contract_id,
      contractDomain: visit.domain,
    });
  }
  return exceptions;
}
```

(`detectOverduePpm` reuses the exact `work_order_id IS NULL` dedup guard already established in
Phase 4a's `fetchScheduleItems` — a converted visit is represented only by
`detectOverdueWorkOrders`, never both. String comparison `date >= todayStr` between two
`YYYY-MM-DD` date-only strings is exact and needs no midnight normalization — that concern only
applies to comparing a date against a real timestamp `Date` object, which this isn't.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 3: Cross-check against real data — true and false positives**

Using the Supabase MCP tool against project `evcaehadjzoxtdlnmehk`:

```sql
-- True positives: should match detectOverdueWorkOrders exactly (2 rows, per Task 1's Step 5)
select id, wo_no, completion_due_at from fm_work_orders
where completion_due_at is not null and status not in ('Completed','Cancelled');

-- False-positive guard: a real work order with a status excluded from detection
select id, wo_no, status from fm_work_orders where status in ('Completed');
```

For PPM: confirm real `ppm_visits` rows with `work_order_id IS NULL` and a past
`due_date`/`planned_date` (expect the 2 already-known overdue Planned visits from Phase 4a) are
matched, and confirm the 2 real `Converted` visits (which DO have `work_order_id` set) are
correctly excluded — a genuine false-positive guard, not just a happy-path check.

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/exceptions.ts
git commit -m "$(cat <<'EOF'
feat: exception engine - types, overdue work order and overdue PPM detectors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Staff and financial detectors

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — export
  `computePaymentStatus`.
- Modify: `src/features/operations-universe/exceptions.ts` — add
  `detectStaffAttendanceIssues`, `detectOverduePayments`.

- [ ] **Step 1: Export `computePaymentStatus` from `useUniverseNodes.ts`**

Find:

```ts
function computePaymentStatus(
  paymentDate: string | null,
  receivedDate: string | null,
): "Received" | "Not Yet Due" | "Due" | "Overdue" {
```

Replace it with (only the `export` keyword added):

```ts
export function computePaymentStatus(
  paymentDate: string | null,
  receivedDate: string | null,
): "Received" | "Not Yet Due" | "Due" | "Overdue" {
```

- [ ] **Step 2: Add the two detectors**

Add this import at the top of `exceptions.ts`, alongside the existing imports:

```ts
import { computePaymentStatus } from "./useUniverseNodes";
```

Add these two functions at the end of `exceptions.ts`:

```ts
export async function detectStaffAttendanceIssues(): Promise<OperationalException[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employeesRes, amcWosRes, fmWosRes, attendanceRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, position")
      .eq("status", "Active"),
    supabase
      .from("work_orders")
      .select("technician_id")
      .not("technician_id", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("technician_id")
      .not("technician_id", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase.from("attendance_logs").select("employee_id").eq("attendance_date", todayStr),
  ]);
  if (employeesRes.error) throw employeesRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;
  if (attendanceRes.error) throw attendanceRes.error;

  const assignedCounts = new Map<string, number>();
  for (const wo of [...(amcWosRes.data ?? []), ...(fmWosRes.data ?? [])]) {
    if (!wo.technician_id) continue;
    assignedCounts.set(wo.technician_id, (assignedCounts.get(wo.technician_id) ?? 0) + 1);
  }

  const attendedToday = new Set((attendanceRes.data ?? []).map((row) => row.employee_id));

  const exceptions: OperationalException[] = [];
  for (const employee of employeesRes.data ?? []) {
    const assignedCount = assignedCounts.get(employee.id) ?? 0;
    if (assignedCount === 0) continue;
    if (attendedToday.has(employee.id)) continue;
    const name = employee.full_name ?? `${employee.first_name} ${employee.last_name ?? ""}`.trim();
    exceptions.push({
      id: `people:no-attendance:${employee.id}`,
      category: "people",
      severity: "important",
      title: "No Attendance Recorded",
      reason: `${name} has ${assignedCount} open work order${assignedCount === 1 ? "" : "s"} assigned but no attendance record for today.`,
      target: { kind: "employee", id: employee.id, name, position: employee.position ?? undefined },
    });
  }
  return exceptions;
}

export async function detectOverduePayments(): Promise<OperationalException[]> {
  const [contractsRes, paymentsRes] = await Promise.all([
    supabase.from("contracts").select("id, title"),
    supabase
      .from("contract_payments")
      .select("id, contract_id, value, payment_date, received_date"),
  ]);
  if (contractsRes.error) throw contractsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const contractTitles = new Map((contractsRes.data ?? []).map((c) => [c.id, c.title]));
  const overdueByContract = new Map<string, { count: number; total: number }>();

  for (const payment of paymentsRes.data ?? []) {
    const status = computePaymentStatus(payment.payment_date, payment.received_date);
    if (status !== "Overdue") continue;
    const current = overdueByContract.get(payment.contract_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += payment.value ?? 0;
    overdueByContract.set(payment.contract_id, current);
  }

  const exceptions: OperationalException[] = [];
  for (const [contractId, { count, total }] of overdueByContract) {
    const title = contractTitles.get(contractId) ?? "This contract";
    exceptions.push({
      id: `finance:overdue-payment:AMC:${contractId}`,
      category: "finance",
      severity: "critical",
      title: "Overdue Payment",
      reason: `${title} has ${count} payment${count === 1 ? "" : "s"} totaling AED ${total} that remain unpaid more than 15 days after the due date.`,
      target: { kind: "contract-finance", domain: "AMC", id: contractId },
      contractId,
      contractDomain: "AMC",
    });
  }
  return exceptions;
}
```

(`detectOverduePayments` only queries `contract_payments`/`contracts`, i.e. AMC — confirmed in
Phase 4b that `fm_contract_payments` has 0 real rows, so there is nothing for FM to detect
today; this is not a domain oversight, it's the correct reflection of real data. One exception
per *contract*, not per payment, aggregating count and total — matching the brief's own §10
aggregation principle at the source rather than generating one alert per late payment.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 4: Cross-check against real data — true and false positives**

```sql
-- Staff: true positives (expect 2 employees today, per the investigation)
select e.id, e.full_name
from employees e
where e.status = 'Active'
and exists (
  select 1 from fm_work_orders wo where wo.technician_id = e.id and wo.status not in ('Completed','Cancelled')
)
and not exists (
  select 1 from attendance_logs al where al.employee_id = e.id and al.attendance_date = current_date
);

-- Staff: false-positive guard - an employee with an open work order AND real attendance today
-- should NOT appear above; cross-check by picking one such employee id and confirming
-- they're absent from the query result.

-- Finance: true positives (expect 7 AMC contracts, per the investigation)
select contract_id, count(*), sum(value)
from contract_payments
where received_date is null and current_date - payment_date >= 16
group by contract_id;
```

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts src/features/operations-universe/exceptions.ts
git commit -m "$(cat <<'EOF'
feat: exception engine - staff attendance and overdue payment detectors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Contract expiry and data-quality reconciliation detectors

**Files:**
- Modify: `src/features/operations-universe/exceptions.ts`

- [ ] **Step 1: Add the two detectors**

Add these two functions at the end of `exceptions.ts`:

```ts
export async function detectExpiringContracts(): Promise<OperationalException[]> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 60);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const [amcRes, fmRes] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, title, end_date")
      .eq("status", "Active")
      .not("end_date", "is", null)
      .gte("end_date", todayStr)
      .lte("end_date", windowEndStr),
    supabase
      .from("fm_contracts")
      .select("id, title, end_date")
      .eq("status", "Active")
      .not("end_date", "is", null)
      .gte("end_date", todayStr)
      .lte("end_date", windowEndStr),
  ]);
  if (amcRes.error) throw amcRes.error;
  if (fmRes.error) throw fmRes.error;

  const exceptions: OperationalException[] = [];
  for (const contract of [
    ...(amcRes.data ?? []).map((c) => ({ ...c, domain: "AMC" as const })),
    ...(fmRes.data ?? []).map((c) => ({ ...c, domain: "FM" as const })),
  ]) {
    exceptions.push({
      id: `contracts:expiring:${contract.domain}:${contract.id}`,
      category: "contracts",
      severity: "attention",
      title: "Expiring Contract",
      reason: `${contract.title ?? "This contract"} is active and ends on ${contract.end_date}, within the next 60 days.`,
      target: { kind: "contract", domain: contract.domain, id: contract.id },
      contractId: contract.id,
      contractDomain: contract.domain,
    });
  }
  return exceptions;
}

export async function detectReconciliationIssues(): Promise<OperationalException[]> {
  const [contractsRes, paymentsRes] = await Promise.all([
    supabase.from("contracts").select("id, title, value").not("value", "is", null),
    supabase.from("contract_payments").select("contract_id, value"),
  ]);
  if (contractsRes.error) throw contractsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const scheduledTotals = new Map<string, number>();
  for (const payment of paymentsRes.data ?? []) {
    const current = scheduledTotals.get(payment.contract_id) ?? 0;
    scheduledTotals.set(payment.contract_id, current + (payment.value ?? 0));
  }

  const exceptions: OperationalException[] = [];
  for (const contract of contractsRes.data ?? []) {
    const scheduledTotal = scheduledTotals.get(contract.id) ?? 0;
    const contractValue = contract.value ?? 0;
    const delta = Math.abs(contractValue - scheduledTotal);
    if (delta <= 1) continue;
    exceptions.push({
      id: `data-quality:reconciliation:AMC:${contract.id}`,
      category: "data-quality",
      severity: "attention",
      title: "Payment Schedule Mismatch",
      reason: `${contract.title ?? "This contract"}'s payment schedule totals AED ${scheduledTotal}, but the contract value is AED ${contractValue}.`,
      target: { kind: "contract", domain: "AMC", id: contract.id },
      contractId: contract.id,
      contractDomain: "AMC",
    });
  }
  return exceptions;
}
```

(`detectReconciliationIssues` is AMC-only, matching real data — FM has zero payment rows, so
there is nothing to reconcile there. This is deliberately classified `"data-quality"`, never
`"finance"` — per the brief's own §24/§25, a schedule/value mismatch is not automatically a
genuine financial emergency, and `detectOverduePayments` already independently catches any
contract that also has a real overdue payment; the two categories don't overlap by
construction, since this detector never inspects payment *status*, only the schedule *total*.
No 30/60/90-day precedent existed anywhere in this app before this task — 60 days was chosen
because it's the smallest window that demonstrates against real data (3 real AMC contracts
today; 30 days matches zero).)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 3: Cross-check against real data — true and false positives**

```sql
-- Expiring: true positives (expect 3 real AMC contracts within 60 days, 0 FM)
select id, title, end_date from contracts
where status = 'Active' and end_date is not null
and end_date between current_date and current_date + 60;

-- Expiring: false-positive guard - a real Active contract ending well past 60 days should NOT appear
select id, end_date from contracts where status = 'Active' and end_date > current_date + 60 limit 3;

-- Reconciliation: true positives (expect 5 real AMC contracts per the investigation)
select c.id, c.title, c.value, coalesce(sum(cp.value), 0) as scheduled_total
from contracts c
left join contract_payments cp on cp.contract_id = c.id
where c.value is not null
group by c.id, c.title, c.value
having abs(c.value - coalesce(sum(cp.value), 0)) > 1;
```

Confirm none of the reconciliation matches ALSO appear in Task 3's overdue-payment query result
(the two categories are independent, by design — verify this holds in the real data, not just
in the code's structure).

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/exceptions.ts
git commit -m "$(cat <<'EOF'
feat: exception engine - expiring contract and reconciliation detectors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Aggregation — `detectAllExceptions`, counts, contract grouping

**Files:**
- Modify: `src/features/operations-universe/exceptions.ts`

- [ ] **Step 1: Add the three aggregation functions**

Add these at the end of `exceptions.ts`:

```ts
export async function detectAllExceptions(): Promise<OperationalException[]> {
  const results = await Promise.all([
    detectOverdueWorkOrders(),
    detectOverduePpm(),
    detectStaffAttendanceIssues(),
    detectOverduePayments(),
    detectExpiringContracts(),
    detectReconciliationIssues(),
  ]);
  return results.flat();
}

export async function detectExceptionCounts(): Promise<Record<ExceptionCategory, number>> {
  const exceptions = await detectAllExceptions();
  const counts: Record<ExceptionCategory, number> = {
    operations: 0,
    people: 0,
    finance: 0,
    contracts: 0,
    "data-quality": 0,
  };
  for (const exception of exceptions) {
    counts[exception.category]++;
  }
  return counts;
}

export function groupExceptionsByContract(
  exceptions: OperationalException[],
): Map<string, OperationalException[]> {
  const grouped = new Map<string, OperationalException[]>();
  for (const exception of exceptions) {
    if (!exception.contractId || !exception.contractDomain) continue;
    const key = `${exception.contractDomain}:${exception.contractId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(exception);
  }
  return grouped;
}
```

**Note on a deliberate design-doc deviation**: the design doc described `detectExceptionCounts`
as a separate *lightweight* query path (columns-only, no reason-string construction), mirroring
Phase 4a's `fetchScheduleCounts`/`fetchScheduleItems` split. This plan simplifies that to a thin
wrapper over `detectAllExceptions()` instead. Reasoning: Phase 4a's split existed because
Schedules could plausibly grow to many rows; real exception counts today are tiny (roughly
15-17 total across all six detectors combined, confirmed during Phase 5a's investigation) —
building and maintaining a fully separate lightweight query path for a dataset this size isn't
justified by YAGNI, and the six detectors already run in parallel via `Promise.all` inside
`detectAllExceptions`, so the actual cost of "counting via the full path" is one extra set of
already-cheap queries, not a real performance problem. Revisit if real exception volume grows
substantially.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

Run: `npx eslint src/features/operations-universe/exceptions.ts src/features/operations-universe/useUniverseNodes.ts`

Expected: no new warnings.

- [ ] **Step 3: Cross-check against real data**

Using the Supabase MCP tool, independently tally the expected real counts from every prior
task's cross-checks (roughly: 2 overdue work orders + 2 overdue PPM + 2 staff attendance issues
+ 7 overdue-payment contracts + 3 expiring contracts + 5 reconciliation issues) and confirm this
matches what `detectAllExceptions()`/`detectExceptionCounts()` would produce when summed by
category. Confirm `groupExceptionsByContract` would correctly bucket the overdue-payment,
expiring, and reconciliation exceptions under their real contract ids (the only three detectors
that set `contractId`/`contractDomain`), and that overdue-work-order/overdue-PPM exceptions
group under their contract too when `contract_id` is present (nullable on work orders — some
real rows may have no `contract_id`, which correctly falls outside grouping per the `if
(!exception.contractId ...) continue;` guard). Staff exceptions correctly never appear in the
grouped map (they have no `contractId` at all, by design — they're person-scoped, not
contract-scoped).

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/exceptions.ts
git commit -m "$(cat <<'EOF'
feat: exception engine - aggregate all detectors, counts, contract grouping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification and completion cross-checks

This is the "prove it" task per the brief's explicit §27/§28 requirement — not optional. This
environment cannot log into the deployed app as a real authenticated user, so this task is
entirely SQL cross-checks and code trace-through, no browser UI to verify yet (5a has none).

**Files:** none — this task produces no code changes.

- [ ] **Step 1: Full `npx tsc --noEmit` and `npx eslint` pass**

Run both across the whole `src/features/operations-universe/` directory. Expected: zero errors,
zero new warnings — confirms the whole 5a diff compiles and lints cleanly end to end.

- [ ] **Step 2: Consolidated real-data cross-check table**

For each of the six detectors, using the Supabase MCP tool against project
`evcaehadjzoxtdlnmehk`, record: the real matching count, and confirm at least one specific real
non-matching record was checked (not just "the count seems plausible"). Reuse the SQL from
Tasks 1-4's own cross-check steps — this task's job is to confirm they're *consistent with each
other* (e.g. the reconciliation contracts really are disjoint from the overdue-payment
contracts, as Task 4 asked to verify) and to produce one clean summary table for the completion
report, not to re-invent new queries.

- [ ] **Step 3: Confirm no double-counting**

Specifically re-verify Phase 4a's PPM/work-order dedup guarantee holds through the NEW canonical
rule: the 2 real converted PPM visits must appear ONLY in `detectOverdueWorkOrders`'s result
(via their spawned work order), never in `detectOverduePpm`'s result. Trace this by id, not just
by count.

- [ ] **Step 4: Report**

Summarize: canonical rule (what changed, why, real-data impact), each detector's real count and
one confirmed false-positive guard, the dedup confirmation, and confirm `tsc`/`eslint` are
clean. This feeds directly into the completion report format the user's brief requires.
