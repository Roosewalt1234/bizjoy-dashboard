import { supabase } from "@/integrations/supabase/client";

export type FrequencyType = "daily" | "weekly" | "custom_days";
export type ScheduleAreaType = "section" | "utility_room";

export const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export type CleaningSchedule = {
  id: string;
  floor_id: string;
  area_id: string;
  area_name: string;
  area_type: ScheduleAreaType;
  frequency_type: FrequencyType;
  days_of_week: number[] | null;
  time_window_start: string | null;
  time_window_end: string | null;
  assigned_employee_id: string | null;
  assigned_employee_name: string | null;
  active: boolean;
};

export type CleaningVisit = {
  id: string;
  floor_id: string;
  floor_label: string;
  tower_id: string;
  tower_name: string;
  performed_by_employee_id: string | null;
  employee_name: string | null;
  scanned_at: string;
  notes: string | null;
  item_count: number;
  done_count: number;
  issue_count: number;
};

export type EmployeeOption = { id: string; name: string };

export async function fetchEmployeeOptions(): Promise<EmployeeOption[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, first_name, last_name")
    .order("full_name", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    name: e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unnamed",
  }));
}

export async function fetchSchedulesForTowers(towerIds: string[]): Promise<Record<string, CleaningSchedule[]>> {
  if (towerIds.length === 0) return {};
  const { data, error } = await (supabase as any)
    .from("fm_cleaning_schedules")
    .select(
      "*, fm_cleaning_floors!inner(tower_id), fm_cleaning_areas!inner(name, area_type), employees:assigned_employee_id(id, full_name, first_name, last_name)",
    )
    .in("fm_cleaning_floors.tower_id", towerIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const byFloor: Record<string, CleaningSchedule[]> = {};
  for (const row of data ?? []) {
    const emp = row.employees;
    const area = row.fm_cleaning_areas;
    const schedule: CleaningSchedule = {
      id: row.id,
      floor_id: row.floor_id,
      area_id: row.area_id,
      area_name: area?.name ?? "-",
      area_type: area?.area_type ?? "section",
      frequency_type: row.frequency_type,
      days_of_week: row.days_of_week,
      time_window_start: row.time_window_start,
      time_window_end: row.time_window_end,
      assigned_employee_id: row.assigned_employee_id,
      assigned_employee_name: emp ? emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null,
      active: row.active,
    };
    (byFloor[row.floor_id] ??= []).push(schedule);
  }
  return byFloor;
}

export type SaveScheduleInput = {
  floor_id: string;
  area_id: string;
  frequency_type: FrequencyType;
  days_of_week: number[];
  time_window_start: string;
  time_window_end: string;
  assigned_employee_id: string | null;
  active: boolean;
};

/** Single write path for cleaning schedule create/update. */
export async function saveCleaningSchedule(input: SaveScheduleInput, editingId?: string): Promise<void> {
  const payload = {
    floor_id: input.floor_id,
    area_id: input.area_id,
    frequency_type: input.frequency_type,
    days_of_week: input.frequency_type === "custom_days" ? input.days_of_week : null,
    time_window_start: input.time_window_start || null,
    time_window_end: input.time_window_end || null,
    assigned_employee_id: input.assigned_employee_id,
    active: input.active,
  };
  if (editingId) {
    const { error } = await supabase.from("fm_cleaning_schedules").update(payload).eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("fm_cleaning_schedules").insert(payload);
    if (error) throw error;
  }
}

export async function deleteCleaningSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("fm_cleaning_schedules").delete().eq("id", id);
  if (error) throw error;
}


export async function fetchVisitsForTowers(towerIds: string[], limit = 200): Promise<CleaningVisit[]> {
  if (towerIds.length === 0) return [];
  const [{ data: visits, error: vErr }] = await Promise.all([
    (supabase as any)
      .from("fm_cleaning_visits")
      .select(
        "*, fm_cleaning_floors(label), fm_cleaning_towers(name), employees:performed_by_employee_id(id, full_name, first_name, last_name)",
      )
      .in("tower_id", towerIds)
      .order("scanned_at", { ascending: false })
      .limit(limit),
  ]);
  if (vErr) throw vErr;

  const visitIds = (visits ?? []).map((v: any) => v.id);
  let itemsByVisit: Record<string, { total: number; done: number; issue: number }> = {};
  if (visitIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from("fm_cleaning_visit_items")
      .select("visit_id, status")
      .in("visit_id", visitIds);
    if (iErr) throw iErr;
    itemsByVisit = (items ?? []).reduce((acc: Record<string, { total: number; done: number; issue: number }>, it: any) => {
      const bucket = (acc[it.visit_id] ??= { total: 0, done: 0, issue: 0 });
      bucket.total += 1;
      if (it.status === "done") bucket.done += 1;
      if (it.status === "issue") bucket.issue += 1;
      return acc;
    }, {});
  }

  return (visits ?? []).map((v: any) => {
    const emp = v.employees;
    const counts = itemsByVisit[v.id] ?? { total: 0, done: 0, issue: 0 };
    return {
      id: v.id,
      floor_id: v.floor_id,
      floor_label: v.fm_cleaning_floors?.label ?? "-",
      tower_id: v.tower_id,
      tower_name: v.fm_cleaning_towers?.name ?? "-",
      performed_by_employee_id: v.performed_by_employee_id,
      employee_name: emp ? emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null,
      scanned_at: v.scanned_at,
      notes: v.notes,
      item_count: counts.total,
      done_count: counts.done,
      issue_count: counts.issue,
    };
  });
}
