import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Sparkles,
  FileText,
  Users,
  CalendarClock,
  Layers,
  Building2,
  Wrench,
  CalendarCheck,
  Receipt,
  Banknote,
  ClipboardCheck,
  HardHat,
  Clock,
  User,
  UserCircle2,
  Info,
  ListChecks,
  Briefcase,
} from "lucide-react";
import type { UniverseNodeData, EntityKind } from "./types";

const ICONS: Record<EntityKind, React.ComponentType<{ className?: string }>> = {
  today: Sparkles,
  "contracts-hub": FileText,
  "staff-hub": Users,
  "schedules-hub": CalendarClock,
  category: Layers,
  contract: FileText,
  customer: Building2,
  "work-order": Wrench,
  "ppm-visit": CalendarCheck,
  invoice: Receipt,
  payment: Banknote,
  "service-report": ClipboardCheck,
  manpower: HardHat,
  "timeline-event": Clock,
  "employee-info": User,
  "staff-category": Users,
  "staff-member": UserCircle2,
  "staff-detail": Info,
  "schedule-category": ListChecks,
  "schedule-job": Briefcase,
};

const COLORS: Partial<Record<EntityKind, string>> = {
  today: "#e8b44a",
  "contracts-hub": "#7ec699",
  "staff-hub": "#5b6270",
  "schedules-hub": "#5b6270",
  category: "#5b9bd5",
  contract: "#7ec699",
  customer: "#b48ee8",
  "work-order": "#e89a4a",
  "ppm-visit": "#4ac6c6",
  invoice: "#e8c14a",
  payment: "#5fc27e",
  "service-report": "#8a93e8",
  manpower: "#4ac6a0",
  "timeline-event": "#8a93a3",
  "employee-info": "#8a93a3",
  "staff-category": "#5b9bd5",
  "staff-member": "#e8a5c4",
  "staff-detail": "#8a93a3",
  "schedule-category": "#5b9bd5",
  "schedule-job": "#e89a4a",
};

export function UniverseNodeComponent({ data }: NodeProps<Node<UniverseNodeData>>) {
  const Icon = ICONS[data.kind];
  const baseColor = COLORS[data.kind] ?? "#5b9bd5";
  const isDimmed = !data.clickable;
  const isException = Boolean(data.exception);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isDimmed ? "#2a2f38" : baseColor,
        border: isException ? "3px solid #dc4c4c" : "2px solid rgba(0,0,0,0.15)",
        color: isDimmed ? "#8a93a3" : "#0d1117",
        opacity: isDimmed ? 0.55 : 1,
        cursor: data.clickable || data.kind === "employee-info" ? "pointer" : "default",
        textAlign: "center",
        padding: 6,
        boxShadow: isException ? "0 0 12px rgba(220,76,76,0.6)" : "none",
      }}
      title={data.sublabel ? `${data.label} - ${data.sublabel}` : data.label}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Icon className="h-4 w-4" />
      <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2, lineHeight: 1.1 }}>
        {data.label.length > 18 ? `${data.label.slice(0, 17)}…` : data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
