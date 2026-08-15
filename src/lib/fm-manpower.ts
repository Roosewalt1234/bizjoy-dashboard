export const MANPOWER_ROLES = [
  "FM Supervisor",
  "HVAC Technician",
  "Electrician",
  "Plumber",
  "Multi Technician",
  "Cleaning Team Leader",
  "Male Cleaner",
  "Female Cleaner",
  "Pool Technician",
  "Lift Contractor / OEM",
  "Security Guard",
  "Other",
] as const;

export const MANPOWER_SHIFTS = [
  "Day Shift",
  "Night Shift",
  "Split Shift",
  "Weekly Visit",
  "On Call",
] as const;

export const ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Late",
  "Half Day",
  "Weekly Off",
  "Leave",
  "Sick Leave",
  "Not Assigned",
] as const;

export const ATTENDANCE_SOURCES = [
  "Manual",
  "Mobile App",
  "Biometric",
  "Import",
  "System",
] as const;

export type ManpowerPlanLike = {
  required_headcount?: number | null;
  active?: boolean | null;
};

export type AssignmentLike = {
  employee_id?: string | null;
  active?: boolean | null;
  status?: string | null;
};

export type AttendanceLike = {
  employee_id?: string | null;
  status?: string | null;
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function requiredHeadcount(plans: ManpowerPlanLike[]) {
  return plans
    .filter((plan) => plan.active !== false)
    .reduce((sum, plan) => sum + (Number(plan.required_headcount) || 0), 0);
}

export function activeAssignments(assignments: AssignmentLike[]) {
  return assignments.filter(
    (assignment) => assignment.active !== false && assignment.status !== "Inactive",
  );
}

export function assignedEmployeeCount(assignments: AssignmentLike[]) {
  return new Set(
    activeAssignments(assignments)
      .map((assignment) => assignment.employee_id)
      .filter(Boolean),
  ).size;
}

export function attendanceCounts(rows: AttendanceLike[]) {
  const present = rows.filter((row) => row.status === "Present").length;
  const absent = rows.filter((row) => row.status === "Absent").length;
  const late = rows.filter((row) => row.status === "Late").length;
  return { present, absent, late };
}

export function manpowerShortage(required: number, present: number) {
  return Math.max(0, required - present);
}

export function summarizeAttendance(
  plans: ManpowerPlanLike[],
  assignments: AssignmentLike[],
  attendanceRows: AttendanceLike[],
) {
  const required = requiredHeadcount(plans);
  const assigned = assignedEmployeeCount(assignments);
  const counts = attendanceCounts(attendanceRows);
  return {
    required,
    assigned,
    ...counts,
    shortage: manpowerShortage(required, counts.present),
  };
}

export function dateRangeSummary(rows: AttendanceLike[]) {
  const counts = attendanceCounts(rows);
  return {
    ...counts,
    total: rows.length,
  };
}
