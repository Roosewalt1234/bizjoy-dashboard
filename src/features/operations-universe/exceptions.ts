import { supabase } from "@/integrations/supabase/client";
import type { CenterEntity, ContractDomain } from "./types";
import { computePaymentStatus } from "./payment-status";

export type ExceptionSeverity = "attention" | "important" | "critical";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";

export interface OperationalException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  title: string;
  reason: string;
  target: CenterEntity;
  contractId?: string;
  contractDomain?: ContractDomain;
}

export async function detectOverdueWorkOrders(): Promise<OperationalException[]> {
  const now = Date.now();

  const [amcRes, fmRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, wo_no, completion_due_at, contract_id")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("id, wo_no, completion_due_at, contract_id")
      .not("completion_due_at", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
  ]);
  if (amcRes.error) throw amcRes.error;
  if (fmRes.error) throw fmRes.error;

  const workOrders = [
    ...(amcRes.data ?? []).map((wo) => ({ ...wo, domain: "AMC" as const })),
    ...(fmRes.data ?? []).map((wo) => ({ ...wo, domain: "FM" as const })),
  ];

  const exceptions: OperationalException[] = [];
  for (const wo of workOrders) {
    if (!wo.completion_due_at) continue;
    const dueAt = new Date(wo.completion_due_at).getTime();
    if (dueAt >= now) continue;
    const daysOverdue = Math.floor((now - dueAt) / 86400000);
    exceptions.push({
      id: `operations:overdue-work-order:${wo.domain}:${wo.id}`,
      category: "operations",
      severity: daysOverdue > 30 ? "critical" : "important",
      title: "Overdue Work Order",
      reason: `${wo.wo_no ?? "This work order"} requires attention because its completion due date was ${wo.completion_due_at.slice(0, 10)} and it remains open.`,
      target: { kind: "work-order", domain: wo.domain, id: wo.id },
      contractId: wo.contract_id ?? undefined,
      contractDomain: wo.contract_id ? wo.domain : undefined,
    });
  }
  return exceptions;
}

export async function detectOverduePpm(): Promise<OperationalException[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [fmRes, amcRes] = await Promise.all([
    supabase
      .from("ppm_visits")
      .select("id, planned_date, due_date, contract_id, work_order_id, status")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
    supabase
      .from("amc_ppm_visits")
      .select("id, planned_date, due_date, contract_id, work_order_id, status")
      .is("work_order_id", null)
      .not("status", "in", "(Completed,Skipped,Cancelled)"),
  ]);
  if (fmRes.error) throw fmRes.error;
  if (amcRes.error) throw amcRes.error;

  const visits = [
    ...(fmRes.data ?? []).map((v) => ({ ...v, domain: "FM" as const })),
    ...(amcRes.data ?? []).map((v) => ({ ...v, domain: "AMC" as const })),
  ];

  const exceptions: OperationalException[] = [];
  for (const visit of visits) {
    const date = visit.due_date ?? visit.planned_date;
    if (!date || date >= todayStr) continue;
    exceptions.push({
      id: `operations:overdue-ppm:${visit.domain}:${visit.id}`,
      category: "operations",
      severity: "important",
      title: "Overdue PPM",
      reason: `This PPM visit was due on ${date} and remains unresolved.`,
      target: { kind: "ppm-visit", domain: visit.domain, id: visit.id },
      contractId: visit.contract_id,
      contractDomain: visit.domain,
    });
  }
  return exceptions;
}

export async function detectStaffAttendanceIssues(): Promise<OperationalException[]> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employeesRes, amcWosRes, fmWosRes, attendanceRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, first_name, last_name, position")
      .eq("status", "Active"),
    supabase
      .from("work_orders")
      .select("technician_id")
      .not("technician_id", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase
      .from("fm_work_orders")
      .select("technician_id")
      .not("technician_id", "is", null)
      .not("status", "in", "(Completed,Cancelled)"),
    supabase.from("attendance_logs").select("employee_id").eq("attendance_date", todayStr),
  ]);
  if (employeesRes.error) throw employeesRes.error;
  if (amcWosRes.error) throw amcWosRes.error;
  if (fmWosRes.error) throw fmWosRes.error;
  if (attendanceRes.error) throw attendanceRes.error;

  const assignedCounts = new Map<string, { amc: number; fm: number }>();
  for (const wo of amcWosRes.data ?? []) {
    if (!wo.technician_id) continue;
    const current = assignedCounts.get(wo.technician_id) ?? { amc: 0, fm: 0 };
    current.amc += 1;
    assignedCounts.set(wo.technician_id, current);
  }
  for (const wo of fmWosRes.data ?? []) {
    if (!wo.technician_id) continue;
    const current = assignedCounts.get(wo.technician_id) ?? { amc: 0, fm: 0 };
    current.fm += 1;
    assignedCounts.set(wo.technician_id, current);
  }

  const attendedToday = new Set((attendanceRes.data ?? []).map((row) => row.employee_id));

  const exceptions: OperationalException[] = [];
  for (const employee of employeesRes.data ?? []) {
    const counts = assignedCounts.get(employee.id);
    const totalCount = (counts?.amc ?? 0) + (counts?.fm ?? 0);
    if (totalCount === 0) continue;
    if (attendedToday.has(employee.id)) continue;
    const name = employee.full_name ?? `${employee.first_name} ${employee.last_name ?? ""}`.trim();
    const breakdown: string[] = [];
    if (counts && counts.amc > 0) breakdown.push(`${counts.amc} AMC`);
    if (counts && counts.fm > 0) breakdown.push(`${counts.fm} FM`);
    exceptions.push({
      id: `people:no-attendance:${employee.id}`,
      category: "people",
      severity: "important",
      title: "No Attendance Recorded",
      reason: `${name} has ${totalCount} open work order${totalCount === 1 ? "" : "s"} assigned (${breakdown.join(", ")}) but no attendance record for today.`,
      target: { kind: "employee", id: employee.id, name, position: employee.position ?? undefined },
    });
  }
  return exceptions;
}

export async function detectOverduePayments(): Promise<OperationalException[]> {
  // contract_payments/contracts are structurally AMC-only (fm_contract_payments has zero
  // real rows as of Phase 4b) - this constant makes that scoping decision explicit and
  // avoids repeating the literal in three places below.
  const domain: ContractDomain = "AMC";

  const [contractsRes, paymentsRes] = await Promise.all([
    supabase.from("contracts").select("id, title"),
    supabase
      .from("contract_payments")
      .select("id, contract_id, value, payment_date, received_date"),
  ]);
  if (contractsRes.error) throw contractsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const contractTitles = new Map((contractsRes.data ?? []).map((c) => [c.id, c.title]));
  const overdueByContract = new Map<string, { count: number; total: number }>();

  for (const payment of paymentsRes.data ?? []) {
    const status = computePaymentStatus(payment.payment_date, payment.received_date);
    if (status !== "Overdue") continue;
    const current = overdueByContract.get(payment.contract_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += payment.value ?? 0;
    overdueByContract.set(payment.contract_id, current);
  }

  const exceptions: OperationalException[] = [];
  for (const [contractId, { count, total }] of overdueByContract) {
    const title = contractTitles.get(contractId) ?? "This contract";
    exceptions.push({
      id: `finance:overdue-payment:${domain}:${contractId}`,
      category: "finance",
      severity: "critical",
      title: "Overdue Payment",
      reason: `${title} has ${count} payment${count === 1 ? "" : "s"} totaling AED ${total} that remain unpaid more than 15 days after the due date.`,
      target: { kind: "contract-finance", domain, id: contractId },
      contractId,
      contractDomain: domain,
    });
  }
  return exceptions;
}
