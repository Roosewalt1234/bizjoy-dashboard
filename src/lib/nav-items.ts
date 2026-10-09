import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  UserCog,
  Wallet,
  FileText,
  FolderKanban,
  History,
  Shield,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Sidebar navigation tree, shared by the sidebar and the User Permissions page.
 *
 * `key` is the nav-item permission key stored in user_permissions.module.
 * `module` is the data module the item belongs to - the database RLS policies
 * check module rows, which are derived from the nav-item grants on save.
 * When key === module (mobile pages) the item IS the module row.
 */
export type NavChild = { key: string; title: string; url: string; module: string };

export type NavItem = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
  module?: string;
  adminOnly?: boolean;
  /** Not shown in the web sidebar - permission-only group (mobile app pages). */
  hiddenInSidebar?: boolean;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { key: "nav:dashboard", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { key: "nav:customers", title: "Customers", url: "/customers", icon: Users, module: "customers" },
  { key: "nav:sales", title: "Sales", url: "/sales", icon: ShoppingCart, module: "sales" },
  {
    key: "nav:hr",
    title: "HR",
    url: "/hr",
    icon: UserCog,
    module: "hr",
    children: [
      { key: "nav:hr.employees", title: "Employees", url: "/hr", module: "hr" },
      { key: "nav:hr.attendance", title: "Attendance", url: "/fm-attendance", module: "contracts" },
    ],
  },
  {
    key: "nav:accounts",
    title: "Accounts",
    url: "/accounts",
    icon: Wallet,
    module: "accounts",
    children: [
      { key: "nav:accounts.ledger", title: "Ledger", url: "/accounts", module: "accounts" },
      { key: "nav:accounts.outstanding", title: "Outstanding Amounts", url: "/accounts-outstanding", module: "accounts" },
      { key: "nav:accounts.pemo", title: "PEMO Management", url: "/pemo-management", module: "accounts" },
    ],
  },
  {
    key: "nav:amc",
    title: "AMC Contracts",
    url: "/amc-contracts",
    icon: FileText,
    module: "contracts",
    children: [
      { key: "nav:amc.scheduling", title: "AMC Scheduling", url: "/amc-scheduling", module: "contracts" },
      { key: "nav:amc.work-orders", title: "AMC Work Orders", url: "/amc-work-orders", module: "service" },
      { key: "nav:amc.service-reports", title: "AMC Work Completion Reports", url: "/amc-service-reports", module: "service" },
    ],
  },
  {
    key: "nav:fm",
    title: "FM Projects",
    url: "/fm-daily-operations",
    icon: FolderKanban,
    module: "contracts",
    children: [
      { key: "nav:fm.contracts", title: "FM Contracts", url: "/fm-contracts", module: "contracts" },
      { key: "nav:fm.service-categories", title: "Service Categories", url: "/fm-service-categories", module: "contracts" },
      { key: "nav:fm.line-items", title: "Contract Line Items", url: "/fm-contract-line-items", module: "contracts" },
      { key: "nav:fm.assets", title: "FM Asset Register", url: "/fm-assets", module: "contracts" },
      { key: "nav:fm.ppm", title: "PPM Planner", url: "/fm-ppm", module: "contracts" },
      { key: "nav:fm.work-orders", title: "FM Work Orders", url: "/fm-work-orders", module: "service" },
      { key: "nav:fm.service-reports", title: "FM Service Reports", url: "/fm-service-reports", module: "service" },
      { key: "nav:fm.sla", title: "SLA & KPI Tracker", url: "/fm-sla", module: "contracts" },
      { key: "nav:fm.manpower", title: "Manpower Planning", url: "/fm-manpower", module: "contracts" },
      { key: "nav:fm.weekly-reports", title: "Weekly Reports", url: "/fm-weekly-reports", module: "contracts" },
      { key: "nav:fm.monthly-reports", title: "Monthly Reports", url: "/fm-monthly-reports", module: "contracts" },
      { key: "nav:fm.invoice-packs", title: "Invoice Packs", url: "/fm-invoice-packs", module: "contracts" },
      { key: "nav:fm.cleaning-areas", title: "Cleaning Area", url: "/fm-cleaning-areas", module: "projects" },
      { key: "nav:fm.cleaning-scheduler", title: "Cleaning Scheduler", url: "/fm-cleaning-scheduler", module: "projects" },
      { key: "nav:fm.reports", title: "Reports", url: "/fm-reports", module: "projects" },
    ],
  },
  {
    key: "nav:mobile",
    title: "Mobile App",
    url: "",
    icon: Smartphone,
    hiddenInSidebar: true,
    children: [
      { key: "mobile_attendance", title: "Attendance", url: "", module: "mobile_attendance" },
      { key: "mobile_pending_jobs", title: "Pending Jobs", url: "", module: "mobile_pending_jobs" },
      { key: "mobile_schedule", title: "Schedule", url: "", module: "mobile_schedule" },
      { key: "mobile_report_snag", title: "Report Snag", url: "", module: "mobile_report_snag" },
      { key: "mobile_variation_job", title: "New Variation Job", url: "", module: "mobile_variation_job" },
      { key: "mobile_completion_report", title: "Completion Report", url: "", module: "mobile_completion_report" },
      { key: "mobile_floor_scan", title: "Floor Scan (NFC)", url: "", module: "mobile_floor_scan" },
      { key: "mobile_sales", title: "Sales", url: "", module: "mobile_sales" },
    ],
  },

  { key: "nav:audit", title: "Audit Log", url: "/audit", icon: History, adminOnly: true },
  { key: "nav:permissions", title: "User Permissions", url: "/permissions", icon: Shield, adminOnly: true },
];

/** Nav items that carry permissions (excludes the always-visible Dashboard and admin-only pages). */
export const PERMISSION_NAV_ITEMS = NAV_ITEMS.filter((i) => !i.adminOnly && (i.module || i.children?.length));

export type PermAction = "view" | "add" | "edit" | "delete";
export const PERM_ACTIONS: PermAction[] = ["view", "add", "edit", "delete"];

export type PermFlags = Record<PermAction, boolean>;
export type PermRow = { module: string; can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean };

/** Every permission-carrying node (parent "main" rows that have a module + all children) with its module. */
export function permissionNodes(): { key: string; module: string }[] {
  const out: { key: string; module: string }[] = [];
  for (const item of PERMISSION_NAV_ITEMS) {
    if (item.module) out.push({ key: item.key, module: item.module });
    for (const c of item.children ?? []) out.push({ key: c.key, module: c.module });
  }
  return out;
}

/**
 * Builds the rows to persist: one row per nav item, plus one row per data module
 * granted an action when ANY nav item under that module is granted it.
 */
export function buildPermissionRows(values: Record<string, PermFlags>): PermRow[] {
  const nodes = permissionNodes();
  const byKey = new Map<string, PermRow>();
  const moduleRows = new Map<string, PermRow>();
  for (const { key, module } of nodes) {
    const v = values[key] ?? { view: false, add: false, edit: false, delete: false };
    if (key !== module) {
      byKey.set(key, { module: key, can_view: v.view, can_add: v.add, can_edit: v.edit, can_delete: v.delete });
    }
    const m = moduleRows.get(module) ?? { module, can_view: false, can_add: false, can_edit: false, can_delete: false };
    m.can_view ||= v.view;
    m.can_add ||= v.add;
    m.can_edit ||= v.edit;
    m.can_delete ||= v.delete;
    moduleRows.set(module, m);
  }
  return [...byKey.values(), ...moduleRows.values()];
}

/**
 * Reads a nav item's grant from a user's stored rows. Falls back to the item's
 * module row for users whose permissions were saved before nav-item grants existed.
 */
export function navFlags(rows: any[], key: string, module: string): PermFlags {
  const row = rows.find((p) => p.module === key) ?? rows.find((p) => p.module === module);
  return {
    view: Boolean(row?.can_view),
    add: Boolean(row?.can_add),
    edit: Boolean(row?.can_edit),
    delete: Boolean(row?.can_delete),
  };
}
