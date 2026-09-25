# Operations Universe Phase 3a (People Branch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the STAFF hub's fictional `DEMO_STAFF` data with real `employees` +
`attendance_logs` data, by filling in the already-wired-but-placeholder `employee`
CenterEntity and pointing the STAFF hub's flat employee list straight at it.

**Architecture:** The STAFF hub keeps its existing entry point
(`{ kind: 'staff-category' }`) but its ring is now a real query against `employees` instead
of `DEMO_STAFF`. Each employee node routes to the existing `employee` CenterEntity (already
used today when reached via a work order's assigned technician), whose handler is upgraded
from a placeholder to a real query joining `employees`, today's `attendance_logs` row, and
open work orders (`work_orders`/`fm_work_orders` where `technician_id` matches). The
now-unreachable demo-only `staff-category` (non-root) and `staff-member` CenterEntity variants
are removed from the type, along with their backing functions and the routing cases that used
them, and the now-broken `DEMO_STAFF` block in `searchUniverse` is deleted. `DEMO_STAFF` itself
stays in `prototypeData.ts` (still used by the still-fictional Schedules branch's
"suitable staff" suggestion, to be replaced in Phase 3b).

**Tech Stack:** bizjoy-dashboard (TanStack Start + React Query + Supabase, project
`evcaehadjzoxtdlnmehk`), `@xyflow/react`, existing shadcn `Sheet`/`Input` components.

**Design doc:** `docs/superpowers/specs/2026-09-25-operations-universe-phase3a-people-design.md`

**Testing note:** same as Phase 1/2 — no automated test runner in this repo (`package.json`
has no `test` script and no `vitest`/`jest` devDependency), and no way to log into this CRM as
a real authenticated user in this environment. Every task is verified via `npx tsc --noEmit`,
`npx eslint .`, direct SQL cross-checks against the real data where relevant, and careful
manual code trace-through. Task 6 lists exactly what a human needs to do for the real
click-through this environment can't perform.

---

### Task 1: Narrow the `CenterEntity` type

**Files:**
- Modify: `src/features/operations-universe/types.ts:1-15` (the `CenterEntity` union)
- Modify: `src/features/operations-universe/types.ts:64-85` (`centerEntityKey`)

- [ ] **Step 1: Simplify the `staff-category` variant and remove `staff-member`**

The `staff-category` CenterEntity currently carries a `category: StaffCategory | '__root__'`
field left over from the demo Available/Booked/Absent grouping. After this phase, the STAFF
hub is a flat list with no grouping, so `staff-category` is only ever constructed one way —
drop the field entirely. The `staff-member` variant is being replaced everywhere by the
existing `employee` variant (see Task 3), so remove it.

Replace the top of `types.ts` (lines 1-15) with:

```ts
export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "unassigned" | "tomorrow" | "attention";

// '__root__' means "show the category list itself", not a specific category
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "schedule-job"; id: string }
  | { kind: "employee"; id: string; name: string; position?: string };
```

`StaffCategory` stays exported even though `CenterEntity` no longer uses it —
`prototypeData.ts`'s `DemoStaffMember.category` field still needs it (that demo data stays
until Phase 3b replaces the Schedules branch, which is what actually reads that field).

- [ ] **Step 2: Update `centerEntityKey`**

Replace the `centerEntityKey` function (lines 64-85) with:

```ts
export function centerEntityKey(center: CenterEntity): string {
  switch (center.kind) {
    case "today":
      return "today";
    case "contract-category":
      return `contract-category:${center.domain}:${center.status}`;
    case "contract":
      return `contract:${center.domain}:${center.id}`;
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

- [ ] **Step 3: Verify — expect errors elsewhere, confirm they're exactly the expected ones**

Run: `npx tsc --noEmit`

Expected: errors in `src/features/operations-universe/useUniverseNodes.ts` (references to
`buildStaffCategoryMembers`, `buildStaffMemberDetail`, `centerEntity.category` on the
now-fieldless `staff-category` kind, and `centerEntity.kind === "staff-member"` comparisons)
and in `src/features/operations-universe/OperationsUniverse.tsx` (the `"staff-member"` string
literal in `DETAIL_ENTITY_KINDS`/`DEMO_DATA_KINDS` no longer being assignable to
`CenterEntity["kind"]`, and the `category: "__root__"` field on the hub's `staff-category`
center). These are fixed in Tasks 2, 3, and 5. Confirm no *other*, unrelated errors appear.

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/types.ts
git commit -m "$(cat <<'EOF'
refactor: narrow CenterEntity now that Staff/Employee use one real path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Real STAFF hub employee list

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts:456-501` (delete
  `buildStaffCategoryRoot`/`buildStaffCategoryMembers`, add `fetchStaffHubRing`)
- Modify: `src/features/operations-universe/useUniverseNodes.ts:828-859` (the two
  `staff-category` routing cases → one real case)

- [ ] **Step 1: Replace `buildStaffCategoryRoot`/`buildStaffCategoryMembers` with a real query**

These two functions (lines 456-501) built the fictional 3-category (Available/Booked/Absent)
grouping and its member lists from `DEMO_STAFF`. Delete both, and add this in their place:

```ts
async function fetchStaffHubRing(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name, position")
    .eq("status", "Active")
    .order("full_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const name = row.full_name ?? `${row.first_name} ${row.last_name ?? ""}`.trim();
    return {
      id: `staff-member:${row.id}`,
      data: {
        kind: "staff-member" as const,
        label: name,
        sublabel: row.position ?? undefined,
        clickable: true,
        center: {
          kind: "employee",
          id: row.id,
          name,
          position: row.position ?? undefined,
        } as CenterEntity,
        groupKey: "member",
      },
    };
  });
}
```

- [ ] **Step 2: Wire it into the routing switch**

Replace the two `staff-category` cases (lines 828-859 — the `__root__` case that called
`buildStaffCategoryRoot()` and the fallthrough case that called `buildStaffCategoryMembers`)
with a single case:

```ts
      if (centerEntity.kind === "staff-category") {
        const ringOne = await fetchStaffHubRing();
        const centerData: UniverseNodeData = {
          kind: "staff-hub",
          label: "STAFF",
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "staff-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: the errors about `buildStaffCategoryMembers`/`buildStaffCategoryRoot` and
`centerEntity.category` on `staff-category` from Task 1 are gone. Remaining errors should now
only be about `buildStaffMemberDetail`, the `staff-member` CenterEntity case, and the
`DEMO_STAFF` search block (fixed in Task 3-4) plus `OperationsUniverse.tsx` (fixed in Task 5).

- [ ] **Step 4: Cross-check against real data**

Using the Supabase MCP `execute_sql` tool against project `evcaehadjzoxtdlnmehk`, run:

```sql
select id, full_name, first_name, last_name, position
from employees
where status = 'Active'
order by full_name;
```

Expected: 20 rows. Confirm the query in Step 1 matches this shape exactly (same filter, same
order).

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: STAFF hub shows real active employees instead of demo data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Real employee detail (attendance + assigned work orders)

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts:503-538` (delete
  `buildStaffMemberDetail`, add `formatAttendanceTime` + `fetchEmployeeConnections`)
- Modify: `src/features/operations-universe/useUniverseNodes.ts:860-874` (delete the
  `staff-member` routing case — no replacement, the variant no longer exists)
- Modify: `src/features/operations-universe/useUniverseNodes.ts:924-950` (the `employee`
  routing case: placeholder → real)

- [ ] **Step 1: Delete `buildStaffMemberDetail` and the `staff-member` routing case**

Delete the `buildStaffMemberDetail` function (lines 503-538) entirely — it backed the demo
`staff-member` CenterEntity, which Task 1 removed from the type.

Delete this routing case (lines 860-874) entirely — it's now a compile error since
`centerEntity.kind === "staff-member"` can never be true for the narrowed `CenterEntity` type:

```ts
      if (centerEntity.kind === "staff-member") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } = buildStaffMemberDetail(
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "staff-member",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `staff-member:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }
```

- [ ] **Step 2: Add a time-formatting helper and the real employee query**

Add this near the top of the file, alongside the other helper functions (after the imports,
before `fetchContractCategoryCounts`):

```ts
function formatAttendanceTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
```

Add this where `buildStaffMemberDetail` used to be (it takes over that spot in the file):

```ts
async function fetchEmployeeConnections(employeeId: string): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employeeRes, attendanceRes, amcWosRes, fmWosRes] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "full_name, first_name, last_name, position, phone, email, employment_type, staffing_model",
      )
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("check_in, check_out, status")
      .eq("employee_id", employeeId)
      .eq("attendance_date", todayStr)
      .order("check_in", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("work_orders")
      .select("id, wo_no, status, scheduled_date")
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)")
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, status, scheduled_date")
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)")
      .order("scheduled_date", { ascending: true }),
  ]);

  if (employeeRes.error) throw employeeRes.error;
  if (attendanceRes.error) throw attendanceRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const employee = employeeRes.data;
  if (!employee) throw new Error("Employee not found");

  const name = employee.full_name ?? `${employee.first_name} ${employee.last_name ?? ""}`.trim();

  const attendance = attendanceRes.data;
  let attendanceLabel = "No attendance recorded today";
  let attendanceSublabel: string | undefined;
  if (attendance?.status === "Present" && attendance.check_in) {
    attendanceLabel = "Checked in";
    attendanceSublabel = formatAttendanceTime(attendance.check_in);
  } else if (attendance?.status === "Checked Out" && attendance.check_out) {
    attendanceLabel = "Checked out";
    attendanceSublabel = formatAttendanceTime(attendance.check_out);
  }

  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: `staff-detail:${employeeId}:attendance`,
      data: {
        kind: "staff-detail",
        label: attendanceLabel,
        sublabel: attendanceSublabel,
        clickable: false,
        groupKey: "attendance",
        relationshipReason: `${name}'s attendance status for today.`,
      },
    },
  ];

  const workOrders = [
    ...(amcWosRes.data ?? []).map((wo) => ({ ...wo, domain: "AMC" as const })),
    ...(fmWosRes.data ?? []).map((wo) => ({ ...wo, domain: "FM" as const })),
  ];

  for (const wo of workOrders) {
    ringOne.push({
      id: `work-order:${wo.domain}:${wo.id}`,
      data: {
        kind: "work-order",
        label: wo.wo_no ?? "Work Order",
        sublabel: wo.status,
        clickable: true,
        center: { kind: "work-order", domain: wo.domain, id: wo.id },
        groupKey: "work-order",
        relationshipReason: `${name} is assigned to perform this work order.`,
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Position", value: employee.position ?? "-" },
    { label: "Employment Type", value: employee.employment_type ?? "-" },
    { label: "Staffing Model", value: employee.staffing_model ?? "-" },
    { label: "Phone", value: employee.phone ?? "-" },
    { label: "Email", value: employee.email ?? "-" },
  ];

  return {
    centerLabel: name,
    centerSublabel: employee.position ?? "",
    centerDetail,
    ringOne,
  };
}
```

- [ ] **Step 3: Wire it into the `employee` routing case**

Replace the `employee` case (lines 924-950) with:

```ts
      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `employee:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: no errors remaining in `useUniverseNodes.ts` except the `DEMO_STAFF` search block
(fixed in Task 4). `OperationsUniverse.tsx` errors from Task 1 are fixed in Task 5.

- [ ] **Step 5: Cross-check attendance derivation against real data**

Using the Supabase MCP `execute_sql` tool against project `evcaehadjzoxtdlnmehk`, run:

```sql
select employee_id, check_in, check_out, status
from attendance_logs
where attendance_date = current_date
order by employee_id;
```

For each row: confirm `status = 'Present'` rows have `check_in` set (drives "Checked in"), and
`status = 'Checked Out'` rows have `check_out` set (drives "Checked out"). Then run:

```sql
select id from employees where status = 'Active'
except
select employee_id from attendance_logs where attendance_date = current_date;
```

These employee ids should all render "No attendance recorded today" once clicked into.

- [ ] **Step 6: Cross-check assigned work orders against real data**

```sql
select id, wo_no, status, technician_id from fm_work_orders
where status = 'Open' and technician_id is not null
order by technician_id;
```

Pick one `technician_id` from the results and confirm that employee's detail view will show
exactly the `Open` work orders listed here for them (and none from `work_orders`, since AMC
has no employee with a real non-completed work order per the design doc's investigation).

- [ ] **Step 7: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
feat: employee detail shows real attendance and assigned work orders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove the now-broken demo staff search block

**Files:**
- Modify: `src/features/operations-universe/useUniverseNodes.ts` (inside `searchUniverse`,
  originally around lines 739-749)

- [ ] **Step 1: Delete the `DEMO_STAFF` loop in `searchUniverse`**

This block matched typed queries against fictional staff names and returned a `center:
{ kind: 'staff-member', id }` — a CenterEntity variant Task 1 removed from the type, so this
is now a genuine compile error, not just stale content:

```ts
  const lowerQuery = trimmed.toLowerCase();
  for (const member of DEMO_STAFF) {
    if (member.name.toLowerCase().includes(lowerQuery)) {
      results.push({
        id: `staff-member:${member.id}`,
        label: member.name,
        sublabel: `Staff - ${member.skills}`,
        center: { kind: "staff-member", id: member.id },
      });
    }
  }

```

Delete it entirely (both the `const lowerQuery = ...` line and the `for` loop). Real employee
search is out of scope for this phase — it's added in Phase 3d alongside Customer search.

- [ ] **Step 2: Confirm `DEMO_STAFF` is still imported and still used**

`DEMO_STAFF` must **not** be removed from the `import { DEMO_STAFF, DEMO_JOBS,
SUITABLE_STAFF_FOR_JOB } from "./prototypeData";` line at the top of the file — it's still
used by `buildScheduleJobDetail`'s "suitable staff for this job" suggestion (the Schedules
branch stays on demo data until Phase 3b). Confirm this import line is unchanged.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors in `useUniverseNodes.ts`. Any remaining errors should be exclusively in
`OperationsUniverse.tsx` (fixed in Task 5).

Run: `npx eslint src/features/operations-universe/useUniverseNodes.ts`

Expected: no new warnings (in particular, no "unused variable" warning for `DEMO_STAFF` — it's
still used in `buildScheduleJobDetail`).

- [ ] **Step 4: Commit**

```bash
git add src/features/operations-universe/useUniverseNodes.ts
git commit -m "$(cat <<'EOF'
fix: remove dead demo-staff search block now that staff-member routing is gone

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update `OperationsUniverse.tsx` (hub wiring, demo-data banner, detail auto-open)

**Files:**
- Modify: `src/features/operations-universe/OperationsUniverse.tsx:24-49` (`DETAIL_ENTITY_KINDS`,
  the demo-data comment, `DEMO_DATA_KINDS`)
- Modify: `src/features/operations-universe/OperationsUniverse.tsx:66-75` (STAFF hub node in
  `todayGraph()`)

- [ ] **Step 1: Fix `DETAIL_ENTITY_KINDS`**

Replace lines 24-36 with:

```ts
// Entity kinds that always have real detail once loaded - a fixed classification of
// the entity's STATIC KIND, not something that varies per-fetch. Used to decide
// whether the detail panel should auto-open on a genuine navigation (see the
// `panelOpen` effect below), so a background refetch of the SAME entity - which only
// changes `fetchedGraph`'s reference, never `centerEntity` itself - can't reopen a
// panel the user already dismissed.
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = ["contract", "work-order", "schedule-job", "employee"];
```

(`"staff-member"` is removed — it's no longer a valid `CenterEntity["kind"]` after Task 1;
employee detail, reached from both the People branch and a work order's technician, already
routes through `"employee"`, which stays.)

- [ ] **Step 2: Fix the demo-data comment and `DEMO_DATA_KINDS`**

Replace lines 38-49 with:

```ts
// Schedules is still backed by fictional prototype data (see prototypeData.ts's
// DEMO_JOBS) - real integration is Phase 3b. These are the CenterEntity kinds
// reachable anywhere inside that branch, including its hub-root screen (which uses
// the same kind with category: '__root__'). Used to show a persistent "Example Data"
// notice so a viewer never mistakes fictional schedule info for real operational data.
// Staff was real fictional data through Phase 2 but now shows real employees (Phase
// 3a) - it no longer belongs in this list.
const DEMO_DATA_KINDS: CenterEntity["kind"][] = ["schedule-category", "schedule-job"];
```

- [ ] **Step 3: Fix the STAFF hub node's `center`**

In `todayGraph()`, replace:

```ts
        center: { kind: "staff-category", category: "__root__" },
```

with:

```ts
        center: { kind: "staff-category" },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

Expected: zero errors anywhere in `src/features/operations-universe/`.

Run: `npx eslint .`

Expected: no new warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/operations-universe/OperationsUniverse.tsx
git commit -m "$(cat <<'EOF'
fix: Staff hub is no longer flagged as example data, only Schedules is

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Manual verification checklist

This environment cannot log into the deployed app as a real authenticated user, so this task
is a checklist for a human to run through after the branch is deployed (e.g. via the Lovable
preview or a local `npm run dev` session logged in as a real user).

**Files:** none — this task produces no code changes.

- [ ] **Step 1: STAFF hub shows real employees, no "Example Data" banner**

Navigate to `/universe`, click the STAFF hub node. Confirm: the ring shows employee names (not
"Alex Rivera"/"Sam Torres"-style placeholder names), no "(Example)" suffix appears in the
title bar, and no example-data banner is shown. Cross-check the count against `select count(*)
from employees where status = 'Active'` (expect 20 as of this writing).

- [ ] **Step 2: Employee detail shows real attendance**

Click an employee who has a real `attendance_logs` row for today (cross-check via `select
employee_id from attendance_logs where attendance_date = current_date`). Confirm the ring shows
"Checked in" or "Checked out" with a real-looking time, not a placeholder.

- [ ] **Step 3: Employee detail — no attendance case**

Click an employee with no attendance row today. Confirm the ring shows "No attendance recorded
today" — not "Absent", not blank, not an error.

- [ ] **Step 4: Employee detail shows real assigned work orders**

Click an employee with a real open `fm_work_orders` assignment (cross-check via `select
technician_id from fm_work_orders where status = 'Open' and technician_id is not null`).
Confirm a clickable work-order node appears in the ring with the real `wo_no`, and clicking it
navigates into that work order's real centered view (existing Phase 1 behavior, unchanged).

- [ ] **Step 5: Employee reached via a work order still works**

From a work order's centered view, click its assigned technician (if one has a real
`technician_id`). Confirm this still navigates to the same employee detail view built in Task
3 — this is the same `employee` CenterEntity, now shared by both entry points.

- [ ] **Step 6: Search no longer returns fictional staff**

Type a fictional demo staff name (e.g. from `DEMO_STAFF` in `prototypeData.ts` — check the file
for a current name) into the universal search box. Confirm it returns no result (real employee
search isn't added until Phase 3d, so this should simply find nothing, not error).

- [ ] **Step 7: Schedules branch is unaffected**

Click the SCHEDULES hub. Confirm it still shows the "(Example)" title suffix and example-data
banner, and still works exactly as it did before this phase (unchanged — Schedules is Phase
3b's job).
