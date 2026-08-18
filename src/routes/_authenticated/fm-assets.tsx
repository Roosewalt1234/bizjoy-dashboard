import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { CalendarClock, MoreHorizontal, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fm-assets")({
  component: ContractAssetsPage,
});

type LooseQuery = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select: (columns?: string) => LooseQuery;
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
  customer_name: string | null;
};

type ServiceCategory = {
  id: string;
  name: string;
};

type AssetRow = {
  id: string;
  contract_id: string;
  service_category_id: string | null;
  asset_tag: string | null;
  asset_type: string | null;
  description: string | null;
  make: string | null;
  model: string | null;
  serial_no: string | null;
  location: string | null;
  floor: string | null;
  zone: string | null;
  criticality: string | null;
  warranty_expiry: string | null;
  status: string;
  fm_contracts?: ContractLookup | null;
  service_categories?: ServiceCategory | null;
};

type AssetForm = {
  contract_id: string;
  service_category_id: string;
  asset_tag: string;
  asset_type: string;
  description: string;
  make: string;
  model: string;
  serial_no: string;
  location: string;
  floor: string;
  zone: string;
  criticality: string;
  warranty_expiry: string;
  status: string;
};

const emptyForm: AssetForm = {
  contract_id: "",
  service_category_id: "none",
  asset_tag: "",
  asset_type: "",
  description: "",
  make: "",
  model: "",
  serial_no: "",
  location: "",
  floor: "",
  zone: "",
  criticality: "",
  warranty_expiry: "",
  status: "Active",
};

type PpmScheduleForm = {
  schedule_name: string;
  frequency: string;
  interval_months: string;
  start_date: string;
  end_date: string;
  instructions: string;
  active: boolean;
};

const emptyPpmForm: PpmScheduleForm = {
  schedule_name: "",
  frequency: "",
  interval_months: "",
  start_date: "",
  end_date: "",
  instructions: "",
  active: true,
};

type VisitRow = {
  id?: string;
  date: string;
  status?: string;
};

const PPM_FREQUENCIES = [
  { label: "Monthly", months: 1 },
  { label: "Quarterly", months: 3 },
  { label: "Half Yearly", months: 6 },
  { label: "Annual", months: 12 },
  { label: "Custom", months: 1 },
];
const LOCKED_VISIT_STATUSES = ["Converted", "Completed"];
const ASSET_STATUSES = ["Active", "Inactive", "Under Maintenance", "Retired"];
const CRITICALITIES = ["Low", "Medium", "High", "Critical"];
const fmDb = supabase as unknown as LooseSupabase;

function addMonths(isoDate: string, months: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function inferIntervalMonths(frequency: string, intervalMonths: string) {
  if (frequency === "Custom" || !frequency) return Math.max(1, Number(intervalMonths) || 1);
  return PPM_FREQUENCIES.find((item) => item.label === frequency)?.months ?? 1;
}

function buildVisitDates(startDate: string, endDate: string, intervalMonths: number): string[] {
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

function errorMessage(error: unknown, fallback: string) {
  return (error as { message?: string })?.message ?? fallback;
}

function statusClasses(status: string) {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Under Maintenance":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Retired":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function ContractAssetsPage() {
  const qc = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<AssetRow | null>(null);
  const [qrAsset, setQrAsset] = useState<AssetRow | null>(null);
  const [schedulesListAsset, setSchedulesListAsset] = useState<AssetRow | null>(null);
  const [ppmDialogAsset, setPpmDialogAsset] = useState<AssetRow | null>(null);
  const [targetScheduleId, setTargetScheduleId] = useState<string | null>(null);
  const [ppmForm, setPpmForm] = useState<PpmScheduleForm>(emptyPpmForm);
  const [existingScheduleId, setExistingScheduleId] = useState<string | null>(null);
  const [visitDates, setVisitDates] = useState<VisitRow[]>([]);
  const [deletedVisitIds, setDeletedVisitIds] = useState<string[]>([]);
  const [ppmSaving, setPpmSaving] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-lookup-assets"],
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

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_assets"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_assets")
        .select(
          `
          *,
          fm_contracts:contract_id(id, title, contract_no, customer_name),
          service_categories:service_category_id(id, name)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const contractMatch = selectedContractId === "all" || row.contract_id === selectedContractId;
      const categoryMatch =
        selectedCategoryId === "all" || row.service_category_id === selectedCategoryId;
      const textMatch =
        !term ||
        [
          row.asset_tag,
          row.asset_type,
          row.description,
          row.make,
          row.model,
          row.serial_no,
          row.location,
          row.floor,
          row.zone,
          row.fm_contracts?.customer_name,
          row.service_categories?.name,
        ].some((value) => (value ?? "").toLowerCase().includes(term));
      return contractMatch && categoryMatch && textMatch;
    });
  }, [rows, search, selectedContractId, selectedCategoryId]);

  const activeCount = filteredRows.filter((row) => row.status === "Active").length;
  const criticalCount = filteredRows.filter((row) => row.criticality === "Critical").length;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = paginate(filteredRows, page);

  function updateForm(patch: Partial<AssetForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function startCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      contract_id: selectedContractId === "all" ? "" : selectedContractId,
      service_category_id: selectedCategoryId === "all" ? "none" : selectedCategoryId,
    });
    setOpen(true);
  }

  function startEdit(row: AssetRow) {
    setEditing(row);
    setForm({
      contract_id: row.contract_id,
      service_category_id: row.service_category_id ?? "none",
      asset_tag: row.asset_tag ?? "",
      asset_type: row.asset_type ?? "",
      description: row.description ?? "",
      make: row.make ?? "",
      model: row.model ?? "",
      serial_no: row.serial_no ?? "",
      location: row.location ?? "",
      floor: row.floor ?? "",
      zone: row.zone ?? "",
      criticality: row.criticality ?? "",
      warranty_expiry: row.warranty_expiry ?? "",
      status: row.status ?? "Active",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.asset_tag.trim() && !form.description.trim()) {
      toast.error("Enter an asset tag or description");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contract_id: form.contract_id,
        service_category_id: form.service_category_id === "none" ? null : form.service_category_id,
        asset_tag: form.asset_tag.trim() || null,
        asset_type: form.asset_type.trim() || null,
        description: form.description.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        serial_no: form.serial_no.trim() || null,
        location: form.location.trim() || null,
        floor: form.floor.trim() || null,
        zone: form.zone.trim() || null,
        criticality: form.criticality || null,
        warranty_expiry: form.warranty_expiry || null,
        status: form.status || "Active",
      };

      const query = editing
        ? fmDb.from("contract_assets").update(payload).eq("id", editing.id)
        : fmDb.from("contract_assets").insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editing ? "Asset updated" : "Asset added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["contract_assets"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AssetRow) {
    const { error } = await fmDb.from("contract_assets").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("Asset deleted");
    qc.invalidateQueries({ queryKey: ["contract_assets"] });
  }

  const { data: assetSchedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["ppm_schedules_for_asset", schedulesListAsset?.id],
    enabled: !!schedulesListAsset,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ppm_schedules")
        .select("id, schedule_name, frequency, interval_months, start_date, end_date, active")
        .eq("asset_id", schedulesListAsset!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; schedule_name: string; frequency: string | null; interval_months: number | null;
        start_date: string | null; end_date: string | null; active: boolean;
      }>;
    },
  });

  function openNewSchedule(row: AssetRow) {
    setPpmForm({
      ...emptyPpmForm,
      schedule_name: `${row.asset_tag ?? row.asset_type ?? "Asset"} PPM`,
    });
    setExistingScheduleId(null);
    setVisitDates([]);
    setDeletedVisitIds([]);
    setTargetScheduleId(null);
    setPpmDialogAsset(row);
  }

  function openEditSchedule(row: AssetRow, scheduleId: string) {
    setPpmForm(emptyPpmForm);
    setExistingScheduleId(null);
    setVisitDates([]);
    setDeletedVisitIds([]);
    setTargetScheduleId(scheduleId);
    setPpmDialogAsset(row);
  }

  useEffect(() => {
    (async () => {
      if (!ppmDialogAsset || !targetScheduleId) return;
      const { data: existing, error } = await (supabase as any)
        .from("ppm_schedules")
        .select("*")
        .eq("id", targetScheduleId)
        .single();
      if (error) {
        toast.error(error.message || "Failed to load PPM schedule");
        return;
      }
      setExistingScheduleId(existing.id);
      setPpmForm({
        schedule_name: existing.schedule_name ?? "",
        frequency: existing.frequency ?? "",
        interval_months: existing.interval_months != null ? String(existing.interval_months) : "",
        start_date: existing.start_date ?? "",
        end_date: existing.end_date ?? "",
        instructions: existing.instructions ?? "",
        active: existing.active ?? true,
      });

      const { data: visits, error: visitsError } = await (supabase as any)
        .from("ppm_visits")
        .select("id, planned_date, status")
        .eq("ppm_schedule_id", existing.id)
        .order("planned_date", { ascending: true });
      if (visitsError) {
        toast.error(visitsError.message || "Failed to load scheduled visit dates");
      } else {
        setVisitDates(
          (visits ?? []).map((v: any) => ({ id: v.id, date: v.planned_date, status: v.status })),
        );
      }
    })();
  }, [ppmDialogAsset, targetScheduleId]);

  // Auto-generate the visit date list once frequency/start/end are all set, if nothing's been generated yet.
  useEffect(() => {
    if (visitDates.length > 0) return;
    if (!ppmForm.frequency || !ppmForm.start_date || !ppmForm.end_date) return;
    const months = inferIntervalMonths(ppmForm.frequency, ppmForm.interval_months);
    const dates = buildVisitDates(ppmForm.start_date, ppmForm.end_date, months);
    if (dates.length > 0) setVisitDates(dates.map((date) => ({ date })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppmForm.frequency, ppmForm.interval_months, ppmForm.start_date, ppmForm.end_date]);

  function regenerateVisitDates() {
    if (!ppmForm.frequency || !ppmForm.start_date || !ppmForm.end_date) {
      toast.error("Set frequency, start date and end date first");
      return;
    }
    const months = inferIntervalMonths(ppmForm.frequency, ppmForm.interval_months);
    const computed = buildVisitDates(ppmForm.start_date, ppmForm.end_date, months);
    const existingByDate = new Map(visitDates.map((v) => [v.date, v]));
    const merged = computed.map((date) => existingByDate.get(date) ?? { date });
    // Keep any already-converted/completed visits even if they fall outside the recomputed range,
    // so regenerating never silently drops a visit that's already tied to a work order or report.
    const keptLocked = visitDates.filter(
      (v) => LOCKED_VISIT_STATUSES.includes(v.status ?? "") && !computed.includes(v.date),
    );
    setVisitDates([...merged, ...keptLocked].sort((a, b) => a.date.localeCompare(b.date)));
  }

  function updateVisitDate(index: number, date: string) {
    setVisitDates((prev) => prev.map((v, i) => (i === index ? { ...v, date } : v)));
  }

  function removeVisitDate(index: number) {
    setVisitDates((prev) => {
      const row = prev[index];
      if (row?.id) setDeletedVisitIds((ids) => [...ids, row.id as string]);
      return prev.filter((_, i) => i !== index);
    });
  }

  function addVisitDateRow() {
    setVisitDates((prev) => [...prev, { date: ppmForm.end_date || ppmForm.start_date || "" }]);
  }

  async function savePpmSchedule() {
    if (!ppmDialogAsset) return;
    if (!ppmForm.schedule_name.trim()) {
      toast.error("Enter a schedule name");
      return;
    }
    if (visitDates.some((v) => !v.date)) {
      toast.error("Every scheduled visit needs a date");
      return;
    }
    setPpmSaving(true);
    try {
      const payload = {
        contract_id: ppmDialogAsset.contract_id,
        asset_id: ppmDialogAsset.id,
        service_category_id: ppmDialogAsset.service_category_id,
        schedule_name: ppmForm.schedule_name.trim(),
        frequency: ppmForm.frequency || null,
        interval_months: ppmForm.interval_months
          ? Number(ppmForm.interval_months)
          : ppmForm.frequency
            ? inferIntervalMonths(ppmForm.frequency, ppmForm.interval_months)
            : null,
        start_date: ppmForm.start_date || null,
        end_date: ppmForm.end_date || null,
        instructions: ppmForm.instructions.trim() || null,
        active: ppmForm.active,
      };

      let scheduleId = existingScheduleId;
      if (scheduleId) {
        const { error } = await (supabase as any).from("ppm_schedules").update(payload).eq("id", scheduleId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("ppm_schedules")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        scheduleId = data.id;
      }

      if (deletedVisitIds.length > 0) {
        const { error } = await (supabase as any).from("ppm_visits").delete().in("id", deletedVisitIds);
        if (error) throw error;
      }

      const toUpdate = visitDates.filter((v) => v.id);
      for (const v of toUpdate) {
        const { error } = await (supabase as any)
          .from("ppm_visits")
          .update({ planned_date: v.date, due_date: v.date })
          .eq("id", v.id);
        if (error) throw error;
      }

      const toInsert = visitDates
        .filter((v) => !v.id)
        .map((v) => ({
          ppm_schedule_id: scheduleId,
          contract_id: ppmDialogAsset.contract_id,
          asset_id: ppmDialogAsset.id,
          service_category_id: ppmDialogAsset.service_category_id,
          planned_date: v.date,
          due_date: v.date,
          status: "Planned",
          notes: ppmForm.instructions.trim() || null,
        }));
      if (toInsert.length > 0) {
        const { error } = await (supabase as any).from("ppm_visits").insert(toInsert);
        if (error) throw error;
      }

      toast.success(
        existingScheduleId
          ? `PPM schedule updated · ${visitDates.length} visit date${visitDates.length === 1 ? "" : "s"}`
          : `PPM schedule assigned · ${visitDates.length} visit date${visitDates.length === 1 ? "" : "s"} scheduled`,
      );
      setPpmDialogAsset(null);
      qc.invalidateQueries({ queryKey: ["ppm_schedules"] });
      qc.invalidateQueries({ queryKey: ["ppm_schedules_for_asset"] });
      qc.invalidateQueries({ queryKey: ["ppm_visits"] });
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setPpmSaving(false);
    }
  }

  async function deleteScheduleById(scheduleId: string) {
    const { error } = await (supabase as any).from("ppm_schedules").delete().eq("id", scheduleId);
    if (error) {
      toast.error(error.message || "Delete failed");
      return;
    }
    toast.success("PPM schedule deleted");
    qc.invalidateQueries({ queryKey: ["ppm_schedules"] });
    qc.invalidateQueries({ queryKey: ["ppm_schedules_for_asset"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Asset Register</h1>
          <p className="text-muted-foreground">
            Maintain contract assets for PPM planning, reactive work orders, and service reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="contract-assets"
            sheetName="Contract Assets"
            rows={filteredRows}
            columns={[
              { key: "asset_tag", label: "Asset Tag" },
              { key: "asset_type", label: "Asset Type" },
              { key: "description", label: "Description" },
              { key: "make", label: "Make" },
              { key: "model", label: "Model" },
              { key: "serial_no", label: "Serial No" },
              { key: "location", label: "Location" },
              { key: "floor", label: "Floor" },
              { key: "zone", label: "Zone" },
              { key: "criticality", label: "Criticality" },
              { key: "warranty_expiry", label: "Warranty Expiry" },
              { key: "status", label: "Status" },
            ]}
          />
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Asset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Assets</p>
          <p className="text-2xl font-bold">{filteredRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active Assets</p>
          <p className="text-2xl font-bold">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Critical Assets</p>
          <p className="text-2xl font-bold">{criticalCount}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <Label className="text-xs">Service Category</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => {
                setSelectedCategoryId(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="asset-search" className="text-xs">
              Search
            </Label>
            <Input
              id="asset-search"
              placeholder="Search assets"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Make / Model</TableHead>
              <TableHead>Criticality</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">
                      {row.asset_tag ?? row.description ?? "Untitled"}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.asset_type ?? "—"}</div>
                  </TableCell>
                  <TableCell>
                    {row.fm_contracts?.contract_no ?? row.fm_contracts?.customer_name ?? "—"}
                  </TableCell>
                  <TableCell>{row.service_categories?.name ?? "—"}</TableCell>
                  <TableCell>
                    {[row.location, row.floor, row.zone].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>{[row.make, row.model].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>{row.criticality ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", statusClasses(row.status))}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startEdit(row)}>
                          Edit Asset
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSchedulesListAsset(row)}>
                          PPM Schedules
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setQrAsset(row)}>
                          Asset QR Code
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setAssetToDelete(row)}
                        >
                          Delete Asset
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={filteredRows.length} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Contract *</Label>
              <Select
                value={form.contract_id || undefined}
                onValueChange={(value) => updateForm({ contract_id: value })}
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
              <Label>Asset Tag</Label>
              <Input
                value={form.asset_tag}
                onChange={(e) => updateForm({ asset_tag: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Asset Type</Label>
              <Input
                value={form.asset_type}
                onChange={(e) => updateForm({ asset_type: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Serial No</Label>
              <Input
                value={form.serial_no}
                onChange={(e) => updateForm({ serial_no: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Make</Label>
              <Input value={form.make} onChange={(e) => updateForm({ make: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Input value={form.model} onChange={(e) => updateForm({ model: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Warranty Expiry</Label>
              <Input
                type="date"
                value={form.warranty_expiry}
                onChange={(e) => updateForm({ warranty_expiry: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => updateForm({ location: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => updateForm({ floor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Zone</Label>
              <Input value={form.zone} onChange={(e) => updateForm({ zone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Criticality</Label>
              <Select
                value={form.criticality || undefined}
                onValueChange={(value) => updateForm({ criticality: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CRITICALITIES.map((criticality) => (
                    <SelectItem key={criticality} value={criticality}>
                      {criticality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => updateForm({ status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!schedulesListAsset && !ppmDialogAsset}
        onOpenChange={(o) => !o && setSchedulesListAsset(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> PPM Schedules
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {schedulesListAsset?.asset_tag ?? schedulesListAsset?.description ?? "Asset"} · different jobs can each have their own schedule and interval.
          </p>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Start – End</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulesLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : assetSchedules.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No PPM schedules for this asset yet.</TableCell></TableRow>
                ) : (
                  assetSchedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">{schedule.schedule_name}</TableCell>
                      <TableCell>{schedule.frequency ?? (schedule.interval_months ? `Every ${schedule.interval_months} mo` : "—")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {schedule.start_date ?? "—"} – {schedule.end_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={schedule.active ? "bg-emerald-100 text-emerald-800 border-emerald-200" : ""}>
                          {schedule.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => schedulesListAsset && openEditSchedule(schedulesListAsset, schedule.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setScheduleToDelete({ id: schedule.id, name: schedule.schedule_name })}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => schedulesListAsset && openNewSchedule(schedulesListAsset)}
            >
              <Plus className="h-4 w-4 mr-2" /> New Schedule
            </Button>
            <Button variant="outline" onClick={() => setSchedulesListAsset(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!ppmDialogAsset}
        onOpenChange={(o) => {
          if (!o) {
            setPpmDialogAsset(null);
            setTargetScheduleId(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              {existingScheduleId ? "Edit PPM Schedule" : "Assign PPM Schedule"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {ppmDialogAsset?.asset_tag ?? ppmDialogAsset?.description ?? "Asset"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Schedule Name *</Label>
              <Input
                value={ppmForm.schedule_name}
                onChange={(e) => setPpmForm((prev) => ({ ...prev, schedule_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select
                value={ppmForm.frequency || undefined}
                onValueChange={(value) => setPpmForm((prev) => ({ ...prev, frequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {PPM_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq.label} value={freq.label}>{freq.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Interval (months)</Label>
              <Input
                type="number"
                min="0"
                value={ppmForm.interval_months}
                onChange={(e) => setPpmForm((prev) => ({ ...prev, interval_months: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={ppmForm.start_date}
                onChange={(e) => setPpmForm((prev) => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={ppmForm.end_date}
                onChange={(e) => setPpmForm((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Instructions</Label>
              <Textarea
                rows={2}
                value={ppmForm.instructions}
                onChange={(e) => setPpmForm((prev) => ({ ...prev, instructions: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={ppmForm.active}
                onCheckedChange={(checked) => setPpmForm((prev) => ({ ...prev, active: checked }))}
              />
              <Label>Active</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Scheduled Visit Dates</Label>
                <p className="text-xs text-muted-foreground">
                  Generated from frequency, start and end date. Stored per-visit so reminders and reports can use them - edit or add/remove individual dates as needed.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={regenerateVisitDates}>
                  Regenerate
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addVisitDateRow}>
                  Add Date
                </Button>
              </div>
            </div>
            <Card className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Planned Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16 text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visitDates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-sm">
                        Set frequency, start date and end date to generate visit dates.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visitDates.map((visit, i) => {
                      const locked = LOCKED_VISIT_STATUSES.includes(visit.status ?? "");
                      return (
                        <TableRow key={visit.id ?? `new-${i}`}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              className="h-8"
                              value={visit.date}
                              disabled={locked}
                              onChange={(e) => updateVisitDate(i, e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            {visit.status ? (
                              <Badge variant="outline">{visit.status}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">New</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={locked}
                              onClick={() => removeVisitDate(i)}
                              title={locked ? "Already converted/completed - can't remove" : "Remove this date"}
                            >
                              ✕
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPpmDialogAsset(null)}>
              Cancel
            </Button>
            <Button onClick={savePpmSchedule} disabled={ppmSaving}>
              {ppmSaving ? "Saving..." : existingScheduleId ? "Update Schedule" : "Assign Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrAsset} onOpenChange={(o) => !o && setQrAsset(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" /> Asset QR Code
            </DialogTitle>
          </DialogHeader>
          {qrAsset && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="p-4 bg-white rounded-md border">
                <QRCodeSVG value={`FM-ASSET:${qrAsset.id}`} size={200} />
              </div>
              <div className="text-center">
                <div className="font-medium">{qrAsset.asset_tag ?? qrAsset.description ?? "Asset"}</div>
                <div className="text-xs text-muted-foreground">{qrAsset.asset_type ?? "—"}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrAsset(null)}>Close</Button>
            <Button onClick={() => window.print()}>Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!assetToDelete} onOpenChange={(o) => !o && setAssetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This can affect linked PPM schedules or work orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (assetToDelete) remove(assetToDelete);
                setAssetToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!scheduleToDelete} onOpenChange={(o) => !o && setScheduleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{scheduleToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes this PPM schedule and its scheduled visit dates. Visits already converted to work orders are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (scheduleToDelete) deleteScheduleById(scheduleToDelete.id);
                setScheduleToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
