import { supabase } from "@/integrations/supabase/client";
import { nextDocNo } from "@/lib/doc-no";
import { ITEM_SEP } from "@/lib/work-orders";
import {
  calculateDueTimes,
  calculateSlaStatus,
  isPpmRequestType,
  isScheduleBasedPolicy,
  normalizePriority,
  scheduleBasedDueTimes,
} from "@/lib/fm-sla";

export type WorkItem = { problem: string; work: string };

export type FmWorkOrderInput = {
  wo_no: string;
  contract_id: string;
  asset_id: string;
  ppm_visit_id: string;
  service_category_id: string;
  customer_id: string;
  customer_name: string;
  requested_date: string;
  scheduled_date: string;
  request_type: string;
  reported_at: string;
  responded_at: string;
  arrived_at: string;
  completed_at: string;
  delay_reason: string;
  sla_exclusion_reason: string;
  technician_id: string;
  technician_name: string;
  service_type: string;
  location: string;
  priority: string;
  notes: string;
  status: string;
  items: WorkItem[];
};

async function findSlaPolicy(payload: { contract_id?: string | null; priority?: string | null; request_type?: string | null; service_category_id?: string | null }) {
  if (!payload.contract_id) return null;
  const priority = normalizePriority(payload.priority);
  const requestType = payload.request_type || "Reactive";
  const { data, error } = await (supabase as any)
    .from("sla_policies")
    .select("*")
    .eq("active", true)
    .eq("contract_id", payload.contract_id)
    .order("service_category_id", { ascending: false });
  if (error) throw error;
  return (
    (data ?? []).find((policy: any) => {
      const categoryMatch = !policy.service_category_id || policy.service_category_id === payload.service_category_id;
      const priorityMatch = !policy.priority || policy.priority === priority || policy.priority === payload.priority;
      const typeMatch = !policy.request_type || policy.request_type === requestType;
      return categoryMatch && priorityMatch && typeMatch;
    }) ?? null
  );
}

/** Single write path for FM work order create/update, including SLA due-time calculation. */
export async function saveFmWorkOrder(input: FmWorkOrderInput, editingId?: string): Promise<{ noSlaPolicy: boolean }> {
  const kept = input.items.filter((it) => it.problem || it.work);
  const list = kept.length ? kept : [{ problem: "", work: "" }];

  const payload: Record<string, any> = {
    wo_no: input.wo_no || null,
    contract_id: input.contract_id || null,
    asset_id: input.asset_id || null,
    ppm_visit_id: input.ppm_visit_id || null,
    service_category_id: input.service_category_id || null,
    customer_id: input.customer_id || null,
    customer_name: input.customer_name || null,
    requested_date: input.requested_date || null,
    scheduled_date: input.scheduled_date || null,
    request_type: input.request_type || null,
    reported_at:
      input.reported_at ||
      (input.request_type === "PPM" && input.scheduled_date
        ? new Date(`${input.scheduled_date}T09:00:00`).toISOString()
        : new Date().toISOString()),
    responded_at: input.responded_at || null,
    arrived_at: input.arrived_at || null,
    completed_at: input.completed_at || null,
    delay_reason: input.delay_reason || null,
    sla_exclusion_reason: input.sla_exclusion_reason || null,
    technician_id: input.technician_id || null,
    technician_name: input.technician_name || null,
    service_type: input.service_type || null,
    location: input.location || null,
    priority: input.priority || "Medium",
    problem_reported: list.map((it) => it.problem).join(ITEM_SEP) || null,
    work_requested: list.map((it) => it.work).join(ITEM_SEP) || null,
    notes: input.notes || null,
    status: input.status || "Open",
  };

  const policy = await findSlaPolicy(payload);
  if (policy) {
    const scheduleBased = isPpmRequestType(payload.request_type) && isScheduleBasedPolicy(policy);
    const dueTimes = scheduleBased
      ? scheduleBasedDueTimes(payload.scheduled_date)
      : calculateDueTimes(payload.reported_at, policy);
    payload.response_due_at = dueTimes.response_due_at;
    payload.completion_due_at = dueTimes.completion_due_at;
    payload.response_sla_status = calculateSlaStatus({
      dueAt: payload.response_due_at,
      actualAt: payload.responded_at,
      paused: Boolean(payload.delay_reason || payload.sla_exclusion_reason),
    });
    payload.completion_sla_status = calculateSlaStatus({
      dueAt: payload.completion_due_at,
      actualAt: payload.completed_at,
      paused: Boolean(payload.delay_reason || payload.sla_exclusion_reason),
    });
  }

  if (editingId) {
    const { error } = await (supabase as any).from("fm_work_orders").update(payload).eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("fm_work_orders").insert(payload);
    if (error) throw error;
  }

  return { noSlaPolicy: !policy && !!payload.contract_id };
}

export async function deleteFmWorkOrder(id: string): Promise<void> {
  const { error } = await supabase.from("fm_work_orders").delete().eq("id", id);
  if (error) throw error;
}

export { nextDocNo };
