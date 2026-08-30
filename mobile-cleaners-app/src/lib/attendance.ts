import { supabase } from "@/lib/supabase";
import type { AttendanceLogRow } from "@/types/database";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's attendance row for this employee, if any (used to decide clock-in vs clock-out). */
export async function fetchTodaysAttendance(employeeId: string): Promise<AttendanceLogRow | null> {
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("attendance_date", todayIso())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AttendanceLogRow | null) ?? null;
}

/**
 * Single write path for the office NFC tag tap: if there's no open attendance row for today,
 * clock in; if there's one with no check_out yet, clock out. Source is tagged "nfc_app" so
 * office-entered rows (source null/"manual") stay visually distinct in the web dashboard.
 */
export async function toggleAttendance(employeeId: string, employeeName: string): Promise<"in" | "out"> {
  const existing = await fetchTodaysAttendance(employeeId);
  const now = new Date().toISOString();

  if (!existing || existing.check_out) {
    const { error } = await supabase.from("attendance_logs").insert({
      employee_id: employeeId,
      employee_name: employeeName,
      attendance_date: todayIso(),
      check_in: now,
      status: "Present",
      source: "nfc_app",
    });
    if (error) throw error;
    return "in";
  }

  const { error } = await supabase.from("attendance_logs").update({ check_out: now }).eq("id", existing.id);
  if (error) throw error;
  return "out";
}
