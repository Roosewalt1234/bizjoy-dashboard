import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";

async function fetchContractCategoryCounts(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const [amc, fm] = await Promise.all([
    supabase.from("contracts").select("status"),
    supabase.from("fm_contracts").select("status"),
  ]);
  if (amc.error) throw amc.error;
  if (fm.error) throw fm.error;

  const counts = new Map<string, { domain: "AMC" | "FM"; status: string; count: number }>();
  for (const row of amc.data ?? []) {
    const status = row.status ?? "Unknown";
    const key = `AMC:${status}`;
    counts.set(key, { domain: "AMC", status, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  for (const row of fm.data ?? []) {
    const status = row.status ?? "Unknown";
    const key = `FM:${status}`;
    counts.set(key, { domain: "FM", status, count: (counts.get(key)?.count ?? 0) + 1 });
  }

  return [...counts.values()].map(({ domain, status, count }) => ({
    id: `category:${domain}:${status}`,
    data: {
      kind: "category" as const,
      label: `${domain} · ${status}`,
      sublabel: `${count} contract${count === 1 ? "" : "s"}`,
      clickable: true,
      center: { kind: "contract-category", domain, status } as CenterEntity,
      groupKey: domain,
    },
  }));
}

async function fetchContractsInCategory(
  domain: "AMC" | "FM",
  status: string,
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const table = domain === "AMC" ? "contracts" : "fm_contracts";
  const { data, error } = await supabase
    .from(table)
    .select("id, title, customer_name, end_date")
    .eq("status", status)
    .order("title");
  if (error) throw error;

  const today = new Date();
  const soonDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30),
  );
  const soon = soonDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

  return (data ?? []).map((row) => ({
    id: `contract:${domain}:${row.id}`,
    data: {
      kind: "contract" as const,
      label: row.title ?? row.customer_name ?? "Untitled contract",
      sublabel: row.customer_name ?? undefined,
      exception: row.end_date ? row.end_date <= soon : false,
      clickable: true,
      center: { kind: "contract", domain, id: row.id } as CenterEntity,
      groupKey: "contract",
    },
  }));
}

async function fetchContractConnections(
  domain: "AMC" | "FM",
  contractId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const contractTable = domain === "AMC" ? "contracts" : "fm_contracts";
  const workOrderTable = domain === "AMC" ? "work_orders" : "fm_work_orders";
  const paymentTable = domain === "AMC" ? "contract_payments" : "fm_contract_payments";
  const serviceReportTable = domain === "AMC" ? "service_reports" : "fm_service_reports";

  const [
    contractRes,
    workOrdersRes,
    paymentsRes,
    invoicesRes,
    serviceReportsRes,
    ppmVisitsRes,
    manpowerRes,
  ] = await Promise.all([
    supabase
      .from(contractTable)
      .select("id, title, customer_id, customer_name, status, value, end_date")
      .eq("id", contractId)
      .maybeSingle(),
    supabase
      .from(workOrderTable)
      .select("id, wo_no, status, scheduled_date, completion_due_at, completed_at, priority")
      .eq("contract_id", contractId)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from(paymentTable)
      .select("id, value, status, payment_date")
      .eq("contract_id", contractId)
      .order("payment_date", { ascending: true }),
    supabase
      .from("invoice_packs")
      .select("id, invoice_no, total_amount, status, period_start, period_end")
      .eq("contract_id", contractId)
      .order("period_start", { ascending: true }),
    supabase
      .from(serviceReportTable)
      .select("id, report_no, service_date, status")
      .eq("contract_id", contractId)
      .order("service_date", { ascending: true }),
    // ppm_visits.contract_id and contract_manpower_assignments.contract_id both carry a
    // foreign key to fm_contracts (not contracts) per src/integrations/supabase/types.ts -
    // confirmed against real data, where all ppm_visits/manpower rows match FM contracts and
    // none match AMC ones. So these are FM-only relations, despite being commonly thought of
    // as "AMC things" - gate on the real FK, not that assumption.
    domain === "FM"
      ? supabase
          .from("ppm_visits")
          .select("id, planned_date, status")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    domain === "FM"
      ? supabase
          .from("contract_manpower_assignments")
          .select("id, employee_id, employee_name")
          .eq("contract_id", contractId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (contractRes.error) throw contractRes.error;
  if (workOrdersRes.error) throw workOrdersRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  if (serviceReportsRes.error) throw serviceReportsRes.error;
  if ("error" in ppmVisitsRes && ppmVisitsRes.error) throw ppmVisitsRes.error;
  if ("error" in manpowerRes && manpowerRes.error) throw manpowerRes.error;

  const contract = contractRes.data;
  if (!contract) {
    throw new Error("Contract not found");
  }

  const now = new Date();
  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  if (contract.customer_id) {
    ringOne.push({
      id: `customer:${contract.customer_id}`,
      data: {
        kind: "customer",
        label: contract.customer_name ?? "Customer",
        clickable: false,
        groupKey: "customer",
      },
    });
  }

  for (const wo of workOrdersRes.data ?? []) {
    const isPending = wo.status !== "Completed";
    const isOverdue = isPending && wo.completion_due_at && new Date(wo.completion_due_at) < now;
    ringOne.push({
      id: `work-order:${domain}:${wo.id}`,
      data: {
        kind: "work-order",
        label: wo.wo_no ?? "Work Order",
        sublabel: wo.status,
        exception: Boolean(isOverdue),
        clickable: true,
        center: { kind: "work-order", domain, id: wo.id },
        groupKey: isPending ? "work-order-pending" : "work-order-completed",
      },
    });
  }

  for (const visit of ("data" in ppmVisitsRes ? ppmVisitsRes.data : []) ?? []) {
    ringOne.push({
      id: `ppm-visit:${visit.id}`,
      data: {
        kind: "ppm-visit",
        label: "PPM Visit",
        sublabel: visit.planned_date ?? undefined,
        clickable: false,
        groupKey: "ppm",
      },
    });
  }

  for (const assignment of ("data" in manpowerRes ? manpowerRes.data : []) ?? []) {
    ringOne.push({
      id: `manpower:${assignment.id}`,
      data: {
        kind: "manpower",
        label: assignment.employee_name ?? "Assigned staff",
        clickable: false,
        groupKey: "manpower",
      },
    });
  }

  for (const invoice of invoicesRes.data ?? []) {
    ringOne.push({
      id: `invoice:${invoice.id}`,
      data: {
        kind: "invoice",
        label: invoice.invoice_no ?? "Invoice",
        sublabel: invoice.total_amount != null ? `AED ${invoice.total_amount}` : undefined,
        clickable: false,
        groupKey: "invoice",
      },
    });
  }

  for (const payment of paymentsRes.data ?? []) {
    ringOne.push({
      id: `payment:${payment.id}`,
      data: {
        kind: "payment",
        label: payment.status ?? "Payment",
        sublabel: payment.value != null ? `AED ${payment.value}` : undefined,
        clickable: false,
        groupKey: "payment",
      },
    });
  }

  for (const report of serviceReportsRes.data ?? []) {
    ringOne.push({
      id: `service-report:${report.id}`,
      data: {
        kind: "service-report",
        label: report.report_no ?? "Service Report",
        sublabel: report.service_date ?? undefined,
        clickable: false,
        groupKey: "service-report",
      },
    });
  }

  return {
    centerLabel: contract.title ?? contract.customer_name ?? "Contract",
    centerSublabel: contract.status ?? "",
    ringOne,
  };
}

export function useUniverseGraph(centerEntity: CenterEntity, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["universe-graph", centerEntityKey(centerEntity)],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      if (centerEntity.kind === "contract-category" && centerEntity.status === "__root__") {
        const ringOne = await fetchContractCategoryCounts();
        const centerData: UniverseNodeData = {
          kind: "contracts-hub",
          label: "CONTRACTS",
          clickable: false,
        };
        return layoutAround({ centerId: "contracts-hub", centerData, ringOne });
      }

      if (centerEntity.kind === "contract-category") {
        const ringOne = await fetchContractsInCategory(centerEntity.domain, centerEntity.status);
        const centerData: UniverseNodeData = {
          kind: "category",
          label: `${centerEntity.domain} · ${centerEntity.status}`,
          clickable: false,
        };
        return layoutAround({
          centerId: `category:${centerEntity.domain}:${centerEntity.status}`,
          centerData,
          ringOne,
        });
      }

      if (centerEntity.kind === "contract") {
        const { centerLabel, centerSublabel, ringOne } = await fetchContractConnections(
          centerEntity.domain,
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "contract",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return layoutAround({
          centerId: `contract:${centerEntity.domain}:${centerEntity.id}`,
          centerData,
          ringOne,
        });
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
    },
  });
}
