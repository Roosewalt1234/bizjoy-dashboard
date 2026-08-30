import { supabase } from "@/lib/supabase";
import type { ContractAssetRow, FmWorkOrderRow } from "@/types/database";

export type ReactiveWorkItem = FmWorkOrderRow & { contract_assets: ContractAssetRow | null };

const ASSET_SELECT =
  "*, contract_assets:asset_id(id, contract_id, asset_tag, asset_type, description, location, floor, zone, nfc_token)";

/** This employee's assigned reactive/unscheduled work orders that aren't done yet. */
export async function fetchMyReactiveWork(employeeId: string): Promise<ReactiveWorkItem[]> {
  const { data, error } = await supabase
    .from("fm_work_orders")
    .select(ASSET_SELECT)
    .eq("technician_id", employeeId)
    .neq("status", "Completed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReactiveWorkItem[];
}

export async function fetchWorkOrderById(id: string): Promise<ReactiveWorkItem | null> {
  const { data, error } = await supabase.from("fm_work_orders").select(ASSET_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ReactiveWorkItem | null) ?? null;
}

/** The open work order (if any) assigned to this employee for a given asset - checked when its NFC tag is tapped. */
export async function fetchOpenReactiveWorkForAsset(assetId: string, employeeId: string): Promise<ReactiveWorkItem | null> {
  const { data, error } = await supabase
    .from("fm_work_orders")
    .select(ASSET_SELECT)
    .eq("asset_id", assetId)
    .eq("technician_id", employeeId)
    .neq("status", "Completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ReactiveWorkItem | null) ?? null;
}

export type CompleteReactiveWorkInput = {
  workOrder: FmWorkOrderRow;
  employeeId: string;
  notes: string;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
};

/** Single write path for closing out a reactive work order from the mobile app. */
export async function completeReactiveWork(input: CompleteReactiveWorkInput): Promise<void> {
  const { error } = await supabase
    .from("fm_work_orders")
    .update({
      status: "Completed",
      completed_at: new Date().toISOString(),
      notes: input.notes.trim() || input.workOrder.notes,
      before_photo_path: input.beforePhotoPath ?? input.workOrder.before_photo_path,
      after_photo_path: input.afterPhotoPath ?? input.workOrder.after_photo_path,
    })
    .eq("id", input.workOrder.id);
  if (error) throw error;
}

export async function uploadWorkOrderPhoto(employeeId: string, hint: string, uri: string, label: "before" | "after"): Promise<string> {
  const path = `${employeeId}/${hint}-${label}-${Date.now()}.jpg`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from("work-order-photos").upload(path, arrayBuffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
