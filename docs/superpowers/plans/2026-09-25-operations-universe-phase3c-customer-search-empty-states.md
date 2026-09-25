# Operations Universe Phase 3c (Customer Node, Real Search, Empty States) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a contract's/work order's customer a real, clickable node showing their other
real contracts; extend real search to employees and customers with a debounce; add an explicit
"No open work orders" empty-state leaf instead of silence.

**Architecture:** A new `customer` CenterEntity variant reuses the existing `EntityKind:
"customer"` visual kind (already defined) and the existing radial-graph/`layoutAround`
machinery — no new UI components. `fetchCustomerConnections` follows the same
parallel-queries-then-build-a-ring shape already used by `fetchContractConnections`/
`fetchEmployeeConnections`. Search gains two more `ilike`-based query blocks in the same
`Promise.allSettled` array `searchUniverse` already uses, and a client-side debounce in front
of the existing (unchanged) stale-response-discarding logic.

**Tech Stack:** bizjoy-dashboard (TanStack Start + React Query + Supabase, project
`evcaehadjzoxtdlnmehk`), `@xyflow/react`.

**Design doc:**
`docs/superpowers/specs/2026-09-25-operations-universe-phase3c-customer-search-empty-states-design.md`

**Naming note:** this is "Phase 3c", not "3b" — "3b" is already reserved in a comment shipped
by Phase 3a (`OperationsUniverse.tsx`'s `DEMO_DATA_KINDS` comment) for the still-pending
Schedules/PPM work.

**Testing note:** same as every prior phase — no automated test runner in this repo (confirmed
again for this phase; `package.json` has no `test` script, no vitest/jest). Verified via `npx
tsc --noEmit`, `npx eslint`, direct SQL cross-checks, and manual code trace-through. The final
task lists what a human needs to do for the real click-through this environment can't perform
(no login credentials for the deployed app).

**Scope boundary (confirmed with the user this session):** no AMC/FM adapter-layer refactor —
the existing inline `domain === "AMC" ? ... : ...` branching in `useUniverseNodes.ts` stays as
it is, already reviewed as sound in Phase 3a. No new test infrastructure. Phase 3 remains
fully read-only — nothing in this plan writes to the database.

---

### Task 1: Add the `customer` CenterEntity

**Files:**
- Modify: `src/features/operations-universe/types.ts` (the `CenterEntity` union and
  `centerEntityKey`)

- [ ] **Step 1: Add the variant**

Replace the `CenterEntity` union with:

```ts
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "customer"; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "schedule-job"; id: string }
  | { kind: "employee"; id: string; name: string; position?: string };
```

(Only one line is new — `{ kind: "customer"; id: string }` — inserted after `"contract"`. Every
other line is unchanged from the current file; do not reformat or reorder the rest.)

`EntityKind` already has a `"customer"` member (used today for the non-clickable customer
label nodes) — no change needed there.

- [ ] **Step 2: Add the `centerEntityKey` case**

Replace the `centerEntityKey` function with:

```ts
export function centerEntityKey(center: CenterEntity): string {
  switch (center.kind) {
    case "today":
      return "today";
    case "contract-category":
      return `contract-category:${center.domain}:${center.status}`;
    case "contract":
      return `contract:${center.domain}:${center.id}`;
    case "customer":
      return `customer:${center.id}`;
    case "work-order":
      return `work-order:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
    case "schedule-category":
      return `schedule-category:${center.category}`;
    case "schedule-job":
      return `schedule-job:${center.id}`;
    case "employee":
      return `employee:${center.id}`;
  }
}
```

(Only the `case "customer": return \`customer:${center.id}\`;` block is new, inserted after
`"contract"`. Everything else unchanged.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo. Nothing constructs a `{ kind: "customer", ... }`
CenterEntity yet and nothing needs to handle it yet — adding an unused union member plus its
switch case is not a breaking change on its own.

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/types.ts
git commit -m "$(cat <<'EOF'
feat: add customer CenterEntity for a real, navigable customer node

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Customer becomes clickable, real customer detail

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — three edits: the contract's
  customer ring node (inside `fetchContractConnections`), the work order's customer ring node +
  its query `select` (inside `fetchWorkOrderConnections`), and a new `fetchCustomerConnections`
  function + its routing case.

- [ ] **Step 1: Make the contract's customer ring node clickable**

Find this block inside `fetchContractConnections` (currently reads `clickable: false`):

```ts
  if (contract.customer_id) {
    ringOne.push({
      id: `customer:${contract.customer_id}`,
      data: {
        kind: "customer",
        label: contract.customer_name ?? "Customer",
        clickable: false,
        groupKey: "customer",
        relationshipReason: `${contract.customer_name ?? "This customer"} is the party this contract is with.`,
      },
    });
  }
```

Replace it with:

```ts
  if (contract.customer_id) {
    ringOne.push({
      id: `customer:${contract.customer_id}`,
      data: {
        kind: "customer",
        label: contract.customer_name ?? "Customer",
        clickable: true,
        center: { kind: "customer", id: contract.customer_id },
        groupKey: "customer",
        relationshipReason: `${contract.customer_name ?? "This customer"} is the party this contract is with.`,
      },
    });
  }
```

(Only `clickable` and the new `center` line changed.)

- [ ] **Step 2: Add `customer_id` to the work order query, gate and make its customer node clickable**

Find the `select(...)` call inside `fetchWorkOrderConnections`'s `Promise.all`:

```ts
      .select(
        "id, wo_no, contract_id, customer_name, location, scheduled_date, status, priority, technician_id, technician_name, service_type, completion_due_at, completed_at, employees:technician_id(position)",
      )
```

Replace it with (only `customer_id` is added, right after `contract_id`):

```ts
      .select(
        "id, wo_no, contract_id, customer_id, customer_name, location, scheduled_date, status, priority, technician_id, technician_name, service_type, completion_due_at, completed_at, employees:technician_id(position)",
      )
```

Then find this block (currently always pushes an unconditional, non-clickable customer node):

```ts
  ringOne.push({
    id: `customer-label:${workOrderId}`,
    data: {
      kind: "customer",
      label: wo.customer_name ?? "Customer",
      clickable: false,
      groupKey: "customer",
    },
  });
```

Replace it with (now gated on a real `customer_id`, matching the existing nullable-gate style
used right above it for the "Back to Contract" node — a work order genuinely can have no
customer_id, and showing a clickable node with nowhere to go would be worse than showing
nothing):

```ts
  if (wo.customer_id) {
    ringOne.push({
      id: `customer:${wo.customer_id}`,
      data: {
        kind: "customer",
        label: wo.customer_name ?? "Customer",
        clickable: true,
        center: { kind: "customer", id: wo.customer_id },
        groupKey: "customer",
        relationshipReason: `${wo.customer_name ?? "This customer"} is the party this work order is for.`,
      },
    });
  }
```

- [ ] **Step 3: Add `fetchCustomerConnections` and wire it into the routing switch**

Add this new function directly after `fetchWorkOrderConnections` (before `fetchStaffHubRing`):

```ts
async function fetchCustomerConnections(customerId: string): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const [customerRes, amcContractsRes, fmContractsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("display_name, company_name, email, phone, address_city")
      .eq("id", customerId)
      .maybeSingle(),
    supabase.from("contracts").select("id, title, status").eq("customer_id", customerId).order("title"),
    supabase
      .from("fm_contracts")
      .select("id, title, status")
      .eq("customer_id", customerId)
      .order("title"),
  ]);

  if (customerRes.error) throw customerRes.error;
  if (amcContractsRes.error) throw amcContractsRes.error;
  if (fmContractsRes.error) throw fmContractsRes.error;

  const customer = customerRes.data;
  if (!customer) throw new Error("Customer not found");

  const name = customer.display_name ?? customer.company_name ?? "Customer";

  const contracts = [
    ...(amcContractsRes.data ?? []).map((c) => ({ ...c, domain: "AMC" as const })),
    ...(fmContractsRes.data ?? []).map((c) => ({ ...c, domain: "FM" as const })),
  ];

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  for (const c of contracts) {
    ringOne.push({
      id: `contract:${c.domain}:${c.id}`,
      data: {
        kind: "contract",
        label: c.title ?? "Contract",
        sublabel: c.status,
        clickable: true,
        center: { kind: "contract", domain: c.domain, id: c.id },
        groupKey: "contract",
        relationshipReason: `${c.title ?? "This contract"} belongs to ${name}.`,
      },
    });
  }

  if (contracts.length === 0) {
    ringOne.push({
      id: `customer-empty:${customerId}:contracts`,
      data: {
        kind: "staff-detail",
        label: "No contracts on file",
        clickable: false,
        groupKey: "contract",
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Company", value: customer.company_name ?? "-" },
    { label: "Email", value: customer.email ?? "-" },
    { label: "Phone", value: customer.phone ?? "-" },
    { label: "City", value: customer.address_city ?? "-" },
  ];

  return {
    centerLabel: name,
    centerSublabel: customer.company_name ?? "",
    centerDetail,
    ringOne,
  };
}
```

Then add this routing case inside `useUniverseGraph`'s `queryFn`, directly after the
`work-order` case and before the `staff-category` case:

```ts
      if (centerEntity.kind === "customer") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchCustomerConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "customer",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `customer:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 5: Cross-check against real data**

Using the Supabase MCP tool (name contains `execute_sql`; load via ToolSearch if not visible)
against project `evcaehadjzoxtdlnmehk`, pick one real AMC contract with a `customer_id` and
confirm the customer it points to:

```sql
select c.id as contract_id, c.title, c.customer_id, cu.display_name, cu.company_name
from contracts c join customers cu on cu.id = c.customer_id
limit 1;
```

Then confirm that same customer's other contracts (should include at least the one above):

```sql
select id, title, status from contracts where customer_id = '<customer_id from above>'
union all
select id, title, status from fm_contracts where customer_id = '<customer_id from above>';
```

Your `fetchCustomerConnections` query should return exactly this same set for that customer.

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: customer becomes a real, clickable node showing their other contracts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: "No open work orders" empty state

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` (inside
  `fetchContractConnections`)

- [ ] **Step 1: Add the empty-state leaf**

Find the end of the work-order loop inside `fetchContractConnections`:

```ts
  for (const wo of workOrdersRes.data ?? []) {
    const isCancelled = wo.status === "Cancelled";
    const isCompleted = wo.status === "Completed";
    const isPending = !isCancelled && !isCompleted;
    const isOverdue = isPending && wo.completion_due_at && new Date(wo.completion_due_at) < now;
    ringOne.push({
      id: `work-order:${domain}:${wo.id}`,
      data: {
        kind: "work-order",
        label: wo.wo_no ?? "Work Order",
        sublabel: wo.status,
        exception: Boolean(isOverdue),
        clickable: true,
        center: { kind: "work-order", domain, id: wo.id },
        groupKey: isCancelled
          ? "work-order-cancelled"
          : isPending
            ? "work-order-pending"
            : "work-order-completed",
        relationshipReason: `${wo.wo_no ?? "This work order"} is scoped under this contract.`,
      },
    });
  }
```

Directly after this loop's closing `}` (before the `for (const visit of ...)` PPM loop that
follows it), add:

```ts

  const hasPendingWorkOrder = ringOne.some((node) => node.data.groupKey === "work-order-pending");
  if (!hasPendingWorkOrder) {
    ringOne.push({
      id: `contract-empty:${contractId}:pending-work-orders`,
      data: {
        kind: "staff-detail",
        label: "No open work orders",
        clickable: false,
        groupKey: "work-order-pending",
      },
    });
  }
```

This covers both a contract with zero work orders at all, and a contract whose work orders are
all completed/cancelled — either way, `hasPendingWorkOrder` is `false` and the leaf appears.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

- [ ] **Step 3: Cross-check against real data**

```sql
select c.id, c.title,
  count(*) filter (where wo.status not in ('Completed','Cancelled')) as pending_count
from contracts c
left join work_orders wo on wo.contract_id = c.id
group by c.id, c.title
having count(*) filter (where wo.status not in ('Completed','Cancelled')) = 0
limit 5;
```

Pick one contract id from the results and confirm that contract's ring includes the "No open
work orders" leaf once your change is in place (trace through the code, since this environment
can't click through the real UI — see the final manual-verification task for the human
click-through).

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: show an explicit empty state when a contract has no open work orders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Real search — employees and customers

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` (the `searchUniverse`
  function)

- [ ] **Step 1: Replace the whole `searchUniverse` function**

Replace it with:

```ts
export async function searchUniverse(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results: SearchResult[] = [];

  const settled = await Promise.allSettled([
    supabase
      .from("contracts")
      .select("id, title, customer_name, status")
      .ilike("title", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("fm_contracts")
      .select("id, title, customer_name, status")
      .ilike("title", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("work_orders")
      .select("id, wo_no, customer_name, status")
      .ilike("wo_no", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, customer_name, status")
      .ilike("wo_no", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, position")
      .eq("status", "Active")
      .ilike("full_name", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("customers")
      .select("id, display_name, company_name")
      .ilike("display_name", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("customers")
      .select("id, display_name, company_name")
      .ilike("company_name", `%${trimmed}%`)
      .limit(5),
  ]);

  // A rejected settled result (a genuine network/promise rejection) has no `.data`/`.error`
  // shape of its own, so normalize it to the same "no results, but here's why" shape a
  // resolved-with-error PostgREST response already has. This keeps the `.data ?? []` loops
  // below unchanged for both failure modes, and lets one query's failure degrade gracefully
  // instead of taking the others down with it.
  function unwrap<T extends { data: unknown; error: unknown }>(
    settledResult: PromiseSettledResult<T>,
  ): T | { data: null; error: unknown } {
    return settledResult.status === "fulfilled"
      ? settledResult.value
      : { data: null, error: settledResult.reason };
  }

  const amcContracts = unwrap(settled[0]);
  const fmContracts = unwrap(settled[1]);
  const amcWorkOrders = unwrap(settled[2]);
  const fmWorkOrders = unwrap(settled[3]);
  const employees = unwrap(settled[4]);
  const customersByDisplayName = unwrap(settled[5]);
  const customersByCompanyName = unwrap(settled[6]);

  if (amcContracts.error)
    console.warn("searchUniverse: AMC contract search failed", amcContracts.error);
  if (fmContracts.error)
    console.warn("searchUniverse: FM contract search failed", fmContracts.error);
  if (amcWorkOrders.error)
    console.warn("searchUniverse: AMC work order search failed", amcWorkOrders.error);
  if (fmWorkOrders.error)
    console.warn("searchUniverse: FM work order search failed", fmWorkOrders.error);
  if (employees.error)
    console.warn("searchUniverse: employee search failed", employees.error);
  if (customersByDisplayName.error)
    console.warn("searchUniverse: customer search (display name) failed", customersByDisplayName.error);
  if (customersByCompanyName.error)
    console.warn("searchUniverse: customer search (company name) failed", customersByCompanyName.error);

  for (const row of amcContracts.data ?? []) {
    results.push({
      id: `contract:AMC:${row.id}`,
      label: row.title ?? "Untitled contract",
      sublabel: `AMC Contract - ${row.customer_name ?? ""}`,
      center: { kind: "contract", domain: "AMC", id: row.id },
    });
  }
  for (const row of fmContracts.data ?? []) {
    results.push({
      id: `contract:FM:${row.id}`,
      label: row.title ?? "Untitled contract",
      sublabel: `FM Contract - ${row.customer_name ?? ""}`,
      center: { kind: "contract", domain: "FM", id: row.id },
    });
  }
  for (const row of amcWorkOrders.data ?? []) {
    results.push({
      id: `work-order:AMC:${row.id}`,
      label: row.wo_no ?? "Work order",
      sublabel: `AMC Work Order - ${row.customer_name ?? ""}`,
      center: { kind: "work-order", domain: "AMC", id: row.id },
    });
  }
  for (const row of fmWorkOrders.data ?? []) {
    results.push({
      id: `work-order:FM:${row.id}`,
      label: row.wo_no ?? "Work order",
      sublabel: `FM Work Order - ${row.customer_name ?? ""}`,
      center: { kind: "work-order", domain: "FM", id: row.id },
    });
  }
  for (const row of employees.data ?? []) {
    const name = row.full_name ?? `${row.first_name} ${row.last_name ?? ""}`.trim();
    results.push({
      id: `employee:${row.id}`,
      label: name,
      sublabel: row.position ? `Staff - ${row.position}` : "Staff",
      center: { kind: "employee", id: row.id, name, position: row.position ?? undefined },
    });
  }

  const seenCustomerIds = new Set<string>();
  for (const row of [
    ...(customersByDisplayName.data ?? []),
    ...(customersByCompanyName.data ?? []),
  ]) {
    if (seenCustomerIds.has(row.id)) continue;
    seenCustomerIds.add(row.id);
    results.push({
      id: `customer:${row.id}`,
      label: row.display_name ?? row.company_name ?? "Customer",
      sublabel: row.company_name ?? "Customer",
      center: { kind: "customer", id: row.id },
    });
  }

  return results;
}
```

(The first four query blocks, the `unwrap` helper, and the first four result-push loops are
byte-for-byte unchanged from the current file — only the three new query blocks at the end of
the `Promise.allSettled` array, their three new `unwrap`/error-check lines, and the two new
result-push blocks at the end are new.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

Run: `npx eslint src/features/operations-universe/useUniverseNodes.ts`

Expected: no new warnings.

- [ ] **Step 3: Cross-check against real data**

Pick a real employee's first name substring and a real customer's company name substring, and
confirm via the Supabase MCP tool that the equivalent `ilike` queries return that record:

```sql
select id, full_name, position from employees where status = 'Active' and full_name ilike '%<substring>%';
select id, display_name, company_name from customers where company_name ilike '%<substring>%';
```

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: extend universal search to real employees and customers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Debounce the search box

**Files:**
- Modify: `src/features/operations-universe/UniverseSearch.tsx`

- [ ] **Step 1: Add a debounce ref and gate the search call behind it**

Find:

```ts
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef(0);

  async function handleChange(value: string) {
    setQuery(value);
    const thisRequestId = ++requestIdRef.current;
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const found = await searchUniverse(value);
    if (thisRequestId !== requestIdRef.current) return; // a newer request has since started; discard this stale response
    setResults(found);
    setOpen(true);
  }
```

Replace it with:

```ts
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setQuery(value);
    const thisRequestId = ++requestIdRef.current;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const found = await searchUniverse(value);
      if (thisRequestId !== requestIdRef.current) return; // a newer request has since started; discard this stale response
      setResults(found);
      setOpen(true);
    }, 300);
  }
```

`handleChange` drops the `async` keyword (it no longer directly awaits anything — the
debounced `setTimeout` callback does) but its call site (`onChange={(e) =>
handleChange(e.target.value)}`) doesn't await it either way, so this is not a breaking change.
`useRef` is already imported at the top of this file — no new import needed.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo.

Run: `npx eslint src/features/operations-universe/UniverseSearch.tsx`

Expected: no new warnings.

- [ ] **Step 3: Commit**

```bash
git add src/features/operations-universe/UniverseSearch.tsx
git commit -m "$(cat <<'EOF'
fix: debounce universal search input by 300ms

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Customer detail panel auto-opens on navigation

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx` (`DETAIL_ENTITY_KINDS`)

- [ ] **Step 1: Add `"customer"` to the array**

Find:

```ts
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "schedule-job",
  "employee",
];
```

Replace it with:

```ts
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "schedule-job",
  "employee",
  "customer",
];
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo — this should hold at every task in this plan, not
just this one, since every change so far only adds new, fully-wired capability rather than
narrowing an existing type out from under other code.

- [ ] **Step 3: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
fix: customer detail panel auto-opens on navigation like other real entities

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Manual verification checklist

This environment cannot log into the deployed app as a real authenticated user (confirmed
again this session — `/universe` redirects to `/auth`, which needs real Google or
email/password credentials this environment doesn't have), so this task is a checklist for a
human to run through after the branch is deployed.

**Files:** none — this task produces no code changes.

- [ ] **Step 1: Contract → Customer → back**

Open a real contract with a customer (`CONTRACTS → AMC → any contract`). Confirm the customer
node is now clickable (not dimmed/inert) and clicking it makes the customer the graph center,
with real fields (company, email, phone, city) in the context panel.

- [ ] **Step 2: Customer shows their other real contracts**

From that customer's centered view, confirm the ring shows real contract nodes (not a
demo/placeholder), and clicking one navigates into that contract's real centered view.

- [ ] **Step 3: Customer with no contracts shows the empty state**

Search for (or otherwise reach) a customer with no linked contracts. Confirm the ring shows
"No contracts on file" rather than an empty/silent ring.

- [ ] **Step 4: Work order → Customer**

Open a real work order. Confirm its customer node (if `customer_id` is set) is clickable and
routes to the same real customer view as Step 1.

- [ ] **Step 5: Contract with no open work orders shows the empty state**

Open a real contract whose work orders are all completed/cancelled, or that has none at all
(cross-check via SQL from Task 3's Step 3 if needed). Confirm the ring shows "No open work
orders" rather than nothing.

- [ ] **Step 6: Search finds real employees and customers**

Type a real employee's name into the search box. Confirm a debounced (not instant-per-keystroke)
result appears and selecting it centers the graph on that real employee — same entity/behavior
as reaching them via the STAFF hub or a work order's technician. Repeat for a real customer's
company name, confirming it centers on the real customer view built in this phase.

- [ ] **Step 7: Regression — STAFF and existing Contract/Work Order paths unaffected**

Re-run Phase 3a's STAFF checklist (real employee names, attendance states, assigned work
orders, technician navigation) and confirm nothing regressed. Confirm Contract → Work Order →
Technician → Work Order → Contract (the full loop, spanning Phase 1 and Phase 3a/3c code)
still works end-to-end without leaving the Universe.

- [ ] **Step 8: Mobile regression**

Repeat Contract → Customer → Contract and Contract → Work Order → Technician at mobile width.
Confirm no overlapping nodes, readable labels, tappable targets, a usable bottom-sheet context
panel, and that Back / Return to Today both still work.
