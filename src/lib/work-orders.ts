export const WO_STATUS = ["Open", "Scheduled", "In Progress", "Completed", "Cancelled"] as const;
export const WO_PRIORITY = ["Low", "Normal", "High", "Urgent"] as const;

export const ITEM_SEP = "\n---\n";

export function splitItems(v: string | null | undefined): string[] {
  return (v ?? "").split(ITEM_SEP);
}

export function woStatusClasses(s: string | null | undefined): string {
  switch (s) {
    case "Completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "In Progress":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200";
    case "Scheduled":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200";
    case "Cancelled":
      return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
  }
}

export function woPriorityClasses(p: string | null | undefined): string {
  switch (p) {
    case "Urgent":
      return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200";
    case "High":
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200";
    case "Low":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200";
    default:
      return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200";
  }
}
