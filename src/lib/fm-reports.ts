/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

export const REPORT_STATUSES = ["Draft", "Generated", "Submitted", "Approved", "Rejected"] as const;
export const REPORT_LABELS = [
  "MEP & HVAC",
  "Housekeeping",
  "Swimming Pool",
  "Lift Maintenance",
  "SLA/KPI Summary",
  "Manpower Summary",
  "PPM Summary",
  "Pending Client Approvals",
  "Pending Spares / Materials",
  "Site Challenges",
  "Recommendations",
] as const;

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getDateRangeForWeek(seed = new Date()) {
  const date = new Date(seed);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function getDateRangeForMonth(month = new Date().toISOString().slice(0, 7)) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function inDateRange(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  const date = value.slice(0, 10);
  return date >= start && date <= end;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function normalizePriority(value: string | null | undefined) {
  if (value === "Emergency") return "P1 Critical";
  if (value === "High") return "P2 High";
  if (value === "Medium") return "P3 Medium";
  if (value === "Low") return "P4 Low";
  return value || "Unspecified";
}

export function calculateWorkOrderSummary(workOrders: AnyRow[], start: string, end: string) {
  const rows = workOrders.filter((row) =>
    inDateRange(
      row.reported_at ?? row.scheduled_date ?? row.requested_date ?? row.created_at,
      start,
      end,
    ),
  );
  const completed = rows.filter((row) => row.status === "Completed").length;
  const open = rows.filter(
    (row) => !["Completed", "Cancelled", "Closed"].includes(row.status),
  ).length;
  const byRequestType = Object.fromEntries(
    ["Emergency", "Reactive", "Corrective", "PPM", "Inspection", "Other"].map((type) => [
      type,
      rows.filter((row) => row.request_type === type).length,
    ]),
  );
  const byPriority = Object.fromEntries(
    ["P1 Critical", "P2 High", "P3 Medium", "P4 Low"].map((priority) => [
      priority,
      rows.filter((row) => normalizePriority(row.priority) === priority).length,
    ]),
  );
  return { total: rows.length, open, completed, byRequestType, byPriority };
}

export function calculateSlaSummary(workOrders: AnyRow[], start: string, end: string) {
  const rows = workOrders.filter((row) =>
    inDateRange(
      row.reported_at ?? row.scheduled_date ?? row.requested_date ?? row.created_at,
      start,
      end,
    ),
  );
  const responseWithin = rows.filter((row) => row.response_sla_status === "Within SLA").length;
  const responseBreached = rows.filter((row) => row.response_sla_status === "Breached").length;
  const completionWithin = rows.filter((row) => row.completion_sla_status === "Within SLA").length;
  const completionBreached = rows.filter((row) => row.completion_sla_status === "Breached").length;
  const atRisk = rows.filter(
    (row) => row.response_sla_status === "At Risk" || row.completion_sla_status === "At Risk",
  ).length;
  const measured = responseWithin + responseBreached + completionWithin + completionBreached;
  const within = responseWithin + completionWithin;
  const breachReasons = rows.reduce<Record<string, number>>((acc, row) => {
    const reason = row.delay_reason || row.sla_exclusion_reason;
    if (reason) acc[reason] = (acc[reason] ?? 0) + 1;
    return acc;
  }, {});
  return {
    responseWithin,
    responseBreached,
    completionWithin,
    completionBreached,
    breachCount: responseBreached + completionBreached,
    atRisk,
    compliancePercent: percent(within, measured),
    breachReasons,
  };
}

export function calculatePpmSummary(ppmVisits: AnyRow[], start: string, end: string) {
  const rows = ppmVisits.filter((row) => inDateRange(row.planned_date ?? row.due_date, start, end));
  const completed = rows.filter((row) => row.status === "Completed").length;
  const overdue = rows.filter(
    (row) =>
      row.status !== "Completed" && (row.due_date ?? row.planned_date) < toIsoDate(new Date()),
  ).length;
  const byCategory = rows.reduce<Record<string, { planned: number; completed: number }>>(
    (acc, row) => {
      const name = row.service_categories?.name ?? "Unassigned";
      acc[name] ??= { planned: 0, completed: 0 };
      acc[name].planned += 1;
      if (row.status === "Completed") acc[name].completed += 1;
      return acc;
    },
    {},
  );
  return {
    planned: rows.length,
    completed,
    overdue,
    completionPercent: percent(completed, rows.length),
    byCategory,
  };
}

export function calculateAttendanceSummary(attendance: AnyRow[], start: string, end: string) {
  const rows = attendance.filter((row) => inDateRange(row.attendance_date, start, end));
  const present = rows.filter((row) => row.status === "Present").length;
  const absent = rows.filter((row) => row.status === "Absent").length;
  const late = rows.filter((row) => row.status === "Late").length;
  const byDate = rows.reduce<Record<string, { present: number; absent: number; late: number }>>(
    (acc, row) => {
      const date = row.attendance_date;
      acc[date] ??= { present: 0, absent: 0, late: 0 };
      if (row.status === "Present") acc[date].present += 1;
      if (row.status === "Absent") acc[date].absent += 1;
      if (row.status === "Late") acc[date].late += 1;
      return acc;
    },
    {},
  );
  return { total: rows.length, present, absent, late, byDate };
}

export function calculateManpowerVariance(
  plans: AnyRow[],
  assignments: AnyRow[],
  attendance: AnyRow[],
  start: string,
  end: string,
) {
  const required = plans
    .filter((plan) => plan.active !== false)
    .reduce((sum, plan) => sum + (Number(plan.required_headcount) || 0), 0);
  const assigned = new Set(
    assignments
      .filter((assignment) => assignment.active !== false && assignment.status !== "Inactive")
      .map((assignment) => assignment.employee_id)
      .filter(Boolean),
  ).size;
  const attendanceSummary = calculateAttendanceSummary(attendance, start, end);
  const shortageByDate = Object.entries(attendanceSummary.byDate).reduce<Record<string, number>>(
    (acc, [date, value]) => {
      acc[date] = Math.max(0, required - value.present);
      return acc;
    },
    {},
  );
  const shortageCount = Object.values(shortageByDate).reduce((sum, value) => sum + value, 0);
  const shortageDays = Object.values(shortageByDate).filter((value) => value > 0).length;
  return {
    required,
    assigned,
    present: attendanceSummary.present,
    absent: attendanceSummary.absent,
    late: attendanceSummary.late,
    shortageCount,
    shortageDays,
    compliancePercent: percent(
      attendanceSummary.present,
      Math.max(1, required * Object.keys(attendanceSummary.byDate).length),
    ),
  };
}

export function calculateAssetSummary(
  assets: AnyRow[],
  workOrders: AnyRow[],
  start: string,
  end: string,
) {
  const scopedWorkOrders = workOrders.filter((row) =>
    inDateRange(
      row.reported_at ?? row.scheduled_date ?? row.requested_date ?? row.created_at,
      start,
      end,
    ),
  );
  const assetWoCounts = scopedWorkOrders.reduce<Record<string, number>>((acc, row) => {
    if (row.asset_id) acc[row.asset_id] = (acc[row.asset_id] ?? 0) + 1;
    return acc;
  }, {});
  const criticalAssetIds = new Set(
    assets.filter((asset) => asset.criticality === "Critical").map((asset) => asset.id),
  );
  const criticalIssues = scopedWorkOrders.filter(
    (row) => row.asset_id && criticalAssetIds.has(row.asset_id),
  ).length;
  const repeated = Object.values(assetWoCounts).filter((count) => count > 1).length;
  return {
    totalAssets: assets.length,
    activeAssets: assets.filter((asset) => asset.status === "Active").length,
    assetsWithWorkOrders: Object.keys(assetWoCounts).length,
    criticalAssetWorkOrders: criticalIssues,
    repeatedIssueAssets: repeated,
  };
}

export function calculateServiceReportSummary(
  serviceReports: AnyRow[],
  start: string,
  end: string,
) {
  const rows = serviceReports.filter((row) =>
    inDateRange(row.service_date ?? row.created_at, start, end),
  );
  return {
    completed: rows.filter((row) => row.status === "Completed").length,
    followUpRequired: rows.filter((row) => row.follow_up_required).length,
    defectsFound: rows.filter((row) => Boolean(row.defects_found)).length,
  };
}

export function buildWeeklyReportPayload(input: {
  contract: AnyRow | null;
  start: string;
  end: string;
  workOrders: AnyRow[];
  ppmVisits: AnyRow[];
  attendance: AnyRow[];
  plans: AnyRow[];
  assignments: AnyRow[];
  assets: AnyRow[];
  serviceReports: AnyRow[];
}) {
  const workOrders = calculateWorkOrderSummary(input.workOrders, input.start, input.end);
  const sla = calculateSlaSummary(input.workOrders, input.start, input.end);
  const ppm = calculatePpmSummary(input.ppmVisits, input.start, input.end);
  const attendance = calculateAttendanceSummary(input.attendance, input.start, input.end);
  const manpower = calculateManpowerVariance(
    input.plans,
    input.assignments,
    input.attendance,
    input.start,
    input.end,
  );
  const assets = calculateAssetSummary(input.assets, input.workOrders, input.start, input.end);
  const serviceReports = calculateServiceReportSummary(
    input.serviceReports,
    input.start,
    input.end,
  );
  return {
    kind: "Weekly",
    contract: input.contract,
    period: { start: input.start, end: input.end },
    workOrders,
    sla,
    ppm,
    attendance,
    manpower,
    assets,
    serviceReports,
    notes: {
      labels: REPORT_LABELS,
      siteObservations: "",
      challenges: "",
      pendingClientApprovals: "",
      pendingSpareParts: "",
      recommendations: "",
    },
  };
}

export function buildMonthlyReportPayload(input: Parameters<typeof buildWeeklyReportPayload>[0]) {
  const base = buildWeeklyReportPayload(input);
  return {
    ...base,
    kind: "Monthly",
    executiveSummary: {
      contractName: input.contract?.title ?? input.contract?.contract_no ?? "Contract",
      siteName: input.contract?.site_name ?? "",
      overallStatus:
        base.sla.compliancePercent >= 90 && base.ppm.completionPercent >= 90
          ? "On Track"
          : "Needs Attention",
      keyHighlights: "",
      majorConcerns: "",
      recommendations: "",
    },
    clientSubmission: {
      completedActivities: "",
      pendingActivities: "",
      risksChallenges: "",
      clientSupportRequired: "",
      nextMonthFocus: "",
    },
  };
}
