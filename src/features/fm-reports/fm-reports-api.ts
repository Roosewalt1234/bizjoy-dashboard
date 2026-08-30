import { supabase } from "@/integrations/supabase/client";

export type OccurrenceStatus = "done" | "issue" | "skipped" | "pending" | "missed" | "upcoming";

export type CleaningOccurrence = {
  key: string;
  scheduleId: string;
  areaName: string;
  sectionName: string | null;
  floorLabel: string;
  towerName: string;
  assignedEmployeeName: string | null;
  dueDate: string; // yyyy-mm-dd - for weekly schedules, this is the Sunday closing that week
  windowStart: string | null;
  windowEnd: string | null;
  status: OccurrenceStatus;
  completedAt: string | null;
  completedBy: string | null;
};

export type MepOccurrence = {
  key: string;
  visitId: string;
  scheduleName: string;
  assetTag: string | null;
  assetType: string | null;
  contractName: string | null;
  dueDate: string;
  status: OccurrenceStatus;
  completedAt: string | null;
};

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1)); // Monday
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export type PeriodType = "day" | "week" | "month";

/** Inclusive [start, end] range (as Date, local midnight) for the period containing `reference`. */
export function periodRange(type: PeriodType, reference: Date): { start: Date; end: Date } {
  const ref = new Date(reference);
  ref.setHours(0, 0, 0, 0);
  if (type === "day") return { start: ref, end: ref };
  if (type === "week") {
    const start = startOfWeek(ref);
    return { start, end: addDays(start, 6) };
  }
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start, end };
}

/** Day/week/month-aware done -> pending -> missed logic, shared by cleaning and MEP. */
function computeStatus(
  dueDate: string,
  todayIso: string,
  isDone: boolean,
  doneStatus: "done" | "issue" | "skipped",
  windowEnd: string | null,
): OccurrenceStatus {
  if (isDone) return doneStatus;
  if (dueDate > todayIso) return "upcoming";
  if (dueDate < todayIso) return "missed";
  if (!windowEnd) return "pending"; // due today, no specific deadline time - pending until the day rolls over
  const [h, m] = windowEnd.split(":").map(Number);
  const deadline = new Date();
  deadline.setHours(h, m, 0, 0);
  return new Date() > deadline ? "missed" : "pending";
}

/**
 * Every cleaning schedule's due occurrence(s) within the period, each tagged done/pending/missed.
 * Daily and custom-day schedules get one row per matching date. Weekly schedules get one row per
 * week overlapping the period (no specific weekday is stored for "weekly" yet, so the whole week
 * is treated as the due window, closing on the Sunday - pending until then, missed after).
 */
export async function fetchCleaningOccurrences(towerIds: string[], periodStart: Date, periodEnd: Date): Promise<CleaningOccurrence[]> {
  if (towerIds.length === 0) return [];
  const { data: schedules, error: schedErr } = await (supabase as any)
    .from("fm_cleaning_schedules")
    .select(
      "*, fm_cleaning_floors!inner(tower_id, label, fm_cleaning_towers(name)), fm_cleaning_areas!inner(name, section_id), employees:assigned_employee_id(full_name, first_name, last_name)",
    )
    .in("fm_cleaning_floors.tower_id", towerIds)
    .eq("active", true);
  if (schedErr) throw schedErr;
  if (!schedules || schedules.length === 0) return [];

  const areaIds: string[] = Array.from(new Set<string>(schedules.map((s: any) => s.area_id)));
  const sectionIds: string[] = Array.from(
    new Set<string>(schedules.map((s: any) => s.fm_cleaning_areas?.section_id).filter((x: any) => Boolean(x))),
  );
  const { data: sections } = sectionIds.length
    ? await supabase.from("fm_cleaning_areas").select("id, name").in("id", sectionIds)
    : { data: [] as any[] };
  const sectionNameById = new Map((sections ?? []).map((s: any) => [s.id, s.name]));

  const rangeStartIso = toIso(periodStart);
  const rangeEndIso = toIso(periodEnd);
  const { data: items, error: itemsErr } = await (supabase as any)
    .from("fm_cleaning_visit_items")
    .select("area_id, status, created_at, fm_cleaning_visits!inner(scanned_at, employees:performed_by_employee_id(full_name, first_name, last_name))")
    .in("area_id", areaIds)
    .gte("fm_cleaning_visits.scanned_at", `${rangeStartIso}T00:00:00`)
    .lte("fm_cleaning_visits.scanned_at", `${rangeEndIso}T23:59:59`);
  if (itemsErr) throw itemsErr;

  // date (yyyy-mm-dd) -> areaId -> item, for daily/custom-day lookups
  const itemsByDateArea = new Map<string, Map<string, any>>();
  // areaId -> items within the week, for weekly lookups (checked separately below)
  const itemsByArea = new Map<string, any[]>();
  for (const it of items ?? []) {
    const dateIso = String(it.fm_cleaning_visits?.scanned_at ?? "").slice(0, 10);
    if (!itemsByDateArea.has(dateIso)) itemsByDateArea.set(dateIso, new Map());
    itemsByDateArea.get(dateIso)!.set(it.area_id, it);
    (itemsByArea.get(it.area_id) ?? itemsByArea.set(it.area_id, []).get(it.area_id)!)!.push(it);
  }

  const todayIso = toIso(new Date());
  const occurrences: CleaningOccurrence[] = [];

  for (const s of schedules) {
    const area = s.fm_cleaning_areas;
    const floor = s.fm_cleaning_floors;
    const emp = s.employees;
    const employeeName = emp ? emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null;
    const areaName = area?.name ?? "-";
    const sectionName = area?.section_id ? (sectionNameById.get(area.section_id) ?? null) : null;
    const floorLabel = floor?.label ?? "-";
    const towerName = floor?.fm_cleaning_towers?.name ?? "-";

    if (s.frequency_type === "weekly") {
      // one row per week overlapping the period
      let weekStart = startOfWeek(periodStart);
      while (weekStart <= periodEnd) {
        const weekEnd = addDays(weekStart, 6);
        if (weekEnd >= periodStart) {
          const dueDate = toIso(weekEnd);
          const weekItems = (itemsByArea.get(s.area_id) ?? []).filter((it: any) => {
            const d = String(it.fm_cleaning_visits?.scanned_at ?? "").slice(0, 10);
            return d >= toIso(weekStart) && d <= dueDate;
          });
          const done = weekItems.find((it: any) => it.status === "done") ?? weekItems[0];
          occurrences.push(
            buildOccurrence(s, areaName, sectionName, floorLabel, towerName, employeeName, dueDate, null, null, done, todayIso),
          );
        }
        weekStart = addDays(weekStart, 7);
      }
      continue;
    }

    for (let d = new Date(periodStart); d <= periodEnd; d = addDays(d, 1)) {
      const dow = d.getDay();
      const due = s.frequency_type === "daily" || (s.frequency_type === "custom_days" && (s.days_of_week ?? []).includes(dow));
      if (!due) continue;
      const dueDate = toIso(d);
      const item = itemsByDateArea.get(dueDate)?.get(s.area_id);
      occurrences.push(
        buildOccurrence(s, areaName, sectionName, floorLabel, towerName, employeeName, dueDate, s.time_window_start, s.time_window_end, item, todayIso),
      );
    }
  }

  return occurrences.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.areaName.localeCompare(b.areaName));
}

function buildOccurrence(
  s: any,
  areaName: string,
  sectionName: string | null,
  floorLabel: string,
  towerName: string,
  employeeName: string | null,
  dueDate: string,
  windowStart: string | null,
  windowEnd: string | null,
  item: any,
  todayIso: string,
): CleaningOccurrence {
  const isDone = !!item;
  const doneStatus: "done" | "issue" | "skipped" = item?.status ?? "done";
  const emp = item?.fm_cleaning_visits?.employees;
  return {
    key: `${s.id}-${dueDate}`,
    scheduleId: s.id,
    areaName,
    sectionName,
    floorLabel,
    towerName,
    assignedEmployeeName: employeeName,
    dueDate,
    windowStart,
    windowEnd,
    status: computeStatus(dueDate, todayIso, isDone, doneStatus, windowEnd),
    completedAt: item?.fm_cleaning_visits?.scanned_at ?? null,
    completedBy: emp ? emp.full_name || [emp.first_name, emp.last_name].filter(Boolean).join(" ") : null,
  };
}

/** PPM/MEP visits due within the period, tagged done/pending/missed (date-only, no time window). */
export async function fetchMepOccurrences(contractId: string, periodStart: Date, periodEnd: Date): Promise<MepOccurrence[]> {
  const { data, error } = await (supabase as any)
    .from("ppm_visits")
    .select(
      "id, planned_date, status, completed_at, ppm_schedules(schedule_name), contract_assets:asset_id(asset_tag, asset_type), fm_contracts:contract_id(title, contract_no, customer_name)",
    )
    .eq("contract_id", contractId)
    .gte("planned_date", toIso(periodStart))
    .lte("planned_date", toIso(periodEnd))
    .order("planned_date", { ascending: true });
  if (error) throw error;

  const todayIso = toIso(new Date());
  return (data ?? []).map((v: any) => {
    const isDone = v.status === "Completed" || v.status === "Converted";
    const contract = v.fm_contracts;
    return {
      key: v.id,
      visitId: v.id,
      scheduleName: v.ppm_schedules?.schedule_name ?? "-",
      assetTag: v.contract_assets?.asset_tag ?? null,
      assetType: v.contract_assets?.asset_type ?? null,
      contractName: contract ? (contract.contract_no ? `${contract.contract_no} - ${contract.customer_name ?? contract.title}` : contract.title) : null,
      dueDate: v.planned_date,
      status: computeStatus(v.planned_date, todayIso, isDone, "done", null),
      completedAt: v.completed_at,
    };
  });
}
