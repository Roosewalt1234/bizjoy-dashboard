import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  component: ContractDetailPage,
});

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
  single: () => LooseQuery;
};

type LooseSupabase = {
  from: (table: string) => LooseQuery;
};

const sections = [
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

function ContractDetailPage() {
  const { id } = Route.useParams();
  const [section, setSection] = useState("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["contract-detail", id],
    queryFn: async () => {
      const [contractResult, lineItemsResult, assetsResult, workOrdersResult] = await Promise.all([
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
      ]);

      if (contractResult.error) throw contractResult.error;
      if (lineItemsResult.error) throw lineItemsResult.error;
      if (assetsResult.error) throw assetsResult.error;
      if (workOrdersResult.error) throw workOrdersResult.error;

      return {
        contract: contractResult.data as ContractRecord,
        lineItems: (lineItemsResult.data ?? []) as LineItemRecord[],
        assetsCount: assetsResult.count ?? 0,
        openWorkOrdersCount: workOrdersResult.count ?? 0,
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

  if (isLoading) {
    return <div className="p-6 max-w-7xl mx-auto text-muted-foreground">Loading contract...</div>;
  }

  if (!data?.contract) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <Button variant="outline" asChild>
          <Link to="/contracts">
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
            <Link to="/contracts">
              <ArrowLeft className="h-4 w-4 mr-2" /> Contracts
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

      {!["Overview", "Line Items"].includes(section) && (
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
