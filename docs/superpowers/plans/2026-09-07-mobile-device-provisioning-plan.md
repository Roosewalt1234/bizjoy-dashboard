# Mobile app redesign — Phase 2: device-bound login and provisioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile cleaner app's per-launch typed login with a device-bound identity for regular staff, a daily project picker for flagged managers/admins, and an admin-gated provisioning screen that (re)binds a device to an employee and a project.

**Architecture:** A new `ActiveProjectProvider` React context (mobile app) tracks which project the current session is "working from." Regular employees get that value from AsyncStorage (persisted once, at provisioning time); managers/admins get it from an in-memory pick made every launch. A new `/provisioning` route — reachable from a small gear icon on the login screen (factory-fresh device) or a long-press on the home screen's employee name (already-provisioned device) — re-authenticates as an admin, lets them pick a project and an employee (photo grid sourced from the existing `contract_manpower_assignments` table), then signs in as that employee and persists the device's default project. One new `employees.can_switch_projects` boolean column (web + mobile) drives the manager/admin gate, set via a new checkbox on the existing web Employee form.

**Tech Stack:** TanStack Start + Supabase (web, `src/`), Expo SDK 57 / React Native 0.86 / expo-router (mobile, `mobile-cleaners-app/src/`), Supabase Postgres + RLS.

**Testing approach:** `mobile-cleaners-app` has no test runner configured (no Jest, no React Native Testing Library — confirmed via its `package.json`). This app has been verified throughout its build via manual runs in Expo (dev client / EAS preview builds), not automated tests. Adding a test framework from scratch is out of scope for a UI-only phase (YAGNI) and wasn't asked for. Each mobile task below ends with a **manual verification** step (exact actions + expected result) using `npx expo start` instead of an automated test. Web-side changes (Task 1, Task 2) follow the repo's existing pattern of no test suite either — verification is via the running dev server / Supabase.

---

## File Structure

**New files (mobile):**
- `mobile-cleaners-app/src/lib/device-identity.ts` — AsyncStorage read/write for the device's persisted default project.
- `mobile-cleaners-app/src/lib/manpower.ts` — Supabase queries: list all FM projects, list a project's assigned staff (photos).
- `mobile-cleaners-app/src/contexts/active-project.tsx` — `ActiveProjectProvider` / `useActiveProject()`: the in-memory "which project is this session working from" context, consumed by future phases (Attendance, Work Order creation) as well as the provisioning/gate logic itself.
- `mobile-cleaners-app/src/components/manager-project-picker.tsx` — plain-text project list UI (used both as the manager/admin daily gate and inside provisioning).
- `mobile-cleaners-app/src/components/staff-photo-grid.tsx` — photo grid of a project's staff, initials placeholder when no photo.
- `mobile-cleaners-app/src/app/provisioning.tsx` — the admin-gated provisioning screen (all 7 spec steps as an internal step state machine).

**Modified files (mobile):**
- `mobile-cleaners-app/src/types/database.ts` — add `can_switch_projects` to `EmployeeRow`; add `ProjectOption`, `StaffOption` types.
- `mobile-cleaners-app/src/hooks/use-auth.ts` — select `can_switch_projects`.
- `mobile-cleaners-app/src/app/login.tsx` — small gear icon → `/provisioning`.
- `mobile-cleaners-app/src/app/(app)/index.tsx` — long-press on the employee name → `/provisioning` (tucked-away entry point for an already-provisioned device).
- `mobile-cleaners-app/src/app/_layout.tsx` — wrap in `ActiveProjectProvider`; allow `/provisioning` pre-auth; gate on manager project-pick / regular-employee default-project redirect.

**Modified files (web):**
- `src/components/employee-form.tsx` — new "Can switch projects" checkbox.
- `src/integrations/supabase/types.ts` — regenerated after the migration.

**Database:**
- One migration adding `employees.can_switch_projects boolean not null default false`.

---

### Task 1: Database migration — `employees.can_switch_projects`

**Files:**
- Migration applied via Supabase MCP (no local file needed — this project's migrations are applied directly and synced back by Lovable Cloud, matching how `phase_25_fm_contract_nfc_attendance` was done earlier this session).
- Modify: `src/integrations/supabase/types.ts` (regenerated).

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with:
- `name`: `phase_26_employees_can_switch_projects`
- `query`:
```sql
alter table employees add column if not exists can_switch_projects boolean not null default false;
```

- [ ] **Step 2: Verify the column exists**

Use the Supabase MCP `execute_sql` tool with:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'employees' and column_name = 'can_switch_projects';
```
Expected: one row, `data_type = boolean`, `column_default = false`.

- [ ] **Step 3: Regenerate TypeScript types**

Call the Supabase MCP `generate_typescript_types` tool. Its output is too large for a direct tool-result write, so use the repo's established workaround: write a small script to the scratchpad directory that reads the tool result JSON and writes the `types` field to `src/integrations/supabase/types.ts`, then run it with `python3 <script path>` (not inline `python3 -c "..."`, which breaks on this string's quoting).

- [ ] **Step 4: Confirm the new field appears in the generated types**

Run:
```bash
grep -n "can_switch_projects" "src/integrations/supabase/types.ts"
```
Expected: at least one match inside the `employees` `Row`/`Insert`/`Update` types.

- [ ] **Step 5: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: regenerate Supabase types for employees.can_switch_projects"
```

---

### Task 1b: Database — close self-escalation on `can_switch_projects`

*(Added during execution: the Task 1 code quality review found that `employees` has a permissive self-update RLS policy, `employees_self_update_push_token` (`USING`/`WITH CHECK`: `auth_user_id = auth.uid()`), which — being a separate permissive policy from the properly HR-gated `employees_update` policy — has no column restriction and lets any signed-in employee change ANY column on their own row via a direct PostgREST call, including the new `can_switch_projects` flag. Since Task 9's admin-gated provisioning screen trusts this exact flag to authorize setting up other employees' devices, this is a self-privilege-escalation path that must close before that trust is meaningful. Confirmed live via Supabase MCP: `employees_update` correctly gates on `app_private.can(auth.uid(), 'hr', 'edit')`; `employees_self_update_push_token` does not gate on anything but row ownership, and RLS policies for the same command are OR'd, so passing either permits the update. Fix: a `BEFORE UPDATE` trigger that blocks changes to `can_switch_projects` specifically, unless the caller has `hr`/`edit` permission — leaving the self-service push-token update path (and every other column's existing self-update behavior) untouched, per user decision to fix this narrowly rather than broadly re-scope `employees` RLS.)*

**Files:**
- Migration applied via Supabase MCP.

- [ ] **Step 1: Apply the guard trigger migration**

Use the Supabase MCP `apply_migration` tool with:
- `name`: `phase_27_employees_guard_can_switch_projects`
- `query`:
```sql
create or replace function app_private.guard_can_switch_projects()
returns trigger
language plpgsql
as $$
begin
  if new.can_switch_projects is distinct from old.can_switch_projects
     and not app_private.can(auth.uid(), 'hr', 'edit') then
    raise exception 'Not authorized to change can_switch_projects';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard_can_switch_projects on public.employees;
create trigger employees_guard_can_switch_projects
before update on public.employees
for each row execute function app_private.guard_can_switch_projects();
```

Note: `app_private.can` is itself `SECURITY DEFINER` (confirmed via `pg_proc.prosecdef`), so this trigger function does not need to be `SECURITY DEFINER` itself — it only ever calls into an already-privileged function, never reads privileged tables directly.

- [ ] **Step 2: Verify the trigger blocks self-escalation**

Using the Supabase MCP `execute_sql` tool, as a sanity check confirm the trigger and function exist:
```sql
select tgname, tgrelid::regclass from pg_trigger where tgname = 'employees_guard_can_switch_projects';
```
Expected: one row, `tgrelid` = `employees`.

A full end-to-end negative test (signing in as a non-HR employee and attempting the PATCH) is not practical from the MCP's service-role connection, which bypasses RLS entirely — service-role access was not the vulnerability. Accept the trigger's presence plus the code review's confirmation of the underlying RLS policy behavior as sufficient verification for this narrow fix.

- [ ] **Step 3: Commit**

No local files changed (this is a database-only migration, like Task 1). Nothing to commit in this step — the migration is the change of record, tracked in Supabase's own migration history (verifiable via `list_migrations`).

---

### Task 2: Web — "Can switch projects" checkbox on the Employee form

**Files:**
- Modify: `src/components/employee-form.tsx:14` (imports), `:40-53` (`empty` state), `:112-140` (save payload), `:269-278` (Status field area).

- [ ] **Step 1: Import `Checkbox`**

In `src/components/employee-form.tsx`, add to the imports (near the existing `Select`/`Textarea` imports):
```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: Add the field to the form's default state**

Find:
```tsx
  commission_rate: "", position: "", assigned_branch: "", status: "Active",
```
Replace with:
```tsx
  commission_rate: "", position: "", assigned_branch: "", status: "Active",
  can_switch_projects: false,
```

- [ ] **Step 3: Include it in the save payload**

Find:
```tsx
        status: form.status || "Active",
```
Replace with:
```tsx
        status: form.status || "Active",
        can_switch_projects: Boolean(form.can_switch_projects),
```

- [ ] **Step 4: Add the checkbox next to the Status field**

Find:
```tsx
            <Field label="Status">
              <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
```
Replace with:
```tsx
            <Field label="Status">
              <Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mobile app device setup">
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox
                  checked={!!form.can_switch_projects}
                  onCheckedChange={(v) => set("can_switch_projects", Boolean(v))}
                />
                <span className="text-sm text-muted-foreground">Can switch projects (manager/admin)</span>
              </div>
            </Field>
          </div>
```

- [ ] **Step 5: Manual verification**

Run the web dev server (`npm run dev` or the project's usual script), open the Employees page, edit any employee, confirm the "Mobile app device setup" checkbox appears next to Status, check it, save, reopen the same employee, and confirm it's still checked. Then, using the Supabase MCP `execute_sql` tool, run `select can_switch_projects from employees where full_name = '<that employee>';` and confirm it's `true`.

- [ ] **Step 6: Commit**

```bash
git add src/components/employee-form.tsx
git commit -m "feat: add can_switch_projects checkbox to Employee form"
```

---

### Task 3: Mobile — types and auth hook

**Files:**
- Modify: `mobile-cleaners-app/src/types/database.ts:9-16`, `mobile-cleaners-app/src/hooks/use-auth.ts:26`.

- [ ] **Step 1: Extend `EmployeeRow` and add the new option types**

In `mobile-cleaners-app/src/types/database.ts`, find:
```ts
export interface EmployeeRow {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string | null;
  full_name: string | null;
  status: string | null;
}
```
Replace with:
```ts
export interface EmployeeRow {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string | null;
  full_name: string | null;
  status: string | null;
  can_switch_projects: boolean;
}

export interface ProjectOption {
  id: string;
  title: string;
  site_name: string | null;
}

export interface StaffOption {
  id: string;
  full_name: string | null;
  first_name: string;
  email: string | null;
  profile_photo: string | null;
}
```

- [ ] **Step 2: Select the new column in `useAuth`**

In `mobile-cleaners-app/src/hooks/use-auth.ts`, find:
```ts
        .select("id, auth_user_id, first_name, last_name, full_name, status")
```
Replace with:
```ts
        .select("id, auth_user_id, first_name, last_name, full_name, status, can_switch_projects")
```

- [ ] **Step 3: Manual verification**

Run `cd mobile-cleaners-app && npx tsc --noEmit`. Expected: no new errors (both files are pure type/query changes).

- [ ] **Step 4: Commit**

```bash
cd mobile-cleaners-app
git add src/types/database.ts src/hooks/use-auth.ts
git commit -m "feat: add can_switch_projects to mobile EmployeeRow and auth query"
```

---

### Task 4: Mobile — device identity (persisted default project)

**Files:**
- Create: `mobile-cleaners-app/src/lib/device-identity.ts`

- [ ] **Step 1: Write the module**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@fizfix/default-project";

export type DefaultProject = { id: string; title: string };

/** This device's persisted default project, set once during provisioning. Null until provisioned. */
export async function getDefaultProject(): Promise<DefaultProject | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DefaultProject;
  } catch {
    return null;
  }
}

export async function setDefaultProject(project: DefaultProject): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(project));
}

export async function clearDefaultProject(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Manual verification**

Run `cd mobile-cleaners-app && npx tsc --noEmit`. Expected: no errors. (This module has no UI yet — it's exercised end-to-end once Task 9/10 wire it up.)

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/lib/device-identity.ts
git commit -m "feat: add device-identity module for persisted default project"
```

---

### Task 5: Mobile — manpower queries (projects + project staff)

**Files:**
- Create: `mobile-cleaners-app/src/lib/manpower.ts`

- [ ] **Step 1: Write the module**

```ts
import { supabase } from "./supabase";
import type { ProjectOption, StaffOption } from "@/types/database";

/** All FM projects, for the manager/admin project picker and provisioning. */
export async function fetchProjects(): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from("fm_contracts")
    .select("id, title, site_name")
    .order("title", { ascending: true });
  if (error) throw error;
  return (data as ProjectOption[]) ?? [];
}

/**
 * Staff actively assigned to a project, sourced from contract_manpower_assignments.
 * An employee can have more than one assignment row per project (different roles/shifts) -
 * dedupe by employee id since the photo grid only needs one tile per person.
 */
export async function fetchProjectStaff(contractId: string): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from("contract_manpower_assignments")
    .select("employees:employee_id(id, full_name, first_name, email, profile_photo)")
    .eq("contract_id", contractId)
    .eq("active", true);
  if (error) throw error;

  const rows = (data ?? []) as { employees: StaffOption | null }[];
  const seen = new Set<string>();
  const staff: StaffOption[] = [];
  for (const row of rows) {
    if (!row.employees || seen.has(row.employees.id)) continue;
    seen.add(row.employees.id);
    staff.push(row.employees);
  }
  return staff;
}
```

- [ ] **Step 2: Manual verification**

This needs a real signed-in session, which doesn't exist until Task 9 wires it into a screen. Defer functional verification to Task 9's manual check; for now confirm it compiles:
```bash
cd mobile-cleaners-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/lib/manpower.ts
git commit -m "feat: add manpower queries for project list and project staff"
```

---

### Task 6: Mobile — active project context

**Files:**
- Create: `mobile-cleaners-app/src/contexts/active-project.tsx`

- [ ] **Step 1: Write the context**

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

export type ActiveProject = { id: string; title: string } | null;

type ActiveProjectContextValue = {
  activeProject: ActiveProject;
  setActiveProject: (project: ActiveProject) => void;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<ActiveProject>(null);
  return (
    <ActiveProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

/** Which project the current app session is "working from" - see docs/superpowers/specs/2026-09-07-mobile-device-provisioning-design.md. */
export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ActiveProjectProvider");
  return ctx;
}
```

- [ ] **Step 2: Manual verification**

```bash
cd mobile-cleaners-app && npx tsc --noEmit
```
Expected: no errors. (Wired into the tree in Task 10.)

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/contexts/active-project.tsx
git commit -m "feat: add ActiveProjectProvider context"
```

---

### Task 7: Mobile — manager project picker component

**Files:**
- Create: `mobile-cleaners-app/src/components/manager-project-picker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchProjects } from "@/lib/manpower";
import type { ProjectOption } from "@/types/database";

type Props = {
  onSelect: (project: ProjectOption) => void;
};

export function ManagerProjectPicker({ onSelect }: Props) {
  const theme = useTheme();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchProjects()
      .then((rows) => {
        if (mounted) setProjects(rows);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load projects");
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Select a project
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Choose which project you're working from today.
      </ThemedText>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {projects === null ? (
        <ActivityIndicator />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {projects.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => onSelect(project)}
              style={[styles.row, { borderColor: theme.backgroundSelected }]}
            >
              <ThemedText type="smallBold">{project.title}</ThemedText>
              {project.site_name && (
                <ThemedText themeColor="textSecondary" type="small">
                  {project.site_name}
                </ThemedText>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 28 },
  subtitle: { marginBottom: 16 },
  error: { color: "#D64545" },
  list: { gap: 10, paddingBottom: 24 },
  row: { borderWidth: 1, borderRadius: 12, padding: 16 },
});
```

- [ ] **Step 2: Manual verification**

```bash
cd mobile-cleaners-app && npx tsc --noEmit
```
Expected: no errors. (Rendered for real in Task 9/10's manual checks.)

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/components/manager-project-picker.tsx
git commit -m "feat: add ManagerProjectPicker component"
```

---

### Task 8: Mobile — staff photo grid component

**Files:**
- Create: `mobile-cleaners-app/src/components/staff-photo-grid.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchProjectStaff } from "@/lib/manpower";
import type { StaffOption } from "@/types/database";

type Props = {
  contractId: string;
  onSelect: (staff: StaffOption) => void;
};

function initials(staff: StaffOption): string {
  const name = staff.full_name || staff.first_name || "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function StaffPhotoGrid({ contractId, onSelect }: Props) {
  const theme = useTheme();
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setStaff(null);
    fetchProjectStaff(contractId)
      .then((rows) => {
        if (mounted) setStaff(rows);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load staff");
      });
    return () => {
      mounted = false;
    };
  }, [contractId]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Select the employee
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Tap this device's owner.
      </ThemedText>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {staff === null ? (
        <ActivityIndicator />
      ) : staff.length === 0 ? (
        <ThemedText themeColor="textSecondary">No staff assigned to this project yet.</ThemedText>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {staff.map((person) => (
            <Pressable key={person.id} onPress={() => onSelect(person)} style={styles.tile}>
              {person.profile_photo ? (
                <Image source={{ uri: person.profile_photo }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.placeholder, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="subtitle">{initials(person)}</ThemedText>
                </View>
              )}
              <ThemedText type="small" style={styles.name} numberOfLines={1}>
                {person.full_name || person.first_name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 28 },
  subtitle: { marginBottom: 16 },
  error: { color: "#D64545" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingBottom: 24 },
  tile: { width: 96, alignItems: "center", gap: 6 },
  photo: { width: 84, height: 84, borderRadius: 42 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  name: { textAlign: "center" },
});
```

- [ ] **Step 2: Manual verification**

```bash
cd mobile-cleaners-app && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/components/staff-photo-grid.tsx
git commit -m "feat: add StaffPhotoGrid component"
```

---

### Task 9: Mobile — provisioning screen

**Files:**
- Create: `mobile-cleaners-app/src/app/provisioning.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from "react-native";

import { ManagerProjectPicker } from "@/components/manager-project-picker";
import { StaffPhotoGrid } from "@/components/staff-photo-grid";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useActiveProject } from "@/contexts/active-project";
import { useTheme } from "@/hooks/use-theme";
import { setDefaultProject } from "@/lib/device-identity";
import { supabase } from "@/lib/supabase";
import type { ProjectOption, StaffOption } from "@/types/database";

type Step = "admin-login" | "project-pick" | "staff-pick" | "employee-credentials";

export default function ProvisioningScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setActiveProject } = useActiveProject();

  const [step, setStep] = useState<Step>("admin-login");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectOption | null>(null);
  const [staff, setStaff] = useState<StaffOption | null>(null);

  const [employeePassword, setEmployeePassword] = useState("");
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  async function signInAsAdmin() {
    if (!adminEmail.trim() || !adminPassword) {
      setAdminError("Enter the admin email and password");
      return;
    }
    setAdminLoading(true);
    setAdminError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail.trim(),
      password: adminPassword,
    });
    if (error || !data.user) {
      setAdminLoading(false);
      setAdminError(error?.message ?? "Sign in failed");
      return;
    }

    const { data: employeeRow, error: lookupError } = await supabase
      .from("employees")
      .select("can_switch_projects")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    setAdminLoading(false);

    if (lookupError || !employeeRow?.can_switch_projects) {
      await supabase.auth.signOut();
      Alert.alert("Not authorized", "This account cannot set up devices. Ask an admin or manager to do this.");
      router.replace("/login");
      return;
    }

    setStep("project-pick");
  }

  async function signInAsEmployee() {
    if (!staff || !employeePassword) {
      setEmployeeError("Enter the password");
      return;
    }
    setEmployeeLoading(true);
    setEmployeeError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: staff.email ?? "",
      password: employeePassword,
    });
    if (error) {
      setEmployeeLoading(false);
      setEmployeeError(error.message);
      return;
    }

    if (project) {
      const defaultProject = { id: project.id, title: project.title };
      await setDefaultProject(defaultProject);
      setActiveProject(defaultProject);
    }

    setEmployeeLoading(false);
    router.replace("/");
  }

  if (step === "admin-login") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Set up this device
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Sign in with an admin or manager account to continue.
        </ThemedText>
        <TextInput
          value={adminEmail}
          onChangeText={setAdminEmail}
          placeholder="Admin email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          value={adminPassword}
          onChangeText={setAdminPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {adminError && <ThemedText style={styles.error}>{adminError}</ThemedText>}
        <Pressable
          onPress={signInAsAdmin}
          disabled={adminLoading}
          style={[styles.button, { opacity: adminLoading ? 0.7 : 1 }]}
        >
          {adminLoading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Continue</ThemedText>}
        </Pressable>
        <Pressable onPress={() => router.replace("/login")} style={styles.cancel}>
          <ThemedText themeColor="textSecondary">Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (step === "project-pick") {
    return (
      <ManagerProjectPicker
        onSelect={(p) => {
          setProject(p);
          setStep("staff-pick");
        }}
      />
    );
  }

  if (step === "staff-pick" && project) {
    return (
      <StaffPhotoGrid
        contractId={project.id}
        onSelect={(s) => {
          setStaff(s);
          setStep("employee-credentials");
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Sign in {staff?.full_name ?? staff?.first_name}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Enter this employee's password to finish setting up the device.
      </ThemedText>
      <TextInput
        value={staff?.email ?? ""}
        editable={false}
        style={[styles.input, styles.readonly, { color: theme.textSecondary, borderColor: theme.backgroundSelected }]}
      />
      <TextInput
        value={employeePassword}
        onChangeText={setEmployeePassword}
        placeholder="Employee password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      {employeeError && <ThemedText style={styles.error}>{employeeError}</ThemedText>}
      <Pressable
        onPress={signInAsEmployee}
        disabled={employeeLoading}
        style={[styles.button, { opacity: employeeLoading ? 0.7 : 1 }]}
      >
        {employeeLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Finish setup</ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28 },
  subtitle: { marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  readonly: { opacity: 0.7 },
  error: { color: "#D64545" },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8, backgroundColor: "#208AEF" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancel: { alignItems: "center", padding: 12 },
});
```

- [ ] **Step 2: Manual verification**

```bash
cd mobile-cleaners-app && npx tsc --noEmit
```
Expected: no errors. Full functional verification happens in Task 10's manual check, once the route is reachable and the root layout no longer redirects it away.

- [ ] **Step 3: Commit**

```bash
cd mobile-cleaners-app
git add src/app/provisioning.tsx
git commit -m "feat: add device provisioning screen"
```

---

### Task 10: Mobile — wire the root layout (route gate, manager picker, default-project redirect)

**Files:**
- Modify: `mobile-cleaners-app/src/app/_layout.tsx` (full rewrite — every branch of the existing conditional changes).

- [ ] **Step 1: Replace the file's full contents**

```tsx
import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, Redirect, Slot, ThemeProvider, usePathname } from 'expo-router';
import { Pressable, useColorScheme, View } from 'react-native';

import { ManagerProjectPicker } from '@/components/manager-project-picker';
import { ScanToast } from '@/components/scan-toast';
import { ThemedText } from '@/components/themed-text';
import { ActiveProjectProvider, useActiveProject } from '@/contexts/active-project';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultProject } from '@/lib/device-identity';
import { registerForPushNotifications } from '@/lib/push-notifications';
import { initScanTracker } from '@/lib/scan-tracker';
import { supabase } from '@/lib/supabase';

export default function RootLayout() {
  return (
    <ActiveProjectProvider>
      <RootLayoutInner />
    </ActiveProjectProvider>
  );
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { loading, session, employee } = useAuth();
  const { activeProject, setActiveProject } = useActiveProject();
  const [defaultProjectChecked, setDefaultProjectChecked] = useState(false);

  useEffect(() => {
    initScanTracker();
  }, []);

  useEffect(() => {
    if (employee?.id && employee.status !== 'Terminated') {
      registerForPushNotifications(employee.id);
    }
  }, [employee?.id, employee?.status]);

  // Regular (non-flagged) employees: load this device's persisted default project once
  // per employee session. Managers/admins pick fresh every launch (see the render below),
  // so there is nothing to load for them.
  useEffect(() => {
    if (!employee || employee.can_switch_projects) {
      setDefaultProjectChecked(true);
      return;
    }
    let mounted = true;
    setDefaultProjectChecked(false);
    getDefaultProject().then((project) => {
      if (!mounted) return;
      if (project) setActiveProject(project);
      setDefaultProjectChecked(true);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.can_switch_projects]);

  const isLoginRoute = pathname === '/login';
  const isProvisioningRoute = pathname === '/provisioning';
  const needsDefaultProject = !!employee && !employee.can_switch_projects && defaultProjectChecked && !activeProject;
  const needsProjectPick = !!employee && employee.can_switch_projects && !activeProject;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText>Loading...</ThemedText>
          </View>
        ) : !session && !isLoginRoute && !isProvisioningRoute ? (
          <Redirect href="/login" />
        ) : session && isLoginRoute ? (
          <Redirect href="/" />
        ) : session && !employee && !isLoginRoute && !isProvisioningRoute ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
            <ThemedText type="subtitle">Account not linked</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Your login isn't linked to an employee record yet. Ask the office to link your account before you can
              use this app.
            </ThemedText>
            <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}>
              <ThemedText type="link" themeColor="textSecondary">
                Sign out
              </ThemedText>
            </Pressable>
          </View>
        ) : session && employee?.status === 'Terminated' && !isLoginRoute && !isProvisioningRoute ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
            <ThemedText type="subtitle">Account deactivated</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Your access has been switched off. Contact the office if you think this is a mistake.
            </ThemedText>
            <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}>
              <ThemedText type="link" themeColor="textSecondary">
                Sign out
              </ThemedText>
            </Pressable>
          </View>
        ) : session && employee && !isProvisioningRoute && !defaultProjectChecked ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText>Loading...</ThemedText>
          </View>
        ) : session && employee && needsDefaultProject && !isProvisioningRoute ? (
          <Redirect href="/provisioning" />
        ) : session && employee && needsProjectPick && !isProvisioningRoute ? (
          <ManagerProjectPicker onSelect={(project) => setActiveProject({ id: project.id, title: project.title })} />
        ) : (
          <Slot />
        )}
        <ScanToast />
      </View>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Manual verification — regular employee, first launch after this change (simulates "never provisioned")**

1. Run `cd mobile-cleaners-app && npx expo start`, open the app on a device/emulator already signed in as a non-flagged employee (`can_switch_projects = false`) whose employee row has no prior app-level state.
2. Expected: the app redirects to `/provisioning` and shows the "Set up this device" admin sign-in form (Task 9's screen), instead of the old home screen. This confirms `needsDefaultProject` correctly fires when AsyncStorage has nothing yet.
3. On the provisioning screen, sign in with an admin account that has `can_switch_projects = true` (set via Task 2's checkbox first, if not already).
4. Expected: moves to the project list (`ManagerProjectPicker`). Tap a project.
5. Expected: moves to the staff photo grid for that project (staff pulled from `contract_manpower_assignments`). Confirm at least one tile shows a real photo (for an employee you've uploaded `profile_photo` for) and at least one shows initials (for one without).
6. Tap the target employee, enter their real password, tap "Finish setup".
7. Expected: lands on the home screen ("Today's Tasks") signed in as that employee.
8. Force-quit and relaunch the app.
9. Expected: goes straight to the home screen — no login, no provisioning redirect. This confirms the persisted `defaultProject` is being read correctly on subsequent launches.

- [ ] **Step 3: Manual verification — manager/admin, every-launch project pick**

1. In the web Employee form (Task 2), check "Can switch projects" for one test employee and give them a mobile login.
2. Sign into the mobile app as that employee (via provisioning, or if already signed in, force-quit and relaunch).
3. Expected: after the loading screen, a plain-text project list appears (not the photo grid) every time the app is opened, before reaching the home screen.
4. Pick a project. Expected: lands on the home screen.
5. Force-quit and relaunch. Expected: the project list appears again (in-memory pick, not persisted) — confirms Flow B's "every launch" behavior.

- [ ] **Step 4: Commit**

```bash
cd mobile-cleaners-app
git add src/app/_layout.tsx
git commit -m "feat: gate mobile app on device-bound project identity"
```

---

### Task 11: Mobile — provisioning entry points (gear icon + long-press)

**Files:**
- Modify: `mobile-cleaners-app/src/app/login.tsx`
- Modify: `mobile-cleaners-app/src/app/(app)/index.tsx:14, 55-69`

- [ ] **Step 1: Add the gear icon to the login screen**

In `mobile-cleaners-app/src/app/login.tsx`, add `useRouter` to the imports:
```tsx
import { useRouter } from 'expo-router';
```
and inside `LoginScreen`, add the router hook and a small top-right Pressable. Find:
```tsx
export default function LoginScreen() {
  const theme = useTheme();
```
Replace with:
```tsx
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
```
Then find:
```tsx
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
```
Replace with:
```tsx
  return (
    <ThemedView style={styles.container}>
      <Pressable
        onPress={() => router.push('/provisioning')}
        hitSlop={12}
        style={styles.setupButton}
        accessibilityLabel="Set up this device"
      >
        <ThemedText themeColor="textSecondary" style={{ fontSize: 20 }}>
          ⚙️
        </ThemedText>
      </Pressable>
      <KeyboardAvoidingView
```
Finally, add a style entry. Find:
```tsx
  container: { flex: 1 },
```
Replace with:
```tsx
  container: { flex: 1 },
  setupButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
```

- [ ] **Step 2: Add the long-press entry point on the home screen**

In `mobile-cleaners-app/src/app/(app)/index.tsx`, find:
```tsx
        <View>
          <ThemedText type="subtitle">{employee?.full_name ?? employee?.first_name}</ThemedText>
```
Replace with:
```tsx
        <View>
          <ThemedText type="subtitle" onLongPress={() => router.push('/provisioning')}>
            {employee?.full_name ?? employee?.first_name}
          </ThemedText>
```

- [ ] **Step 3: Manual verification**

1. Run `cd mobile-cleaners-app && npx expo start`.
2. On the login screen, confirm a small ⚙️ appears in the top-right corner and tapping it navigates to the provisioning screen.
3. From the provisioning screen's "Cancel" button, confirm it returns to the login screen.
4. Signed in as a regular employee on the home screen, long-press their name at the top and confirm it navigates to the provisioning screen too.
5. Confirm a normal (non-long) tap on the name does nothing unexpected (no accidental navigation on quick taps).

- [ ] **Step 4: Commit**

```bash
cd mobile-cleaners-app
git add src/app/login.tsx "src/app/(app)/index.tsx"
git commit -m "feat: add provisioning entry points to login and home screens"
```

---

## Self-Review Notes

- **Spec coverage:** Data model change (Task 1), Flow A persisted default project (Tasks 4, 10), Flow B manager/admin daily picker (Tasks 6, 7, 10), Flow C provisioning steps 1-7 (Tasks 5, 8, 9, 11) are all covered. The spec's explicit non-goals (3-button hub, photo upload, fine-grained permissions) have no corresponding tasks, as intended.
- **Admin-gate failure path** matches the spec's resolved ambiguity exactly: sign out and return to `/login` unconditionally (Task 9, `signInAsAdmin`), never attempting to restore a prior session.
- **RLS check performed during planning (not spec content, but required for Task 9 to actually work):** `contract_manpower_assignments`'s `_select` policy requires `app_private.can(auth.uid(), 'contracts', 'view')` — only true for the temporarily-signed-in admin, not a regular employee. The staff photo grid (Task 8) is queried in Task 9 *before* switching auth to the target employee, so this holds. `fm_contracts` and `employees` both have permissive `USING (true)` policies for any authenticated user, so the project list and photo/name lookups need no additional RLS changes.
