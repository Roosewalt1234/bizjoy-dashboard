export const SLA_STATUSES = [
  "Within SLA",
  "At Risk",
  "Breached",
  "Paused",
  "Not Started",
  "Not Applicable",
] as const;

export const SLA_PRIORITIES = ["P1 Critical", "P2 High", "P3 Medium", "P4 Low"] as const;
export const SLA_REQUEST_TYPES = [
  "Emergency",
  "Reactive",
  "Corrective",
  "PPM",
  "Inspection",
  "Other",
] as const;

export type SlaStatus = (typeof SLA_STATUSES)[number];

export type SlaPolicyLike = {
  id?: string | null;
  response_minutes?: number | null;
  completion_minutes?: number | null;
  response_hours?: number | null;
  completion_hours?: number | null;
};

export function minutesFromPolicy(
  policy: SlaPolicyLike | null | undefined,
  kind: "response" | "completion",
) {
  if (!policy) return null;
  const minuteValue = kind === "response" ? policy.response_minutes : policy.completion_minutes;
  if (minuteValue != null && Number.isFinite(Number(minuteValue))) return Number(minuteValue);
  const hourValue = kind === "response" ? policy.response_hours : policy.completion_hours;
  if (hourValue != null && Number.isFinite(Number(hourValue))) return Number(hourValue) * 60;
  return null;
}

export function addMinutesIso(baseIso: string | null | undefined, minutes: number | null) {
  if (!baseIso || minutes == null) return null;
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + minutes * 60 * 1000).toISOString();
}

const PPM_REQUEST_TYPES = [
  "PPM",
  "Preventive Maintenance",
  "Planned Preventive Maintenance",
];

export function isPpmRequestType(value: string | null | undefined) {
  return PPM_REQUEST_TYPES.includes(value ?? "");
}

/**
 * A policy is "schedule based" when it carries no usable response/completion
 * targets (blank or zero). PPM work is then measured against its scheduled
 * visit date instead of a minute-based clock.
 */
export function isScheduleBasedPolicy(policy: SlaPolicyLike | null | undefined) {
  const response = minutesFromPolicy(policy, "response");
  const completion = minutesFromPolicy(policy, "completion");
  return !response && !completion;
}

/** End-of-day on the scheduled visit date (local time). */
export function scheduleBasedDueTimes(scheduledDate: string | null | undefined) {
  if (!scheduledDate) return { response_due_at: null, completion_due_at: null };
  const due = new Date(`${scheduledDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return { response_due_at: null, completion_due_at: null };
  return { response_due_at: null, completion_due_at: due.toISOString() };
}

export function calculateDueTimes(
  reportedAt: string | null | undefined,
  policy: SlaPolicyLike | null | undefined,
) {
  return {
    response_due_at: addMinutesIso(reportedAt, minutesFromPolicy(policy, "response")),
    completion_due_at: addMinutesIso(reportedAt, minutesFromPolicy(policy, "completion")),
  };
}

type StatusInput = {
  dueAt?: string | null;
  actualAt?: string | null;
  paused?: boolean;
  now?: Date;
};

export function calculateSlaStatus({
  dueAt,
  actualAt,
  paused,
  now = new Date(),
}: StatusInput): SlaStatus {
  if (paused) return "Paused";
  if (!dueAt) return "Not Applicable";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "Not Applicable";
  if (actualAt) {
    const actual = new Date(actualAt);
    if (Number.isNaN(actual.getTime())) return "Not Applicable";
    return actual.getTime() <= due.getTime() ? "Within SLA" : "Breached";
  }
  const remainingMs = due.getTime() - now.getTime();
  if (remainingMs < 0) return "Breached";
  if (remainingMs <= 2 * 60 * 60 * 1000) return "At Risk";
  return "Not Started";
}

export function statusBadgeClasses(status: string | null | undefined) {
  switch (status) {
    case "Within SLA":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "At Risk":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Breached":
      return "bg-red-100 text-red-800 border-red-200";
    case "Paused":
      return "bg-violet-100 text-violet-800 border-violet-200";
    case "Not Started":
      return "bg-sky-100 text-sky-800 border-sky-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function normalizePriority(value: string | null | undefined) {
  switch (value) {
    case "Emergency":
      return "P1 Critical";
    case "High":
      return "P2 High";
    case "Medium":
      return "P3 Medium";
    case "Low":
      return "P4 Low";
    default:
      return value || "P3 Medium";
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
