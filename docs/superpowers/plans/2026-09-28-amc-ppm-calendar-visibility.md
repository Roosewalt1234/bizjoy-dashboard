# AMC Scheduling Calendar: Show PPM Dates from `contracts.ppm_schedule` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AMC Scheduling calendar show every PPM date that's actually maintained in `contracts.ppm_schedule` (the real, actively-used data — 46/46 AMC contracts, 18 with real November 2026 dates), and let staff update a visit's status straight from the calendar.

**Architecture:** Add `ppm_schedule` to the calendar's existing `contracts` lookup query, generate one `CalendarEvent` per category/date/index from it (reusing the same status-computation logic `contracts-page.tsx` already uses), and add a small status-update `Dialog` that writes back to just that one jsonb column. A "View full contract" link deep-links into the Contracts page via a new `?edit=<id>` search param that auto-opens the existing edit dialog (a small new mechanism — none exists today).

**Tech Stack:** React 19, TanStack Router (file-based routes, `validateSearch`), TanStack Query, Supabase JS client, shadcn/ui (`Dialog`, `Select`), Tailwind, Sonner (`toast`). No test framework is configured in this repo — verification is `tsc --noEmit`, `npm run build`, live Supabase queries, and manual trace-through, matching this repo's established pattern (no unit tests exist for any other feature in this codebase).

---

### Task 1: Read `ppm_schedule`, add types and status-computation helpers

**Files:**
- Modify: `src/routes/_authenticated/amc-scheduling.tsx:1-63` and `:221-232`

- [ ] **Step 1: Add the `Link` import**

Find (`amc-scheduling.tsx:1-2`):
```ts
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
```

Replace:
```ts
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
```

- [ ] **Step 2: Add `ppm_schedule` to `ContractLookup` and add `PpmScheduleJson`**

Find (`amc-scheduling.tsx:56-63`):
```ts
type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
  water_tank_cleaning_date: string | null;
  ac_duct_cleaning_date: string | null;
};
```

Replace:
```ts
type PpmScheduleJson = {
  dates?: Record<string, string[]>;
  status?: Record<string, string[]>;
  freq?: Record<string, number>;
};

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
  water_tank_cleaning_date: string | null;
  ac_duct_cleaning_date: string | null;
  ppm_schedule: PpmScheduleJson | null;
};
```

- [ ] **Step 3: Select `ppm_schedule` in the contracts lookup query**

Find (`amc-scheduling.tsx:221-232`):
```ts
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-amc-scheduling"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });
```

Replace:
```ts
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-amc-scheduling"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date, ppm_schedule")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });
```

- [ ] **Step 4: Add the PPM category labels + status helpers**

These are deliberately duplicated from `src/components/contracts-page.tsx` (its `PPM_SERVICES` list and `computePpmStatus` function) rather than imported — `contracts-page.tsx` doesn't export them today, and this file already carries its own local `ContractLookup` shape rather than importing one, so this matches the existing pattern of the two route files not being coupled.

Find (`amc-scheduling.tsx:164-167`, the end of `contractLabel` and the blank line before `emptyScheduleForm`):
```ts
function contractLabel(contract: Pick<ContractLookup, "contract_no" | "customer_name" | "title">) {
  return (contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title);
}

const emptyScheduleForm = {
```

Replace:
```ts
function contractLabel(contract: Pick<ContractLookup, "contract_no" | "customer_name" | "title">) {
  return (contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title);
}

// PPM category keys/labels and status logic below are intentionally duplicated from
// contracts-page.tsx (PPM_SERVICES, computePpmStatus) — that file doesn't export them,
// and this route already keeps its own local ContractLookup shape rather than importing one.
const PPM_CATEGORY_LABELS: Record<string, string> = {
  ac_units: "AC Units",
  water_pumps: "Water Pumps & Motors",
  electrical: "Fixed Electrical Fittings",
  plumbing: "Plumbing Units",
  solar: "Solar Water Heater",
  water_tank: "Water Tank Cleaning",
};

function computePpmStatus(date: string, override: string): "Not Yet Due" | "Due" | "Overdue" | "Scheduled" | "Completed" {
  if (override === "Completed") return "Completed";
  if (override === "Scheduled") return "Scheduled";
  if (!date) return "Not Yet Due";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays <= 0) return "Not Yet Due";
  if (diffDays <= 15) return "Due";
  return "Overdue";
}

function ppmEventColorClass(status: string): string {
  switch (status) {
    case "Completed": return "bg-emerald-100 text-emerald-900";
    case "Scheduled":  return "bg-sky-100 text-sky-900";
    case "Due":        return "bg-amber-100 text-amber-900";
    case "Overdue":    return "bg-red-100 text-red-900";
    default:           return "bg-slate-100 text-slate-700"; // Not Yet Due
  }
}

const emptyScheduleForm = {
```

- [ ] **Step 5: Verify the file still compiles so far**

Run: `npx tsc --noEmit -p . 2>&1 | grep amc-scheduling`
Expected: no output (no errors reference this file). Errors in other unrelated files are pre-existing and not this task's concern — only confirm nothing new points at `amc-scheduling.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/amc-scheduling.tsx
git commit -m "feat: read ppm_schedule in AMC scheduling calendar's contracts query"
```

---

### Task 2: Generate calendar events from `ppm_schedule`

**Files:**
- Modify: `src/routes/_authenticated/amc-scheduling.tsx:288-335` (line numbers shifted by Task 1's additions — locate by the `calendarEvents` memo content below, which is unchanged by Task 1)

- [ ] **Step 1: Add the PPM event-generation loop**

Find:
```ts
    for (const wo of scheduledWorkOrders) {
      if (!wo.scheduled_date) continue;
      const contractLabel = wo.contracts?.contract_no ?? wo.contracts?.customer_name ?? "Contract";
      events.push({
        id: `wo-${wo.id}`,
        date: wo.scheduled_date,
        title: `WO: ${wo.wo_no ?? contractLabel}`,
        subtitle: wo.service_type ?? wo.status,
        colorClass: "bg-amber-100 text-amber-900",
      });
    }

    return events;
  }, [visits, contracts, scheduledWorkOrders]);
```

Replace:
```ts
    for (const wo of scheduledWorkOrders) {
      if (!wo.scheduled_date) continue;
      const contractLabel = wo.contracts?.contract_no ?? wo.contracts?.customer_name ?? "Contract";
      events.push({
        id: `wo-${wo.id}`,
        date: wo.scheduled_date,
        title: `WO: ${wo.wo_no ?? contractLabel}`,
        subtitle: wo.service_type ?? wo.status,
        colorClass: "bg-amber-100 text-amber-900",
      });
    }

    for (const contract of contracts) {
      const label = contract.contract_no ?? contract.customer_name ?? "Contract";
      const dates = contract.ppm_schedule?.dates ?? {};
      const overrides = contract.ppm_schedule?.status ?? {};
      for (const category of Object.keys(PPM_CATEGORY_LABELS)) {
        const categoryDates = dates[category] ?? [];
        const categoryOverrides = overrides[category] ?? [];
        categoryDates.forEach((date, i) => {
          if (!date) return;
          const status = computePpmStatus(date, categoryOverrides[i] ?? "");
          events.push({
            id: `ppm|${contract.id}|${category}|${i}`,
            date,
            title: `PPM: ${PPM_CATEGORY_LABELS[category]} — ${label}`,
            subtitle: status,
            colorClass: ppmEventColorClass(status),
          });
        });
      }
    }

    return events;
  }, [visits, contracts, scheduledWorkOrders]);
```

Note the event `id` uses `|` as the separator (`ppm|<contractId>|<category>|<index>`), not `-` — `contract.id` is a UUID that itself contains hyphens, so splitting an id like `ppm-3f2a...-water_tank-0` on `-` would be ambiguous. `|` never appears in a UUID or in any of the six category keys, so splitting on it in Task 3 is unambiguous.

- [ ] **Step 2: Verify the calendar page still renders with real data**

This step is manual (no test framework in this repo). It's verified together with Task 3's click handling in Task 3's own manual check — skip a standalone check here since the events aren't clickable yet.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/amc-scheduling.tsx
git commit -m "feat: generate AMC calendar events from contracts.ppm_schedule"
```

---

### Task 3: Click a PPM event to view/update its status

**Files:**
- Modify: `src/routes/_authenticated/amc-scheduling.tsx` (state block after line 214, `handleCalendarEventClick` after Task 1/2's line shifts, JSX after the Cleaning Dates `Dialog`, and the calendar legend)

- [ ] **Step 1: Add dialog state**

Find:
```ts
  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [cleaningForm, setCleaningForm] = useState(emptyCleaningForm);
  const [savingCleaning, setSavingCleaning] = useState(false);

  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);
```

Replace:
```ts
  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [cleaningForm, setCleaningForm] = useState(emptyCleaningForm);
  const [savingCleaning, setSavingCleaning] = useState(false);

  const [ppmEditOpen, setPpmEditOpen] = useState(false);
  const [ppmEditTarget, setPpmEditTarget] = useState<{ contractId: string; category: string; index: number } | null>(null);
  const [ppmPendingStatus, setPpmPendingStatus] = useState<string | null>(null);
  const [savingPpmStatus, setSavingPpmStatus] = useState(false);

  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);
```

- [ ] **Step 2: Add the click branch**

Find (`handleCalendarEventClick`'s final branch and closing brace):
```ts
    if (event.id.startsWith("wo-")) {
      const woId = event.id.slice("wo-".length);
      const wo = scheduledWorkOrders.find((w) => w.id === woId);
      if (wo) {
        // Full row (see AmcWorkOrderRow's `select("*")` note above) — safe
        // to hand straight to WorkOrderDialog for editing without
        // clobbering columns this page doesn't otherwise touch.
        setWorkOrderEditing(wo);
        setWorkOrderOpen(true);
      }
      return;
    }
  }
```

Replace:
```ts
    if (event.id.startsWith("wo-")) {
      const woId = event.id.slice("wo-".length);
      const wo = scheduledWorkOrders.find((w) => w.id === woId);
      if (wo) {
        // Full row (see AmcWorkOrderRow's `select("*")` note above) — safe
        // to hand straight to WorkOrderDialog for editing without
        // clobbering columns this page doesn't otherwise touch.
        setWorkOrderEditing(wo);
        setWorkOrderOpen(true);
      }
      return;
    }
    if (event.id.startsWith("ppm|")) {
      const [, contractId, category, indexStr] = event.id.split("|");
      setPpmEditTarget({ contractId, category, index: Number(indexStr) });
      setPpmEditOpen(true);
      return;
    }
  }
```

- [ ] **Step 3: Add the save handler**

Find (`saveCleaningDates`'s closing brace and the `// ---- Day-click picker ----` comment that follows it):
```ts
      toast.success("Cleaning dates updated");
      setCleaningOpen(false);
      qc.invalidateQueries({ queryKey: ["contracts-lookup-amc-scheduling"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSavingCleaning(false);
    }
  }

  // ---- Day-click picker ----
```

Replace:
```ts
      toast.success("Cleaning dates updated");
      setCleaningOpen(false);
      qc.invalidateQueries({ queryKey: ["contracts-lookup-amc-scheduling"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSavingCleaning(false);
    }
  }

  // ---- PPM status quick-update dialog (reads/writes contracts.ppm_schedule directly) ----

  const ppmTargetContract = ppmEditTarget ? contracts.find((c) => c.id === ppmEditTarget.contractId) : undefined;
  const ppmTargetDate =
    ppmEditTarget && ppmTargetContract
      ? ppmTargetContract.ppm_schedule?.dates?.[ppmEditTarget.category]?.[ppmEditTarget.index] ?? ""
      : "";
  const ppmTargetOverride =
    ppmEditTarget && ppmTargetContract
      ? ppmTargetContract.ppm_schedule?.status?.[ppmEditTarget.category]?.[ppmEditTarget.index] ?? ""
      : "";

  async function savePpmStatus(newStatus: string) {
    if (!ppmEditTarget || !ppmTargetContract) return;
    setSavingPpmStatus(true);
    try {
      const current = ppmTargetContract.ppm_schedule ?? {};
      const statusByCategory = { ...(current.status ?? {}) };
      const categoryStatuses = [...(statusByCategory[ppmEditTarget.category] ?? [])];
      while (categoryStatuses.length <= ppmEditTarget.index) categoryStatuses.push("");
      categoryStatuses[ppmEditTarget.index] = newStatus === "Auto" ? "" : newStatus;
      statusByCategory[ppmEditTarget.category] = categoryStatuses;
      const updated = { ...current, status: statusByCategory };
      const { error } = await supabase
        .from("contracts")
        .update({ ppm_schedule: updated })
        .eq("id", ppmTargetContract.id);
      if (error) throw error;
      toast.success("PPM status updated");
      setPpmEditOpen(false);
      setPpmPendingStatus(null);
      qc.invalidateQueries({ queryKey: ["contracts-lookup-amc-scheduling"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSavingPpmStatus(false);
    }
  }

  // ---- Day-click picker ----
```

- [ ] **Step 4: Add a legend entry for the new event source**

Find:
```tsx
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-200" /> PPM Visit</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-200" /> Water Tank</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-200" /> AC Duct</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200" /> Work Order</span>
            </div>
```

Replace:
```tsx
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-200" /> PPM Visit</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-200" /> Water Tank</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-200" /> AC Duct</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200" /> Work Order</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200" /> PPM Schedule (colored by status)</span>
            </div>
```

- [ ] **Step 5: Add the Dialog JSX**

Find (the Cleaning Dates `Dialog`'s closing tag and the comment that follows it):
```tsx
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleaningOpen(false)}>Cancel</Button>
            <Button onClick={saveCleaningDates} disabled={savingCleaning}>{savingCleaning ? "Saving..." : "Save Dates"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day-click picker: choose contract + type, then open the right dialog */}
```

Replace:
```tsx
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleaningOpen(false)}>Cancel</Button>
            <Button onClick={saveCleaningDates} disabled={savingCleaning}>{savingCleaning ? "Saving..." : "Save Dates"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ppmEditOpen}
        onOpenChange={(v) => {
          setPpmEditOpen(v);
          if (!v) {
            setPpmEditTarget(null);
            setPpmPendingStatus(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>PPM Visit</DialogTitle>
          </DialogHeader>
          {ppmEditTarget && ppmTargetContract && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="font-medium">{contractLabel(ppmTargetContract)}</div>
                <div className="text-muted-foreground">
                  {PPM_CATEGORY_LABELS[ppmEditTarget.category]} — {ppmTargetDate}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={ppmPendingStatus ?? (ppmTargetOverride || "Auto")}
                  onValueChange={setPpmPendingStatus}
                  disabled={savingPpmStatus}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Auto">Auto</SelectItem>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => savePpmStatus(ppmPendingStatus ?? (ppmTargetOverride || "Auto"))}
                disabled={savingPpmStatus}
              >
                {savingPpmStatus ? "Saving..." : "Save Status"}
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/amc-contracts" search={{ edit: ppmTargetContract.id }}>
                  View full contract
                </Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Day-click picker: choose contract + type, then open the right dialog */}
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep amc-scheduling`
Expected: no output. (A `search={{ edit: ... }}` type error against the `/amc-contracts` route is expected and fine at this point — Task 4 adds that route's `validateSearch`, which is what makes this typecheck. If Task 4 hasn't run yet, ignore a single error here naming `search` on this `Link`.)

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authenticated/amc-scheduling.tsx
git commit -m "feat: view and update PPM visit status from the AMC scheduling calendar"
```

---

### Task 4: Deep-link support on the Contracts route

**Files:**
- Modify: `src/routes/_authenticated/amc-contracts.tsx` (entire file, currently 7 lines)

- [ ] **Step 1: Add `validateSearch` and pass the value through**

This follows the exact pattern already used by `src/routes/_authenticated/fm-work-orders.tsx` in this codebase (a route-level wrapper component reads `Route.useSearch()` and passes it down as a prop).

Find (entire current file):
```ts
import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "@/components/contracts-page";

export const Route = createFileRoute("/_authenticated/amc-contracts")({
  component: () => <ContractsPage moduleType="AMC" />,
});
```

Replace:
```ts
import { createFileRoute } from "@tanstack/react-router";
import { ContractsPage } from "@/components/contracts-page";

export const Route = createFileRoute("/_authenticated/amc-contracts")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === "string" ? { edit: search.edit } : {},
  component: AmcContractsRoute,
});

function AmcContractsRoute() {
  const { edit } = Route.useSearch();
  return <ContractsPage moduleType="AMC" focusContractId={edit} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authenticated/amc-contracts.tsx
git commit -m "feat: add ?edit= deep link to the AMC contracts page"
```

---

### Task 5: Auto-open the edit dialog for a deep-linked contract

**Files:**
- Modify: `src/components/contracts-page.tsx:1` (import), `:255` (component signature), `:266-277` (near the `rows` query)

This follows the exact pattern already used in `src/components/work-orders-page.tsx` for its `?wo=`/`?wo_id=` deep link (a `useRef` sentinel that prevents re-opening once a given id has been handled, checked in a `useEffect` that runs once `rows` has loaded).

- [ ] **Step 1: Add `useRef` to the React import**

Find (`contracts-page.tsx:1`):
```ts
import { useEffect, useMemo, useState } from "react";
```

Replace:
```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Accept the new prop**

Find (`contracts-page.tsx:255`):
```ts
export function ContractsPage({ moduleType = "AMC" }: { moduleType?: ModuleType }) {
  const isFM = moduleType === "FM";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
```

Replace:
```ts
export function ContractsPage({ moduleType = "AMC", focusContractId }: { moduleType?: ModuleType; focusContractId?: string }) {
  const isFM = moduleType === "FM";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const focusHandled = useRef<string | null>(null);
```

- [ ] **Step 3: Add the deep-link effect**

Find (`contracts-page.tsx`, right after the `rows` query):
```ts
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contracts", moduleType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("module_type", moduleType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  const filteredRows = useMemo(() => {
```

Replace:
```ts
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contracts", moduleType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("module_type", moduleType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deep link: open the exact contract requested via ?edit= (see amc-contracts.tsx)
  useEffect(() => {
    if (!focusContractId || focusHandled.current === focusContractId) return;
    const match = (rows as any[]).find((r) => r.id === focusContractId);
    if (!match) return;
    focusHandled.current = focusContractId;
    setEditing(match);
    setOpen(true);
  }, [rows, focusContractId]);


  const filteredRows = useMemo(() => {
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "contracts-page|amc-contracts|amc-scheduling"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/contracts-page.tsx
git commit -m "feat: auto-open a contract's edit dialog when deep-linked via ?edit="
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors introduced by this feature. (If pre-existing unrelated errors exist elsewhere in the repo, confirm via `git stash` + re-run that they predate this work — don't chase them.)

- [ ] **Step 2: Full build (also regenerates `routeTree.gen.ts` for the new `?edit=` search param)**

Run: `npm run build`
Expected: build succeeds. This step is what makes TanStack Router aware of `/amc-contracts`'s new `edit` search param at the type level, so the `Link to="/amc-contracts" search={{ edit: ... }}` in `amc-scheduling.tsx` typechecks cleanly — run this before the final `tsc` pass if Task 3's `search` prop showed a type error earlier.

- [ ] **Step 3: Live data re-check**

Use the Supabase MCP `execute_sql` tool against project `evcaehadjzoxtdlnmehk` to re-confirm the bug's premise still holds and will now be fixed:

```sql
select id, contract_no, customer_name,
       jsonb_path_query_array(ppm_schedule, '$.dates.*[*] ? (@ >= "2026-11-01" && @ <= "2026-11-30")') as november_dates
from contracts
where module_type = 'AMC'
  and ppm_schedule is not null
limit 5;
```

Expected: at least one row with a non-empty `november_dates` array — these are the dates that were invisible on the calendar before this fix and must now appear as events when that contract's `id` is checked against `calendarEvents` in the browser (Step 4).

- [ ] **Step 4: Manual trace-through in the browser**

1. Start the dev server (`npm run dev` or the project's existing dev workflow) and open the AMC Scheduling page's Calendar tab, navigated to November 2026.
2. Confirm PPM event chips now appear on the dates returned by Step 3's query, colored per `ppmEventColorClass` (e.g. slate for not-yet-due, amber for due, red for overdue).
3. Click one PPM chip → the new dialog opens showing the correct contract name, category, and date.
4. Change its Status dropdown to "Completed" and click "Save Status" → toast confirms, dialog closes, the chip's color updates to emerald and its subtitle reads "Completed" without a page refresh.
5. Click another PPM chip → "View full contract" → confirm it navigates to `/amc-contracts?edit=<id>` and the Contracts page's edit dialog opens automatically on that exact contract.
6. Refresh the AMC Scheduling calendar page and confirm the three pre-existing event sources (PPM Visit, Water Tank / AC Duct, Work Order) still render exactly as before — this feature is additive only.

- [ ] **Step 5: Stop — do not push**

Per `AGENTS.md`, this repo is connected to Lovable.dev; every commit pushed to the connected branch syncs into the Lovable editor. Do not run `git push` after this task. Report completion and wait for the user's explicit instruction to push.
