# AMC Scheduling Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new AMC Scheduling page with a List/Calendar toggle and a Google-Calendar-style Month/Week grid, aggregating AMC PPM visits, water tank/AC duct cleaning dates, and AMC work order scheduled dates — with click-a-day-to-schedule launching the real forms.

**Architecture:** Two new tables (`amc_ppm_schedules`, `amc_ppm_visits`) mirror FM's existing `ppm_schedules`/`ppm_visits` system but point at the AMC `contracts` table instead of `fm_contracts` (that table's FK is hard-pinned to `fm_contracts`, and all 12 existing rows are FM's — this is additive, not a retrofit). A new generic `SchedulingCalendar` component renders the month/week grid from a plain `{date, title, colorClass}` event list, with no assumptions about what the events represent. The AMC Scheduling page fetches the three data sources, normalizes them into that shape, and reuses existing forms (`WorkOrderDialog` for work orders) wherever one already exists rather than inventing new ones.

**Tech Stack:** React 19 + TanStack Router/Query + Supabase + shadcn/ui, matching every other page in this app. No calendar library — the grid is simple enough to build directly (6×7 month grid, 1×7 week grid), and no test runner exists in this repo — verification is `npx tsc --noEmit -p .` plus manual checks, matching every other feature built this session.

**Corrections found during planning (the written spec had two inaccuracies, noted here so nobody re-discovers them):**
- The AMC Work Order form (`src/components/work-order-dialog.tsx`) **already has a Scheduled Date field** (line ~371) — no new field needs to be added there, contrary to spec §4. It's just never been used (0 of 1 AMC work orders have it set).
- There is **no existing List/Calendar view-toggle pattern anywhere in this app** to reuse, contrary to spec §1's "same pattern already used elsewhere." It's built fresh in Task 3 using the existing shadcn `Tabs` component (`src/components/ui/tabs.tsx`), which *is* already used elsewhere for tab-style UI — just not for this specific list/calendar switch.

---

## File Structure

- Create: `supabase/migrations/20260918120000_amc_ppm_scheduling.sql` — `amc_ppm_schedules`, `amc_ppm_visits` tables + RLS.
- Create: `src/components/scheduling-calendar.tsx` — generic, reusable month/week calendar grid component. No AMC-specific knowledge — just renders events on days and reports clicks.
- Create: `src/routes/_authenticated/amc-scheduling.tsx` — the new page: data fetching, List mode (PPM schedule/visit tables + cleaning-date editor), Calendar mode (wires `SchedulingCalendar` to the aggregated event list), day-click "what to schedule" flow, and the small dialogs unique to this page (PPM schedule form, one-off PPM visit form, cleaning-date form). Reuses `WorkOrderDialog` as-is for work orders.
- Modify: `src/components/app-sidebar.tsx` — add "AMC Scheduling" to the AMC Contracts group.

---

### Task 1: Database — `amc_ppm_schedules` and `amc_ppm_visits`

**Files:**
- Create: `supabase/migrations/20260918120000_amc_ppm_scheduling.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Recurring AMC maintenance schedules and their generated visits. Mirrors
-- the existing ppm_schedules/ppm_visits tables' shape and RLS pattern,
-- but as new, independent tables rather than retrofitting those — their
-- contract_id foreign keys are pinned specifically to fm_contracts and
-- all 12 existing rows belong to FM contracts today. AMC has no
-- per-asset register (contract_assets/contract_line_items/
-- service_categories are all FK'd to fm_contracts only), so unlike the
-- FM tables these have no asset_id/service_category_id/
-- contract_line_item_id columns — scheduling here is contract-level.

create table public.amc_ppm_schedules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  schedule_name text not null,
  frequency text,
  interval_months integer,
  start_date date,
  end_date date,
  active boolean not null default true,
  instructions text,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.amc_ppm_visits (
  id uuid primary key default gen_random_uuid(),
  ppm_schedule_id uuid references public.amc_ppm_schedules(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  planned_date date not null,
  due_date date,
  assigned_team text,
  status text not null default 'Planned',
  work_order_id uuid references public.work_orders(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index amc_ppm_schedules_contract_id_idx on public.amc_ppm_schedules(contract_id);
create index amc_ppm_visits_contract_id_idx on public.amc_ppm_visits(contract_id);
create index amc_ppm_visits_schedule_id_idx on public.amc_ppm_visits(ppm_schedule_id);
create index amc_ppm_visits_planned_date_idx on public.amc_ppm_visits(planned_date);

alter table public.amc_ppm_schedules enable row level security;
alter table public.amc_ppm_visits enable row level security;

-- Same permission model as ppm_schedules/ppm_visits: the "contracts"
-- module's view/add/edit/delete permissions gate everything. No
-- employee-self policies (unlike ppm_visits' self-insert/self-update) —
-- there's no AMC mobile-app employee flow this feeds today, so that
-- dimension isn't needed.
create policy amc_ppm_schedules_select on public.amc_ppm_schedules
  for select using (app_private.can(auth.uid(), 'contracts', 'view'));
create policy amc_ppm_schedules_insert on public.amc_ppm_schedules
  for insert with check (app_private.can(auth.uid(), 'contracts', 'add'));
create policy amc_ppm_schedules_update on public.amc_ppm_schedules
  for update using (app_private.can(auth.uid(), 'contracts', 'edit'))
  with check (app_private.can(auth.uid(), 'contracts', 'edit'));
create policy amc_ppm_schedules_delete on public.amc_ppm_schedules
  for delete using (app_private.can(auth.uid(), 'contracts', 'delete'));

create policy amc_ppm_visits_select on public.amc_ppm_visits
  for select using (app_private.can(auth.uid(), 'contracts', 'view'));
create policy amc_ppm_visits_insert on public.amc_ppm_visits
  for insert with check (app_private.can(auth.uid(), 'contracts', 'add'));
create policy amc_ppm_visits_update on public.amc_ppm_visits
  for update using (app_private.can(auth.uid(), 'contracts', 'edit'))
  with check (app_private.can(auth.uid(), 'contracts', 'edit'));
create policy amc_ppm_visits_delete on public.amc_ppm_visits
  for delete using (app_private.can(auth.uid(), 'contracts', 'delete'));
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: evcaehadjzoxtdlnmehk`, name `amc_ppm_scheduling`, and the SQL above. **Ask the user to confirm before applying** — this creates new production tables, matching the confirmation pattern used for every schema change this session.

- [ ] **Step 3: Verify**

Via the Supabase MCP `execute_sql` tool:

```sql
select table_name from information_schema.tables
where table_name in ('amc_ppm_schedules', 'amc_ppm_visits');

select count(*) from pg_policies
where tablename in ('amc_ppm_schedules', 'amc_ppm_visits');
```

Expected: 2 tables, 8 policies (4 per table).

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\dell\OneDrive\Desktop\bizjoy-dashboard"
git add supabase/migrations/20260918120000_amc_ppm_scheduling.sql
git commit -m "feat: add amc_ppm_schedules and amc_ppm_visits tables

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Generic `SchedulingCalendar` component

**Files:**
- Create: `src/components/scheduling-calendar.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarView = "month" | "week";

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle?: string;
  colorClass: string; // tailwind classes for the chip background/text
};

type SchedulingCalendarProps = {
  view: CalendarView;
  referenceDate: Date;
  events: CalendarEvent[];
  onReferenceDateChange: (date: Date) => void;
  onDayClick: (isoDate: string) => void;
  onEventClick: (event: CalendarEvent) => void;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

function buildMonthGrid(referenceDate: Date): Date[] {
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

function buildWeekGrid(referenceDate: Date): Date[] {
  const gridStart = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    return day;
  });
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SchedulingCalendar({
  view,
  referenceDate,
  events,
  onReferenceDateChange,
  onDayClick,
  onEventClick,
}: SchedulingCalendarProps) {
  const days = useMemo(
    () => (view === "month" ? buildMonthGrid(referenceDate) : buildWeekGrid(referenceDate)),
    [view, referenceDate],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const todayIso = toIsoDate(new Date());
  const currentMonth = referenceDate.getMonth();

  function step(amount: number) {
    const next = new Date(referenceDate);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else next.setDate(next.getDate() + amount * 7);
    onReferenceDateChange(next);
  }

  const label =
    view === "month"
      ? referenceDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} \u2013 ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{label}</h3>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReferenceDateChange(new Date())}>
            Today
          </Button>
          <Button size="icon" variant="outline" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {WEEKDAY_LABELS.map((weekday) => (
          <div
            key={weekday}
            className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground text-center"
          >
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const iso = toIsoDate(day);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isOtherMonth = view === "month" && day.getMonth() !== currentMonth;
          const isToday = iso === todayIso;
          const visibleEvents = view === "month" ? dayEvents.slice(0, 3) : dayEvents;
          const overflow = dayEvents.length - visibleEvents.length;

          return (
            <div
              key={iso}
              onClick={() => onDayClick(iso)}
              className={cn(
                "bg-background p-1.5 flex flex-col gap-1 min-h-24 hover:bg-muted/50 transition-colors cursor-pointer",
                view === "week" && "min-h-40",
                isOtherMonth && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {day.getDate()}
              </span>
              <div className="space-y-0.5">
                {visibleEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    title={event.subtitle ? `${event.title} \u2014 ${event.subtitle}` : event.title}
                    className={cn(
                      "block w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate cursor-pointer",
                      event.colorClass,
                    )}
                  >
                    {event.title}
                  </button>
                ))}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Note the day cell is a plain `<div onClick>`, not a `<button>` — event chips inside it are real `<button>` elements with `stopPropagation`. Nesting a `<button>` inside a `<button>` is invalid HTML and behaves inconsistently across browsers; a `<div>` outer with `<button>` children avoids that.

- [ ] **Step 2: Typecheck**

```bash
cd "C:\Users\dell\OneDrive\Desktop\bizjoy-dashboard"
npx tsc --noEmit -p .
```

Expected: no new errors (this file has no consumers yet, so it should just compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/scheduling-calendar.tsx
git commit -m "feat: add generic SchedulingCalendar month/week grid component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: AMC Scheduling page — data, List mode, sidebar entry

This task builds the page's data layer and the List-mode UI (PPM
schedules table + create/edit dialog, PPM visits table, cleaning-dates
card), plus adds the page to the sidebar so it's reachable while Task 4
(Calendar mode) is still being built.

**Files:**
- Create: `src/routes/_authenticated/amc-scheduling.tsx`
- Modify: `src/components/app-sidebar.tsx:76-100` (AMC Contracts group)

- [ ] **Step 1: Write the route file's data layer and List mode**

```tsx
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Droplets, Pencil, Plus, Trash2, Wind } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { WorkOrderDialog } from "@/components/work-order-dialog";
import { SchedulingCalendar, type CalendarEvent } from "@/components/scheduling-calendar";

export const Route = createFileRoute("/_authenticated/amc-scheduling")({
  component: AmcSchedulingPage,
});

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
  water_tank_cleaning_date: string | null;
  ac_duct_cleaning_date: string | null;
};

type PpmScheduleRow = {
  id: string;
  contract_id: string;
  schedule_name: string;
  frequency: string | null;
  interval_months: number | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  instructions: string | null;
  contracts?: ContractLookup | null;
};

type PpmVisitRow = {
  id: string;
  ppm_schedule_id: string | null;
  contract_id: string;
  planned_date: string;
  due_date: string | null;
  assigned_team: string | null;
  status: string;
  work_order_id: string | null;
  notes: string | null;
  amc_ppm_schedules?: { schedule_name: string } | null;
  contracts?: ContractLookup | null;
};

// Selects every column (`*`) rather than a narrow subset: this same row
// gets passed straight into WorkOrderDialog's `editing` prop when a
// calendar chip is clicked, and that dialog does `setForm({ ...empty,
// ...editing })` — a narrower select here would silently blank out and
// then overwrite (on save) every column not listed, e.g. priority,
// technician_id, problem_reported. Typed loosely since the real shape is
// the full work_orders row plus the joined contract.
type AmcWorkOrderRow = Record<string, unknown> & {
  id: string;
  wo_no: string | null;
  contract_id: string | null;
  scheduled_date: string | null;
  service_type: string | null;
  status: string;
  technician_name: string | null;
  contracts?: ContractLookup | null;
};

const FREQUENCIES = [
  { label: "Monthly", months: 1 },
  { label: "Quarterly", months: 3 },
  { label: "Half Yearly", months: 6 },
  { label: "Annual", months: 12 },
  { label: "Custom", months: 1 },
];
const VISIT_STATUSES = ["Planned", "Scheduled", "Converted", "Completed", "Skipped", "Cancelled"];

function inferIntervalMonths(frequency: string, intervalMonths: string) {
  if (frequency === "Custom") return Math.max(1, Number(intervalMonths) || 1);
  return FREQUENCIES.find((item) => item.label === frequency)?.months ?? 1;
}

function addMonths(isoDate: string, months: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function buildVisitDates(startDate: string, endDate: string, intervalMonths: number) {
  if (!startDate || !endDate) return [];
  const dates: string[] = [];
  let current = startDate;
  let guard = 0;
  while (current <= endDate && guard < 240) {
    dates.push(current);
    current = addMonths(current, intervalMonths);
    guard += 1;
  }
  return dates;
}

function statusClasses(status: string) {
  switch (status) {
    case "Completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Converted":
    case "Scheduled":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "Skipped":
    case "Cancelled":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

const emptyScheduleForm = {
  contract_id: "",
  schedule_name: "",
  frequency: "Quarterly",
  interval_months: "3",
  start_date: "",
  end_date: "",
  active: true,
  instructions: "",
};

const emptyOneOffVisitForm = {
  contract_id: "",
  planned_date: "",
  due_date: "",
  assigned_team: "",
  notes: "",
};

const emptyCleaningForm = {
  contract_id: "",
  water_tank_cleaning_date: "",
  ac_duct_cleaning_date: "",
};

function AmcSchedulingPage() {
  const qc = useQueryClient();
  const [pageMode, setPageMode] = useState<"list" | "calendar">("calendar");
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [referenceDate, setReferenceDate] = useState(new Date());

  const [selectedContractId, setSelectedContractId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<PpmScheduleRow | null>(null);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [oneOffForm, setOneOffForm] = useState(emptyOneOffVisitForm);
  const [savingOneOff, setSavingOneOff] = useState(false);

  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [cleaningForm, setCleaningForm] = useState(emptyCleaningForm);
  const [savingCleaning, setSavingCleaning] = useState(false);

  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);

  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrderEditing, setWorkOrderEditing] = useState<Record<string, unknown> | null>(null);

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

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["amc_ppm_schedules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("amc_ppm_schedules")
        .select("*, contracts:contract_id(id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PpmScheduleRow[];
    },
  });

  const { data: visits = [], isLoading: visitsLoading } = useQuery({
    queryKey: ["amc_ppm_visits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("amc_ppm_visits")
        .select(
          "*, amc_ppm_schedules:ppm_schedule_id(schedule_name), contracts:contract_id(id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date)",
        )
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PpmVisitRow[];
    },
  });

  const { data: scheduledWorkOrders = [] } = useQuery({
    queryKey: ["work_orders-scheduled-amc"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("work_orders")
        .select("*, contracts:contract_id(id, title, contract_no, customer_name, water_tank_cleaning_date, ac_duct_cleaning_date)")
        .eq("module_type", "AMC")
        .not("scheduled_date", "is", null)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AmcWorkOrderRow[];
    },
  });

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const contractMatch = selectedContractId === "all" || visit.contract_id === selectedContractId;
      const statusMatch = selectedStatus === "all" || visit.status === selectedStatus;
      return contractMatch && statusMatch;
    });
  }, [visits, selectedContractId, selectedStatus]);

  const contractsWithCleaningDates = useMemo(
    () => contracts.filter((c) => c.water_tank_cleaning_date || c.ac_duct_cleaning_date),
    [contracts],
  );

  // Unified calendar events from all three sources.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const events: CalendarEvent[] = [];

    for (const visit of visits) {
      const contractLabel = visit.contracts?.contract_no ?? visit.contracts?.customer_name ?? "Contract";
      events.push({
        id: `visit-${visit.id}`,
        date: visit.planned_date,
        title: `PPM: ${contractLabel}`,
        subtitle: visit.status,
        colorClass: "bg-sky-100 text-sky-900",
      });
    }

    for (const contract of contracts) {
      const label = contract.contract_no ?? contract.customer_name ?? "Contract";
      if (contract.water_tank_cleaning_date) {
        events.push({
          id: `water-${contract.id}`,
          date: contract.water_tank_cleaning_date,
          title: `Water Tank: ${label}`,
          colorClass: "bg-cyan-100 text-cyan-900",
        });
      }
      if (contract.ac_duct_cleaning_date) {
        events.push({
          id: `ac-${contract.id}`,
          date: contract.ac_duct_cleaning_date,
          title: `AC Duct: ${label}`,
          colorClass: "bg-violet-100 text-violet-900",
        });
      }
    }

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

  function handleCalendarEventClick(event: CalendarEvent) {
    if (event.id.startsWith("visit-")) {
      const visitId = event.id.slice("visit-".length);
      const visit = visits.find((v) => v.id === visitId);
      if (visit) openOneOffEdit(visit);
      return;
    }
    if (event.id.startsWith("water-") || event.id.startsWith("ac-")) {
      const contractId = event.id.slice(event.id.indexOf("-") + 1);
      const contract = contracts.find((c) => c.id === contractId);
      if (contract) openCleaningEditor(contract);
      return;
    }
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

  // ---- PPM Schedule dialog ----

  function startCreateSchedule() {
    setEditingSchedule(null);
    setScheduleForm({ ...emptyScheduleForm, contract_id: selectedContractId === "all" ? "" : selectedContractId });
    setScheduleOpen(true);
  }

  function startEditSchedule(row: PpmScheduleRow) {
    setEditingSchedule(row);
    setScheduleForm({
      contract_id: row.contract_id,
      schedule_name: row.schedule_name,
      frequency: row.frequency ?? "Quarterly",
      interval_months: row.interval_months != null ? String(row.interval_months) : "3",
      start_date: row.start_date ?? "",
      end_date: row.end_date ?? "",
      active: row.active,
      instructions: row.instructions ?? "",
    });
    setScheduleOpen(true);
  }

  function updateScheduleForm(patch: Partial<typeof emptyScheduleForm>) {
    setScheduleForm((prev) => {
      const next = { ...prev, ...patch };
      if ("frequency" in patch && patch.frequency !== "Custom") {
        next.interval_months = String(inferIntervalMonths(patch.frequency ?? "Quarterly", prev.interval_months));
      }
      return next;
    });
  }

  async function saveSchedule() {
    if (!scheduleForm.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!scheduleForm.schedule_name.trim()) {
      toast.error("Enter a schedule name");
      return;
    }
    setSavingSchedule(true);
    try {
      const payload = {
        contract_id: scheduleForm.contract_id,
        schedule_name: scheduleForm.schedule_name.trim(),
        frequency: scheduleForm.frequency || null,
        interval_months: inferIntervalMonths(scheduleForm.frequency, scheduleForm.interval_months),
        start_date: scheduleForm.start_date || null,
        end_date: scheduleForm.end_date || null,
        active: scheduleForm.active,
        instructions: scheduleForm.instructions.trim() || null,
      };
      const query = editingSchedule
        ? (supabase as any).from("amc_ppm_schedules").update(payload).eq("id", editingSchedule.id)
        : (supabase as any).from("amc_ppm_schedules").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editingSchedule ? "PPM schedule updated" : "PPM schedule added");
      setScheduleOpen(false);
      qc.invalidateQueries({ queryKey: ["amc_ppm_schedules"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule(row: PpmScheduleRow) {
    const { error } = await (supabase as any).from("amc_ppm_schedules").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("PPM schedule deleted");
    qc.invalidateQueries({ queryKey: ["amc_ppm_schedules"] });
    qc.invalidateQueries({ queryKey: ["amc_ppm_visits"] });
  }

  async function generateVisits(schedule: PpmScheduleRow) {
    if (!schedule.start_date || !schedule.end_date) {
      toast.error("Set start and end dates before generating visits");
      return;
    }
    setGeneratingId(schedule.id);
    try {
      const intervalMonths = Math.max(1, Number(schedule.interval_months) || 1);
      const dates = buildVisitDates(schedule.start_date, schedule.end_date, intervalMonths);
      if (dates.length === 0) {
        toast.error("No visit dates generated");
        return;
      }
      const existing = visits.filter((v) => v.ppm_schedule_id === schedule.id);
      const existingDates = new Set(existing.map((v) => v.planned_date));
      const rows = dates
        .filter((date) => !existingDates.has(date))
        .map((date) => ({
          ppm_schedule_id: schedule.id,
          contract_id: schedule.contract_id,
          planned_date: date,
          due_date: date,
          status: "Planned",
          notes: schedule.instructions,
        }));
      if (rows.length === 0) {
        toast.info("All visits already exist for this schedule");
        return;
      }
      const { error } = await (supabase as any).from("amc_ppm_visits").insert(rows);
      if (error) throw error;
      toast.success(`Generated ${rows.length} PPM visits`);
      qc.invalidateQueries({ queryKey: ["amc_ppm_visits"] });
    } catch (error: any) {
      toast.error(error.message ?? "Visit generation failed");
    } finally {
      setGeneratingId(null);
    }
  }

  // ---- One-off PPM visit dialog (also used for editing any visit) ----

  function openOneOffCreate(prefillDate?: string, prefillContractId?: string) {
    setOneOffForm({
      ...emptyOneOffVisitForm,
      contract_id: prefillContractId ?? (selectedContractId === "all" ? "" : selectedContractId),
      planned_date: prefillDate ?? "",
      due_date: prefillDate ?? "",
    });
    setOneOffOpen(true);
  }

  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editingVisitStatus, setEditingVisitStatus] = useState("Planned");

  function openOneOffEdit(visit: PpmVisitRow) {
    setEditingVisitId(visit.id);
    setEditingVisitStatus(visit.status);
    setOneOffForm({
      contract_id: visit.contract_id,
      planned_date: visit.planned_date,
      due_date: visit.due_date ?? "",
      assigned_team: visit.assigned_team ?? "",
      notes: visit.notes ?? "",
    });
    setOneOffOpen(true);
  }

  async function saveOneOffVisit() {
    if (!oneOffForm.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!oneOffForm.planned_date) {
      toast.error("Select a planned date");
      return;
    }
    setSavingOneOff(true);
    try {
      const payload: Record<string, unknown> = {
        contract_id: oneOffForm.contract_id,
        planned_date: oneOffForm.planned_date,
        due_date: oneOffForm.due_date || oneOffForm.planned_date,
        assigned_team: oneOffForm.assigned_team.trim() || null,
        notes: oneOffForm.notes.trim() || null,
      };
      if (editingVisitId) {
        payload.status = editingVisitStatus;
        const { error } = await (supabase as any).from("amc_ppm_visits").update(payload).eq("id", editingVisitId);
        if (error) throw error;
        toast.success("PPM visit updated");
      } else {
        payload.status = "Planned";
        payload.ppm_schedule_id = null;
        const { error } = await (supabase as any).from("amc_ppm_visits").insert(payload);
        if (error) throw error;
        toast.success("PPM visit scheduled");
      }
      setOneOffOpen(false);
      setEditingVisitId(null);
      qc.invalidateQueries({ queryKey: ["amc_ppm_visits"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSavingOneOff(false);
    }
  }

  // ---- Cleaning date dialog ----

  function openCleaningEditor(contract: ContractLookup) {
    setCleaningForm({
      contract_id: contract.id,
      water_tank_cleaning_date: contract.water_tank_cleaning_date ?? "",
      ac_duct_cleaning_date: contract.ac_duct_cleaning_date ?? "",
    });
    setCleaningOpen(true);
  }

  async function saveCleaningDates() {
    if (!cleaningForm.contract_id) {
      toast.error("Select a contract");
      return;
    }
    setSavingCleaning(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({
          water_tank_cleaning_date: cleaningForm.water_tank_cleaning_date || null,
          ac_duct_cleaning_date: cleaningForm.ac_duct_cleaning_date || null,
        })
        .eq("id", cleaningForm.contract_id);
      if (error) throw error;
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

  function closeDayPicker() {
    setDayPickerDate(null);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AMC Scheduling</h1>
          <p className="text-muted-foreground">
            Plan recurring PPM visits, cleaning dates, and scheduled work orders across AMC contracts.
          </p>
        </div>
        <Tabs value={pageMode} onValueChange={(v) => setPageMode(v as "list" | "calendar")}>
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {pageMode === "calendar" ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Tabs value={calendarView} onValueChange={(v) => setCalendarView(v as "month" | "week")}>
              <TabsList>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-200" /> PPM Visit</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-200" /> Water Tank</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-200" /> AC Duct</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200" /> Work Order</span>
            </div>
          </div>
          <SchedulingCalendar
            view={calendarView}
            referenceDate={referenceDate}
            events={calendarEvents}
            onReferenceDateChange={setReferenceDate}
            onDayClick={(iso) => setDayPickerDate(iso)}
            onEventClick={handleCalendarEventClick}
          />
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={startCreateSchedule}>
              <Plus className="h-4 w-4 mr-2" /> Add PPM Schedule
            </Button>
          </div>

          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contract</Label>
                <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {(contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Visit Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {VISIT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">PPM Schedules</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : schedules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No PPM schedules found.</TableCell>
                  </TableRow>
                ) : (
                  schedules
                    .filter((s) => selectedContractId === "all" || s.contract_id === selectedContractId)
                    .map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell>
                          <div className="font-medium">{schedule.schedule_name}</div>
                          {!schedule.active && <div className="text-xs text-muted-foreground">Inactive</div>}
                        </TableCell>
                        <TableCell>{schedule.contracts?.contract_no ?? schedule.contracts?.customer_name ?? "\u2014"}</TableCell>
                        <TableCell>
                          {schedule.frequency ?? "\u2014"}
                          {schedule.interval_months ? ` / ${schedule.interval_months} mo` : ""}
                        </TableCell>
                        <TableCell>{schedule.start_date ?? "\u2014"} to {schedule.end_date ?? "\u2014"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => generateVisits(schedule)} disabled={generatingId === schedule.id}>
                              <CalendarDays className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => startEditSchedule(schedule)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this PPM schedule?</AlertDialogTitle>
                                  <AlertDialogDescription>Linked generated visits are also removed.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeSchedule(schedule)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">PPM Visits</h2>
              <Button size="sm" variant="outline" onClick={() => openOneOffCreate()}>
                <Plus className="h-4 w-4 mr-1" /> Add One-off Visit
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Planned Date</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Assigned Team</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filteredVisits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No PPM visits found.</TableCell>
                  </TableRow>
                ) : (
                  filteredVisits.map((visit) => (
                    <TableRow key={visit.id} className="cursor-pointer" onClick={() => openOneOffEdit(visit)}>
                      <TableCell>{visit.planned_date}</TableCell>
                      <TableCell>{visit.amc_ppm_schedules?.schedule_name ?? "One-off"}</TableCell>
                      <TableCell>{visit.contracts?.contract_no ?? visit.contracts?.customer_name ?? "\u2014"}</TableCell>
                      <TableCell>{visit.assigned_team ?? "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-medium", statusClasses(visit.status))}>
                          {visit.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Cleaning Dates</h2>
              <Select value="" onValueChange={(contractId) => {
                const contract = contracts.find((c) => c.id === contractId);
                if (contract) openCleaningEditor(contract);
              }}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Set dates for a contract..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead><Droplets className="h-3.5 w-3.5 inline mr-1" />Water Tank Cleaning</TableHead>
                  <TableHead><Wind className="h-3.5 w-3.5 inline mr-1" />AC Duct Cleaning</TableHead>
                  <TableHead className="w-16 text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractsWithCleaningDates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No contracts have cleaning dates set yet. Use the selector above to add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  contractsWithCleaningDates.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell>{contract.contract_no ?? contract.customer_name ?? "\u2014"}</TableCell>
                      <TableCell>{contract.water_tank_cleaning_date ?? "\u2014"}</TableCell>
                      <TableCell>{contract.ac_duct_cleaning_date ?? "\u2014"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openCleaningEditor(contract)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* PPM Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? "Edit PPM Schedule" : "Add PPM Schedule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Contract *</Label>
              <Select value={scheduleForm.contract_id || undefined} onValueChange={(v) => updateScheduleForm({ contract_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contract..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Schedule Name *</Label>
              <Input value={scheduleForm.schedule_name} onChange={(e) => updateScheduleForm({ schedule_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select value={scheduleForm.frequency} onValueChange={(v) => updateScheduleForm({ frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.label} value={f.label}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Interval Months</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={scheduleForm.interval_months}
                onChange={(e) => updateScheduleForm({ interval_months: e.target.value })}
                disabled={scheduleForm.frequency !== "Custom"}
              />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={scheduleForm.start_date} onChange={(e) => updateScheduleForm({ start_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={scheduleForm.end_date} onChange={(e) => updateScheduleForm({ end_date: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm pt-7">
              <input type="checkbox" checked={scheduleForm.active} onChange={(e) => updateScheduleForm({ active: e.target.checked })} />
              Active schedule
            </label>
            <div className="space-y-1 md:col-span-2">
              <Label>Instructions</Label>
              <Textarea rows={3} value={scheduleForm.instructions} onChange={(e) => updateScheduleForm({ instructions: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={saveSchedule} disabled={savingSchedule}>{savingSchedule ? "Saving..." : "Save PPM Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-off PPM visit dialog (also used to edit any visit) */}
      <Dialog open={oneOffOpen} onOpenChange={(v) => { setOneOffOpen(v); if (!v) setEditingVisitId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVisitId ? "Edit PPM Visit" : "Schedule PPM Visit"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <Label>Contract *</Label>
              <Select
                value={oneOffForm.contract_id || undefined}
                onValueChange={(v) => setOneOffForm((prev) => ({ ...prev, contract_id: v }))}
                disabled={Boolean(editingVisitId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") + (contract.customer_name ?? contract.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Planned Date *</Label>
                <Input type="date" value={oneOffForm.planned_date} onChange={(e) => setOneOffForm((prev) => ({ ...prev, planned_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={oneOffForm.due_date} onChange={(e) => setOneOffForm((prev) => ({ ...prev, due_date: e.target.value }))} />
              </div>
            </div>
            {editingVisitId && (
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editingVisitStatus} onValueChange={setEditingVisitStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Assigned Team</Label>
              <Input value={oneOffForm.assigned_team} onChange={(e) => setOneOffForm((prev) => ({ ...prev, assigned_team: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={3} value={oneOffForm.notes} onChange={(e) => setOneOffForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOneOffOpen(false)}>Cancel</Button>
            <Button onClick={saveOneOffVisit} disabled={savingOneOff}>{savingOneOff ? "Saving..." : "Save Visit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleaning date dialog */}
      <Dialog open={cleaningOpen} onOpenChange={setCleaningOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Cleaning Dates</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <Label>Water Tank Cleaning Date</Label>
              <Input
                type="date"
                value={cleaningForm.water_tank_cleaning_date}
                onChange={(e) => setCleaningForm((prev) => ({ ...prev, water_tank_cleaning_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>AC Duct Cleaning Date</Label>
              <Input
                type="date"
                value={cleaningForm.ac_duct_cleaning_date}
                onChange={(e) => setCleaningForm((prev) => ({ ...prev, ac_duct_cleaning_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleaningOpen(false)}>Cancel</Button>
            <Button onClick={saveCleaningDates} disabled={savingCleaning}>{savingCleaning ? "Saving..." : "Save Dates"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day-click picker: choose contract + type, then open the right dialog */}
      <Dialog open={dayPickerDate !== null} onOpenChange={(v) => !v && closeDayPicker()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule something on {dayPickerDate}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                const date = dayPickerDate!;
                closeDayPicker();
                openOneOffCreate(date);
              }}
            >
              <CalendarDays className="h-4 w-4 mr-2" /> PPM Visit
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                closeDayPicker();
                setCleaningForm({ ...emptyCleaningForm });
                setCleaningOpen(true);
              }}
            >
              <Droplets className="h-4 w-4 mr-2" /> Water Tank / AC Duct Cleaning
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                const date = dayPickerDate!;
                closeDayPicker();
                setWorkOrderEditing({ scheduled_date: date });
                setWorkOrderOpen(true);
              }}
            >
              <Wind className="h-4 w-4 mr-2" /> Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WorkOrderDialog
        open={workOrderOpen}
        onOpenChange={(v) => {
          setWorkOrderOpen(v);
          if (!v) setWorkOrderEditing(null);
        }}
        editing={workOrderEditing}
        moduleType="AMC"
      />
    </div>
  );
}
```

A few notes on choices made here, so a reviewer isn't surprised:

- The day-click "Water Tank / AC Duct Cleaning" option opens the cleaning
  dialog WITHOUT a pre-filled contract (it needs the user to pick one from
  the dropdown, since there's no dedicated per-day cleaning-date select in
  this quick dialog) — the cleaning date fields themselves don't take a
  "date" prefill from the clicked day either, since a contract can have
  both a water tank AND an AC duct date and the day-click can't know which
  one you mean. This is a minor UX rough edge — acceptable for a first
  pass; the "Cleaning Dates" card's own row-level edit button and the
  contract-selector-triggered flow both work precisely.
- `WorkOrderDialog`'s `editing` prop is reused for prefill: passing
  `{ scheduled_date: date }` (no `id`) makes the dialog treat it as
  "new, with defaults overridden" per its own `setForm({ ...empty,
  ...editing, ... })` logic (see `work-order-dialog.tsx:174-180`) — the
  save path correctly goes through `.insert(...)` since `editing?.id` is
  undefined. No changes to `WorkOrderDialog` itself are needed.
- When editing an *existing* work order clicked from the calendar, the
  full row must be passed in, not just the few columns needed for the
  chip label — `WorkOrderDialog` does `setForm({ ...empty, ...editing })`
  and on save writes every field in `form` back out, so a narrow select
  would silently blank fields like `priority`/`technician_id`/
  `problem_reported` and overwrite them with empty values on the next
  save. `scheduledWorkOrders` below selects `*` for exactly this reason
  — don't narrow that select even though the calendar chip itself only
  needs `wo_no`/`scheduled_date`/`service_type`/`status`.
- Clicking a calendar chip for a completed/converted PPM visit still
  opens the same edit dialog — there's no read-only mode distinction in
  this pass, matching how simple the rest of this app's dialogs are.

- [ ] **Step 2: Add the page to the sidebar**

In `src/components/app-sidebar.tsx`, in the "AMC Contracts" group's
`children` array (currently lines 70-74), add a new entry right after
"AMC Contracts":

```ts
    children: [
      { title: "AMC Contracts", url: "/amc-contracts", module: "contracts" },
      { title: "AMC Scheduling", url: "/amc-scheduling", module: "contracts" },
      { title: "AMC Work Orders", url: "/amc-work-orders", module: "service" },
      { title: "AMC Work Completion Reports", url: "/amc-service-reports", module: "service" },
    ],
```

- [ ] **Step 3: Typecheck**

```bash
cd "C:\Users\dell\OneDrive\Desktop\bizjoy-dashboard"
npx tsc --noEmit -p .
```

Expected: no errors. If `WorkOrderDialog`'s `editing` prop type doesn't
accept a partial object without `id`/other required fields, loosen it —
check `src/components/work-order-dialog.tsx:48-52`'s `Props` type
(`editing: any | null` — it's already untyped `any`, so no change should
be needed there).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/amc-scheduling.tsx src/components/app-sidebar.tsx
git commit -m "feat: add AMC Scheduling page with PPM schedules, visits, and cleaning dates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dashboard**

```bash
cd "C:\Users\dell\OneDrive\Desktop\bizjoy-dashboard"
npm run dev
```

Log in, navigate to HR → wait, navigate to **AMC Contracts → AMC
Scheduling** in the sidebar.

- [ ] **Step 2: Create a PPM schedule and generate visits**

Switch to List mode, click "Add PPM Schedule", fill in a contract,
schedule name, Quarterly frequency, a start date, and an end date ~1
year out. Save. Click the calendar-days icon on the new row to generate
visits. Confirm the "PPM Visits" table below now shows 4 rows at
3-month intervals.

- [ ] **Step 3: Confirm the visits show on the calendar**

Switch to Calendar mode. Confirm the generated visits appear as sky-blue
chips on their planned dates in Month view. Switch to Week view and
navigate to a week containing one of the visits; confirm it appears
there too.

- [ ] **Step 4: Click a day to schedule a Work Order**

Click an empty day, choose "Work Order," confirm the standard
`WorkOrderDialog` opens with **Scheduled Date already filled in** with
the clicked day. Fill in a contract and save. Confirm it now appears on
the calendar as an amber chip on that day, and also shows up normally
on the existing `/amc-work-orders` page.

- [ ] **Step 5: Set a cleaning date and confirm it appears**

In List mode, use the "Cleaning Dates" card's contract selector to set
a Water Tank Cleaning Date for a contract. Confirm it appears in Month
view as a cyan chip, and clicking that chip reopens the same dialog
with the date pre-filled.

- [ ] **Step 6: Confirm clicking an existing PPM visit chip opens it for editing**

Click one of the sky-blue PPM visit chips on the calendar. Confirm the
"Edit PPM Visit" dialog opens with the right contract/date, change its
status to "Completed," save, and confirm the change is reflected both
on the calendar (if you re-open it) and in the List mode's PPM Visits
table.
