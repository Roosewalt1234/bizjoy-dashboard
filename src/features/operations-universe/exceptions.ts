import { supabase } from "@/integrations/supabase/client";
import type { CenterEntity, ContractDomain } from "./types";

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
