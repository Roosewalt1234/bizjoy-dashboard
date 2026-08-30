import { supabase } from "@/lib/supabase";
import type { AreaType, CleaningAreaRow, CleaningScheduleRow, VisitItemStatus } from "@/types/database";

export type TaskItem = {
  scheduleId: string;
  area: CleaningAreaRow;
  floorLabel: string;
  towerName: string;
  frequencyLabel: string;
  doneToday: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isDueToday(schedule: CleaningScheduleRow): boolean {
  if (schedule.frequency_type === "daily") return true;
  if (schedule.frequency_type === "weekly") return true; // no specific weekday captured yet - shown every day
  const today = new Date().getDay();
  return (schedule.days_of_week ?? []).includes(today);
}

function frequencyLabel(schedule: CleaningScheduleRow): string {
  if (schedule.frequency_type === "daily") return "Daily";
  if (schedule.frequency_type === "weekly") return "Weekly";
  return (schedule.days_of_week ?? []).map((d) => WEEKDAY_LABELS[d]).join(", ") || "Custom";
}

/** Today's assigned tasks for this employee, across all their active schedules. */
export async function fetchTodaysTasks(employeeId: string): Promise<TaskItem[]> {
  const { data: schedules, error: schedErr } = await supabase
    .from("fm_cleaning_schedules")
    .select("*")
    .eq("assigned_employee_id", employeeId)
    .eq("active", true);
  if (schedErr) throw schedErr;

  const dueToday = (schedules ?? []).filter(isDueToday);
  if (dueToday.length === 0) return [];

  const areaIds = dueToday.map((s) => s.area_id);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // These two only depend on areaIds, not on each other - run them together instead of
  // waiting for one to finish before starting the next.
  const [{ data: areas, error: areaErr }, { data: doneItems, error: doneErr }] = await Promise.all([
    supabase.from("fm_cleaning_areas").select("*, fm_cleaning_floors(label), fm_cleaning_towers(name)").in("id", areaIds),
    supabase
      .from("fm_cleaning_visit_items")
      .select("area_id, fm_cleaning_visits!inner(scanned_at, performed_by_employee_id)")
      .in("area_id", areaIds)
      .gte("fm_cleaning_visits.scanned_at", startOfDay.toISOString())
      .eq("fm_cleaning_visits.performed_by_employee_id", employeeId),
  ]);
  if (areaErr) throw areaErr;
  if (doneErr) throw doneErr;
  const doneAreaIds = new Set((doneItems ?? []).map((d: any) => d.area_id));

  const areaById = new Map((areas ?? []).map((a: any) => [a.id, a]));
  return dueToday
    .map((schedule) => {
      const area = areaById.get(schedule.area_id);
      if (!area) return null;
      const task: TaskItem = {
        scheduleId: schedule.id,
        area: {
          id: area.id,
          tower_id: area.tower_id,
          floor_id: area.floor_id,
          section_id: area.section_id,
          catalog_id: area.catalog_id,
          area_type: area.area_type,
          name: area.name,
          quantity: area.quantity,
          notes: area.notes,
          sort_order: area.sort_order,
          nfc_token: area.nfc_token,
        },
        floorLabel: area.fm_cleaning_floors?.label ?? "-",
        towerName: area.fm_cleaning_towers?.name ?? "-",
        frequencyLabel: frequencyLabel(schedule),
        doneToday: doneAreaIds.has(area.id),
      };
      return task;
    })
    .filter((t): t is TaskItem => t !== null);
}

export type ResolvedArea = {
  area: CleaningAreaRow;
  floorLabel: string;
  towerName: string;
  sectionName: string | null;
};

/** Resolves whatever the tapped NFC tag's token points to - a section or a utility room/corridor. */
export async function resolveAreaByToken(token: string): Promise<ResolvedArea | null> {
  const { data, error } = await supabase
    .from("fm_cleaning_areas")
    .select("*, fm_cleaning_floors(label), fm_cleaning_towers(name)")
    .eq("nfc_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let sectionName: string | null = null;
  if (data.section_id) {
    const { data: section } = await supabase.from("fm_cleaning_areas").select("name").eq("id", data.section_id).maybeSingle();
    sectionName = section?.name ?? null;
  }

  return {
    area: {
      id: data.id,
      tower_id: data.tower_id,
      floor_id: data.floor_id,
      section_id: data.section_id,
      catalog_id: data.catalog_id,
      area_type: data.area_type as AreaType,
      name: data.name,
      quantity: data.quantity,
      notes: data.notes,
      sort_order: data.sort_order,
      nfc_token: data.nfc_token,
    },
    floorLabel: data.fm_cleaning_floors?.label ?? "-",
    towerName: data.fm_cleaning_towers?.name ?? "-",
    sectionName,
  };
}

/** All utility rooms/corridors under a section (for the section-tap checklist screen). */
export async function fetchUtilityRoomsForSection(sectionId: string): Promise<CleaningAreaRow[]> {
  const { data, error } = await supabase
    .from("fm_cleaning_areas")
    .select("*")
    .eq("section_id", sectionId)
    .eq("area_type", "utility_room")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CleaningAreaRow[];
}

export type CompleteJobInput = {
  area: CleaningAreaRow;
  employeeId: string;
  status: VisitItemStatus;
  note: string;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
};

/** Single write path for completing a utility room/corridor job - creates the visit + its one item. */
export async function completeJob(input: CompleteJobInput): Promise<void> {
  const { data: visit, error: visitErr } = await supabase
    .from("fm_cleaning_visits")
    .insert({
      floor_id: input.area.floor_id,
      tower_id: input.area.tower_id,
      section_id: input.area.section_id,
      performed_by_employee_id: input.employeeId,
    })
    .select("id")
    .single();
  if (visitErr) throw visitErr;

  const { error: itemErr } = await supabase.from("fm_cleaning_visit_items").insert({
    visit_id: (visit as { id: string }).id,
    area_id: input.area.id,
    status: input.status,
    note: input.note.trim() || null,
    before_photo_path: input.beforePhotoPath,
    after_photo_path: input.afterPhotoPath,
  });
  if (itemErr) throw itemErr;
}

export async function uploadJobPhoto(employeeId: string, visitItemHint: string, uri: string, label: "before" | "after"): Promise<string> {
  const path = `${employeeId}/${visitItemHint}-${label}-${Date.now()}.jpg`;
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from("cleaning-photos").upload(path, arrayBuffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}
