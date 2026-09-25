export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "unassigned" | "tomorrow" | "attention";

// '__root__' means "show the category list itself", not a specific category
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "schedule-job"; id: string }
  | { kind: "employee"; id: string; name: string; position?: string };

export type EntityKind =
  | "today"
  | "contracts-hub"
  | "staff-hub"
  | "schedules-hub"
  | "category"
  | "contract"
  | "customer"
  | "work-order"
  | "ppm-visit"
  | "invoice"
  | "payment"
  | "service-report"
  | "manpower"
  | "timeline-event"
  | "employee-info"
  | "staff-category"
  | "staff-member"
  | "staff-detail"
  | "schedule-category"
  | "schedule-job";

export type EdgeStyle = "active" | "planned" | "attention";

export interface UniverseNodeData {
  [key: string]: unknown;
  kind: EntityKind;
  label: string;
  sublabel?: string;
  exception?: boolean;
  /** false for "coming soon" hubs, or an employee-info card whose work order has no linked technician id - clicking does nothing instead of recentering */
  clickable: boolean;
  /** what clicking this node centers on - only present when clickable is true */
  center?: CenterEntity;
  /** groups nodes into the same angular sector of their ring, e.g. all pending work orders together */
  groupKey?: string;
  /** how this node's connecting edge to the center should render - defaults to 'active' (solid) if omitted, or 'attention' automatically when `exception` is true */
  edgeStyle?: EdgeStyle;
  /** human-readable answer to "why is this connected?" for the edge linking this node to its center */
  relationshipReason?: string;
}

export interface CenterDetailField {
  label: string;
  value: string;
}

export function centerEntityKey(center: CenterEntity): string {
  switch (center.kind) {
    case "today":
      return "today";
    case "contract-category":
      return `contract-category:${center.domain}:${center.status}`;
    case "contract":
      return `contract:${center.domain}:${center.id}`;
    case "work-order":
      return `work-order:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
    case "schedule-category":
      return `schedule-category:${center.category}`;
    case "schedule-job":
      return `schedule-job:${center.id}`;
    case "employee":
      return `employee:${center.id}`;
  }
}
