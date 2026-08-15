/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { summarizeAttendance, todayIso } from "@/lib/fm-manpower";

type ContractRecord = {
  id: string;
  title: string;
  contract_no: string | null;
  customer_name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  value: number | null;
  contract_scope_type?: string | null;
  site_name?: string | null;
  site_address?: string | null;
  building_type?: string | null;
  billing_cycle?: string | null;
  retention_percent?: number | null;
  vat_percent?: number | null;
};

type LineItemRecord = {
  id: string;
  description: string;
  quantity: number | null;
  uom: string | null;
  frequency: string | null;
  monthly_amount: number | null;
  annual_amount: number | null;
  service_categories?: { name: string } | null;
};

type LooseQuery = PromiseLike<{
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
}> & {
  select: (columns?: string, options?: unknown) => LooseQuery;
  order: (column: string, options?: unknown) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  not: (column: string, operator: string, value: unknown) => LooseQuery;
  limit: (count: number) => LooseQuery;
  single: () => LooseQuery;
};

type LooseSupabase = {
  from: (table: string) => LooseQuery;
};

const baseSections = [
  "Overview",
  "Line Items",
  "Assets",
  "PPM",
  "Manpower",
  "Work Orders",
  "SLA",
  "Reports",
  "Invoice Pack",
];
const fmOnlySections = ["Consumables & Equipment", "Billing Template"];
const fmDb = supabase as unknown as LooseSupabase;


function formatAED(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function statusClasses(status: string | null) {
  switch (status) {
    case "Active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Expired":
    case "Terminated":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export type ModuleType = "AMC" | "FM";

export function ContractWorkspace({ id, moduleType = "AMC" }: { id: string; moduleType?: ModuleType }) {
  const [section, setSection] = useState("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["contract-detail", id],
    queryFn: async () => {
      const today = todayIso();
      const [
        contractResult,
        lineItemsResult,
        assetsResult,
        workOrdersResult,
        manpowerPlansResult,
        manpowerAssignmentsResult,
        todayAttendanceResult,
        recentAttendanceResult,
        latestWeeklyReportResult,
        latestMonthlyReportResult,
        invoicePacksResult,
      ] = await Promise.all([
        fmDb.from("contracts").select("*").eq("id", id).single(),
        fmDb
          .from("contract_line_items")
          .select(
            "id, description, quantity, uom, frequency, monthly_amount, annual_amount, service_categories:service_category_id(name)",
          )
          .eq("contract_id", id)
          .order("created_at", { ascending: false }),
        fmDb
          .from("contract_assets")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", id)
          .eq("status", "Active"),
        supabase
          .from("work_orders")
          .select("id", { count: "exact", head: true })
          .eq("contract_id", id)
          .not("status", "in", "(Completed,Cancelled,Closed)"),
        fmDb.from("contract_manpower_plans").select("*").eq("contract_id", id),
        fmDb.from("contract_manpower_assignments").select("*").eq("contract_id", id),
        fmDb.from("attendance_logs").select("*").eq("contract_id", id).eq("attendance_date", today),
        fmDb
          .from("attendance_logs")
          .select(
            "id, attendance_date, employee_name, shift, shift_name, status, check_in, check_out",
          )
          .eq("contract_id", id)
          .order("attendance_date", { ascending: false })
          .limit(8),
        fmDb
          .from("weekly_reports")
          .select("*")
          .eq("contract_id", id)
          .order("week_start", { ascending: false })
          .limit(1),
        fmDb
          .from("monthly_reports")
          .select("*")
          .eq("contract_id", id)
          .order("month_start", { ascending: false })
          .limit(1),
        fmDb
          .from("invoice_packs")
          .select("*")
          .eq("contract_id", id)
          .order("billing_period_start", { ascending: false })
          .limit(20),
      ]);

      if (contractResult.error) throw contractResult.error;
      if (lineItemsResult.error) throw lineItemsResult.error;
      if (assetsResult.error) throw assetsResult.error;
      if (workOrdersResult.error) throw workOrdersResult.error;
      if (manpowerPlansResult.error) throw manpowerPlansResult.error;
      if (manpowerAssignmentsResult.error) throw manpowerAssignmentsResult.error;
      if (todayAttendanceResult.error) throw todayAttendanceResult.error;
      if (recentAttendanceResult.error) throw recentAttendanceResult.error;
      if (latestWeeklyReportResult.error) throw latestWeeklyReportResult.error;
      if (latestMonthlyReportResult.error) throw latestMonthlyReportResult.error;
      if (invoicePacksResult.error) throw invoicePacksResult.error;

      return {
        contract: contractResult.data as ContractRecord,
        lineItems: (lineItemsResult.data ?? []) as LineItemRecord[],
        assetsCount: assetsResult.count ?? 0,
        openWorkOrdersCount: workOrdersResult.count ?? 0,
        manpowerPlans: (manpowerPlansResult.data ?? []) as any[],
        manpowerAssignments: (manpowerAssignmentsResult.data ?? []) as any[],
        todayAttendance: (todayAttendanceResult.data ?? []) as any[],
        recentAttendance: (recentAttendanceResult.data ?? []) as any[],
        latestWeeklyReport: ((latestWeeklyReportResult.data as any[]) ?? [])[0] ?? null,
        latestMonthlyReport: ((latestMonthlyReportResult.data as any[]) ?? [])[0] ?? null,
        invoicePacks: (invoicePacksResult.data ?? []) as any[],
      };
    },
  });

  const lineItems = useMemo(() => data?.lineItems ?? [], [data?.lineItems]);
  const monthlyValue = useMemo(
    () => lineItems.reduce((sum, item) => sum + (Number(item.monthly_amount) || 0), 0),
    [lineItems],
  );
  const annualValue = useMemo(
    () => lineItems.reduce((sum, item) => sum + (Number(item.annual_amount) || 0), 0),
    [lineItems],
  );
  const serviceCategoryCount = useMemo(
    () => new Set(lineItems.map((item) => item.service_categories?.name).filter(Boolean)).size,
    [lineItems],
  );
  const manpowerSummary = useMemo(
    () =>
      summarizeAttendance(
        data?.manpowerPlans ?? [],
        data?.manpowerAssignments ?? [],
        data?.todayAttendance ?? [],
      ),
    [data?.manpowerAssignments, data?.manpowerPlans, data?.todayAttendance],
  );
  const latestMonthlyData = (data?.latestMonthlyReport?.report_data ??
    data?.latestMonthlyReport?.summary ??
    {}) as any;
  const latestInvoicePack = data?.invoicePacks?.[0] ?? null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthInvoice = data?.invoicePacks?.find(
    (pack: any) =>
      pack.invoice_month === currentMonth ||
      pack.billing_period_start?.slice(0, 7) === currentMonth,
  );
  const pendingInvoiceCount = (data?.invoicePacks ?? []).filter((pack: any) =>
    ["Prepared", "Submitted", "Client Review"].includes(pack.status),
  ).length;
  const unpaidInvoiceCount = (data?.invoicePacks ?? []).filter((pack: any) =>
    ["Approved", "Invoiced"].includes(pack.status),
  ).length;

  if (isLoading) {
    return <div className="p-6 max-w-7xl mx-auto text-muted-foreground">Loading contract...</div>;
  }

  if (!data?.contract) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Button variant="outline" asChild>
          <Link to={moduleType === "FM" ? "/fm-contracts" : "/amc-contracts"}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Contracts
          </Link>
        </Button>
        <Card className="p-6 text-sm text-muted-foreground">Contract not found.</Card>
      </div>
    );
  }

  const contract = data.contract;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={moduleType === "FM" ? "/fm-contracts" : "/amc-contracts"}>
              <ArrowLeft className="h-4 w-4 mr-2" /> {moduleType === "FM" ? "FM Contracts" : "AMC Contracts"}
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{contract.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{contract.customer_name ?? "No customer"}</span>
              <span>{contract.contract_no ?? "No contract number"}</span>
              <Badge
                variant="outline"
                className={cn("font-medium", statusClasses(contract.status))}
              >
                {contract.status ?? "Draft"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Contract Value</div>
          <div className="text-2xl font-bold">{formatAED(contract.value)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <SummaryCard label="Monthly Value" value={formatAED(monthlyValue)} />
        <SummaryCard label="Annual Value" value={formatAED(annualValue)} />
        <SummaryCard label="Service Categories" value={serviceCategoryCount} />
        <SummaryCard label="Line Items" value={lineItems.length} />
        <SummaryCard label="Active Assets" value={data.assetsCount} />
        <SummaryCard label="Open Work Orders" value={data.openWorkOrdersCount} />
      </div>

      <Card className="p-2">
        <div className="flex flex-wrap gap-2">
          {sections.map((name) => (
            <Button
              key={name}
              variant={section === name ? "default" : "ghost"}
              size="sm"
              onClick={() => setSection(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </Card>

      {section === "Overview" && (
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Info label="Client" value={contract.customer_name} />
            <Info label="Start Date" value={contract.start_date} />
            <Info label="End Date" value={contract.end_date} />
            <Info label="Scope Type" value={contract.contract_scope_type} />
            <Info label="Site Name" value={contract.site_name} />
            <Info label="Building Type" value={contract.building_type} />
            <Info label="Billing Cycle" value={contract.billing_cycle} />
            <Info label="Retention %" value={contract.retention_percent} />
            <Info label="VAT %" value={contract.vat_percent} />
            <div className="md:col-span-3">
              <Info label="Site Address" value={contract.site_address} />
            </div>
          </div>
        </Card>
      )}

      {section === "Line Items" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead className="text-right">Annual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No line items for this contract.
                  </TableCell>
                </TableRow>
              ) : (
                lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.service_categories?.name ?? "—"}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>
                      {item.quantity ?? "—"} {item.uom ?? ""}
                    </TableCell>
                    <TableCell>{item.frequency ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatAED(item.monthly_amount)}</TableCell>
                    <TableCell className="text-right">{formatAED(item.annual_amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {section === "Manpower" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <SummaryCard label="Required Today" value={manpowerSummary.required} />
            <SummaryCard label="Assigned" value={manpowerSummary.assigned} />
            <SummaryCard label="Present Today" value={manpowerSummary.present} />
            <SummaryCard label="Shortage Today" value={manpowerSummary.shortage} />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.recentAttendance ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No recent attendance rows for this contract.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.recentAttendance.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.attendance_date}</TableCell>
                      <TableCell>{row.employee_name ?? "—"}</TableCell>
                      <TableCell>{row.shift ?? row.shift_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.check_in ? new Date(row.check_in).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell>
                        {row.check_out ? new Date(row.check_out).toLocaleTimeString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {section === "Reports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Current Month SLA"
              value={`${latestMonthlyData.sla?.compliancePercent ?? data.latestMonthlyReport?.sla_compliance_percent ?? 0}%`}
            />
            <SummaryCard
              label="Current Month PPM"
              value={`${latestMonthlyData.ppm?.completionPercent ?? data.latestMonthlyReport?.ppm_compliance_percent ?? 0}%`}
            />
            <SummaryCard
              label="Manpower Shortage"
              value={
                latestMonthlyData.manpower?.shortageCount ??
                data.latestMonthlyReport?.manpower_variance ??
                0
              }
            />
            <SummaryCard
              label="Latest Reports"
              value={[data.latestWeeklyReport, data.latestMonthlyReport].filter(Boolean).length}
            />
          </div>
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/fm-weekly-reports">Weekly Reports</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/fm-monthly-reports">Monthly Reports</Link>
              </Button>
            </div>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>PPM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[data.latestWeeklyReport, data.latestMonthlyReport].filter(Boolean).length ===
                0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No reports generated yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  [
                    { type: "Weekly", row: data.latestWeeklyReport },
                    { type: "Monthly", row: data.latestMonthlyReport },
                  ]
                    .filter((item) => item.row)
                    .map((item) => {
                      const reportData = item.row.report_data ?? item.row.summary ?? {};
                      const start = item.row.week_start ?? item.row.month_start;
                      const end = item.row.week_end ?? item.row.month_end;
                      return (
                        <TableRow key={`${item.type}-${item.row.id}`}>
                          <TableCell>{item.type}</TableCell>
                          <TableCell className="font-medium">{item.row.report_no ?? "—"}</TableCell>
                          <TableCell>
                            {start} to {end}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.row.status ?? "Draft"}</Badge>
                          </TableCell>
                          <TableCell>
                            {reportData.sla?.compliancePercent ??
                              item.row.sla_compliance_percent ??
                              0}
                            %
                          </TableCell>
                          <TableCell>
                            {reportData.ppm?.completionPercent ??
                              item.row.ppm_compliance_percent ??
                              0}
                            %
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {section === "Invoice Pack" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Current Month Status"
              value={currentMonthInvoice?.status ?? "Not Prepared"}
            />
            <SummaryCard
              label="Current Month Subtotal"
              value={formatAED(currentMonthInvoice?.subtotal_amount)}
            />
            <SummaryCard
              label="Current Month Net"
              value={formatAED(currentMonthInvoice?.net_payable)}
            />
            <SummaryCard label="Pending Approval" value={pendingInvoiceCount} />
          </div>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Latest Invoice Pack</div>
                <div className="text-sm text-muted-foreground">
                  {latestInvoicePack
                    ? `${latestInvoicePack.invoice_number ?? latestInvoicePack.invoice_no ?? "Invoice"} · ${latestInvoicePack.status} · ${formatAED(latestInvoicePack.net_payable)}`
                    : "No invoice packs generated yet."}
                </div>
                <div className="text-sm text-muted-foreground">
                  Unpaid approved/invoiced packs: {unpaidInvoiceCount}
                </div>
              </div>
              <Button asChild>
                <Link to="/fm-invoice-packs">Invoice Packs</Link>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {!["Overview", "Line Items", "Manpower", "Reports", "Invoice Pack"].includes(section) && (
        <Card className="p-6 text-sm text-muted-foreground">{section} coming next.</Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
