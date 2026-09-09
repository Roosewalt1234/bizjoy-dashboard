# Staffing Model Tag & FM Assignment Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR tag each employee as `FM`, `AMC`, or `Both`, surface that tag plus their current FM contract assignment(s) in the HR employee list, and stop the FM Manpower assignment picker from offering AMC-pool employees.

**Architecture:** One nullable `staffing_model` column added to the existing `employees` table (a shared HR table — this never touches the AMC `contracts` table or any AMC-only code path). The HR page (`src/routes/_authenticated/hr.tsx`) and employee form (`src/components/employee-form.tsx`) get the new field; the FM Manpower page (`src/routes/_authenticated/fm-manpower.tsx`) gets a read filter on its existing employee picker. The "Assigned To" data reads from `contract_manpower_assignments`, a table that already exists and is already FK'd to `fm_contracts` — nothing new is created there.

**Tech Stack:** TanStack Start + React + Supabase (via `@tanstack/react-query`), shadcn/ui components, Supabase project `evcaehadjzoxtdlnmehk` (MCP tools `apply_migration` / `generate_typescript_types`).

**Testing approach:** No test runner exists in this repo (confirmed: no `test` script in `package.json`, no test files under `src/`). Each task ends with `npx tsc --noEmit` (baseline is currently clean — 0 errors, exit code 0) plus a manual-verification section describing exactly what to check via `npm run dev`.

---

## File Structure

**Modified files:**
- `src/components/employee-form.tsx` — add a "Staffing Model" select field.
- `src/routes/_authenticated/hr.tsx` — add a Staffing Model badge column + filter, and an "Assigned To" column reading from `contract_manpower_assignments`.
- `src/routes/_authenticated/fm-manpower.tsx` — filter the Employee Assignments picker to exclude `AMC`-tagged employees.
- `src/integrations/supabase/types.ts` — regenerated (not hand-edited) after the migration, so `staffing_model` is typed on the `employees` row.

**Database:**
- One migration applied via the Supabase MCP `apply_migration` tool (this project's established convention — see `list_migrations`, e.g. `phase_26_employees_can_switch_projects`; there's no local `supabase/migrations/*.sql` file to hand-write for this).

---

### Task 1: Add the `staffing_model` column and regenerate types

**Files:**
- Database: new migration `phase_28_employees_staffing_model`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Confirm the column doesn't already exist**

Run this query with the Supabase MCP `execute_sql` tool (`project_id: "evcaehadjzoxtdlnmehk"`):

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'employees' and column_name = 'staffing_model';
```

Expected: zero rows.

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: "evcaehadjzoxtdlnmehk"`, `name: "phase_28_employees_staffing_model"`, and this `query`:

```sql
alter table public.employees
  add column staffing_model text
  check (staffing_model in ('FM', 'AMC', 'Both'));
```

- [ ] **Step 3: Verify the column was added**

Run with `execute_sql`:

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'employees' and column_name = 'staffing_model';
```

Expected: one row, `data_type = text`, `is_nullable = YES`.

- [ ] **Step 4: Regenerate TypeScript types**

Use the Supabase MCP `generate_typescript_types` tool with `project_id: "evcaehadjzoxtdlnmehk"`. Take the returned file content and write it to `src/integrations/supabase/types.ts` (overwrite the full file — this is a generated file, not hand-edited).

- [ ] **Step 5: Confirm the new field is typed**

```bash
grep -n "staffing_model" "src/integrations/supabase/types.ts"
```

Expected: at least one match under the `employees` table's `Row`/`Insert`/`Update` shapes (same pattern as the existing `can_switch_projects` field — 3 occurrences).

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (exit code 0) — same clean baseline as before this change.

- [ ] **Step 7: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types for employees.staffing_model"
```

(There's no local migration file to add — the migration lives in the Supabase project's migration history, applied in Step 2.)

---

### Task 2: Add the Staffing Model field to the Employee form

**Files:**
- Modify: `src/components/employee-form.tsx`

- [ ] **Step 1: Add `staffing_model` to the form's default state**

In `src/components/employee-form.tsx`, find the `empty` object (starts at line 41):

```tsx
const empty: any = {
  profile_photo: "", full_name: "", employee_id: "", email: "", phone: "",
  nationality: "", date_of_birth: "", current_visa_status: "", current_visa_expiry_date: "",
  notes: "", visa_issued_by: "", referred_by: "", employment_type: "", hire_date: "",
  salary: "", food_allowance: "", ot_amount: "", accommodation: "", transport: "",
  commission_rate: "", position: "", assigned_branch: "", status: "Active",
  can_switch_projects: false,
```

Replace the `can_switch_projects: false,` line with:

```tsx
  can_switch_projects: false,
  staffing_model: "",
```

- [ ] **Step 2: Add the field to the save payload**

Find this line in the `save()` function (around line 141):

```tsx
        can_switch_projects: Boolean(form.can_switch_projects),
```

Add directly after it:

```tsx
        can_switch_projects: Boolean(form.can_switch_projects),
        staffing_model: form.staffing_model || null,
```

- [ ] **Step 3: Add the Select field to the Employee Details tab**

Find the "Mobile app device setup" `Field` block (around line 282-293):

```tsx
            <Field label="Mobile app device setup">
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox
                  checked={!!form.can_switch_projects}
                  onCheckedChange={(v) => set("can_switch_projects", Boolean(v))}
                />
                <span className="text-sm text-muted-foreground">Can switch projects (manager/admin)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Also requires Contracts and HR view permissions (set on the Permissions page) to actually see projects and staff in the mobile app's setup screen.
              </p>
            </Field>
```

Add a new `Field` directly before it:

```tsx
            <Field label="Staffing Model">
              <Select value={form.staffing_model || undefined} onValueChange={(v) => set("staffing_model", v)}>
                <SelectTrigger><SelectValue placeholder="Unclassified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FM">FM (dedicated to one project at a time)</SelectItem>
                  <SelectItem value="AMC">AMC (shared pool, any AMC job)</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                FM staff can be assigned to specific FM contracts on the FM Manpower page. AMC staff work across all AMC contracts and are never pre-assigned.
              </p>
            </Field>
            <Field label="Mobile app device setup">
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox
                  checked={!!form.can_switch_projects}
                  onCheckedChange={(v) => set("can_switch_projects", Boolean(v))}
                />
                <span className="text-sm text-muted-foreground">Can switch projects (manager/admin)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Also requires Contracts and HR view permissions (set on the Permissions page) to actually see projects and staff in the mobile app's setup screen.
              </p>
            </Field>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open the HR page, click "Add" (or edit an existing employee). Confirm a "Staffing Model" dropdown appears in the Employee Details tab with "Unclassified" as the placeholder when nothing is selected, and FM / AMC / Both as options. Pick "FM", save, reopen the same employee, and confirm "FM" is still selected (i.e. it persisted).

- [ ] **Step 6: Commit**

```bash
git add src/components/employee-form.tsx
git commit -m "feat: add Staffing Model field to the employee form"
```

---

### Task 3: Add a Staffing Model column and filter to the HR list

**Files:**
- Modify: `src/routes/_authenticated/hr.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/routes/_authenticated/hr.tsx`, find:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
```

Replace with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
```

Find:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
```

Add directly after it:

```tsx
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
```

- [ ] **Step 2: Add the Staffing Model filter state and filtered rows**

Find (around line 27-28):

```tsx
  const [editing, setEditing] = useState<any | null>(null);
  const [page, setPage] = useState(1);
```

Replace with:

```tsx
  const [editing, setEditing] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [staffingFilter, setStaffingFilter] = useState("all");
```

Find (around line 39-42):

```tsx
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows as any[], page);
```

Replace with:

```tsx
  const filteredRows = useMemo(() => {
    if (staffingFilter === "all") return rows as any[];
    if (staffingFilter === "unclassified") return (rows as any[]).filter((r) => !r.staffing_model);
    return (rows as any[]).filter((r) => r.staffing_model === staffingFilter);
  }, [rows, staffingFilter]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filteredRows, page);
```

- [ ] **Step 3: Point the ExportMenu at the filtered rows and add a Staffing Model export column**

Find:

```tsx
          <ExportMenu
            filename="employees"
            sheetName="Employees"
            rows={rows as any[]}
            columns={[
              { key: "employee_id", label: "Employee ID" },
              { key: "full_name", label: "Full Name", format: (v, r) => v ?? [r.first_name, r.last_name].filter(Boolean).join(" ") },
              { key: "position", label: "Position" },
              { key: "department", label: "Department" },
```

Replace with:

```tsx
          <ExportMenu
            filename="employees"
            sheetName="Employees"
            rows={filteredRows}
            columns={[
              { key: "employee_id", label: "Employee ID" },
              { key: "full_name", label: "Full Name", format: (v, r) => v ?? [r.first_name, r.last_name].filter(Boolean).join(" ") },
              { key: "staffing_model", label: "Staffing Model", format: (v) => v ?? "Unclassified" },
              { key: "position", label: "Position" },
              { key: "department", label: "Department" },
```

- [ ] **Step 4: Add the filter control above the table**

Find:

```tsx
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
```

Replace with:

```tsx
      <div className="flex items-center gap-2">
        <Label className="text-xs">Staffing Model</Label>
        <Select value={staffingFilter} onValueChange={(v) => { setStaffingFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="FM">FM</SelectItem>
            <SelectItem value="AMC">AMC</SelectItem>
            <SelectItem value="Both">Both</SelectItem>
            <SelectItem value="unclassified">Unclassified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Staffing Model</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
```

- [ ] **Step 5: Update the loading/empty rows' `colSpan` and add the badge cell**

Find:

```tsx
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.employee_id ?? "—"}</TableCell>
                <TableCell>{r.full_name ?? ([r.first_name, r.last_name].filter(Boolean).join(" ") || "—")}</TableCell>
                <TableCell>{r.position ?? "—"}</TableCell>
```

Replace with:

```tsx
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No employees found.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.employee_id ?? "—"}</TableCell>
                <TableCell>{r.full_name ?? ([r.first_name, r.last_name].filter(Boolean).join(" ") || "—")}</TableCell>
                <TableCell>
                  {r.staffing_model ? (
                    <Badge variant="outline">{r.staffing_model}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Unclassified</Badge>
                  )}
                </TableCell>
                <TableCell>{r.position ?? "—"}</TableCell>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `npm run dev`, open the HR page. Confirm: a "Staffing Model" filter dropdown appears above the table; the table has a new "Staffing Model" column showing a badge (or "Unclassified" in muted styling for employees with no tag); switching the filter to "FM"/"AMC"/"Both"/"Unclassified" narrows the list correctly; pagination still works against the filtered set; the exported spreadsheet includes the Staffing Model column.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/_authenticated/hr.tsx"
git commit -m "feat: add Staffing Model column and filter to the HR employee list"
```

---

### Task 4: Add the "Assigned To" column to the HR list

**Files:**
- Modify: `src/routes/_authenticated/hr.tsx`

- [ ] **Step 1: Add the FM assignments query**

Find (this is the `employees` query, now right after the `useQuery` import area — locate it by its `queryKey: ["employees"]`):

```tsx
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
```

Add directly after it:

```tsx
  const { data: activeAssignments = [] } = useQuery({
    queryKey: ["employees-active-fm-assignments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_manpower_assignments")
        .select("employee_id, fm_contracts:contract_id(contract_no, customer_name)")
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignmentsByEmployee = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of activeAssignments as any[]) {
      if (!row.employee_id) continue;
      const label = row.fm_contracts?.contract_no ?? row.fm_contracts?.customer_name ?? "Unnamed contract";
      const existing = map.get(row.employee_id) ?? [];
      existing.push(label);
      map.set(row.employee_id, existing);
    }
    return map;
  }, [activeAssignments]);
```

- [ ] **Step 2: Add the column header**

Find (from Task 3's edit):

```tsx
              <TableHead>Staffing Model</TableHead>
              <TableHead>Position</TableHead>
```

Replace with:

```tsx
              <TableHead>Staffing Model</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Position</TableHead>
```

- [ ] **Step 3: Bump the `colSpan` values from Task 3's 8 to 9**

Find:

```tsx
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No employees found.</TableCell></TableRow>
```

Replace with:

```tsx
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No employees found.</TableCell></TableRow>
```

- [ ] **Step 4: Add the cell**

Find (from Task 3's edit):

```tsx
                <TableCell>{r.position ?? "—"}</TableCell>
                <TableCell>{r.nationality ?? "—"}</TableCell>
```

Replace with:

```tsx
                <TableCell>
                  {(assignmentsByEmployee.get(r.id) ?? []).length > 0
                    ? (assignmentsByEmployee.get(r.id) ?? []).join(", ")
                    : "—"}
                </TableCell>
                <TableCell>{r.position ?? "—"}</TableCell>
                <TableCell>{r.nationality ?? "—"}</TableCell>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Since `contract_manpower_assignments` currently has 0 rows, every employee should show "—" in the new "Assigned To" column. To verify the wiring works end-to-end: go to `/fm-manpower`, add an Employee Assignment (any employee, the existing "Parkside" FM contract, `active` left as "Active"), save it, then return to the HR page and confirm that employee's "Assigned To" cell now shows the contract's name instead of "—". Delete the test assignment afterward on `/fm-manpower` if it was only for this test.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/_authenticated/hr.tsx"
git commit -m "feat: show each employee's active FM contract assignment(s) in HR"
```

---

### Task 5: Filter AMC-tagged employees out of the FM Manpower assignment picker

**Files:**
- Modify: `src/routes/_authenticated/fm-manpower.tsx:145-160,992-998`

- [ ] **Step 1: Include `staffing_model` in the employees query**

Find (around line 145-160):

```tsx
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-lookup-manpower"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name, designation, status")
        .order("first_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((employee: any) => ({
        ...employee,
        name:
          employee.full_name ?? [employee.first_name, employee.last_name].filter(Boolean).join(" "),
      }));
    },
  });
```

Replace with:

```tsx
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-lookup-manpower"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name, designation, status, staffing_model")
        .order("first_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((employee: any) => ({
        ...employee,
        name:
          employee.full_name ?? [employee.first_name, employee.last_name].filter(Boolean).join(" "),
      }));
    },
  });
```

- [ ] **Step 2: Filter the picker in `AssignmentDialog`**

Find (around line 992-998):

```tsx
          <SelectField label="Employee" value={form.employee_id} onValueChange={pickEmployee}>
            {employees.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectField>
```

Replace with:

```tsx
          <SelectField label="Employee" value={form.employee_id} onValueChange={pickEmployee}>
            {employees
              .filter((e: any) => e.staffing_model !== "AMC")
              .map((e: any) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
          </SelectField>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

In the HR page, tag one employee as `AMC` and another as `FM` (or leave a third unclassified). Run `npm run dev`, open `/fm-manpower` → "Employee Assignments" tab → "Assign Employee". Confirm the AMC-tagged employee does **not** appear in the Employee dropdown, while the FM-tagged and unclassified employees do.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/_authenticated/fm-manpower.tsx"
git commit -m "fix: exclude AMC-pool employees from the FM Manpower assignment picker"
```

---

## Self-Review Notes

- **Spec coverage:** Data Model (Task 1), employee form field (Task 2), HR list Staffing Model column/filter (Task 3), HR list Assigned To column (Task 4), and FM Manpower picker filter (Task 5) map 1:1 to every section of the spec's "Data Model" and "UI Changes." "Error Handling" and "Testing Approach" needed no dedicated task — they're covered by reusing each file's existing `try/toast.error` pattern and the `npx tsc --noEmit` + manual-verification steps used throughout.
- **AMC isolation confirmed:** every task modifies only `employees` (shared HR table), `contract_manpower_assignments`/`fm_contracts` (already FM-scoped, confirmed via FK inspection: `contract_manpower_assignments.contract_id → fm_contracts.id`, not `contracts.id`), or FM-only route files. Nothing in this plan touches `public.contracts` (the AMC table) or any file under an AMC-specific route.
- **Type/field consistency:** `staffing_model` is used identically everywhere it appears — `employee-form.tsx` (Task 2), `hr.tsx` (Tasks 3-4), and `fm-manpower.tsx` (Task 5) all read/write the same three string values (`"FM"`, `"AMC"`, `"Both"`) or `null`/empty-string for unclassified, matching the DB check constraint from Task 1.
- **Task ordering:** Task 1 must run first (the column has to exist before any UI reads/writes it). Tasks 2-5 are otherwise independent of each other and could be reordered, but are sequenced in the order a reviewer would most naturally verify them (create the tag → show it in HR → cross-reference assignments → protect the assignment picker).
