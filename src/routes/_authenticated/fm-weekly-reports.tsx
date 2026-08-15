/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { buildWeeklyReportPayload, getDateRangeForWeek, REPORT_STATUSES } from "@/lib/fm-reports";

export const Route = createFileRoute("/_authenticated/fm-weekly-reports")({
  validateSearch: (search: Record<string, unknown>): { report_id?: string } =>
    typeof search.report_id === "string" ? { report_id: search.report_id } : {},
  component: ContractWeeklyReportsPage,
});


const fmDb = supabase as any;

function ContractWeeklyReportsPage() {
  const qc = useQueryClient();
  const defaultWeek = getDateRangeForWeek();
  const [contractFilter, setContractFilter] = useState("all");
  const [weekStart, setWeekStart] = useState(defaultWeek.start);
  const [weekEnd, setWeekEnd] = useState(defaultWeek.end);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    status: "Draft",
    remarks: "",
    prepared_by: "",
    reviewed_by: "",
  });
  const [generating, setGenerating] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-weekly-reports"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contracts")
        .select("id, title, contract_no, customer_name, site_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["weekly_reports"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("weekly_reports")
        .select("*, contracts:contract_id(id, title, contract_no, customer_name, site_name)")
        .order("week_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deep link: /fm-weekly-reports?report_id=... opens that report.
  const search = Route.useSearch();
  const openedReportId = useRef<string | null>(null);
  useEffect(() => {
    const id = search.report_id;
    if (!id || openedReportId.current === id) return;
    const match = (reports as any[]).find((row) => row.id === id);
    if (!match) return;
    openedReportId.current = id;
    setViewing(match);
  }, [reports, search.report_id]);



  const filteredReports = useMemo(
    () =>
      (reports as any[]).filter((row) => {
        if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (weekStart && row.week_end < weekStart) return false;
        if (weekEnd && row.week_start > weekEnd) return false;
        return true;
      }),
    [reports, contractFilter, statusFilter, weekEnd, weekStart],
  );

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [filteredReports.length, page]);

  async function fetchReportSource(contractId: string) {
    const [
      contract,
      workOrders,
      ppmVisits,
      attendance,
      plans,
      assignments,
      assets,
      serviceReports,
    ] = await Promise.all([
      fmDb.from("contracts").select("*").eq("id", contractId).single(),
      fmDb.from("work_orders").select("*").eq("contract_id", contractId),
      fmDb
        .from("ppm_visits")
        .select("*, service_categories:service_category_id(id, name)")
        .eq("contract_id", contractId),
      fmDb.from("attendance_logs").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_plans").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_assignments").select("*").eq("contract_id", contractId),
      fmDb.from("contract_assets").select("*").eq("contract_id", contractId),
      fmDb.from("service_reports").select("*").eq("contract_id", contractId),
    ]);
    for (const result of [
      contract,
      workOrders,
      ppmVisits,
      attendance,
      plans,
      assignments,
      assets,
      serviceReports,
    ]) {
      if (result.error) throw result.error;
    }
    return {
      contract: contract.data,
      workOrders: workOrders.data ?? [],
      ppmVisits: ppmVisits.data ?? [],
      attendance: attendance.data ?? [],
      plans: plans.data ?? [],
      assignments: assignments.data ?? [],
      assets: assets.data ?? [],
      serviceReports: serviceReports.data ?? [],
    };
  }

  async function generateReport() {
    if (contractFilter === "all") {
      toast.error("Select a contract first");
      return;
    }
    setGenerating(true);
    try {
      const source = await fetchReportSource(contractFilter);
      const payload = buildWeeklyReportPayload({ ...source, start: weekStart, end: weekEnd });
      const period = await fmDb
        .from("reporting_periods")
        .select("id")
        .eq("contract_id", contractFilter)
        .eq("period_type", "Weekly")
        .eq("period_start", weekStart)
        .eq("period_end", weekEnd)
        .maybeSingle();
      let periodId = period.data?.id ?? null;
      if (!periodId) {
        const created = await fmDb
          .from("reporting_periods")
          .insert({
            contract_id: contractFilter,
            period_type: "Weekly",
            period_start: weekStart,
            period_end: weekEnd,
            label: `Weekly ${weekStart} to ${weekEnd}`,
            status: "Generated",
          })
          .select("id")
          .single();
        if (created.error) throw created.error;
        periodId = created.data.id;
      }
      const { error } = await fmDb.from("weekly_reports").insert({
        contract_id: contractFilter,
        reporting_period_id: periodId,
        week_start: weekStart,
        week_end: weekEnd,
        report_no: `WR-${weekStart}`,
        status: "Draft",
        summary: payload,
        report_data: payload,
        ppm_completed: payload.ppm.completed,
        work_orders_completed: payload.workOrders.completed,
        open_issues: payload.workOrders.open,
        sla_breaches: payload.sla.breachCount,
        remarks: "",
      });
      if (error) throw error;
      toast.success("Weekly report generated");
      qc.invalidateQueries({ queryKey: ["weekly_reports"] });
    } catch (error: any) {
      toast.error(error.message ?? "Report generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(row: any) {
    setEditing(row);
    setEditForm({
      status: row.status ?? "Draft",
      remarks: row.remarks ?? "",
      prepared_by: row.prepared_by ?? "",
      reviewed_by: row.reviewed_by ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await fmDb
      .from("weekly_reports")
      .update({
        ...editForm,
        submitted_at:
          editForm.status === "Submitted" ? new Date().toISOString() : editing.submitted_at,
        approved_at:
          editForm.status === "Approved" ? new Date().toISOString() : editing.approved_at,
      })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Weekly report updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["weekly_reports"] });
  }

  async function remove(row: any) {
    if (row.status !== "Draft") {
      toast.error("Only draft reports can be deleted");
      return;
    }
    const { error } = await fmDb.from("weekly_reports").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Weekly report deleted");
    qc.invalidateQueries({ queryKey: ["weekly_reports"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly Reports</h1>
          <p className="text-muted-foreground">
            Generate weekly FM operational reports for client submission.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            filename="weekly-reports"
            sheetName="Weekly Reports"
            rows={filteredReports}
            columns={[
              { key: "report_no", label: "Report No" },
              { key: "week_start", label: "Week Start" },
              { key: "week_end", label: "Week End" },
              { key: "status", label: "Status" },
              { key: "ppm_completed", label: "PPM Completed" },
              { key: "work_orders_completed", label: "WOs Completed" },
              { key: "sla_breaches", label: "SLA Breaches" },
            ]}
          />
          <Button onClick={generateReport} disabled={generating || contractFilter === "all"}>
            <Plus className="h-4 w-4 mr-2" /> Generate Weekly Report
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Filter
            label="Contract"
            value={contractFilter}
            onValueChange={(value) => {
              setContractFilter(value);
              setPage(1);
            }}
          >
            <SelectItem value="all">All Contracts</SelectItem>
            {contracts.map((contract: any) => (
              <SelectItem key={contract.id} value={contract.id}>
                {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                  (contract.customer_name ?? contract.title ?? "Untitled")}
              </SelectItem>
            ))}
          </Filter>
          <div>
            <Label className="text-xs">Week Start</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Week End</Label>
            <Input
              type="date"
              value={weekEnd}
              onChange={(event) => setWeekEnd(event.target.value)}
            />
          </div>
          <Filter
            label="Status"
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectItem value="all">All Statuses</SelectItem>
            {REPORT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </Filter>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Work Orders</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>PPM</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : paginate(filteredReports, page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No weekly reports found.
                </TableCell>
              </TableRow>
            ) : (
              paginate(filteredReports, page).map((row: any) => {
                const data = row.report_data ?? row.summary ?? {};
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.report_no ?? "Weekly Report"}
                    </TableCell>
                    <TableCell>
                      {row.contracts?.contract_no ?? row.contracts?.customer_name ?? "-"}
                    </TableCell>
                    <TableCell>
                      {row.week_start} to {row.week_end}
                    </TableCell>
                    <TableCell>
                      {data.workOrders?.completed ?? row.work_orders_completed}/
                      {data.workOrders?.total ?? "-"}
                    </TableCell>
                    <TableCell>{data.sla?.compliancePercent ?? 0}%</TableCell>
                    <TableCell>{data.ppm?.completionPercent ?? 0}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        row={row}
                        onView={() => setViewing(row)}
                        onEdit={() => startEdit(row)}
                        onDelete={() => remove(row)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={filteredReports.length} onPageChange={setPage} />
      </Card>

      <ReportViewDialog report={viewing} onClose={() => setViewing(null)} />
      <EditDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        form={editForm}
        setForm={setEditForm}
        save={saveEdit}
      />
    </div>
  );
}

function Filter({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function RowActions({
  row,
  onView,
  onEdit,
  onDelete,
}: {
  row: any;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" onClick={onView}>
        <Eye className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" disabled={row.status !== "Draft"}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft report?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReportViewDialog({ report, onClose }: { report: any | null; onClose: () => void }) {
  if (!report) return null;
  const data = report.report_data ?? report.summary ?? {};
  return (
    <Dialog
      open={Boolean(report)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none">
        <DialogHeader>
          <DialogTitle>{report.report_no ?? "Weekly Report"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {report.contracts?.customer_name ?? report.contracts?.contract_no ?? "Contract"} ·{" "}
              {report.week_start} to {report.week_end}
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Work Orders" value={data.workOrders?.total ?? 0} />
            <Metric label="SLA Compliance" value={`${data.sla?.compliancePercent ?? 0}%`} />
            <Metric label="PPM Completion" value={`${data.ppm?.completionPercent ?? 0}%`} />
            <Metric label="Shortage" value={data.manpower?.shortageCount ?? 0} />
          </div>
          <Section title="Work Orders" rows={data.workOrders} />
          <Section title="SLA / KPI" rows={data.sla} />
          <Section title="PPM" rows={data.ppm} />
          <Section title="Attendance / Manpower" rows={{ ...data.attendance, ...data.manpower }} />
          <Section title="Assets" rows={data.assets} />
          <Section title="Service Reports" rows={data.serviceReports} />
          <div className="rounded-md border p-3">
            <div className="font-medium">Client Notes</div>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {report.remarks || "No notes added."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, rows }: { title: string; rows: any }) {
  return (
    <Card className="p-3">
      <div className="font-medium mb-2">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
        {Object.entries(rows ?? {})
          .filter(([, value]) => typeof value !== "object")
          .map(([key, value]) => (
            <div key={key}>
              <span className="text-muted-foreground">{key}: </span>
              {String(value)}
            </div>
          ))}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}

function EditDialog({
  open,
  onClose,
  form,
  setForm,
  save,
}: {
  open: boolean;
  onClose: () => void;
  form: any;
  setForm: (value: any) => void;
  save: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Weekly Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Filter
            label="Status"
            value={form.status}
            onValueChange={(value) => setForm((prev: any) => ({ ...prev, status: value }))}
          >
            {REPORT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </Filter>
          <div>
            <Label>Prepared By</Label>
            <Input
              value={form.prepared_by}
              onChange={(event) =>
                setForm((prev: any) => ({ ...prev, prepared_by: event.target.value }))
              }
            />
          </div>
          <div>
            <Label>Reviewed By</Label>
            <Input
              value={form.reviewed_by}
              onChange={(event) =>
                setForm((prev: any) => ({ ...prev, reviewed_by: event.target.value }))
              }
            />
          </div>
          <div>
            <Label>Remarks / Client Notes</Label>
            <Input
              value={form.remarks}
              onChange={(event) =>
                setForm((prev: any) => ({ ...prev, remarks: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
