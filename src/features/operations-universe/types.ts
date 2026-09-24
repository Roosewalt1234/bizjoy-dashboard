export type ContractDomain = 'AMC' | 'FM';

export type CenterEntity =
  | { kind: 'today' }
  | { kind: 'contract-category'; domain: ContractDomain; status: string }
  | { kind: 'contract'; domain: ContractDomain; id: string }
  | { kind: 'work-order'; domain: ContractDomain; id: string };

export type EntityKind =
  | 'today'
  | 'contracts-hub'
  | 'staff-hub'
  | 'schedules-hub'
  | 'category'
  | 'contract'
  | 'customer'
  | 'work-order'
  | 'ppm-visit'
  | 'invoice'
  | 'payment'
  | 'service-report'
  | 'manpower'
  | 'timeline-event'
  | 'employee-info';

export interface UniverseNodeData {
  kind: EntityKind;
  label: string;
  sublabel?: string;
  exception?: boolean;
  /** false for "coming soon" hubs and employee-info cards - clicking does nothing (or opens a popover, for employee-info) instead of recentering */
  clickable: boolean;
  /** what clicking this node centers on - only present when clickable is true and it's not an employee-info card */
  center?: CenterEntity;
  /** groups nodes into the same angular sector of their ring, e.g. all pending work orders together */
  groupKey?: string;
}

export function centerEntityKey(center: CenterEntity): string {
  switch (center.kind) {
    case 'today':
      return 'today';
    case 'contract-category':
      return `contract-category:${center.domain}:${center.status}`;
    case 'contract':
      return `contract:${center.domain}:${center.id}`;
    case 'work-order':
      return `work-order:${center.domain}:${center.id}`;
  }
}
