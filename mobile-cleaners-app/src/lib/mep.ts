import { supabase } from "@/lib/supabase";
import type { ContractAssetRow, PpmVisitRow, PpmVisitStatus } from "@/types/database";

export type MepTask = {
  scheduleId: string;
  asset: ContractAssetRow;
  scheduleName: string;
  visit: PpmVisitRow | null; // the nearest planned/overdue visit for this schedule, if any
};

/** This technician's assigned PPM schedules, each with its nearest due (or overdue) visit. */
export async function fetchMyMepTasks(employeeId: string): Promise<MepTask[]> {
  const { data: schedules, error: schedErr } = await supabase
    .from("ppm_schedules")
    .select("*, contract_assets:asset_id(id, contract_id, asset_tag, asset_type, description, location, floor, zone, nfc_token)")
    .eq("assigned_employee_id", employeeId)
    .eq("active", true);
  if (schedErr) throw schedErr;
  if (!schedules || schedules.length === 0) return [];

  const scheduleIds = schedules.map((s: any) => s.id);
  const { data: visits, error: visitErr } = await supabase
    .from("ppm_visits")
    .select("*")
    .in("ppm_schedule_id", scheduleIds)
    .neq("status", "Completed")
    .order("planned_date", { ascending: true });
  if (visitErr) throw visitErr;

  const nearestVisitBySchedule = new Map<string, PpmVisitRow>();
  for (const v of (visits ?? []) as PpmVisitRow[]) {
    if (!v.ppm_schedule_id) continue;
    if (!nearestVisitBySchedule.has(v.ppm_schedule_id)) nearestVisitBySchedule.set(v.ppm_schedule_id, v);
  }

  return schedules
    .filter((s: any) => s.contract_assets)
    .map((s: any) => ({
      scheduleId: s.id,
      asset: s.contract_assets as ContractAssetRow,
      scheduleName: s.schedule_name,
      visit: nearestVisitBySchedule.get(s.id) ?? null,
    }));
}

export async function resolveAssetByToken(token: string): Promise<ContractAssetRow | null> {
  const { data, error } = await supabase
    .from("contract_assets")
    .select("id, contract_id, asset_tag, asset_type, description, location, floor, zone, nfc_token")
    .eq("nfc_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as ContractAssetRow | null) ?? null;
}

/** The visit to act on when this asset's tag is tapped: earliest non-completed visit, or null if none is due. */
export async function fetchCurrentVisitForAsset(assetId: string): Promise<PpmVisitRow | null> {
  const { data, error } = await supabase
    .from("ppm_visits")
    .select("*")
    .eq("asset_id", assetId)
    .neq("status", "Completed")
    .order("planned_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PpmVisitRow | null) ?? null;
}

export type CompleteMepInput = {
  visit: PpmVisitRow | null; // null => no due visit exists, log an ad-hoc one
  asset: ContractAssetRow;
  employeeId: string;
  status: PpmVisitStatus;
  notes: string;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
};

/** Single write path for logging a PPM visit completion - updates the due visit, or creates an ad-hoc one. */
export async function completeMepVisit(input: CompleteMepInput): Promise<void> {
  const payload = {
    status: input.status,
    completed_at: new Date().toISOString(),
    completed_by_employee_id: input.employeeId,
    notes: input.notes.trim() || null,
    before_photo_path: input.beforePhotoPath,
    after_photo_path: input.afterPhotoPath,
  };
  if (input.visit) {
    const { error } = await supabase.from("ppm_visits").update(payload).eq("id", input.visit.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("ppm_visits").insert({
      contract_id: input.asset.contract_id,
      asset_id: input.asset.id,
      planned_date: new Date().toISOString().slice(0, 10),
      ...payload,
    });
    if (error) throw error;
  }
}

export async function uploadMepPhoto(employeeId: string, hint: string, uri: string, label: "before" | "after"): Promise<string> {
  const path = `${employeeId}/${hint}-${label}-${Date.now()}.jpg`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from("mep-photos").upload(path, arrayBuffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
