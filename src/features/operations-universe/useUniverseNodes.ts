import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { layoutAround } from "./layout";
import type { CenterEntity, CenterDetailField, UniverseNodeData } from "./types";
import { centerEntityKey } from "./types";

function formatAttendanceTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

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
  centerDetail: CenterDetailField[];
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
          .select("id, planned_date, due_date, status, work_order_id")
          .eq("contract_id", contractId)
          .order("planned_date", { ascending: true })
      : supabase
          .from("amc_ppm_visits")
          .select("id, planned_date, due_date, status, work_order_id")
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
  const todayStr = now.toISOString().slice(0, 10);
  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  if (contract.customer_id) {
    ringOne.push({
      id: `customer:${contract.customer_id}`,
      data: {
        kind: "customer",
        label: contract.customer_name ?? "Customer",
        clickable: true,
        center: { kind: "customer", id: contract.customer_id },
        groupKey: "customer",
        relationshipReason: `${contract.customer_name ?? "This customer"} is the party this contract is with.`,
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
        relationshipReason: `${wo.wo_no ?? "This work order"} is scoped under this contract.`,
      },
    });
  }

  const hasPendingWorkOrder = ringOne.some((node) => node.data.groupKey === "work-order-pending");
  if (!hasPendingWorkOrder) {
    ringOne.push({
      id: `contract-empty:${contractId}:pending-work-orders`,
      data: {
        kind: "staff-detail",
        label: "No open work orders",
        clickable: false,
        groupKey: "work-order-pending",
      },
    });
  }

  for (const visit of ("data" in ppmVisitsRes ? ppmVisitsRes.data : []) ?? []) {
    const visitDate = visit.due_date ?? visit.planned_date;
    const isOverdue = Boolean(visitDate && visitDate < todayStr && !visit.work_order_id);
    ringOne.push({
      id: `ppm-visit:${visit.id}`,
      data: {
        kind: "ppm-visit",
        label: visitDate ? `PPM · ${visitDate}` : "PPM Visit",
        sublabel: visit.status ?? undefined,
        exception: isOverdue,
        clickable: true,
        center: visit.work_order_id
          ? { kind: "work-order", domain, id: visit.work_order_id }
          : { kind: "ppm-visit", domain, id: visit.id },
        groupKey: "ppm",
        edgeStyle: "planned",
        relationshipReason: `This PPM visit is scheduled under this contract.`,
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
        relationshipReason: `${invoice.invoice_no ?? "This invoice"} bills work performed under this contract.`,
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
        relationshipReason: `This payment was received against this contract.`,
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

  const centerDetail: CenterDetailField[] = [
    { label: "Reference", value: contract.title ?? "-" },
    { label: "Status", value: contract.status ?? "-" },
    { label: "Customer", value: contract.customer_name ?? "-" },
    { label: "Value", value: contract.value != null ? `AED ${contract.value}` : "-" },
    { label: "End Date", value: contract.end_date ?? "-" },
  ];

  return {
    centerLabel: contract.title ?? contract.customer_name ?? "Contract",
    centerSublabel: contract.status ?? "",
    centerDetail,
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
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const table = domain === "AMC" ? "work_orders" : "fm_work_orders";
  const serviceReportTable = domain === "AMC" ? "service_reports" : "fm_service_reports";

  const [woRes, serviceReportsRes] = await Promise.all([
    supabase
      .from(table)
      .select(
        "id, wo_no, contract_id, customer_id, customer_name, location, scheduled_date, status, priority, technician_id, technician_name, service_type, completion_due_at, completed_at, employees:technician_id(position)",
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
        relationshipReason: "This work order was raised under this contract.",
      },
    });
  }

  // customer_id is nullable on work_orders/fm_work_orders - only offer a way back
  // to the customer when this work order is actually attached to one.
  if (wo.customer_id) {
    ringOne.push({
      id: `customer:${wo.customer_id}`,
      data: {
        kind: "customer",
        label: wo.customer_name ?? "Customer",
        clickable: true,
        center: { kind: "customer", id: wo.customer_id },
        groupKey: "customer",
        relationshipReason: `${wo.customer_name ?? "This customer"} is the party this work order is for.`,
      },
    });
  }

  if (wo.technician_name) {
    ringOne.push({
      id: `employee-info:${workOrderId}`,
      data: {
        kind: "employee-info",
        label: wo.technician_name,
        sublabel: technicianPosition,
        clickable: Boolean(wo.technician_id),
        center: wo.technician_id
          ? {
              kind: "employee",
              id: wo.technician_id,
              name: wo.technician_name,
              position: technicianPosition,
            }
          : undefined,
        groupKey: "employee",
        relationshipReason: `${wo.technician_name} is assigned to perform this work order.`,
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

  const centerDetail: CenterDetailField[] = [
    { label: "Status", value: wo.status ?? "-" },
    { label: "Priority", value: wo.priority ?? "-" },
    { label: "Location", value: wo.location ?? "-" },
    { label: "Scheduled", value: wo.scheduled_date ?? "-" },
    { label: "Customer", value: wo.customer_name ?? "-" },
  ];

  return {
    centerLabel: wo.wo_no ?? "Work Order",
    centerSublabel: sublabelParts.join(" · "),
    exception: Boolean(isOverdue),
    centerDetail,
    ringOne,
  };
}

async function fetchCustomerConnections(customerId: string): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const [customerRes, amcContractsRes, fmContractsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("display_name, company_name, email, phone, address_city")
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("contracts")
      .select("id, title, status")
      .eq("customer_id", customerId)
      .order("title"),
    supabase
      .from("fm_contracts")
      .select("id, title, status")
      .eq("customer_id", customerId)
      .order("title"),
  ]);

  if (customerRes.error) throw customerRes.error;
  if (amcContractsRes.error) throw amcContractsRes.error;
  if (fmContractsRes.error) throw fmContractsRes.error;

  const customer = customerRes.data;
  if (!customer) throw new Error("Customer not found");

  const name = customer.display_name ?? customer.company_name ?? "Customer";

  const contracts = [
    ...(amcContractsRes.data ?? []).map((c) => ({ ...c, domain: "AMC" as const })),
    ...(fmContractsRes.data ?? []).map((c) => ({ ...c, domain: "FM" as const })),
  ];

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  for (const c of contracts) {
    ringOne.push({
      id: `contract:${c.domain}:${c.id}`,
      data: {
        kind: "contract",
        label: c.title ?? "Contract",
        sublabel: c.status ?? undefined,
        clickable: true,
        center: { kind: "contract", domain: c.domain, id: c.id },
        groupKey: "contract",
        relationshipReason: `${c.title ?? "This contract"} belongs to ${name}.`,
      },
    });
  }

  if (contracts.length === 0) {
    ringOne.push({
      id: `customer-empty:${customerId}:contracts`,
      data: {
        kind: "staff-detail",
        label: "No contracts on file",
        clickable: false,
        groupKey: "contract",
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Company", value: customer.company_name ?? "-" },
    { label: "Email", value: customer.email ?? "-" },
    { label: "Phone", value: customer.phone ?? "-" },
    { label: "City", value: customer.address_city ?? "-" },
  ];

  return {
    centerLabel: name,
    centerSublabel: customer.company_name ?? "",
    centerDetail,
    ringOne,
  };
}

async function fetchStaffHubRing(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name, position")
    .eq("status", "Active")
    .order("full_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const name = row.full_name ?? `${row.first_name} ${row.last_name ?? ""}`.trim();
    return {
      id: `staff-member:${row.id}`,
      data: {
        kind: "staff-member" as const,
        label: name,
        sublabel: row.position ?? undefined,
        clickable: true,
        center: {
          kind: "employee",
          id: row.id,
          name,
          position: row.position ?? undefined,
        } as CenterEntity,
        groupKey: "member",
      },
    };
  });
}

async function fetchEmployeeConnections(employeeId: string): Promise<{
  centerLabel: string;
  centerSublabel: string;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employeeRes, attendanceRes, amcWosRes, fmWosRes] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "full_name, first_name, last_name, position, phone, email, employment_type, staffing_model",
      )
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("check_in, check_out, status")
      .eq("employee_id", employeeId)
      .eq("attendance_date", todayStr),
    supabase
      .from("work_orders")
      .select("id, wo_no, status, scheduled_date")
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)")
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, status, scheduled_date")
      .eq("technician_id", employeeId)
      .not("status", "in", "(Completed,Cancelled)")
      .order("scheduled_date", { ascending: true }),
  ]);

  if (employeeRes.error) throw employeeRes.error;
  if (attendanceRes.error) throw attendanceRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const employee = employeeRes.data;
  if (!employee) throw new Error("Employee not found");

  const name = employee.full_name ?? `${employee.first_name} ${employee.last_name ?? ""}`.trim();

  const attendanceRows = attendanceRes.data ?? [];
  // An active check-in outranks a same-day checkout: "are they clocked in right now"
  // is the answer this ring node should give, even if an earlier shift that day was
  // already checked out.
  const presentRow = attendanceRows
    .filter((row) => row.status === "Present" && row.check_in)
    .sort((a, b) => (b.check_in ?? "").localeCompare(a.check_in ?? ""))[0];
  const checkedOutRow = attendanceRows
    .filter((row) => row.status === "Checked Out" && row.check_out)
    .sort((a, b) => (b.check_out ?? "").localeCompare(a.check_out ?? ""))[0];

  let attendanceLabel = "No attendance recorded today";
  let attendanceSublabel: string | undefined;
  if (presentRow?.check_in) {
    attendanceLabel = "Checked in";
    attendanceSublabel = formatAttendanceTime(presentRow.check_in);
  } else if (checkedOutRow?.check_out) {
    attendanceLabel = "Checked out";
    attendanceSublabel = formatAttendanceTime(checkedOutRow.check_out);
  }

  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: `staff-detail:${employeeId}:attendance`,
      data: {
        kind: "staff-detail",
        label: attendanceLabel,
        sublabel: attendanceSublabel,
        clickable: false,
        groupKey: "attendance",
        relationshipReason: `${name}'s attendance status for today.`,
      },
    },
  ];

  const workOrders = [
    ...(amcWosRes.data ?? []).map((wo) => ({ ...wo, domain: "AMC" as const })),
    ...(fmWosRes.data ?? []).map((wo) => ({ ...wo, domain: "FM" as const })),
  ];

  for (const wo of workOrders) {
    ringOne.push({
      id: `work-order:${wo.domain}:${wo.id}`,
      data: {
        kind: "work-order",
        label: wo.wo_no ?? "Work Order",
        sublabel: wo.status,
        clickable: true,
        center: { kind: "work-order", domain: wo.domain, id: wo.id },
        groupKey: "work-order",
        relationshipReason: `${name} is assigned to perform this work order.`,
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Position", value: employee.position ?? "-" },
    { label: "Employment Type", value: employee.employment_type ?? "-" },
    { label: "Staffing Model", value: employee.staffing_model ?? "-" },
    { label: "Phone", value: employee.phone ?? "-" },
    { label: "Email", value: employee.email ?? "-" },
  ];

  return {
    centerLabel: name,
    centerSublabel: employee.position ?? "",
    centerDetail,
    ringOne,
  };
}

interface ScheduleItem {
  category: "today" | "upcoming" | "overdue";
  date: string;
  node: { id: string; data: UniverseNodeData };
}

function categorizeByDate(todayStr: string, dateStr: string): "today" | "upcoming" | "overdue" {
  if (dateStr === todayStr) return "today";
  return dateStr < todayStr ? "overdue" : "upcoming";
}

async function fetchScheduleCounts(): Promise<Record<"today" | "upcoming" | "overdue", number>> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [fmPpmRes, amcPpmRes, amcWosRes, fmWosRes] = await Promise.all([
    supabase
      .from("ppm_visits")
      .select("planned_date, due_date")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("amc_ppm_visits")
      .select("planned_date, due_date")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("work_orders")
      .select("scheduled_date")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("scheduled_date")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);

  if (fmPpmRes.error) throw fmPpmRes.error;
  if (amcPpmRes.error) throw amcPpmRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const counts = { today: 0, upcoming: 0, overdue: 0 };

  for (const visit of [...(fmPpmRes.data ?? []), ...(amcPpmRes.data ?? [])]) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    counts[categorizeByDate(todayStr, date)]++;
  }
  for (const wo of [...(amcWosRes.data ?? []), ...(fmWosRes.data ?? [])]) {
    if (!wo.scheduled_date) continue;
    counts[categorizeByDate(todayStr, wo.scheduled_date)]++;
  }

  return counts;
}

async function fetchScheduleItems(): Promise<ScheduleItem[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [fmPpmRes, amcPpmRes, amcWosRes, fmWosRes] = await Promise.all([
    supabase
      .from("ppm_visits")
      .select("id, planned_date, due_date, status, work_order_id")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("amc_ppm_visits")
      .select("id, planned_date, due_date, status, work_order_id")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("work_orders")
      .select("id, wo_no, scheduled_date, status")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, scheduled_date, status")
      .not("scheduled_date", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);

  if (fmPpmRes.error) throw fmPpmRes.error;
  if (amcPpmRes.error) throw amcPpmRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;

  const items: ScheduleItem[] = [];

  for (const visit of fmPpmRes.data ?? []) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    const category = categorizeByDate(todayStr, date);
    items.push({
      category,
      date,
      node: {
        id: `ppm-visit:FM:${visit.id}`,
        data: {
          kind: "ppm-visit",
          label: `PPM · ${date}`,
          sublabel: visit.status ?? undefined,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "ppm-visit", domain: "FM", id: visit.id },
          groupKey: category,
          relationshipReason: `This PPM visit is scheduled for ${date}.`,
        },
      },
    });
  }

  for (const visit of amcPpmRes.data ?? []) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date) continue;
    const category = categorizeByDate(todayStr, date);
    items.push({
      category,
      date,
      node: {
        id: `ppm-visit:AMC:${visit.id}`,
        data: {
          kind: "ppm-visit",
          label: `PPM · ${date}`,
          sublabel: visit.status ?? undefined,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "ppm-visit", domain: "AMC", id: visit.id },
          groupKey: category,
          relationshipReason: `This PPM visit is scheduled for ${date}.`,
        },
      },
    });
  }

  for (const wo of amcWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorizeByDate(todayStr, wo.scheduled_date);
    items.push({
      category,
      date: wo.scheduled_date,
      node: {
        id: `work-order:AMC:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "AMC", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is scheduled for ${wo.scheduled_date}.`,
        },
      },
    });
  }

  for (const wo of fmWosRes.data ?? []) {
    if (!wo.scheduled_date) continue;
    const category = categorizeByDate(todayStr, wo.scheduled_date);
    items.push({
      category,
      date: wo.scheduled_date,
      node: {
        id: `work-order:FM:${wo.id}`,
        data: {
          kind: "work-order",
          label: wo.wo_no ?? "Work Order",
          sublabel: wo.status,
          exception: category === "overdue",
          clickable: true,
          center: { kind: "work-order", domain: "FM", id: wo.id },
          groupKey: category,
          relationshipReason: `${wo.wo_no ?? "This work order"} is scheduled for ${wo.scheduled_date}.`,
        },
      },
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

async function fetchScheduleCategoryRoot(): Promise<{ id: string; data: UniverseNodeData }[]> {
  const counts = await fetchScheduleCounts();
  const categories: { category: "today" | "upcoming" | "overdue"; label: string }[] = [
    { category: "today", label: "Today" },
    { category: "upcoming", label: "Upcoming" },
    { category: "overdue", label: "Overdue" },
  ];
  return categories.map(({ category, label }) => {
    const count = counts[category];
    return {
      id: `schedule-category:${category}`,
      data: {
        kind: "schedule-category" as const,
        label,
        sublabel: `${count} item${count === 1 ? "" : "s"}`,
        exception: category === "overdue" && count > 0,
        clickable: true,
        center: { kind: "schedule-category", category } as CenterEntity,
        groupKey: category,
        relationshipReason: `${label} groups scheduled work by timing.`,
      },
    };
  });
}

async function fetchScheduleCategoryItems(
  category: "today" | "upcoming" | "overdue",
): Promise<{ id: string; data: UniverseNodeData }[]> {
  const items = await fetchScheduleItems();
  const filtered = items.filter((item) => item.category === category).map((item) => item.node);
  if (filtered.length === 0) {
    filtered.push({
      id: `schedule-empty:${category}`,
      data: {
        kind: "staff-detail",
        label: `No ${category} work`,
        clickable: false,
        groupKey: category,
      },
    });
  }
  return filtered;
}

async function fetchPpmVisitConnections(
  domain: "AMC" | "FM",
  visitId: string,
): Promise<{
  centerLabel: string;
  centerSublabel: string;
  exception: boolean;
  centerDetail: CenterDetailField[];
  ringOne: { id: string; data: UniverseNodeData }[];
}> {
  const table = domain === "AMC" ? "amc_ppm_visits" : "ppm_visits";
  const { data: visit, error } = await supabase
    .from(table)
    .select("id, contract_id, planned_date, due_date, status, notes")
    .eq("id", visitId)
    .maybeSingle();
  if (error) throw error;
  if (!visit) throw new Error("PPM visit not found");

  const ringOne: { id: string; data: UniverseNodeData }[] = [];

  if (visit.contract_id) {
    ringOne.push({
      id: `contract:${domain}:${visit.contract_id}`,
      data: {
        kind: "contract",
        label: "Back to Contract",
        clickable: true,
        center: { kind: "contract", domain, id: visit.contract_id },
        groupKey: "contract",
        relationshipReason: "This PPM visit is scheduled under this contract.",
      },
    });
  }

  const centerDetail: CenterDetailField[] = [
    { label: "Planned Date", value: visit.planned_date ?? "-" },
    { label: "Due Date", value: visit.due_date ?? "-" },
    { label: "Status", value: visit.status ?? "-" },
    { label: "Notes", value: visit.notes ?? "-" },
  ];

  const todayStr = new Date().toISOString().slice(0, 10);
  const visitDate = visit.due_date ?? visit.planned_date;
  const isOverdue = Boolean(visitDate && visitDate < todayStr);

  return {
    centerLabel: "PPM Visit",
    centerSublabel: visit.due_date ?? visit.planned_date ?? "",
    exception: isOverdue,
    centerDetail,
    ringOne,
  };
}

export interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  center: CenterEntity;
}

export async function searchUniverse(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results: SearchResult[] = [];

  const settled = await Promise.allSettled([
    supabase
      .from("contracts")
      .select("id, title, customer_name, status")
      .ilike("title", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("fm_contracts")
      .select("id, title, customer_name, status")
      .ilike("title", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("work_orders")
      .select("id, wo_no, customer_name, status")
      .ilike("wo_no", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, customer_name, status")
      .ilike("wo_no", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, position")
      .eq("status", "Active")
      .ilike("full_name", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("customers")
      .select("id, display_name, company_name")
      .ilike("display_name", `%${trimmed}%`)
      .limit(5),
    supabase
      .from("customers")
      .select("id, display_name, company_name")
      .ilike("company_name", `%${trimmed}%`)
      .limit(5),
  ]);

  // A rejected settled result (a genuine network/promise rejection) has no `.data`/`.error`
  // shape of its own, so normalize it to the same "no results, but here's why" shape a
  // resolved-with-error PostgREST response already has. This keeps the `.data ?? []` loops
  // below unchanged for both failure modes, and lets one query's failure degrade gracefully
  // instead of taking the others down with it.
  function unwrap<T extends { data: unknown; error: unknown }>(
    settledResult: PromiseSettledResult<T>,
  ): T | { data: null; error: unknown } {
    return settledResult.status === "fulfilled"
      ? settledResult.value
      : { data: null, error: settledResult.reason };
  }

  const amcContracts = unwrap(settled[0]);
  const fmContracts = unwrap(settled[1]);
  const amcWorkOrders = unwrap(settled[2]);
  const fmWorkOrders = unwrap(settled[3]);
  const employees = unwrap(settled[4]);
  const customersByDisplayName = unwrap(settled[5]);
  const customersByCompanyName = unwrap(settled[6]);

  if (amcContracts.error)
    console.warn("searchUniverse: AMC contract search failed", amcContracts.error);
  if (fmContracts.error)
    console.warn("searchUniverse: FM contract search failed", fmContracts.error);
  if (amcWorkOrders.error)
    console.warn("searchUniverse: AMC work order search failed", amcWorkOrders.error);
  if (fmWorkOrders.error)
    console.warn("searchUniverse: FM work order search failed", fmWorkOrders.error);
  if (employees.error) console.warn("searchUniverse: employee search failed", employees.error);
  if (customersByDisplayName.error)
    console.warn(
      "searchUniverse: customer search (display name) failed",
      customersByDisplayName.error,
    );
  if (customersByCompanyName.error)
    console.warn(
      "searchUniverse: customer search (company name) failed",
      customersByCompanyName.error,
    );

  for (const row of amcContracts.data ?? []) {
    results.push({
      id: `contract:AMC:${row.id}`,
      label: row.title ?? "Untitled contract",
      sublabel: `AMC Contract - ${row.customer_name ?? ""}`,
      center: { kind: "contract", domain: "AMC", id: row.id },
    });
  }
  for (const row of fmContracts.data ?? []) {
    results.push({
      id: `contract:FM:${row.id}`,
      label: row.title ?? "Untitled contract",
      sublabel: `FM Contract - ${row.customer_name ?? ""}`,
      center: { kind: "contract", domain: "FM", id: row.id },
    });
  }
  for (const row of amcWorkOrders.data ?? []) {
    results.push({
      id: `work-order:AMC:${row.id}`,
      label: row.wo_no ?? "Work order",
      sublabel: `AMC Work Order - ${row.customer_name ?? ""}`,
      center: { kind: "work-order", domain: "AMC", id: row.id },
    });
  }
  for (const row of fmWorkOrders.data ?? []) {
    results.push({
      id: `work-order:FM:${row.id}`,
      label: row.wo_no ?? "Work order",
      sublabel: `FM Work Order - ${row.customer_name ?? ""}`,
      center: { kind: "work-order", domain: "FM", id: row.id },
    });
  }
  for (const row of employees.data ?? []) {
    const name = row.full_name ?? `${row.first_name} ${row.last_name ?? ""}`.trim();
    results.push({
      id: `employee:${row.id}`,
      label: name,
      sublabel: row.position ? `Staff - ${row.position}` : "Staff",
      center: { kind: "employee", id: row.id, name, position: row.position ?? undefined },
    });
  }

  const seenCustomerIds = new Set<string>();
  for (const row of [
    ...(customersByDisplayName.data ?? []),
    ...(customersByCompanyName.data ?? []),
  ]) {
    if (seenCustomerIds.has(row.id)) continue;
    seenCustomerIds.add(row.id);
    results.push({
      id: `customer:${row.id}`,
      label: row.display_name ?? row.company_name ?? "Customer",
      sublabel: row.company_name ?? "Customer",
      center: { kind: "customer", id: row.id },
    });
  }

  return results;
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
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchContractConnections(centerEntity.domain, centerEntity.id);
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
          centerDetail,
        };
      }

      if (centerEntity.kind === "work-order") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchWorkOrderConnections(centerEntity.domain, centerEntity.id);
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
          centerDetail,
        };
      }

      if (centerEntity.kind === "ppm-visit") {
        const { centerLabel, centerSublabel, exception, centerDetail, ringOne } =
          await fetchPpmVisitConnections(centerEntity.domain, centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "ppm-visit",
          label: centerLabel,
          sublabel: centerSublabel,
          exception,
          clickable: false,
        };
        return {
          ...layoutAround({
            centerId: `ppm-visit:${centerEntity.domain}:${centerEntity.id}`,
            centerData,
            ringOne,
          }),
          centerDetail,
        };
      }

      if (centerEntity.kind === "customer") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchCustomerConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "customer",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `customer:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      if (centerEntity.kind === "staff-category") {
        const ringOne = await fetchStaffHubRing();
        const centerData: UniverseNodeData = {
          kind: "staff-hub",
          label: "STAFF",
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "staff-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "schedule-category" && centerEntity.category === "__root__") {
        const ringOne = await fetchScheduleCategoryRoot();
        const centerData: UniverseNodeData = {
          kind: "schedules-hub",
          label: "SCHEDULES",
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: "schedules-hub", centerData, ringOne }),
          centerDetail: undefined,
        };
      }

      if (centerEntity.kind === "schedule-category") {
        if (centerEntity.category === "__root__") {
          throw new Error("unreachable: __root__ is handled by the branch above");
        }
        const ringOne = await fetchScheduleCategoryItems(centerEntity.category);
        const labels: Record<string, string> = { today: "Today", upcoming: "Upcoming", overdue: "Overdue" };
        const centerData: UniverseNodeData = {
          kind: "schedule-category",
          label: labels[centerEntity.category] ?? centerEntity.category,
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

      if (centerEntity.kind === "employee") {
        const { centerLabel, centerSublabel, centerDetail, ringOne } =
          await fetchEmployeeConnections(centerEntity.id);
        const centerData: UniverseNodeData = {
          kind: "employee-info",
          label: centerLabel,
          sublabel: centerSublabel,
          clickable: false,
        };
        return {
          ...layoutAround({ centerId: `employee:${centerEntity.id}`, centerData, ringOne }),
          centerDetail,
        };
      }

      // Later tasks add the remaining CenterEntity cases here.
      throw new Error(`No handler yet for center entity kind: ${centerEntity.kind}`);
    },
  });
}
