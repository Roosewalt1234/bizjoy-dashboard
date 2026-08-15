import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ExportMenu } from "@/components/export-menu";
import { PAGE_SIZE, paginate, PaginationBar } from "@/components/pagination-bar";
import { nextDocNo } from "@/lib/doc-no";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fm-ppm")({
  component: ContractPpmPage,
});

type LooseQuery = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
}> & {
  select: (columns?: string, options?: unknown) => LooseQuery;
  order: (column: string, options?: unknown) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  insert: (payload: unknown) => LooseQuery;
  update: (payload: unknown) => LooseQuery;
  delete: () => LooseQuery;
};

type LooseSupabase = {
  from: (table: string) => LooseQuery;
};

type ContractLookup = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_id: string | null;
  customer_name: string | null;
  site_name?: string | null;
};

type ServiceCategory = {
  id: string;
  name: string;
};

type AssetLookup = {
  id: string;
  contract_id: string;
  service_category_id: string | null;
  asset_tag: string | null;
  asset_type: string | null;
  description: string | null;
  location: string | null;
};

type LineItemLookup = {
  id: string;
  contract_id: string;
  service_category_id: string | null;
  description: string;
};

type PpmScheduleRow = {
  id: string;
  contract_id: string;
  contract_line_item_id: string | null;
  asset_id: string | null;
  service_category_id: string | null;
  schedule_name: string;
  frequency: string | null;
  interval_months: number | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  instructions: string | null;
  contracts?: ContractLookup | null;
  contract_assets?: AssetLookup | null;
  service_categories?: ServiceCategory | null;
  contract_line_items?: LineItemLookup | null;
};

type PpmVisitRow = {
  id: string;
  ppm_schedule_id: string | null;
  contract_id: string;
  asset_id: string | null;
  service_category_id: string | null;
  planned_date: string;
  due_date: string | null;
  assigned_team: string | null;
  status: string;
  work_order_id: string | null;
  notes: string | null;
  ppm_schedules?: { schedule_name: string } | null;
  contracts?: ContractLookup | null;
  contract_assets?: AssetLookup | null;
  service_categories?: ServiceCategory | null;
};

type ScheduleForm = {
  contract_id: string;
  contract_line_item_id: string;
  asset_id: string;
  service_category_id: string;
  schedule_name: string;
  frequency: string;
  interval_months: string;
  start_date: string;
  end_date: string;
  active: boolean;
  instructions: string;
};

const emptyForm: ScheduleForm = {
  contract_id: "",
  contract_line_item_id: "none",
  asset_id: "none",
  service_category_id: "none",
  schedule_name: "",
  frequency: "Monthly",
  interval_months: "1",
  start_date: "",
  end_date: "",
  active: true,
  instructions: "",
};

const FREQUENCIES = [
  { label: "Monthly", months: 1 },
  { label: "Quarterly", months: 3 },
  { label: "Half Yearly", months: 6 },
  { label: "Annual", months: 12 },
  { label: "Custom", months: 1 },
];
const VISIT_STATUSES = ["Planned", "Scheduled", "Converted", "Completed", "Skipped", "Cancelled"];
const fmDb = supabase as unknown as LooseSupabase;

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function addMonths(isoDate: string, months: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function inferIntervalMonths(frequency: string, intervalMonths: string) {
  if (frequency === "Custom") return Math.max(1, Number(intervalMonths) || 1);
  return FREQUENCIES.find((item) => item.label === frequency)?.months ?? 1;
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

function ContractPpmPage() {
  const qc = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PpmScheduleRow | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-ppm"],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as LooseSupabase)
        .from("contracts")
        .select("id, title, contract_no, customer_id, customer_name, site_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-lookup-ppm"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceCategory[];
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["contract-assets-lookup-ppm"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_assets")
        .select(
          "id, contract_id, service_category_id, asset_tag, asset_type, description, location",
        )
        .eq("status", "Active")
        .order("asset_tag", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssetLookup[];
    },
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ["contract-line-items-lookup-ppm"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_line_items")
        .select("id, contract_id, service_category_id, description")
        .order("description", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LineItemLookup[];
    },
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["ppm_schedules"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("ppm_schedules")
        .select(
          `
          *,
          contracts:contract_id(id, title, contract_no, customer_id, customer_name, site_name),
          contract_assets:asset_id(id, contract_id, service_category_id, asset_tag, asset_type, description, location),
          service_categories:service_category_id(id, name),
          contract_line_items:contract_line_item_id(id, contract_id, service_category_id, description)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PpmScheduleRow[];
    },
  });

  const { data: visits = [], isLoading: visitsLoading } = useQuery({
    queryKey: ["ppm_visits"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("ppm_visits")
        .select(
          `
          *,
          ppm_schedules:ppm_schedule_id(schedule_name),
          contracts:contract_id(id, title, contract_no, customer_id, customer_name, site_name),
          contract_assets:asset_id(id, contract_id, service_category_id, asset_tag, asset_type, description, location),
          service_categories:service_category_id(id, name)
        `,
        )
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PpmVisitRow[];
    },
  });

  const filteredSchedules = useMemo(() => {
    return schedules.filter(
      (schedule) => selectedContractId === "all" || schedule.contract_id === selectedContractId,
    );
  }, [schedules, selectedContractId]);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const contractMatch =
        selectedContractId === "all" || visit.contract_id === selectedContractId;
      const statusMatch = selectedStatus === "all" || visit.status === selectedStatus;
      return contractMatch && statusMatch;
    });
  }, [visits, selectedContractId, selectedStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageVisits = paginate(filteredVisits, page);
  const openVisits = filteredVisits.filter((visit) =>
    ["Planned", "Scheduled"].includes(visit.status),
  ).length;
  const convertedVisits = filteredVisits.filter((visit) => visit.work_order_id).length;

  const contractAssets = assets.filter((asset) => asset.contract_id === form.contract_id);
  const contractLineItems = lineItems.filter((item) => item.contract_id === form.contract_id);

  function updateForm(patch: Partial<ScheduleForm>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if ("frequency" in patch && patch.frequency !== "Custom") {
        next.interval_months = String(
          inferIntervalMonths(patch.frequency ?? "Monthly", prev.interval_months),
        );
      }
      if ("asset_id" in patch && patch.asset_id && patch.asset_id !== "none") {
        const asset = assets.find((item) => item.id === patch.asset_id);
        if (asset?.service_category_id) next.service_category_id = asset.service_category_id;
      }
      if (
        "contract_line_item_id" in patch &&
        patch.contract_line_item_id &&
        patch.contract_line_item_id !== "none"
      ) {
        const lineItem = lineItems.find((item) => item.id === patch.contract_line_item_id);
        if (lineItem?.service_category_id) next.service_category_id = lineItem.service_category_id;
        if (lineItem?.description && !next.schedule_name) next.schedule_name = lineItem.description;
      }
      return next;
    });
  }

  function startCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      contract_id: selectedContractId === "all" ? "" : selectedContractId,
    });
    setOpen(true);
  }

  function startEdit(row: PpmScheduleRow) {
    setEditing(row);
    setForm({
      contract_id: row.contract_id,
      contract_line_item_id: row.contract_line_item_id ?? "none",
      asset_id: row.asset_id ?? "none",
      service_category_id: row.service_category_id ?? "none",
      schedule_name: row.schedule_name,
      frequency: row.frequency ?? "Monthly",
      interval_months: row.interval_months != null ? String(row.interval_months) : "1",
      start_date: row.start_date ?? "",
      end_date: row.end_date ?? "",
      active: row.active,
      instructions: row.instructions ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.schedule_name.trim()) {
      toast.error("Enter a schedule name");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contract_id: form.contract_id,
        contract_line_item_id:
          form.contract_line_item_id === "none" ? null : form.contract_line_item_id,
        asset_id: form.asset_id === "none" ? null : form.asset_id,
        service_category_id: form.service_category_id === "none" ? null : form.service_category_id,
        schedule_name: form.schedule_name.trim(),
        frequency: form.frequency || null,
        interval_months: inferIntervalMonths(form.frequency, form.interval_months),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        active: form.active,
        instructions: form.instructions.trim() || null,
      };

      const query = editing
        ? fmDb.from("ppm_schedules").update(payload).eq("id", editing.id)
        : fmDb.from("ppm_schedules").insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editing ? "PPM schedule updated" : "PPM schedule added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["ppm_schedules"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(row: PpmScheduleRow) {
    const { error } = await fmDb.from("ppm_schedules").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("PPM schedule deleted");
    qc.invalidateQueries({ queryKey: ["ppm_schedules"] });
    qc.invalidateQueries({ queryKey: ["ppm_visits"] });
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

      const existing = visits.filter((visit) => visit.ppm_schedule_id === schedule.id);
      const existingDates = new Set(existing.map((visit) => visit.planned_date));
      const rows = dates
        .filter((date) => !existingDates.has(date))
        .map((date) => ({
          ppm_schedule_id: schedule.id,
          contract_id: schedule.contract_id,
          asset_id: schedule.asset_id,
          service_category_id: schedule.service_category_id,
          planned_date: date,
          due_date: date,
          status: "Planned",
          notes: schedule.instructions,
        }));

      if (rows.length === 0) {
        toast.info("All visits already exist for this schedule");
        return;
      }

      const { error } = await fmDb.from("ppm_visits").insert(rows);
      if (error) throw error;

      toast.success(`Generated ${rows.length} PPM visits`);
      qc.invalidateQueries({ queryKey: ["ppm_visits"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Visit generation failed"));
    } finally {
      setGeneratingId(null);
    }
  }

  async function convertVisitToWorkOrder(visit: PpmVisitRow) {
    if (visit.work_order_id) {
      toast.info("This PPM visit already has a work order");
      return;
    }

    setConvertingId(visit.id);
    try {
      const contract = visit.contracts ?? contracts.find((item) => item.id === visit.contract_id);
      const assetLabel =
        visit.contract_assets?.asset_tag ??
        visit.contract_assets?.description ??
        visit.contract_assets?.asset_type ??
        "";
      const categoryName = visit.service_categories?.name ?? "PPM";
      const woNo = await nextDocNo("work_order").catch(() => null);
      const payload = {
        wo_no: woNo,
        contract_id: visit.contract_id,
        customer_id: contract?.customer_id ?? null,
        customer_name: contract?.customer_name ?? null,
        requested_date: new Date().toISOString().slice(0, 10),
        scheduled_date: visit.planned_date,
        service_type: categoryName,
        location: visit.contract_assets?.location ?? contract?.site_name ?? null,
        priority: "Medium",
        problem_reported: `${categoryName} planned preventive maintenance${assetLabel ? ` - ${assetLabel}` : ""}`,
        work_requested:
          visit.ppm_schedules?.schedule_name ?? "Complete planned preventive maintenance visit",
        notes: visit.notes ?? null,
        status: "Open",
        asset_id: visit.asset_id,
        ppm_visit_id: visit.id,
        service_category_id: visit.service_category_id,
        request_type: "PPM",
        reported_at: new Date().toISOString(),
      };

      const { data, error } = await fmDb.from("work_orders").insert(payload).select("id");
      if (error) throw error;
      const inserted = Array.isArray(data) ? (data[0] as { id?: string } | undefined) : undefined;
      const workOrderId = inserted?.id ?? null;

      const { error: updateError } = await fmDb
        .from("ppm_visits")
        .update({
          work_order_id: workOrderId,
          status: "Converted",
        })
        .eq("id", visit.id);
      if (updateError) throw updateError;

      toast.success("PPM visit converted to work order");
      qc.invalidateQueries({ queryKey: ["ppm_visits"] });
      qc.invalidateQueries({ queryKey: ["work_orders"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Conversion failed"));
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM PPM Planner</h1>
          <p className="text-muted-foreground">
            Create normalized PPM schedules, generate visit plans, and convert visits into work
            orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="ppm-visits"
            sheetName="PPM Visits"
            rows={filteredVisits}
            columns={[
              { key: "planned_date", label: "Planned Date" },
              { key: "due_date", label: "Due Date" },
              { key: "status", label: "Status" },
              { key: "assigned_team", label: "Assigned Team" },
              { key: "work_order_id", label: "Work Order ID" },
            ]}
          />
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add PPM Schedule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Schedules</p>
          <p className="text-2xl font-bold">{filteredSchedules.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Visits</p>
          <p className="text-2xl font-bold">{filteredVisits.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Open Visits</p>
          <p className="text-2xl font-bold">{openVisits}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Converted</p>
          <p className="text-2xl font-bold">{convertedVisits}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Contract</Label>
            <Select
              value={selectedContractId}
              onValueChange={(value) => {
                setSelectedContractId(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contracts</SelectItem>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                      (contract.customer_name ?? contract.title)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Visit Status</Label>
            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                setSelectedStatus(value);
                setPage(1);
              }}
            >
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
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">PPM Schedules</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schedule</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedulesLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredSchedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No PPM schedules found.
                </TableCell>
              </TableRow>
            ) : (
              filteredSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div className="font-medium">{schedule.schedule_name}</div>
                    {!schedule.active && (
                      <div className="text-xs text-muted-foreground">Inactive</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {schedule.contracts?.contract_no ?? schedule.contracts?.customer_name ?? "—"}
                  </TableCell>
                  <TableCell>{schedule.service_categories?.name ?? "—"}</TableCell>
                  <TableCell>
                    {schedule.contract_assets?.asset_tag ??
                      schedule.contract_assets?.description ??
                      "—"}
                  </TableCell>
                  <TableCell>
                    {schedule.frequency ?? "—"}
                    {schedule.interval_months ? ` / ${schedule.interval_months} mo` : ""}
                  </TableCell>
                  <TableCell>
                    {schedule.start_date ?? "—"} to {schedule.end_date ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => generateVisits(schedule)}
                        disabled={generatingId === schedule.id}
                      >
                        <CalendarDays className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(schedule)}>
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
                            <AlertDialogDescription>
                              Linked generated visits may also be removed by database constraints.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeSchedule(schedule)}>
                              Delete
                            </AlertDialogAction>
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
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">PPM Visits</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Planned Date</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitsLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pageVisits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No PPM visits found.
                </TableCell>
              </TableRow>
            ) : (
              pageVisits.map((visit) => (
                <TableRow key={visit.id}>
                  <TableCell>{visit.planned_date}</TableCell>
                  <TableCell>{visit.ppm_schedules?.schedule_name ?? "—"}</TableCell>
                  <TableCell>
                    {visit.contracts?.contract_no ?? visit.contracts?.customer_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {visit.contract_assets?.asset_tag ?? visit.contract_assets?.description ?? "—"}
                  </TableCell>
                  <TableCell>{visit.service_categories?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", statusClasses(visit.status))}
                    >
                      {visit.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => convertVisitToWorkOrder(visit)}
                      disabled={Boolean(visit.work_order_id) || convertingId === visit.id}
                    >
                      <Wrench className="h-4 w-4 mr-1" />
                      {visit.work_order_id ? "WO Linked" : "Create WO"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={filteredVisits.length} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit PPM Schedule" : "Add PPM Schedule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Contract *</Label>
              <Select
                value={form.contract_id || undefined}
                onValueChange={(value) =>
                  updateForm({
                    contract_id: value,
                    asset_id: "none",
                    contract_line_item_id: "none",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract..." />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                        (contract.customer_name ?? contract.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service Category</Label>
              <Select
                value={form.service_category_id}
                onValueChange={(value) => updateForm({ service_category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Line Item</Label>
              <Select
                value={form.contract_line_item_id}
                onValueChange={(value) => updateForm({ contract_line_item_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {contractLineItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Asset</Label>
              <Select
                value={form.asset_id}
                onValueChange={(value) => updateForm({ asset_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {contractAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.asset_tag ?? asset.description ?? asset.asset_type ?? "Untitled asset"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Schedule Name *</Label>
              <Input
                value={form.schedule_name}
                onChange={(event) => updateForm({ schedule_name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(value) => updateForm({ frequency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((frequency) => (
                    <SelectItem key={frequency.label} value={frequency.label}>
                      {frequency.label}
                    </SelectItem>
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
                value={form.interval_months}
                onChange={(event) => updateForm({ interval_months: event.target.value })}
                disabled={form.frequency !== "Custom"}
              />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(event) => updateForm({ start_date: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(event) => updateForm({ end_date: event.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pt-7">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateForm({ active: event.target.checked })}
              />
              Active schedule
            </label>
            <div className="space-y-1 md:col-span-3">
              <Label>Instructions</Label>
              <Textarea
                rows={3}
                value={form.instructions}
                onChange={(event) => updateForm({ instructions: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save PPM Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
