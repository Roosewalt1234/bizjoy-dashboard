# Operations Universe Phase 4a (Real Schedules/PPM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SCHEDULES branch's fictional `DEMO_JOBS` data with real, merged
PPM-visit + scheduled-work-order data (TODAY/UPCOMING/OVERDUE), reusing the existing real
`work-order` entity where a visit has already become one, and retiring all demo-data machinery
now that nothing in the app needs it anymore.

**Architecture:** A new `fetchScheduleItems()` queries `ppm_visits`/`amc_ppm_visits` (excluding
visits already converted to a work order, via `work_order_id IS NULL`) and
`work_orders`/`fm_work_orders` with a real `scheduled_date`, normalizes both into one sorted
list bucketed by TODAY/UPCOMING/OVERDUE, and both the SCHEDULES hub (counts) and each category
screen (items) derive from it. A schedule item backed by a real work order routes to the
existing `work-order` CenterEntity (no duplicate node type); an unconverted PPM visit routes to
a new `ppm-visit` CenterEntity. The existing (currently inert) PPM ring nodes already shown on
a contract become clickable using this exact same routing rule.

**Tech Stack:** bizjoy-dashboard (TanStack Start + React Query + Supabase, project
`evcaehadjzoxtdlnmehk`), `@xyflow/react`.

**Design doc:**
`docs/superpowers/specs/2026-09-25-operations-universe-phase4a-schedules-design.md`

**Testing note:** same as every prior phase — no automated test runner in this repo (confirmed
again; `package.json` has no `test` script, no vitest/jest). Verified via `npx tsc --noEmit`,
`npx eslint`, direct SQL cross-checks, and manual code trace-through. The final task lists what
a human needs to do for the real click-through this environment can't perform (no login
credentials for the deployed app).

**Scope boundary:** Contract Financial Position is Phase 4b, a separate plan — not touched
here. No new filter-tab UI (the "FINANCE"/"OPERATIONS" tab concept from the Phase 4 brief) is
introduced anywhere in this plan. TODAY's hub tiles gain no new real counts in this phase.

---

### Task 1: Narrow `ScheduleCategory`, add `ppm-visit`, remove `schedule-job`

**Files:**
- Modify: `src/features/operations-universe/types.ts`

- [ ] **Step 1: Replace the top of the file**

Replace lines 1-15 (through the `CenterEntity` union) with:

```ts
export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "upcoming" | "overdue";

// '__root__' means "show the category list itself", not a specific category
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

(`ScheduleCategory`'s demo-era values `"unassigned" | "tomorrow" | "attention"` become
`"today" | "upcoming" | "overdue"` — the categories the real data can actually support. The
`schedule-job` variant is removed entirely — real schedule items route to the existing
`work-order` CenterEntity or the new `ppm-visit` one, never a separate "job" abstraction. The
new `ppm-visit` variant is inserted after `work-order`.)

- [ ] **Step 2: Remove `"schedule-job"` from `EntityKind`**

Find the `EntityKind` union and delete the `| "schedule-job";` line (it's currently the last
line of that union, right after `| "schedule-category"`). The union's closing line becomes
`| "schedule-category";` instead. `"ppm-visit"` is already a member of this union (used
today as a non-clickable ring-label kind) — leave it exactly as-is, it's about to also become a
real centerable kind, which needs no change to `EntityKind` itself since that type only
describes visual/icon kind, not routing.

- [ ] **Step 3: Update `centerEntityKey`**

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
    case "ppm-visit":
      return `ppm-visit:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
    case "schedule-category":
      return `schedule-category:${center.category}`;
    case "employee":
      return `employee:${center.id}`;
  }
}
```

(Only the new `case "ppm-visit":` block is added, and `case "schedule-job":` is removed.
Everything else unchanged.)

- [ ] **Step 4: Verify — expect errors elsewhere, confirm they're the expected ones**

Run: `npx tsc --noEmit`

Expected: errors in `src/features/operations-universe/useUniverseNodes.ts` (the demo
`buildScheduleCategoryRoot`/`buildScheduleCategoryJobs`/`buildScheduleJobDetail` functions and
their routing cases reference the now-removed `"unassigned"`/`"tomorrow"`/`"attention"`
category values and the removed `schedule-job` CenterEntity — none of that is your job, later
tasks fix it) and in `src/features/operations-universe/OperationsUniverse.tsx` (the
`"schedule-job"` string literal in `DETAIL_ENTITY_KINDS`/`DEMO_DATA_KINDS` no longer assignable
to `CenterEntity["kind"]` — also not your job, a later task). Confirm no *other*, unrelated
errors appear.

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/types.ts
git commit -m "$(cat <<'EOF'
refactor: narrow ScheduleCategory to real values, add ppm-visit CenterEntity

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Real SCHEDULES hub and category screens

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — delete
  `buildScheduleCategoryRoot`/`buildScheduleCategoryJobs`, add `fetchScheduleItems` +
  `fetchScheduleCategoryRoot` + `fetchScheduleCategoryItems`, wire two routing cases.

- [ ] **Step 1: Add the shared real-data fetcher**

Add this new function directly after `fetchEmployeeConnections` (before
`buildScheduleCategoryRoot`, which the next step deletes):

```ts
interface ScheduleItem {
  category: "today" | "upcoming" | "overdue";
  date: string;
  node: { id: string; data: UniverseNodeData };
}

async function fetchScheduleItems(): Promise<ScheduleItem[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  function categorize(dateStr: string): "today" | "upcoming" | "overdue" {
    if (dateStr === todayStr) return "today";
    return dateStr < todayStr ? "overdue" : "upcoming";
  }

  const [fmPpmRes, amcPpmRes, amcWosRes, fmWosRes] = await Promise.all([
    supabase
      .from("ppm_visits")
      .select("id, planned_date, due_date, status, work_order_id")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Closed,Verified)"),
    supabase
      .from("amc_ppm_visits")
      .select("id, planned_date, due_date, status, work_order_id")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Closed,Verified)"),
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
  ]);

  if (fmPpmRes.error) throw fmPpmRes.error;
  if (amcPpmRes.error) throw amcPpmRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const items: ScheduleItem[] = [];

  for (const visit of fmPpmRes.data ?? []) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    const category = categorize(date);
    items.push({
      category,
      date,
      node: {
        id: `ppm-visit:FM:${visit.id}`,
        data: {
          kind: "ppm-visit",
          label: `PPM · ${date}`,
          sublabel: visit.status ?? undefined,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "ppm-visit", domain: "FM", id: visit.id },
          groupKey: category,
          relationshipReason: `This PPM visit is scheduled for ${date}.`,
        },
      },
    });
  }

  for (const visit of amcPpmRes.data ?? []) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    const category = categorize(date);
    items.push({
      category,
      date,
      node: {
        id: `ppm-visit:AMC:${visit.id}`,
        data: {
          kind: "ppm-visit",
          label: `PPM · ${date}`,
          sublabel: visit.status ?? undefined,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "ppm-visit", domain: "AMC", id: visit.id },
          groupKey: category,
          relationshipReason: `This PPM visit is scheduled for ${date}.`,
        },
      },
    });
  }

  for (const wo of amcWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorize(wo.scheduled_date);
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

  for (const wo of fmWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorize(wo.scheduled_date);
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

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}
```

- [ ] **Step 2: Delete `buildScheduleCategoryRoot`/`buildScheduleCategoryJobs`, add their real
  replacements**

Delete both functions entirely (they build the fictional 4-category grouping and its
`DEMO_JOBS`-backed member lists). Add these two in their place:

```ts
async function fetchScheduleCategoryRoot(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const items = await fetchScheduleItems();
  const categories: { category: "today" | "upcoming" | "overdue"; label: string }[] = [
    { category: "today", label: "Today" },
    { category: "upcoming", label: "Upcoming" },
    { category: "overdue", label: "Overdue" },
  ];
  return categories.map(({ category, label }) => {
    const count = items.filter((item) => item.category === category).length;
    return {
      id: `schedule-category:${category}`,
      data: {
        kind: "schedule-category" as const,
        label,
        sublabel: `${count} item${count === 1 ? "" : "s"}`,
        exception: category === "overdue" && count > 0,
        clickable: true,
        center: { kind: "schedule-category", category } as CenterEntity,
        groupKey: category,
        relationshipReason: `${label} groups scheduled work by timing.`,
      },
    };
  });
}

async function fetchScheduleCategoryItems(
  category: "today" | "upcoming" | "overdue",
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const items = await fetchScheduleItems();
  const filtered = items.filter((item) => item.category === category).map((item) => item.node);
  if (filtered.length === 0) {
    filtered.push({
      id: `schedule-empty:${category}`,
      data: {
        kind: "staff-detail",
        label: `No ${category} work`,
        clickable: false,
        groupKey: category,
      },
    });
  }
  return filtered;
}
```

- [ ] **Step 3: Wire both into the routing switch**

Replace the two `schedule-category` cases in the big `if`-chain inside `useUniverseGraph`'s
`queryFn` (the `__root__` case calling `buildScheduleCategoryRoot()` and the fallthrough case
calling `buildScheduleCategoryJobs`) with:

```ts
      if (centerEntity.kind === "schedule-category" && centerEntity.category === "__root__") {
        const ringOne = await fetchScheduleCategoryRoot();
        const centerData: UniverseNodeData = {
          kind: "schedules-hub",
          label: "SCHEDULES",
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "schedules-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "schedule-category") {
        const ringOne = await fetchScheduleCategoryItems(centerEntity.category);
        const labels: Record<string, string> = { today: "Today", upcoming: "Upcoming", overdue: "Overdue" };
        const centerData: UniverseNodeData = {
          kind: "schedule-category",
          label: labels[centerEntity.category] ?? centerEntity.category,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `schedule-category:${centerEntity.category}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }
```

(`centerEntity.category` in the second case is already typed `"today" | "upcoming" |
"overdue"` by this point — TypeScript narrows away `"__root__"` because the first `if` already
handled it — so no cast is needed, unlike the demo-era code this replaces.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: the errors about `buildScheduleCategoryRoot`/`buildScheduleCategoryJobs` and the old
category values are now gone. Remaining errors should ONLY be about `buildScheduleJobDetail`,
the `schedule-job` routing case, the `DEMO_STAFF`/`DEMO_JOBS`/`SUITABLE_STAFF_FOR_JOB` import
(all fixed in Task 3), and `OperationsUniverse.tsx` (fixed in Task 5) — not your job here.

- [ ] **Step 5: Cross-check against real data**

Using the Supabase MCP tool (name contains `execute_sql`; load via ToolSearch if not visible)
against project `evcaehadjzoxtdlnmehk`, run:

```sql
select id, coalesce(due_date, planned_date) as date, status
from ppm_visits
where work_order_id is null and status not in ('Completed','Closed','Verified')
order by date;
```

and the AMC/work-order equivalents:

```sql
select id, coalesce(due_date, planned_date) as date, status
from amc_ppm_visits
where work_order_id is null and status not in ('Completed','Closed','Verified')
order by date;

select id, wo_no, scheduled_date, status from work_orders
where scheduled_date is not null and status not in ('Completed','Cancelled')
order by scheduled_date;

select id, wo_no, scheduled_date, status from fm_work_orders
where scheduled_date is not null and status not in ('Completed','Cancelled')
order by scheduled_date;
```

Confirm the total row count across all four matches what `fetchScheduleItems()` would return,
and that today's date correctly splits them into today/upcoming/overdue.

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: SCHEDULES hub shows real TODAY/UPCOMING/OVERDUE work instead of demo jobs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Real `ppm-visit` detail, remove demo schedule-job machinery

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` — delete
  `buildScheduleJobDetail`, add `fetchPpmVisitConnections`, delete the `schedule-job` routing
  case, add the `ppm-visit` routing case, remove the now-fully-unused prototypeData import.
- Delete: `src/features/operations-universe/prototypeData.ts`

- [ ] **Step 1: Delete `buildScheduleJobDetail` and the `schedule-job` routing case**

Delete the `buildScheduleJobDetail` function entirely (it backed the demo `schedule-job`
CenterEntity, removed from the type in Task 1).

Delete this routing case entirely (find it by searching for `centerEntity.kind ===
"schedule-job"`):

```ts
      if (centerEntity.kind === "schedule-job") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } = buildScheduleJobDetail(
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "schedule-job",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `schedule-job:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }
```

- [ ] **Step 2: Add `fetchPpmVisitConnections`**

Add this where `buildScheduleJobDetail` used to be:

```ts
async function fetchPpmVisitConnections(
  domain: "AMC" | "FM",
  visitId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const table = domain === "AMC" ? "amc_ppm_visits" : "ppm_visits";
  const { data: visit, error } = await supabase
    .from(table)
    .select("id, contract_id, planned_date, due_date, status, notes")
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw error;
  if (!visit) throw new Error("PPM visit not found");

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  if (visit.contract_id) {
    ringOne.push({
      id: `contract:${domain}:${visit.contract_id}`,
      data: {
        kind: "contract",
        label: "Back to Contract",
        clickable: true,
        center: { kind: "contract", domain, id: visit.contract_id },
        groupKey: "contract",
        relationshipReason: "This PPM visit is scheduled under this contract.",
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Planned Date", value: visit.planned_date ?? "-" },
    { label: "Due Date", value: visit.due_date ?? "-" },
    { label: "Status", value: visit.status ?? "-" },
    { label: "Notes", value: visit.notes ?? "-" },
  ];

  return {
    centerLabel: "PPM Visit",
    centerSublabel: visit.due_date ?? visit.planned_date ?? "",
    centerDetail,
    ringOne,
  };
}
```

- [ ] **Step 3: Wire the `ppm-visit` routing case**

Add this to the routing switch, directly after the `work-order` case and before the `customer`
case:

```ts
      if (centerEntity.kind === "ppm-visit") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchPpmVisitConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "ppm-visit",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `ppm-visit:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail,
        };
      }
```

- [ ] **Step 4: Remove the now-fully-unused prototypeData import, delete the file**

Nothing in this file references `DEMO_STAFF`, `DEMO_JOBS`, or `SUITABLE_STAFF_FOR_JOB` anymore
once the previous steps and Task 2 have landed. Delete this line entirely:

```ts
import { DEMO_STAFF, DEMO_JOBS, SUITABLE_STAFF_FOR_JOB } from "./prototypeData";
```

Delete the file `src/features/operations-universe/prototypeData.ts` entirely:

```bash
rm src/features/operations-universe/prototypeData.ts
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors in `useUniverseNodes.ts`. Remaining errors should be exclusively in
`OperationsUniverse.tsx` (fixed in Task 5).

Run: `npx eslint src/features/operations-universe/useUniverseNodes.ts`

Expected: no new warnings (in particular, no unused-import warning — the prototypeData import
line was removed, not left dangling).

- [ ] **Step 6: Cross-check against real data**

Pick one real, unconverted PPM visit id from Task 2's Step 5 cross-check output and confirm via
the Supabase MCP tool that `select id, contract_id, planned_date, due_date, status, notes from
ppm_visits where id = '<that id>'` returns a row whose `contract_id` matches a real contract —
this is what `fetchPpmVisitConnections`'s "Back to Contract" node would link to.

- [ ] **Step 7: Commit**

```bash
git add -A src/features/operations-universe/
git commit -m "$(cat <<'EOF'
feat: real PPM visit detail view, remove demo schedule-job/prototype data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Contract's PPM ring nodes become clickable

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` (inside
  `fetchContractConnections`)

- [ ] **Step 1: Add `due_date`/`work_order_id` to both PPM queries' `select`**

Find (inside `fetchContractConnections`'s `Promise.all`):

```ts
    domain === "FM"
      ? supabase
          .from("ppm_visits")
          .select("id, planned_date, status")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true })
      : supabase
          .from("amc_ppm_visits")
          .select("id, planned_date, status")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true }),
```

Replace it with (only the two `select(...)` column lists change, adding `due_date,
work_order_id`):

```ts
    domain === "FM"
      ? supabase
          .from("ppm_visits")
          .select("id, planned_date, due_date, status, work_order_id")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true })
      : supabase
          .from("amc_ppm_visits")
          .select("id, planned_date, due_date, status, work_order_id")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true }),
```

- [ ] **Step 2: Add a `todayStr` alongside the existing `now`**

Find:

```ts
  const now = new Date();
  const ringOne: { id: string; data: UniverseNodeData }[] = [];
```

Replace it with:

```ts
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const ringOne: { id: string; data: UniverseNodeData }[] = [];
```

- [ ] **Step 3: Make the PPM ring nodes clickable**

Find:

```ts
  for (const visit of ("data" in ppmVisitsRes ? ppmVisitsRes.data : []) ?? []) {
    ringOne.push({
      id: `ppm-visit:${visit.id}`,
      data: {
        kind: "ppm-visit",
        label: "PPM Visit",
        sublabel: visit.planned_date ?? undefined,
        clickable: false,
        groupKey: "ppm",
        edgeStyle: "planned",
        relationshipReason: `This PPM visit is scheduled under this contract.`,
      },
    });
  }
```

Replace it with:

```ts
  for (const visit of ("data" in ppmVisitsRes ? ppmVisitsRes.data : []) ?? []) {
    const visitDate = visit.due_date ?? visit.planned_date;
    const isOverdue = Boolean(visitDate && visitDate < todayStr && !visit.work_order_id);
    ringOne.push({
      id: `ppm-visit:${visit.id}`,
      data: {
        kind: "ppm-visit",
        label: visitDate ? `PPM · ${visitDate}` : "PPM Visit",
        sublabel: visit.status ?? undefined,
        exception: isOverdue,
        clickable: true,
        center: visit.work_order_id
          ? { kind: "work-order", domain, id: visit.work_order_id }
          : { kind: "ppm-visit", domain, id: visit.id },
        groupKey: "ppm",
        edgeStyle: "planned",
        relationshipReason: `This PPM visit is scheduled under this contract.`,
      },
    });
  }
```

(A visit already converted to a work order routes to that real work order — same "no duplicate
representations" rule as Task 2/3 — and is never flagged overdue here, since its own work-order
node already carries that signal via `completion_due_at`.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in the repo except the pre-registered `OperationsUniverse.tsx`
ones (fixed in Task 5).

- [ ] **Step 5: Cross-check against real data**

Using the Supabase MCP tool, confirm the one real FM contract with PPM visits (search
`ppm_visits` for its `contract_id` if you don't already have it from Task 2's cross-check) and
verify its visits' `work_order_id`/`due_date`/`planned_date` match what this change would
render — in particular the 2 `Converted` visits (which have a real `work_order_id`) should
route to `work-order`, and the other 10 `Planned` ones should route to `ppm-visit`.

- [ ] **Step 6: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: contract's PPM visits become real, clickable schedule nodes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Retire the demo-data banner mechanism entirely

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx`

- [ ] **Step 1: Fix `DETAIL_ENTITY_KINDS`**

Find:

```ts
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "schedule-job",
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
  "employee",
  "customer",
];
```

(`"schedule-job"` is removed — no longer a valid `CenterEntity["kind"]`. `"ppm-visit"` is added
so its detail panel auto-opens on navigation, matching every other real entity.)

- [ ] **Step 2: Delete `DEMO_DATA_KINDS` and everything that reads it**

Delete this block entirely:

```ts
// Schedules is still backed by fictional prototype data (see prototypeData.ts's
// DEMO_JOBS) - real integration is Phase 3b. These are the CenterEntity kinds
// reachable anywhere inside that branch, including its hub-root screen (which uses
// the same kind with category: '__root__'). Used to show a persistent "Example Data"
// notice so a viewer never mistakes fictional schedule info for real operational data.
// Staff was fictional demo data through Phase 2 but now shows real employees (Phase
// 3a) - it no longer belongs in this list.
const DEMO_DATA_KINDS: CenterEntity["kind"][] = ["schedule-category", "schedule-job"];
```

Find this line (inside the `OperationsUniverse` component body):

```ts
  const isDemoData = DEMO_DATA_KINDS.includes(centerEntity.kind);
```

Delete it.

Find this JSX block and delete it entirely:

```tsx
      {isDemoData && (
        <div
          style={{
            position: "absolute",
            top: isMobile ? 108 : 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 15,
            background: "#3d2e0f",
            border: "1px solid #e8b44a",
            borderRadius: 8,
            padding: "6px 14px",
            color: "#e8b44a",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {isMobile ? "Example Data" : "Example Data — not connected to live records yet"}
        </div>
      )}
```

Find:

```tsx
      <EntityDetailPanel
        title={isDemoData ? `${currentLabel} (Example)` : currentLabel}
        fields={!isToday ? fetchedGraph?.centerDetail : undefined}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
```

Replace it with:

```tsx
      <EntityDetailPanel
        title={currentLabel}
        fields={!isToday ? fetchedGraph?.centerDetail : undefined}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in `src/features/operations-universe/` — this should be the
first clean repo-wide compile since Task 1 started this sequence.

Run: `npx eslint src/features/operations-universe/OperationsUniverse.tsx`

Expected: no new warnings (in particular, no unused-variable warning for `isMobile` — it's
still used elsewhere in this file for layout, e.g. the search box and breadcrumb positioning).

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
fix: remove the example-data banner - nothing in the Universe is demo data anymore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification checklist

This environment cannot log into the deployed app as a real authenticated user (`/universe`
redirects to `/auth`, which needs real Google or email/password credentials this environment
doesn't have), so this task is a checklist for a human to run through after the branch is
deployed.

**Files:** none — this task produces no code changes.

- [ ] **Step 1: SCHEDULES hub shows real counts, no "Example Data" banner anywhere**

Navigate to `/universe`, click the SCHEDULES hub node. Confirm: three real categories (Today,
Upcoming, Overdue) with real counts, no "(Example)" title suffix, no example-data banner
anywhere in the app (check STAFF and CONTRACTS too — the mechanism is fully removed, not just
hidden for those two).

- [ ] **Step 2: Real overdue PPM visit shows attention styling**

Click SCHEDULES → Overdue. Confirm a real PPM visit or work order appears with the exception/
warning visual treatment (matches how overdue work orders already look elsewhere).

- [ ] **Step 3: Unconverted PPM visit detail**

Click a real "Upcoming" PPM visit (one without a linked work order). Confirm it becomes the
center with real planned/due date, status, and notes in the context panel, and a "Back to
Contract" node that navigates to that visit's real contract.

- [ ] **Step 4: Converted PPM visit routes to its real work order, not a duplicate node**

Click one of the 2 real PPM visits that has already become a work order (cross-check via `select
id from ppm_visits where work_order_id is not null` if needed). Confirm clicking it navigates
straight into that work order's existing real centered view (Phase 1 behavior, unchanged) —
not a separate "PPM visit" screen.

- [ ] **Step 5: Contract → Schedule → back**

Open the one real FM contract with PPM visits. Confirm its PPM ring nodes are now clickable
with real due dates as labels, and clicking one recenters correctly (to either a `ppm-visit` or
`work-order` view per Step 3/4 above).

- [ ] **Step 6: Regression — everything from Phase 1/3a/3c still works**

Re-run the STAFF checklist (real names, attendance, assigned work orders, technician
navigation) and the Customer/Search checklist (Contract → Customer → their other contracts,
search for a real employee/customer/contract/work order). Confirm nothing regressed.

- [ ] **Step 7: Mobile regression**

Repeat Steps 1, 3, and 5 at mobile width. Confirm no overlapping nodes, readable labels,
tappable targets, a usable bottom-sheet context panel, and Back / Return to Today both work.
