export type ContractDomain = "AMC" | "FM";
export type StaffCategory = "available" | "booked" | "absent";
export type ScheduleCategory = "today" | "upcoming" | "overdue";
export type ExceptionCategory = "operations" | "people" | "finance" | "contracts" | "data-quality";
export type ExceptionSeverity = "attention" | "important" | "critical";

/**
 * The entity kinds a reverse-navigation "ATTENTION" relationship can attach to. Deliberately
 * narrower than CenterEntity - excludes attention/attention-type/exception/entity-attention
 * itself, so an entity-attention node can never wrap another one (which would make
 * centerEntityKey's recursive case for this kind recurse without a base case).
 */
export type AttentionTarget =
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "contract-finance"; domain: ContractDomain; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "ppm-visit"; domain: ContractDomain; id: string }
  | { kind: "employee"; id: string; name: string; position?: string };

// '__root__' means "show the category list itself", not a specific category
export type CenterEntity =
  | { kind: "today" }
  | { kind: "contract-category"; domain: ContractDomain; status: string }
  | { kind: "contract"; domain: ContractDomain; id: string }
  | { kind: "customer"; id: string }
  | { kind: "work-order"; domain: ContractDomain; id: string }
  | { kind: "ppm-visit"; domain: ContractDomain; id: string }
  | { kind: "contract-finance"; domain: ContractDomain; id: string }
  | { kind: "payment-category"; domain: ContractDomain; contractId: string; category: "received" | "outstanding" | "overdue" }
  | { kind: "payment"; domain: ContractDomain; id: string }
  | { kind: "staff-category" }
  | { kind: "schedule-category"; category: ScheduleCategory | "__root__" }
  | { kind: "employee"; id: string; name: string; position?: string }
  | { kind: "attention"; category: ExceptionCategory | "__root__" }
  | { kind: "attention-type"; category: ExceptionCategory; title: string }
  | { kind: "exception"; id: string }
  | { kind: "entity-attention"; target: AttentionTarget };

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
  | "contract-finance"
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
  | "attention-hub"
  | "attention-category"
  | "exception";

export type EdgeStyle = "active" | "planned" | "attention";

export interface UniverseNodeData {
  [key: string]: unknown;
  kind: EntityKind;
  label: string;
  sublabel?: string;
  exception?: boolean;
  /** only set by attention/exception-related nodes - drives severity-tiered node styling */
  severity?: ExceptionSeverity;
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
    case "customer":
      return `customer:${center.id}`;
    case "work-order":
      return `work-order:${center.domain}:${center.id}`;
    case "ppm-visit":
      return `ppm-visit:${center.domain}:${center.id}`;
    case "contract-finance":
      return `contract-finance:${center.domain}:${center.id}`;
    case "payment-category":
      return `payment-category:${center.domain}:${center.contractId}:${center.category}`;
    case "payment":
      return `payment:${center.domain}:${center.id}`;
    case "staff-category":
      return "staff-category";
    case "schedule-category":
      return `schedule-category:${center.category}`;
    case "employee":
      return `employee:${center.id}`;
    case "attention":
      return `attention:${center.category}`;
    case "attention-type":
      return `attention-type:${center.category}:${center.title}`;
    case "exception":
      return `exception:${center.id}`;
    case "entity-attention":
      return `entity-attention:${centerEntityKey(center.target)}`;
  }
}
