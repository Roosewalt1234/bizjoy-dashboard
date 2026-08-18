/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { nextDocNo } from "@/lib/doc-no";
import {
  calculateDueTimes,
  calculateSlaStatus,
  isScheduleBasedPolicy,
  normalizePriority,
  scheduleBasedDueTimes,
} from "@/lib/fm-sla";

const fmDb = supabase as any;

export type PpmVisitLike = {
  id: string;
  contract_id: string;
  asset_id?: string | null;
  service_category_id?: string | null;
  planned_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  work_order_id?: string | null;
  ppm_schedules?: { schedule_name?: string | null } | null;
  fm_contracts?: {
    customer_id?: string | null;
    customer_name?: string | null;
    site_name?: string | null;
  } | null;
  contract_assets?: {
    asset_tag?: string | null;
    description?: string | null;
    asset_type?: string | null;
    location?: string | null;
  } | null;
  service_categories?: { name?: string | null } | null;
};

/**
 * Converts a PPM visit into an FM-only work order.
 * module_type is always "FM" so AMC work orders can never be created here.
 */
export async function convertPpmVisitToFmWorkOrder(visit: PpmVisitLike) {
  if (visit.work_order_id) throw new Error("This PPM visit already has a work order");

  let contract = visit.fm_contracts ?? null;
  if (!contract) {
    const { data } = await fmDb
      .from("fm_contracts")
      .select("customer_id, customer_name, site_name")
      .eq("id", visit.contract_id)
      .maybeSingle();
    contract = data ?? null;
  }

  const assetLabel =
    visit.contract_assets?.asset_tag ??
    visit.contract_assets?.description ??
    visit.contract_assets?.asset_type ??
    "";
  const categoryName = visit.service_categories?.name ?? "PPM";
  const plannedDate = visit.planned_date ?? visit.due_date ?? null;
  const woNo = await nextDocNo("work_order").catch(() => null);

  const payload: Record<string, any> = {
    wo_no: woNo,
    contract_id: visit.contract_id,
    customer_id: contract?.customer_id ?? null,
    customer_name: contract?.customer_name ?? null,
    requested_date: new Date().toISOString().slice(0, 10),
    scheduled_date: plannedDate,
    service_type: categoryName,
    location: visit.contract_assets?.location ?? contract?.site_name ?? null,
    priority: "Medium",
    problem_reported: `${categoryName} planned preventive maintenance${assetLabel ? ` - ${assetLabel}` : ""}`,
    work_requested:
      visit.ppm_schedules?.schedule_name ?? "Complete planned preventive maintenance visit",
    notes: visit.notes ?? null,
    status: "Open",
    asset_id: visit.asset_id ?? null,
    ppm_visit_id: visit.id,
    service_category_id: visit.service_category_id ?? null,
    request_type: "PPM",
    reported_at: new Date().toISOString(),
  };

  const { data: policies, error: policyError } = await fmDb
    .from("sla_policies")
    .select("*")
    .eq("active", true)
    .eq("contract_id", visit.contract_id);
  if (policyError) throw policyError;

  const priority = normalizePriority(payload.priority);
  const ppmTypes = ["PPM", "Preventive Maintenance", "Planned Preventive Maintenance"];
  const candidates = ((policies ?? []) as any[]).filter(
    (item) => !item.service_category_id || item.service_category_id === payload.service_category_id,
  );
  const policy =
    candidates.find((item) => ppmTypes.includes(item.request_type ?? "")) ??
    candidates.find(
      (item) => !item.priority || item.priority === priority || item.priority === payload.priority,
    ) ??
    null;

  // PPM is schedule based: with no minute targets, compliance is measured
  // against the end of the planned visit day.
  const dueTimes =
    !policy || isScheduleBasedPolicy(policy)
      ? scheduleBasedDueTimes(plannedDate)
      : calculateDueTimes(payload.reported_at, policy);
  payload.response_due_at = dueTimes.response_due_at;
  payload.completion_due_at = dueTimes.completion_due_at;
  payload.response_sla_status = calculateSlaStatus({ dueAt: payload.response_due_at });
  payload.completion_sla_status = calculateSlaStatus({ dueAt: payload.completion_due_at });

  const { data, error } = await fmDb.from("fm_work_orders").insert(payload).select("id, wo_no");
  if (error) throw error;
  const inserted = Array.isArray(data) ? (data[0] as { id?: string; wo_no?: string }) : undefined;

  const { error: updateError } = await fmDb
    .from("ppm_visits")
    .update({ work_order_id: inserted?.id ?? null, status: "Converted" })
    .eq("id", visit.id);
  if (updateError) throw updateError;

  return { id: inserted?.id ?? null, wo_no: inserted?.wo_no ?? woNo };
}
