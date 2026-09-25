import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, CenterDetailField, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";
import { DEMO_STAFF, DEMO_JOBS, SUITABLE_STAFF_FOR_JOB } from "./prototypeData";

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
    // invoice_packs.contract_id carries a foreign key to fm_contracts only (per
    // src/integrations/supabase/types.ts) - there is no AMC-domain invoices table in this
    // schema, so an AMC contracts.id can never match a row here. Gate on the real FK instead
    // of querying a table this domain can never match.
    domain === "FM"
      ? supabase
          .from("invoice_packs")
          .select("id, invoice_no, total_amount, status, period_start, period_end")
          .eq("contract_id", contractId)
          .order("period_start", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from(serviceReportTable)
      .select("id, report_no, service_date, status")
      .eq("contract_id", contractId)
      .order("service_date", { ascending: true }),
    // ppm_visits.contract_id and contract_manpower_assignments.contract_id both carry a
    // foreign key to fm_contracts (not contracts) per src/integrations/supabase/types.ts -
    // confirmed against real data, where all ppm_visits/manpower rows match FM contracts and
    // none match AMC ones. So these are FM-only relations, despite being commonly thought of
    // as "AMC things" - gate on the real FK, not that assumption. AMC has its own separate
    // PPM table, amc_ppm_visits, whose contract_id carries a foreign key to contracts (the
    // AMC-domain table) - query that one for AMC instead. There is no AMC equivalent of
    // manpower.
    domain === "FM"
      ? supabase
          .from("ppm_visits")
          .select("id, planned_date, status")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true })
      : supabase
          .from("amc_ppm_visits")
          .select("id, planned_date, status")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true }),
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
  if ("error" in invoicesRes && invoicesRes.error) throw invoicesRes.error;
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
    const isCancelled = wo.status === "Cancelled";
    const isCompleted = wo.status === "Completed";
    const isPending = !isCancelled && !isCompleted;
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
        groupKey: isCancelled
          ? "work-order-cancelled"
          : isPending
            ? "work-order-pending"
            : "work-order-completed",
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

  for (const invoice of ("data" in invoicesRes ? invoicesRes.data : []) ?? []) {
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

  const timelineEvents: { date: string; label: string }[] = [];
  if (contract.end_date) timelineEvents.push({ date: contract.end_date, label: "Contract End" });
  for (const wo of workOrdersRes.data ?? []) {
    if (wo.completed_at)
      timelineEvents.push({
        date: wo.completed_at,
        label: `${wo.wo_no ?? "Work Order"} completed`,
      });
  }
  for (const invoice of ("data" in invoicesRes ? invoicesRes.data : []) ?? []) {
    if (invoice.period_start)
      timelineEvents.push({
        date: invoice.period_start,
        label: `Invoice ${invoice.invoice_no ?? ""}`.trim(),
      });
  }
  for (const payment of paymentsRes.data ?? []) {
    if (payment.payment_date) timelineEvents.push({ date: payment.payment_date, label: "Payment" });
  }
  for (const visit of ("data" in ppmVisitsRes ? ppmVisitsRes.data : []) ?? []) {
    if (visit.planned_date) timelineEvents.push({ date: visit.planned_date, label: "PPM Visit" });
  }
  timelineEvents.sort((a, b) => a.date.localeCompare(b.date));

  timelineEvents.forEach((event, index) => {
    ringOne.push({
      id: `timeline-event:${contractId}:${index}`,
      data: {
        kind: "timeline-event",
        label: event.label,
        sublabel: event.date,
        clickable: false,
        groupKey: "timeline",
      },
    });
  });

  return {
    centerLabel: contract.title ?? contract.customer_name ?? "Contract",
    centerSublabel: contract.status ?? "",
    ringOne,
  };
}

async function fetchWorkOrderConnections(
  domain: "AMC" | "FM",
  workOrderId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  exception: boolean;
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const table = domain === "AMC" ? "work_orders" : "fm_work_orders";
  const serviceReportTable = domain === "AMC" ? "service_reports" : "fm_service_reports";

  const [woRes, serviceReportsRes] = await Promise.all([
    supabase
      .from(table)
      .select(
        "id, wo_no, contract_id, customer_name, location, scheduled_date, status, priority, technician_id, technician_name, service_type, completion_due_at, completed_at, employees:technician_id(position)",
      )
      .eq("id", workOrderId)
      .maybeSingle(),
    supabase
      .from(serviceReportTable)
      .select("id, report_no, service_date")
      .eq("work_order_id", workOrderId),
  ]);
  const { data: wo, error } = woRes;
  if (error) throw error;
  if (!wo) throw new Error("Work order not found");

  const { data: serviceReports, error: srError } = serviceReportsRes;
  if (srError) throw srError;

  const technicianPosition = wo.employees?.position ?? undefined;

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  // contract_id is nullable on work_orders/fm_work_orders - only offer a way back
  // to the contract when this work order is actually attached to one.
  if (wo.contract_id) {
    ringOne.push({
      id: `contract:${domain}:${wo.contract_id}`,
      data: {
        kind: "contract",
        label: "Back to Contract",
        clickable: true,
        center: { kind: "contract", domain, id: wo.contract_id },
        groupKey: "contract",
      },
    });
  }

  ringOne.push({
    id: `customer-label:${workOrderId}`,
    data: {
      kind: "customer",
      label: wo.customer_name ?? "Customer",
      clickable: false,
      groupKey: "customer",
    },
  });

  if (wo.technician_name) {
    ringOne.push({
      id: `employee-info:${workOrderId}`,
      data: {
        kind: "employee-info",
        label: wo.technician_name,
        sublabel: technicianPosition,
        clickable: false,
        groupKey: "employee",
      },
    });
  }

  for (const report of serviceReports ?? []) {
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

  const isCancelled = wo.status === "Cancelled";
  const isCompleted = wo.status === "Completed";
  const isPending = !isCancelled && !isCompleted;
  const isOverdue =
    isPending && wo.completion_due_at ? new Date(wo.completion_due_at) < new Date() : false;

  // status is non-nullable; priority and location are both `string | null` on
  // work_orders/fm_work_orders, so only join in the parts that are actually present -
  // otherwise an absent location renders as a literal "null" (or a dangling separator).
  const sublabelParts = [wo.status];
  if (wo.priority) sublabelParts.push(wo.priority);
  if (wo.location) sublabelParts.push(wo.location);

  return {
    centerLabel: wo.wo_no ?? "Work Order",
    centerSublabel: sublabelParts.join(" · "),
    exception: Boolean(isOverdue),
    ringOne,
  };
}

function buildStaffCategoryRoot(): {
  centerLabel: string;
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const categories: { category: "available" | "booked" | "absent"; label: string }[] = [
    { category: "available", label: "Available" },
    { category: "booked", label: "Booked" },
    { category: "absent", label: "Absent" },
  ];
  const ringOne = categories.map(({ category, label }) => {
    const count = DEMO_STAFF.filter((s) => s.category === category).length;
    return {
      id: `staff-category:${category}`,
      data: {
        kind: "staff-category" as const,
        label,
        sublabel: `${count} staff`,
        clickable: true,
        center: { kind: "staff-category", category } as CenterEntity,
        groupKey: category,
        relationshipReason: `${label} reflects each technician's current attendance/assignment status.`,
      },
    };
  });
  return { centerLabel: "STAFF", ringOne };
}

function buildStaffCategoryMembers(category: "available" | "booked" | "absent"): {
  centerLabel: string;
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const members = DEMO_STAFF.filter((s) => s.category === category);
  const ringOne = members.map((member) => ({
    id: `staff-member:${member.id}`,
    data: {
      kind: "staff-member" as const,
      label: member.name,
      sublabel: member.skills,
      clickable: true,
      center: { kind: "staff-member", id: member.id } as CenterEntity,
      groupKey: "member",
      relationshipReason: `${member.name} is currently ${category}.`,
    },
  }));
  return { centerLabel: category.charAt(0).toUpperCase() + category.slice(1), ringOne };
}

function buildStaffMemberDetail(id: string): {
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const member = DEMO_STAFF.find((s) => s.id === id);
  if (!member) throw new Error("Staff member not found");

  const facts: { key: string; label: string; value: string }[] = [
    { key: "available-now", label: "Available Now", value: member.availableNow },
    { key: "next-job", label: "Next Job", value: member.nextJob },
    { key: "todays-jobs", label: "Today's Jobs", value: member.todaysJobs },
    { key: "skills", label: "Skills", value: member.skills },
    { key: "location", label: "Location", value: member.location },
  ];

  const ringOne = facts.map((fact) => ({
    id: `staff-detail:${member.id}:${fact.key}`,
    data: {
      kind: "staff-detail" as const,
      label: fact.label,
      sublabel: fact.value,
      clickable: false,
      groupKey: "detail",
      relationshipReason: `${fact.label} is a current attribute of ${member.name}.`,
    },
  }));

  return {
    centerLabel: member.name,
    centerSublabel: member.category,
    centerDetail: facts.map(({ label, value }) => ({ label, value })),
    ringOne,
  };
}

function buildScheduleCategoryRoot(): {
  centerLabel: string;
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const categories: {
    category: "today" | "unassigned" | "tomorrow" | "attention";
    label: string;
  }[] = [
    { category: "today", label: "Today's Jobs" },
    { category: "unassigned", label: "Unassigned" },
    { category: "tomorrow", label: "Tomorrow" },
    { category: "attention", label: "Attention Required" },
  ];
  const ringOne = categories.map(({ category, label }) => {
    const count = DEMO_JOBS.filter((j) => j.category === category).length;
    return {
      id: `schedule-category:${category}`,
      data: {
        kind: "schedule-category" as const,
        label,
        sublabel: `${count} job${count === 1 ? "" : "s"}`,
        exception: category === "attention" && count > 0,
        clickable: true,
        center: { kind: "schedule-category", category } as CenterEntity,
        groupKey: category,
        relationshipReason: `${label} groups jobs by their current scheduling state.`,
      },
    };
  });
  return { centerLabel: "SCHEDULES", ringOne };
}

function buildScheduleCategoryJobs(category: "today" | "unassigned" | "tomorrow" | "attention"): {
  centerLabel: string;
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const jobs = DEMO_JOBS.filter((j) => j.category === category);
  const ringOne = jobs.map((job) => ({
    id: `schedule-job:${job.id}`,
    data: {
      kind: "schedule-job" as const,
      label: job.title,
      sublabel: job.customer,
      exception: category === "attention",
      clickable: true,
      center: { kind: "schedule-job", id: job.id } as CenterEntity,
      groupKey: "job",
      relationshipReason: `${job.title} is currently in the "${category}" schedule state.`,
    },
  }));
  const labels: Record<string, string> = {
    today: "Today's Jobs",
    unassigned: "Unassigned",
    tomorrow: "Tomorrow",
    attention: "Attention Required",
  };
  return { centerLabel: labels[category] ?? category, ringOne };
}

function buildScheduleJobDetail(id: string): {
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
} {
  const job = DEMO_JOBS.find((j) => j.id === id);
  if (!job) throw new Error("Job not found");

  const ringOne: { id: string; data: UniverseNodeData }[] = [];
  const suitableIds = SUITABLE_STAFF_FOR_JOB[job.id] ?? [];
  for (const staffId of suitableIds) {
    const staff = DEMO_STAFF.find((s) => s.id === staffId);
    if (!staff) continue;
    ringOne.push({
      id: `staff-suggestion:${job.id}:${staff.id}`,
      data: {
        kind: "staff-member",
        label: staff.name,
        sublabel: `Suitable - ${staff.skills}`,
        clickable: false,
        groupKey: "suitable-staff",
        relationshipReason: `${staff.name} matches the required skill (${job.requiredSkill}) and is currently available.`,
      },
    });
  }

  return {
    centerLabel: job.title,
    centerSublabel: `${job.priority} priority`,
    centerDetail: [
      { label: "Customer", value: job.customer },
      { label: "Location", value: job.location },
      { label: "Required Skill", value: job.requiredSkill },
      { label: "Priority", value: job.priority },
    ],
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
        return {
          ...layoutAround({ centerId: "contracts-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "contract-category") {
        const ringOne = await fetchContractsInCategory(centerEntity.domain, centerEntity.status);
        const centerData: UniverseNodeData = {
          kind: "category",
          label: `${centerEntity.domain} · ${centerEntity.status}`,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `category:${centerEntity.domain}:${centerEntity.status}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
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
        return {
          ...layoutAround({
            centerId: `contract:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "work-order") {
        const { centerLabel, centerSublabel, exception, ringOne } = await fetchWorkOrderConnections(
          centerEntity.domain,
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "work-order",
          label: centerLabel,
          sublabel: centerSublabel,
          exception,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `work-order:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "staff-category" && centerEntity.category === "__root__") {
        const { centerLabel, ringOne } = buildStaffCategoryRoot();
        const centerData: UniverseNodeData = {
          kind: "staff-hub",
          label: centerLabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "staff-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "staff-category") {
        const { centerLabel, ringOne } = buildStaffCategoryMembers(
          centerEntity.category as "available" | "booked" | "absent",
        );
        const centerData: UniverseNodeData = {
          kind: "staff-category",
          label: centerLabel,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `staff-category:${centerEntity.category}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "staff-member") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } = buildStaffMemberDetail(
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "staff-member",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `staff-member:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      if (centerEntity.kind === "schedule-category" && centerEntity.category === "__root__") {
        const { centerLabel, ringOne } = buildScheduleCategoryRoot();
        const centerData: UniverseNodeData = {
          kind: "schedules-hub",
          label: centerLabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "schedules-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "schedule-category") {
        const { centerLabel, ringOne } = buildScheduleCategoryJobs(
          centerEntity.category as "today" | "unassigned" | "tomorrow" | "attention",
        );
        const centerData: UniverseNodeData = {
          kind: "schedule-category",
          label: centerLabel,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `schedule-category:${centerEntity.category}`,
            centerData,
            ringOne,
          }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "schedule-job") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } = buildScheduleJobDetail(
          centerEntity.id,
        );
        const centerData: UniverseNodeData = {
          kind: "schedule-job",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `schedule-job:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
    },
  });
}
