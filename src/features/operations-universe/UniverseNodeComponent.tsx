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
  Wallet,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import type { UniverseNodeData, EntityKind } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";

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
  "contract-finance": Wallet,
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
  "attention-hub": AlertTriangle,
  "attention-category": Layers,
  exception: AlertCircle,
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
  "contract-finance": "#d4af37",
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
  "attention-hub": "#5b6270",
  "attention-category": "#5b9bd5",
  exception: "#e89a4a",
};

type Severity = "attention" | "important" | "critical";

const SEVERITY_BORDER: Record<Severity, string> = {
  attention: "2px solid #e8b44a",
  important: "3px solid #e89a4a",
  critical: "3px solid #dc4c4c",
};
const SEVERITY_GLOW: Record<Severity, string> = {
  attention: "none",
  important: "0 0 8px rgba(232,154,74,0.5)",
  critical: "0 0 12px rgba(220,76,76,0.6)",
};
const SEVERITY_HUB_FILL: Record<Severity, string> = {
  attention: "#e8b44a",
  important: "#e89a4a",
  critical: "#dc4c4c",
};

export function UniverseNodeComponent({ data }: NodeProps<Node<UniverseNodeData>>) {
  const isMobile = useIsMobile();
  const Icon = ICONS[data.kind];
  const isDimmed = !data.clickable;
  const isException = Boolean(data.exception);
  const severity = data.severity as Severity | undefined;
  const isAttentionHub = data.kind === "attention-hub";
  // The ATTENTION node's own fill reflects the worst live severity (calm gray when clear) -
  // every other kind keeps its static COLORS fill and only gets a severity-tiered border/glow.
  const baseColor = isAttentionHub
    ? severity
      ? SEVERITY_HUB_FILL[severity]
      : "#5b6270"
    : (COLORS[data.kind] ?? "#5b9bd5");
  const border =
    severity && !isAttentionHub
      ? SEVERITY_BORDER[severity]
      : isException
        ? "3px solid #dc4c4c"
        : "2px solid rgba(0,0,0,0.15)";
  const glow =
    severity && !isAttentionHub
      ? SEVERITY_GLOW[severity]
      : isException
        ? "0 0 12px rgba(220,76,76,0.6)"
        : "none";
  const maxLabelLength = isMobile ? 14 : 18;
  const labelFontSize = isMobile ? 11 : 10;

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
        border,
        color: isDimmed ? "#8a93a3" : "#0d1117",
        opacity: isDimmed ? 0.55 : 1,
        cursor: data.clickable ? "pointer" : "default",
        textAlign: "center",
        padding: 6,
        boxShadow: glow,
      }}
      title={data.sublabel ? `${data.label} - ${data.sublabel}` : data.label}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Icon className="h-4 w-4" />
      <span style={{ fontSize: labelFontSize, fontWeight: 700, marginTop: 2, lineHeight: 1.1 }}>
        {data.label.length > maxLabelLength
          ? `${data.label.slice(0, maxLabelLength - 1)}…`
          : data.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
