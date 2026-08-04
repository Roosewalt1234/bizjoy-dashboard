export const SERVICE_TYPES = [
  "AC Servicing",
  "Water Pumps & Motors",
  "Electrical",
  "Plumbing",
  "Solar Water Heater",
  "Water Tank Cleaning",
  "Handyman",
  "Breakdown Call",
  "Rectification Work",
  "Snag Inspection",
  "Other",
] as const;

export const REPORT_STATUS = ["Draft", "Completed"] as const;

export type PhotoRow = {
  id?: string;
  caption?: string | null;
  before_path?: string | null;
  after_path?: string | null;
  sort_order?: number;
  beforeFile?: File;
  afterFile?: File;
  _deleted?: boolean;
};

export function statusClasses(s: string | null | undefined): string {
  return s === "Completed"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200"
    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
}
