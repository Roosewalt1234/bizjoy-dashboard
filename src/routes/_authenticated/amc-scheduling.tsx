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
                        <TableCell>{schedule.contracts?.contract_no ?? schedule.contracts?.customer_name ?? "—"}</TableCell>
                        <TableCell>
                          {schedule.frequency ?? "—"}
                          {schedule.interval_months ? ` / ${schedule.interval_months} mo` : ""}
                        </TableCell>
                        <TableCell>{schedule.start_date ?? "—"} to {schedule.end_date ?? "—"}</TableCell>
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
                      <TableCell>{visit.contracts?.contract_no ?? visit.contracts?.customer_name ?? "—"}</TableCell>
                      <TableCell>{visit.assigned_team ?? "—"}</TableCell>
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
                      <TableCell>{contract.contract_no ?? contract.customer_name ?? "—"}</TableCell>
                      <TableCell>{contract.water_tank_cleaning_date ?? "—"}</TableCell>
                      <TableCell>{contract.ac_duct_cleaning_date ?? "—"}</TableCell>
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
