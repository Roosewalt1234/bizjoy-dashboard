/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateSlaStatus, statusBadgeClasses } from "@/lib/fm-sla";
import { todayIso } from "@/lib/fm-manpower";
import { convertPpmVisitToFmWorkOrder } from "@/lib/fm-ppm-convert";

export const Route = createFileRoute("/_authenticated/fm-daily-operations")({
  head: () => ({
    meta: [
      { title: "FM Daily Operations — Fiz Fix ERP" },
      {
        name: "description",
        content:
          "Daily site operations control room for FM contracts: attendance, PPM, work orders, SLA, cleaning checks and reporting.",
      },
      { property: "og:title", content: "FM Daily Operations — Fiz Fix ERP" },
      {
        property: "og:description",
        content: "What needs attention today at your FM site, in one screen.",
      },
    ],
  }),
  component: FmDailyOperationsPage,
});

const fmDb = supabase as any;

type ChecklistTask = { id?: string; area: string; task: string; sort_order?: number };

// Fallback used only when a contract has no checklist template rows yet.
const DEFAULT_CLEANING_TASKS: ChecklistTask[] = [
  { area: "Common Areas", task: "Lobby cleaned" },
  { area: "Common Areas", task: "Corridors cleaned" },
  { area: "Common Areas", task: "Lifts cleaned" },
  { area: "External", task: "Parking area cleaned" },
  { area: "Waste", task: "Garbage room cleaned" },
  { area: "Amenities", task: "Gym / washroom / common areas checked" },
  { area: "Materials", task: "Chemicals / tools available" },
  { area: "Materials", task: "Air fresheners / water checked" },
];

const CHECK_STATUSES = ["Pending", "Completed", "Not Applicable", "Issue Found"];


function fmt(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function weekBounds(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Monday start
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function monthBounds(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function StatCard({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: any;
  rows: { label: string; value: React.ReactNode; tone?: "danger" | "warn" | "ok" }[];
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span
              className={
                r.tone === "danger"
                  ? "font-semibold text-destructive"
                  : r.tone === "warn"
                    ? "font-semibold text-amber-600"
                    : r.tone === "ok"
                      ? "font-semibold text-emerald-600"
                      : "font-medium"
              }
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FmDailyOperationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [contractId, setContractId] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [busy, setBusy] = useState(false);

  const week = weekBounds(date);
  const month = monthBounds(date);

  const { data: contracts = [] } = useQuery({
    queryKey: ["fm-ops-contracts"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contracts")
        .select(
          "id, title, contract_no, customer_name, site_name, start_date, end_date, value, billing_cycle, status",
        )
        .eq("module_type", "FM")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeContractId = contractId || (contracts[0]?.id ?? "");
  const contract = contracts.find((c: any) => c.id === activeContractId) ?? null;

  const enabled = Boolean(activeContractId);

  const { data: plans = [] } = useQuery({
    queryKey: ["fm-ops-plans", activeContractId],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_manpower_plans")
        .select("id, role_name, designation, shift_name, required_headcount, active")
        .eq("contract_id", activeContractId)
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["fm-ops-attendance", activeContractId, date],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("attendance_logs")
        .select("id, employee_name, shift, status, check_in, check_out, remarks")
        .eq("contract_id", activeContractId)
        .eq("attendance_date", date)
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["fm-ops-wos", activeContractId],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("work_orders")
        .select(
          "id, wo_no, priority, request_type, status, response_sla_status, completion_sla_status, completion_due_at, scheduled_date, technician_name, location, contract_assets(asset_tag, description)",
        )
        .eq("contract_id", activeContractId)
        .eq("module_type", "FM")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ppmVisits = [] } = useQuery({
    queryKey: ["fm-ops-ppm", activeContractId],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("ppm_visits")
        .select(
          "id, planned_date, due_date, status, assigned_team, work_order_id, completed_at, service_categories(name), contract_assets(asset_tag)",
        )
        .eq("contract_id", activeContractId)
        .order("planned_date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: weekly = [] } = useQuery({
    queryKey: ["fm-ops-weekly", activeContractId, week.start],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("weekly_reports")
        .select("id, report_no, status, week_start, week_end")
        .eq("contract_id", activeContractId)
        .lte("week_start", week.end)
        .gte("week_end", week.start)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["fm-ops-monthly", activeContractId, month.start],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("monthly_reports")
        .select("id, report_no, status, month_start, month_end")
        .eq("contract_id", activeContractId)
        .lte("month_start", month.end)
        .gte("month_end", month.start)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: packs = [] } = useQuery({
    queryKey: ["fm-ops-packs", activeContractId, month.start],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("invoice_packs")
        .select("id, invoice_no, invoice_number, status, period_start, period_end, net_payable")
        .eq("contract_id", activeContractId)
        .lte("period_start", month.end)
        .gte("period_end", month.start)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: checks = [] } = useQuery({
    queryKey: ["fm-ops-checks", activeContractId, date],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("fm_daily_cleaning_checks")
        .select("id, area, task_name, status, remarks, checked_by")
        .eq("fm_contract_id", activeContractId)
        .eq("check_date", date)
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: checklistTemplates = [] } = useQuery({
    queryKey: ["fm-ops-checklist-templates", activeContractId],
    enabled,
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("fm_cleaning_checklist_templates")
        .select("id, area, task_name, default_priority, is_active, sort_order")
        .eq("fm_contract_id", activeContractId)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ---------------- derived ---------------- */


  const plannedHeadcount = useMemo(
    () =>
      plans
        .filter((p: any) => p.active !== false)
        .reduce((sum: number, p: any) => sum + Number(p.required_headcount ?? 0), 0),
    [plans],
  );
  const present = attendance.filter((a: any) =>
    ["Present", "Overtime", "Late"].includes(a.status),
  ).length;
  const absent = attendance.filter((a: any) =>
    ["Absent", "Leave", "Sick Leave"].includes(a.status),
  ).length;
  const coverage = plannedHeadcount ? Math.round((present / plannedHeadcount) * 100) : 0;

  const openWos = workOrders.filter(
    (w: any) => !["Completed", "Closed", "Cancelled"].includes(w.status),
  );
  const urgentWos = openWos.filter((w: any) =>
    ["P1 Critical", "P2 High", "Emergency", "Urgent", "High"].includes(w.priority),
  );
  const slaOf = (w: any) => w.completion_sla_status ?? w.response_sla_status ?? "Not Started";
  const breachedWos = openWos.filter((w: any) => slaOf(w) === "Breached");
  const atRiskWos = openWos.filter((w: any) => slaOf(w) === "At Risk");
  const onTrackWos = openWos.filter((w: any) =>
    ["Within SLA", "Not Started", "Not Applicable"].includes(slaOf(w)),
  );

  const isDone = (v: any) => ["Completed", "Closed", "Verified"].includes(v.status);
  const ppmDate = (v: any) => v.due_date ?? v.planned_date;
  const ppmDueToday = ppmVisits.filter((v: any) => ppmDate(v) === date && !isDone(v));
  const ppmDueWeek = ppmVisits.filter(
    (v: any) => ppmDate(v) >= week.start && ppmDate(v) <= week.end && !isDone(v),
  );
  // Schedule based: a PPM visit is only overdue once its scheduled day has passed.
  const ppmOverdue = ppmVisits.filter((v: any) => ppmDate(v) < date && !isDone(v));
  const ppmCompletedMonth = ppmVisits.filter(
    (v: any) => isDone(v) && ppmDate(v) >= month.start && ppmDate(v) <= month.end,
  );

  const weeklyReport = weekly[0] ?? null;
  const monthlyReport = monthly[0] ?? null;
  const invoicePack = packs[0] ?? null;

  const checkByTask = useMemo(() => {
    const map = new Map<string, any>();
    checks.forEach((c: any) => map.set(c.task_name, c));
    return map;
  }, [checks]);

  // Daily checklist comes from the contract's template rows; existing checks
  // for the day are reused (never duplicated) and legacy rows stay visible.
  const cleaningTasks: ChecklistTask[] = useMemo(() => {
    const active = (checklistTemplates as any[]).filter((t) => t.is_active !== false);
    const base: ChecklistTask[] = active.length
      ? active.map((t) => ({
          id: t.id,
          area: t.area ?? "General",
          task: t.task_name,
          sort_order: t.sort_order ?? 0,
        }))
      : DEFAULT_CLEANING_TASKS;
    const names = new Set(base.map((t) => t.task));
    const legacy = (checks as any[])
      .filter((c) => !names.has(c.task_name))
      .map((c) => ({ area: c.area ?? "General", task: c.task_name }));
    return [...base, ...legacy];
  }, [checklistTemplates, checks]);

  const cleaningDone = cleaningTasks.filter(
    (t) => checkByTask.get(t.task)?.status === "Completed",
  ).length;


  /* ---------------- actions ---------------- */

  async function saveCheck(task: { area: string; task: string }, patch: Record<string, any>) {
    if (!activeContractId) return;
    const existing = checkByTask.get(task.task);
    const payload = {
      fm_contract_id: activeContractId,
      check_date: date,
      area: task.area,
      task_name: task.task,
      status: existing?.status ?? "Pending",
      remarks: existing?.remarks ?? null,
      ...patch,
    };
    const { error } = existing
      ? await fmDb.from("fm_daily_cleaning_checks").update(payload).eq("id", existing.id)
      : await fmDb.from("fm_daily_cleaning_checks").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["fm-ops-checks", activeContractId, date] });
  }

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["fm-ops-attendance"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-wos"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-ppm"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-checks"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-checklist-templates"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-weekly"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-monthly"] });
    qc.invalidateQueries({ queryKey: ["fm-ops-packs"] });
    setLastRefresh(new Date());
  }

  /* ---- deep links ---- */
  const openAttendance = (add?: boolean) =>
    navigate({
      to: "/fm-attendance",
      search: { contract_id: activeContractId, date, ...(add ? { add: "1" } : {}) },
    });
  const openPpm = (visitId?: string) =>
    navigate({
      to: "/fm-ppm",
      search: { contract_id: activeContractId, ...(visitId ? { visit_id: visitId } : {}) },
    });
  const openWorkOrder = (wo: any) =>
    navigate({
      to: "/fm-work-orders",
      search: wo?.wo_no ? { wo: wo.wo_no } : { wo_id: wo?.id },
    });

  /* ---- attendance quick action ---- */
  async function markFullTeamPresent() {
    if (!activeContractId) return;
    const activePlans = (plans as any[]).filter((p) => p.active !== false);
    if (activePlans.length === 0) {
      toast.error("No manpower plan for this contract");
      return;
    }
    const rows: any[] = [];
    activePlans.forEach((p) => {
      const count = Number(p.required_headcount ?? 0);
      for (let i = 0; i < count; i += 1) {
        rows.push({
          contract_id: activeContractId,
          attendance_date: date,
          employee_name: `${p.designation ?? p.role_name ?? "Staff"}${count > 1 ? ` ${i + 1}` : ""}`,
          shift: p.shift_name ?? null,
          shift_name: p.shift_name ?? null,
          status: "Present",
          source: "Daily Operations",
          remarks: null,
        });
      }
    });
    if (rows.length === 0) {
      toast.error("Planned headcount is zero");
      return;
    }
    if (
      !window.confirm(
        `Create ${rows.length} attendance entries marked Present for ${date}? Remarks can be edited afterwards.`,
      )
    )
      return;
    setBusy(true);
    const { error } = await fmDb.from("attendance_logs").insert(rows);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${rows.length} attendance entries created`);
    refreshAll();
  }

  /* ---- PPM quick action ---- */
  async function convertPpm(visit: any) {
    if (!window.confirm("Create an FM work order for this PPM visit?")) return;
    setBusy(true);
    try {
      const result = await convertPpmVisitToFmWorkOrder({ ...visit, contract_id: activeContractId });
      toast.success(`FM work order ${result.wo_no ?? ""} created`);
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not convert PPM visit");
    } finally {
      setBusy(false);
    }
  }

  /* ---- work order quick actions ---- */
  async function updateWorkOrder(wo: any, kind: "responded" | "completed") {
    const now = new Date().toISOString();
    const patch =
      kind === "responded"
        ? {
            responded_at: now,
            response_sla_status: calculateSlaStatus({
              dueAt: wo.response_due_at,
              actualAt: now,
            }),
            status: "In Progress",
          }
        : {
            completed_at: now,
            completion_sla_status: calculateSlaStatus({
              dueAt: wo.completion_due_at,
              actualAt: now,
            }),
            status: "Completed",
          };
    if (!window.confirm(`Mark ${wo.wo_no ?? "this work order"} as ${kind}?`)) return;
    setBusy(true);
    const { error } = await fmDb
      .from("work_orders")
      .update(patch)
      .eq("id", wo.id)
      .eq("module_type", "FM");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Work order marked ${kind}`);
    refreshAll();
  }



  type ActionItem = {
    rank: number; // lower = more urgent
    priority: "High" | "Medium" | "Low";
    state: string;
    module: string;
    description: string;
    record: string;
    label: string;
    go: () => void;
  };

  const actions = useMemo(() => {
    const list: ActionItem[] = [];

    // 1 — breached / overdue
    ppmOverdue.slice(0, 8).forEach((v: any) =>
      list.push({
        rank: 1,
        priority: "High",
        state: "Overdue",
        module: "PPM",
        description: "Overdue PPM visit",
        record: `${v.service_categories?.name ?? "PPM"} — planned ${ppmDate(v)}`,
        label: "Open PPM",
        go: () => openPpm(v.id),
      }),
    );
    breachedWos.slice(0, 8).forEach((w: any) =>
      list.push({
        rank: 1,
        priority: "High",
        state: "Breached",
        module: "Work Orders",
        description: "SLA breached — close work order",
        record: `${w.wo_no ?? "WO"} · ${w.request_type ?? "-"}`,
        label: "Open Work Order",
        go: () => openWorkOrder(w),
      }),
    );

    // 2 — at risk
    atRiskWos.slice(0, 8).forEach((w: any) =>
      list.push({
        rank: 2,
        priority: "Medium",
        state: "At Risk",
        module: "Work Orders",
        description: "SLA at risk — respond now",
        record: `${w.wo_no ?? "WO"} · ${w.request_type ?? "-"}`,
        label: "Open Work Order",
        go: () => openWorkOrder(w),
      }),
    );
    ppmDueToday.slice(0, 8).forEach((v: any) =>
      list.push({
        rank: 2,
        priority: "Medium",
        state: "Pending",
        module: "PPM",
        description: "PPM visit due today",
        record: `${v.service_categories?.name ?? "PPM"}`,
        label: "Open PPM",
        go: () => openPpm(v.id),
      }),
    );

    // 3 — attendance
    if (attendance.length === 0)
      list.push({
        rank: 3,
        priority: "High",
        state: "Pending",
        module: "Attendance",
        description: `No attendance marked for ${date}`,
        record: `${plannedHeadcount} planned headcount`,
        label: "Add Attendance",
        go: () => openAttendance(true),
      });
    else if (plannedHeadcount && coverage < 100)
      list.push({
        rank: 3,
        priority: "Medium",
        state: "At Risk",
        module: "Attendance",
        description: `Manpower coverage at ${coverage}%`,
        record: `${present}/${plannedHeadcount} present`,
        label: "Open Attendance",
        go: () => openAttendance(),
      });

    // 4 — cleaning
    if (cleaningDone < cleaningTasks.length)
      list.push({
        rank: 4,
        priority: "Medium",
        state: "Pending",
        module: "Cleaning",
        description: "Daily cleaning checklist incomplete",
        record: `${cleaningDone}/${cleaningTasks.length} completed`,
        label: "Mark Checklist",
        go: () => document.getElementById("cleaning-widget")?.scrollIntoView({ behavior: "smooth" }),
      });

    // 5 — reporting / invoicing
    if (!weeklyReport)
      list.push({
        rank: 5,
        priority: "Medium",
        state: "Pending",
        module: "Reporting",
        description: "Prepare weekly report",
        record: `${week.start} to ${week.end}`,
        label: "Generate Report",
        go: () => navigate({ to: "/fm-weekly-reports", search: {} }),
      });
    if (!monthlyReport)
      list.push({
        rank: 5,
        priority: "Medium",
        state: "Pending",
        module: "Reporting",
        description: "Prepare monthly report",
        record: `${month.start} to ${month.end}`,
        label: "Generate Report",
        go: () => navigate({ to: "/fm-monthly-reports", search: {} }),
      });
    if (!invoicePack)
      list.push({
        rank: 6,
        priority: "Low",
        state: "Pending",
        module: "Invoicing",
        description: "Generate current month invoice pack",
        record: `${month.start} to ${month.end}`,
        label: "Open Invoice Pack",
        go: () => navigate({ to: "/fm-invoice-packs", search: {} }),
      });

    return list.sort((a, b) => a.rank - b.rank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attendance.length,
    atRiskWos,
    breachedWos,
    cleaningDone,
    cleaningTasks.length,
    coverage,
    date,
    invoicePack,
    month.end,
    month.start,
    monthlyReport,
    navigate,
    plannedHeadcount,
    ppmDueToday,
    ppmOverdue,
    present,
    week.end,
    week.start,
    weeklyReport,
  ]);

  const stateBadge = (s: string) =>
    s === "Breached" || s === "Overdue"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : s === "At Risk"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : s === "Completed" || s === "On Track"
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : "bg-muted text-muted-foreground";


  const priorityBadge = (p: string) =>
    p === "High"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : p === "Medium"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-muted text-muted-foreground";

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Daily Operations</h1>
          <p className="text-muted-foreground">What needs attention today at this FM site</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">FM Contract</Label>
            <Select value={activeContractId} onValueChange={setContractId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select FM contract" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title ?? c.contract_no ?? "Untitled"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
              className="w-[170px]"
            />
          </div>
          <Button variant="outline" onClick={() => setDate(todayIso())}>
            Today
          </Button>
          <Button variant="outline" onClick={refreshAll} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <span className="text-xs text-muted-foreground pb-2">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>


      {!contract ? (
        <Card className="p-6 text-sm text-muted-foreground">No FM contracts found.</Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Contract"
              icon={FileText}
              rows={[
                { label: "Site", value: contract.title ?? contract.contract_no ?? "—" },
                { label: "Client", value: contract.customer_name ?? "—" },
                {
                  label: "Period",
                  value: `${contract.start_date ?? "—"} → ${contract.end_date ?? "—"}`,
                },
                {
                  label: "Monthly value",
                  value: fmt(Number(contract.value ?? 0) / 12),
                },
              ]}
            />
            <StatCard
              title="Attendance Today"
              icon={Users}
              rows={[
                { label: "Planned manpower", value: plannedHeadcount },
                { label: "Present", value: present, tone: "ok" },
                { label: "Absent", value: absent, tone: absent ? "danger" : undefined },
                {
                  label: "Coverage",
                  value: `${coverage}%`,
                  tone: coverage >= 100 ? "ok" : coverage >= 80 ? "warn" : "danger",
                },
              ]}
            />
            <StatCard
              title="Open Work Orders"
              icon={Wrench}
              rows={[
                { label: "Total open", value: openWos.length },
                {
                  label: "Emergency / urgent",
                  value: urgentWos.length,
                  tone: urgentWos.length ? "warn" : undefined,
                },
                {
                  label: "Breached",
                  value: breachedWos.length,
                  tone: breachedWos.length ? "danger" : undefined,
                },
                {
                  label: "At risk",
                  value: atRiskWos.length,
                  tone: atRiskWos.length ? "warn" : undefined,
                },
              ]}
            />
            <StatCard
              title="PPM Today / This Week"
              icon={CalendarClock}
              rows={[
                { label: "Due today", value: ppmDueToday.length },
                { label: "Due this week", value: ppmDueWeek.length },
                {
                  label: "Overdue",
                  value: ppmOverdue.length,
                  tone: ppmOverdue.length ? "danger" : undefined,
                },
                { label: "Completed this month", value: ppmCompletedMonth.length, tone: "ok" },
              ]}
            />
            <StatCard
              title="SLA Status"
              icon={AlertTriangle}
              rows={[
                { label: "On track", value: onTrackWos.length, tone: "ok" },
                {
                  label: "At risk",
                  value: atRiskWos.length,
                  tone: atRiskWos.length ? "warn" : undefined,
                },
                {
                  label: "Breached",
                  value: breachedWos.length,
                  tone: breachedWos.length ? "danger" : undefined,
                },
              ]}
            />
            <StatCard
              title="Invoice / Reporting"
              icon={ClipboardList}
              rows={[
                { label: "Invoice pack", value: invoicePack?.status ?? "Not created" },
                { label: "Weekly report", value: weeklyReport?.status ?? "Not created" },
                { label: "Monthly report", value: monthlyReport?.status ?? "Not created" },
              ]}
            />
          </div>

          {/* Action list */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Today's Action List</h2>
              <Badge variant="outline">{actions.length} items</Badge>
            </div>
            {actions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Nothing outstanding for this date.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Linked record</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((a, i) => (
                    <TableRow key={`${a.module}-${a.record}-${i}`}>
                      <TableCell>
                        <Badge variant="outline" className={priorityBadge(a.priority)}>
                          {a.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={stateBadge(a.state)}>
                          {a.state}
                        </Badge>
                      </TableCell>
                      <TableCell>{a.module}</TableCell>
                      <TableCell>{a.description}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{a.record}</TableCell>

                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={a.go}>
                          {a.label}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Attendance widget */}
            <Card className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Attendance — {date}</h2>
                {attendance.length === 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={markFullTeamPresent} disabled={busy}>
                      Mark Full Planned Team Present
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAttendance(true)}>
                      Add Attendance Manually
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={stateBadge("Completed")}>
                      Present {present}
                    </Badge>
                    <Badge variant="outline" className={absent ? stateBadge("Breached") : undefined}>
                      Absent {absent}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={stateBadge(coverage >= 100 ? "Completed" : "At Risk")}
                    >
                      Coverage {coverage}%
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openAttendance()}>
                      Open Attendance
                    </Button>
                  </div>
                )}
              </div>
              {attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance marked today</p>
              ) : (

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>In / Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.employee_name ?? "—"}</TableCell>
                        <TableCell>{a.shift ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(a.check_in ?? "—").toString().slice(11, 16)} /{" "}
                          {(a.check_out ?? "—").toString().slice(11, 16)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div>
                <div className="text-sm font-medium mb-1">Planned manpower</div>
                <div className="flex flex-wrap gap-1">
                  {plans.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No manpower plan</span>
                  ) : (
                    plans.map((p: any) => (
                      <Badge key={p.id} variant="secondary">
                        {(p.designation ?? p.role_name) + " × " + (p.required_headcount ?? 0)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </Card>

            {/* PPM widget */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">PPM Visits</h2>
                <Button size="sm" variant="outline" onClick={() => openPpm()}>
                  Open PPM Planner
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Due today: {ppmDueToday.length}</Badge>
                <Badge variant="outline">This week: {ppmDueWeek.length}</Badge>
                <Badge variant="outline" className={priorityBadge(ppmOverdue.length ? "High" : "Low")}>
                  Overdue: {ppmOverdue.length}
                </Badge>
                <Badge variant="outline">Completed this month: {ppmCompletedMonth.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Planned</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...ppmOverdue, ...ppmDueWeek].slice(0, 10).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        No PPM visits due or overdue.
                      </TableCell>
                    </TableRow>
                  ) : (
                    [...ppmOverdue, ...ppmDueWeek].slice(0, 10).map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell>{ppmDate(v)}</TableCell>
                        <TableCell>{v.service_categories?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={stateBadge(
                              ppmDate(v) < date ? "Overdue" : (v.status ?? "Pending"),
                            )}
                          >
                            {ppmDate(v) < date ? "Overdue" : (v.status ?? "Planned")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => openPpm(v.id)}>
                            Open PPM
                          </Button>
                          {!v.work_order_id ? (
                            <Button size="sm" onClick={() => convertPpm(v)} disabled={busy}>
                              Convert to FM WO
                            </Button>
                          ) : null}
                        </TableCell>

                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Work orders / SLA */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">FM Work Orders & SLA</h2>
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/fm-work-orders", search: {} })}>
                Open Work Orders
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO No</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Request type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Quick actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openWos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      No open FM work orders.
                    </TableCell>
                  </TableRow>

                ) : (
                  openWos.slice(0, 25).map((w: any) => {
                    const sla = slaOf(w);
                    const hot = sla === "Breached" || sla === "At Risk";
                    return (
                      <TableRow key={w.id} className={hot ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-medium">{w.wo_no ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              urgentWos.includes(w) ? priorityBadge("High") : priorityBadge("Low")
                            }
                          >
                            {w.priority ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{w.request_type ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {w.contract_assets?.asset_tag ?? w.location ?? "—"}
                        </TableCell>
                        <TableCell>{w.status}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClasses(sla)}>
                            {sla}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {w.completion_due_at
                            ? new Date(w.completion_due_at).toLocaleString()
                            : (w.scheduled_date ?? "—")}
                        </TableCell>
                        <TableCell>{w.technician_name ?? "—"}</TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => openWorkOrder(w)}>
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => updateWorkOrder(w, "responded")}
                          >
                            Mark Responded
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => updateWorkOrder(w, "completed")}
                          >
                            Mark Completed
                          </Button>
                        </TableCell>
                      </TableRow>

                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Cleaning checklist */}
            <Card className="p-4 space-y-3" id="cleaning-widget">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Cleaning / Housekeeping — {date}</h2>
                <Badge variant="outline">
                  {cleaningDone}/{cleaningTasks.length} done
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="w-[160px]">Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cleaningTasks.map((t) => {
                    const row = checkByTask.get(t.task);
                    return (
                      <TableRow key={t.task}>
                        <TableCell className="text-xs text-muted-foreground">{t.area}</TableCell>
                        <TableCell>{t.task}</TableCell>
                        <TableCell>
                          <Select
                            value={row?.status ?? "Pending"}
                            onValueChange={(v) => saveCheck(t, { status: v })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHECK_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            defaultValue={row?.remarks ?? ""}
                            placeholder="Add remarks"
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value !== (row?.remarks ?? "")) saveCheck(t, { remarks: value });
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Reporting shortcuts */}
            <Card className="p-4 space-y-3">
              <h2 className="text-lg font-semibold">Reporting Shortcuts</h2>
              <div className="space-y-2">
                {[
                  {
                    title: "Weekly Report",
                    period: `${week.start} → ${week.end}`,
                    status: weeklyReport?.status ?? "Not created",
                    ref: weeklyReport?.report_no,
                    label: weeklyReport ? "Open Weekly Report" : "Create Weekly Report",
                    to: "/fm-weekly-reports" as const,
                    search: weeklyReport ? { report_id: weeklyReport.id } : {},
                  },
                  {
                    title: "Monthly Report",
                    period: `${month.start} → ${month.end}`,
                    status: monthlyReport?.status ?? "Not created",
                    ref: monthlyReport?.report_no,
                    label: monthlyReport ? "Open Monthly Report" : "Create Monthly Report",
                    to: "/fm-monthly-reports" as const,
                    search: monthlyReport ? { report_id: monthlyReport.id } : {},
                  },
                  {
                    title: "Invoice Pack",
                    period: `${month.start} → ${month.end}`,
                    status: invoicePack?.status ?? "Not created",
                    ref: invoicePack?.invoice_number ?? invoicePack?.invoice_no,
                    label: invoicePack ? "Open Invoice Pack" : "Create Invoice Pack",
                    to: "/fm-invoice-packs" as const,
                    search: invoicePack ? { invoice_pack_id: invoicePack.id } : {},
                  },
                ].map((r) => (

                  <div
                    key={r.title}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.period}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline">{r.status}</Badge>
                        {r.ref ? (
                          <span className="text-xs text-muted-foreground">{r.ref}</span>
                        ) : null}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate({ to: r.to, search: r.search })}>
                      {r.label}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
