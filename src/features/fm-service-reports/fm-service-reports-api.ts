import { supabase } from "@/integrations/supabase/client";
import { nextDocNo } from "@/lib/doc-no";
import { calculateSlaStatus } from "@/lib/fm-sla";
import type { PhotoRow } from "@/lib/service-reports";

export const ITEM_SEP = "\n---\n";
export const COMPLETION_TYPES = ["Fully Completed", "Partially Completed", "Deferred", "Not Accessible"] as const;

export type WorkItem = { problem: string; work: string; parts: string; hours: string };
export const emptyItem = (): WorkItem => ({ problem: "", work: "", parts: "", hours: "" });

function splitField(v: string | null | undefined): string[] {
  return (v ?? "").split(ITEM_SEP);
}

export function itemsFromReport(r: any): WorkItem[] {
  const p = splitField(r?.problem_reported);
  const w = splitField(r?.work_done);
  const pa = splitField(r?.parts_used);
  const n = Math.max(p.length, w.length, pa.length, 1);
  const items: WorkItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      problem: p[i] ?? "",
      work: w[i] ?? "",
      parts: pa[i] ?? "",
      hours: i === 0 ? (r?.hours_spent == null ? "" : String(r.hours_spent)) : "",
    });
  }
  return items;
}

export type FmServiceReportInput = {
  report_no: string;
  work_order_id: string;
  contract_id: string;
  asset_id: string;
  ppm_visit_id: string;
  service_category_id: string;
  customer_id: string;
  customer_name: string;
  service_date: string;
  technician_name: string;
  service_type: string;
  location: string;
  time_checked_in: string;
  time_checked_out: string;
  completion_type: string;
  client_representative: string;
  defects_found: string;
  follow_up_required: boolean;
  recommendations: string;
  next_service_date: string;
  signed_by: string;
  signature_data: string;
  status: string;
  items: WorkItem[];
  photos: PhotoRow[];
};

async function uploadPhoto(reportId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${reportId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/** Single write path for FM service report create/update, including photos and linked work order/PPM visit updates. */
export async function saveFmServiceReport(input: FmServiceReportInput, editingId?: string): Promise<string> {
  const kept = input.items.filter((it) => it.problem || it.work || it.parts || it.hours);
  const list = kept.length ? kept : [emptyItem()];
  const totalHours = list.reduce((s, it) => s + (it.hours === "" ? 0 : Number(it.hours) || 0), 0);

  const payload: Record<string, any> = {
    report_no: input.report_no || null,
    work_order_id: input.work_order_id || null,
    contract_id: input.contract_id || null,
    asset_id: input.asset_id || null,
    ppm_visit_id: input.ppm_visit_id || null,
    service_category_id: input.service_category_id || null,
    customer_id: input.customer_id || null,
    customer_name: input.customer_name || null,
    service_date: input.service_date || null,
    technician_name: input.technician_name || null,
    service_type: input.service_type || null,
    location: input.location || null,
    time_checked_in: input.time_checked_in || null,
    time_checked_out: input.time_checked_out || null,
    problem_reported: list.map((it) => it.problem).join(ITEM_SEP) || null,
    work_done: list.map((it) => it.work).join(ITEM_SEP) || null,
    parts_used: list.map((it) => it.parts).join(ITEM_SEP) || null,
    hours_spent: totalHours || null,
    completion_type: input.completion_type || null,
    client_representative: input.client_representative || null,
    defects_found: input.defects_found || null,
    follow_up_required: input.follow_up_required,
    recommendations: input.recommendations || null,
    next_service_date: input.next_service_date || null,
    signed_by: input.signed_by || null,
    signature_data: input.signature_data || null,
    status: input.status || "Draft",
  };

  let reportId: string;
  if (editingId) {
    const { error } = await (supabase as any).from("fm_service_reports").update(payload).eq("id", editingId);
    if (error) throw error;
    reportId = editingId;
  } else {
    const { data, error } = await (supabase as any).from("fm_service_reports").insert(payload).select("id").single();
    if (error) throw error;
    reportId = data.id as string;
  }

  const removedIds = input.photos.filter((p) => p._deleted && p.id).map((p) => p.id) as string[];
  if (removedIds.length) {
    await supabase.from("fm_service_report_photos").delete().in("id", removedIds);
  }
  let order = 0;
  for (const p of input.photos) {
    if (p._deleted) continue;
    const beforePath = p.beforeFile ? await uploadPhoto(reportId, p.beforeFile) : (p.before_path ?? null);
    const afterPath = p.afterFile ? await uploadPhoto(reportId, p.afterFile) : (p.after_path ?? null);
    const row = { report_id: reportId, caption: p.caption || null, before_path: beforePath, after_path: afterPath, sort_order: order++ };
    if (p.id) {
      const { error } = await supabase.from("fm_service_report_photos").update(row).eq("id", p.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("fm_service_report_photos").insert(row);
      if (error) throw error;
    }
  }

  // Mark the linked work order (and PPM visit, if any) completed alongside the report.
  if (input.work_order_id) {
    const { data: wo } = await (supabase as any)
      .from("fm_work_orders")
      .select("completion_due_at, completed_at, delay_reason, sla_exclusion_reason, ppm_visit_id")
      .eq("id", input.work_order_id)
      .maybeSingle();
    const completedAt = new Date().toISOString();
    const isCompleted = (input.status || "Draft") === "Completed";
    const completionStatus = calculateSlaStatus({
      dueAt: wo?.completion_due_at,
      actualAt: wo?.completed_at ?? completedAt,
      paused: Boolean(wo?.delay_reason || wo?.sla_exclusion_reason),
    });
    await (supabase as any)
      .from("fm_work_orders")
      .update({
        status: isCompleted ? "Completed" : "In Progress",
        completed_at: isCompleted ? (wo?.completed_at ?? completedAt) : (wo?.completed_at ?? null),
        completion_sla_status: isCompleted ? completionStatus : (wo?.completion_sla_status ?? null),
      })
      .eq("id", input.work_order_id);

    const visitId = input.ppm_visit_id || wo?.ppm_visit_id;
    if (isCompleted && visitId) {
      await (supabase as any)
        .from("ppm_visits")
        .update({ status: "Completed", completed_at: completedAt, service_report_id: reportId })
        .eq("id", visitId);
    }
  }

  return reportId;
}

export async function deleteFmServiceReport(id: string): Promise<void> {
  const { error } = await supabase.from("fm_service_reports").delete().eq("id", id);
  if (error) throw error;
}

export { nextDocNo };
