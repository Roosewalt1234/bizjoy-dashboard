/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
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
import { buildMonthlyReportPayload, getDateRangeForMonth, REPORT_STATUSES } from "@/lib/fm-reports";

export const Route = createFileRoute("/_authenticated/fm-monthly-reports")({
  validateSearch: (search: Record<string, unknown>): { report_id?: string } =>
    typeof search.report_id === "string" ? { report_id: search.report_id } : {},
  component: ContractMonthlyReportsPage,
});


const fmDb = supabase as any;

function ContractMonthlyReportsPage() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState("all");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
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
  const range = getDateRangeForMonth(month);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-monthly-reports"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("fm_contracts")
        .select("id, title, contract_no, customer_name, site_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["monthly_reports"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("monthly_reports")
        .select("*, fm_contracts:contract_id(id, title, contract_no, customer_name, site_name)")
        .order("month_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deep link: /fm-monthly-reports?report_id=... opens that report.
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



  const { data: invoicePacks = [] } = useQuery({
    queryKey: ["monthly-report-invoice-packs"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("invoice_packs")
        .select("id, contract_id, invoice_month, billing_period_start, status");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredReports = useMemo(
    () =>
      (reports as any[]).filter((row) => {
        if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
        if (statusFilter !== "all" && row.status !== statusFilter) return false;
        if (month && row.month_start.slice(0, 7) !== month) return false;
        return true;
      }),
    [reports, contractFilter, month, statusFilter],
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
      fmDb.from("fm_contracts").select("*").eq("id", contractId).single(),
      fmDb.from("fm_work_orders").select("*").eq("contract_id", contractId),
      fmDb
        .from("ppm_visits")
        .select("*, service_categories:service_category_id(id, name)")
        .eq("contract_id", contractId),
      fmDb.from("attendance_logs").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_plans").select("*").eq("contract_id", contractId),
      fmDb.from("contract_manpower_assignments").select("*").eq("contract_id", contractId),
      fmDb.from("contract_assets").select("*").eq("contract_id", contractId),
      fmDb.from("fm_service_reports").select("*").eq("contract_id", contractId),
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
      const payload = buildMonthlyReportPayload({ ...source, start: range.start, end: range.end });
      const period = await fmDb
        .from("reporting_periods")
        .select("id")
        .eq("contract_id", contractFilter)
        .eq("period_type", "Monthly")
        .eq("period_start", range.start)
        .eq("period_end", range.end)
        .maybeSingle();
      let periodId = period.data?.id ?? null;
      if (!periodId) {
        const created = await fmDb
          .from("reporting_periods")
          .insert({
            contract_id: contractFilter,
            period_type: "Monthly",
            period_start: range.start,
            period_end: range.end,
            label: `Monthly ${month}`,
            status: "Generated",
          })
          .select("id")
          .single();
        if (created.error) throw created.error;
        periodId = created.data.id;
      }
      const { error } = await fmDb.from("monthly_reports").insert({
        contract_id: contractFilter,
        reporting_period_id: periodId,
        month_start: range.start,
        month_end: range.end,
        report_no: `MR-${month}`,
        status: "Draft",
        summary: payload,
        report_data: payload,
        ppm_compliance_percent: payload.ppm.completionPercent,
        reactive_closure_percent: payload.workOrders.total
          ? Math.round((payload.workOrders.completed / payload.workOrders.total) * 100)
          : 0,
        sla_compliance_percent: payload.sla.compliancePercent,
        manpower_variance: payload.manpower.shortageCount,
        remarks: "",
      });
      if (error) throw error;
      toast.success("Monthly report generated");
      qc.invalidateQueries({ queryKey: ["monthly_reports"] });
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
      .from("monthly_reports")
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
    toast.success("Monthly report updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["monthly_reports"] });
  }

  async function remove(row: any) {
    if (row.status !== "Draft") {
      toast.error("Only draft reports can be deleted");
      return;
    }
    const { error } = await fmDb.from("monthly_reports").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Monthly report deleted");
    qc.invalidateQueries({ queryKey: ["monthly_reports"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Reports</h1>
          <p className="text-muted-foreground">
            Generate monthly FM client reports for operations and invoice support.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            filename="monthly-reports"
            sheetName="Monthly Reports"
            rows={filteredReports}
            columns={[
              { key: "report_no", label: "Report No" },
              { key: "month_start", label: "Month Start" },
              { key: "month_end", label: "Month End" },
              { key: "status", label: "Status" },
              { key: "ppm_compliance_percent", label: "PPM %" },
              { key: "sla_compliance_percent", label: "SLA %" },
              { key: "manpower_variance", label: "Manpower Shortage" },
            ]}
          />
          <Button onClick={generateReport} disabled={generating || contractFilter === "all"}>
            <Plus className="h-4 w-4 mr-2" /> Generate Monthly Report
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
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
              <TableHead>Month</TableHead>
              <TableHead>Executive Status</TableHead>
              <TableHead>Work Orders</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>PPM</TableHead>
              <TableHead>Invoice Pack</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : paginate(filteredReports, page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No monthly reports found.
                </TableCell>
              </TableRow>
            ) : (
              paginate(filteredReports, page).map((row: any) => {
                const data = row.report_data ?? row.summary ?? {};
                const invoicePack = (invoicePacks as any[]).find(
                  (pack) =>
                    pack.contract_id === row.contract_id &&
                    (pack.invoice_month === row.month_start.slice(0, 7) ||
                      pack.billing_period_start === row.month_start),
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.report_no ?? "Monthly Report"}
                    </TableCell>
                    <TableCell>
                      {row.fm_contracts?.contract_no ?? row.fm_contracts?.customer_name ?? "-"}
                    </TableCell>
                    <TableCell>{row.month_start.slice(0, 7)}</TableCell>
                    <TableCell>{data.executiveSummary?.overallStatus ?? "-"}</TableCell>
                    <TableCell>
                      {data.workOrders?.completed ?? 0}/{data.workOrders?.total ?? 0}
                    </TableCell>
                    <TableCell>{data.sla?.compliancePercent ?? 0}%</TableCell>
                    <TableCell>{data.ppm?.completionPercent ?? 0}%</TableCell>
                    <TableCell>
                      {invoicePack ? (
                        <Badge variant="outline">{invoicePack.status}</Badge>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/fm-invoice-packs">Create Invoice Pack</Link>
                        </Button>
                      )}
                    </TableCell>
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
          <DialogTitle>{report.report_no ?? "Monthly Report"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {report.fm_contracts?.customer_name ?? report.fm_contracts?.contract_no ?? "Contract"} ·{" "}
              {report.month_start} to {report.month_end}
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
            </Button>
          </div>
          <div className="rounded-md border p-3">
            <div className="font-medium">Executive Summary</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-2">
              <div>
                <span className="text-muted-foreground">Contract: </span>
                {data.executiveSummary?.contractName ?? "-"}
              </div>
              <div>
                <span className="text-muted-foreground">Site: </span>
                {data.executiveSummary?.siteName ?? "-"}
              </div>
              <div>
                <span className="text-muted-foreground">Overall: </span>
                {data.executiveSummary?.overallStatus ?? "-"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Completed WOs" value={data.workOrders?.completed ?? 0} />
            <Metric label="SLA Compliance" value={`${data.sla?.compliancePercent ?? 0}%`} />
            <Metric label="PPM Completion" value={`${data.ppm?.completionPercent ?? 0}%`} />
            <Metric
              label="Manpower Compliance"
              value={`${data.manpower?.compliancePercent ?? 0}%`}
            />
          </div>
          <Section title="Work Order Summary" rows={data.workOrders} />
          <Section title="SLA / KPI Summary" rows={data.sla} />
          <Section title="PPM Summary" rows={data.ppm} />
          <Section
            title="Attendance / Manpower Summary"
            rows={{ ...data.attendance, ...data.manpower }}
          />
          <Section title="Asset Summary" rows={data.assets} />
          <Section title="Service Report Summary" rows={data.serviceReports} />
          <div className="rounded-md border p-3">
            <div className="font-medium">Client Submission Notes</div>
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
          <DialogTitle>Edit Monthly Report</DialogTitle>
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
