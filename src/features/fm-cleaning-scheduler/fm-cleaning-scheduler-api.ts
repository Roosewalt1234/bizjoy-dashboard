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
  task_catalog_id: string;
  task_name: string | null;
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

/**
 * Employees actively assigned to this contract's manpower (contract_manpower_assignments,
 * status = 'Active' - the column's own documented default and the only status value present in
 * live data), not a flat system-wide employee list. Returns [] for a contract with no recorded
 * assignments yet - callers show a blocked empty state rather than falling back to everyone.
 */
export async function fetchEmployeeOptions(contractId: string): Promise<EmployeeOption[]> {
  if (!contractId) return [];
  const { data, error } = await supabase
    .from("contract_manpower_assignments")
    .select("employee_id, employees:employee_id(id, full_name, first_name, last_name)")
    .eq("contract_id", contractId)
    .eq("status", "Active");
  if (error) throw error;
  const seen = new Set<string>();
  const options: EmployeeOption[] = [];
  for (const row of (data ?? []) as any[]) {
    const emp = row.employees;
    if (!emp || seen.has(emp.id)) continue;
    seen.add(emp.id);
    options.push({
      id: emp.id,
      name: emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") || "Unnamed",
    });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export type TaskCatalogOption = { id: string; task_name: string };

/** Active tasks defined for a room-type (fm_cleaning_task_catalog, keyed by area_catalog_id) -
 * the same catalog the mobile app's per-room checklist already reads from. */
export async function fetchTaskCatalogForAreaCatalog(areaCatalogId: string): Promise<TaskCatalogOption[]> {
  const { data, error } = await supabase
    .from("fm_cleaning_task_catalog")
    .select("id, task_name")
    .eq("area_catalog_id", areaCatalogId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskCatalogOption[];
}

export async function fetchSchedulesForTowers(towerIds: string[]): Promise<Record<string, CleaningSchedule[]>> {
  if (towerIds.length === 0) return {};
  const { data, error } = await (supabase as any)
    .from("fm_cleaning_schedules")
    .select(
      "*, fm_cleaning_floors!inner(tower_id), fm_cleaning_areas!inner(name, area_type), employees:assigned_employee_id(id, full_name, first_name, last_name), fm_cleaning_task_catalog:task_catalog_id(task_name)",
    )
    .in("fm_cleaning_floors.tower_id", towerIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const byFloor: Record<string, CleaningSchedule[]> = {};
  for (const row of data ?? []) {
    const emp = row.employees;
    const area = row.fm_cleaning_areas;
    const task = row.fm_cleaning_task_catalog;
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
      task_catalog_id: row.task_catalog_id,
      task_name: task?.task_name ?? null,
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
  task_catalog_id: string;
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
    task_catalog_id: input.task_catalog_id,
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


export type TodaysCompletion = {
  status: "done" | "skipped" | "issue";
  scannedAt: string;
  employeeName: string | null;
};

/** Most recent today's visit-item outcome per area, for the "done today?" badge on each schedule. */
export async function fetchTodaysCompletionByArea(towerIds: string[]): Promise<Record<string, TodaysCompletion>> {
  if (towerIds.length === 0) return {};
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await (supabase as any)
    .from("fm_cleaning_visit_items")
    .select(
      "area_id, status, fm_cleaning_visits!inner(scanned_at, tower_id, employees:performed_by_employee_id(full_name, first_name, last_name))",
    )
    .in("fm_cleaning_visits.tower_id", towerIds)
    .gte("fm_cleaning_visits.scanned_at", startOfDay.toISOString())
    .order("scanned_at", { foreignTable: "fm_cleaning_visits", ascending: false });
  if (error) throw error;

  const byArea: Record<string, TodaysCompletion> = {};
  for (const row of data ?? []) {
    if (!row.area_id || byArea[row.area_id]) continue; // keep only the most recent (rows are already newest-first)
    const emp = row.fm_cleaning_visits?.employees;
    byArea[row.area_id] = {
      status: row.status,
      scannedAt: row.fm_cleaning_visits?.scanned_at,
      employeeName: emp ? emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null,
    };
  }
  return byArea;
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
