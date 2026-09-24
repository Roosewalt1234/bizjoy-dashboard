import { useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
import { useUniverseGraph } from "./useUniverseNodes";
import type { CenterEntity, UniverseNodeData } from "./types";

const nodeTypes = { universe: UniverseNodeComponent };

function todayGraph() {
  const centerData: UniverseNodeData = { kind: "today", label: "TODAY", clickable: false };
  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: "hub:contracts",
      data: {
        kind: "contracts-hub",
        label: "CONTRACTS",
        sublabel: "What must we deliver?",
        clickable: true,
        center: { kind: "contract-category", domain: "AMC", status: "__root__" },
        groupKey: "contracts",
      },
    },
    {
      id: "hub:staff",
      data: {
        kind: "staff-hub",
        label: "STAFF",
        sublabel: "Coming soon",
        clickable: false,
        groupKey: "staff",
      },
    },
    {
      id: "hub:schedules",
      data: {
        kind: "schedules-hub",
        label: "SCHEDULES",
        sublabel: "Coming soon",
        clickable: false,
        groupKey: "schedules",
      },
    },
  ];
  return layoutAround({ centerId: "today", centerData, ringOne });
}

export function OperationsUniverse() {
  const [centerEntity, setCenterEntity] = useState<CenterEntity>({ kind: "today" });
  const [employeeCard, setEmployeeCard] = useState<{ label: string; sublabel?: string } | null>(
    null,
  );

  const isToday = centerEntity.kind === "today";
  const {
    data: fetchedGraph,
    isLoading,
    error,
  } = useUniverseGraph(centerEntity, { enabled: !isToday });
  const graph = isToday ? todayGraph() : (fetchedGraph ?? { nodes: [], edges: [] });

  return (
    <div style={{ width: "100%", height: "calc(100vh - 4rem)", position: "relative" }}>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          const data = node.data as UniverseNodeData;
          if (data.kind === "employee-info") {
            setEmployeeCard({ label: data.label, sublabel: data.sublabel });
            return;
          }
          if (data.clickable && data.center) {
            setEmployeeCard(null);
            setCenterEntity(data.center);
          }
        }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {employeeCard && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            minWidth: 200,
            maxWidth: 280,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "12px 14px",
            color: "#e6edf3",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <button
            type="button"
            onClick={() => setEmployeeCard(null)}
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              background: "none",
              border: "none",
              color: "#8a93a3",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
          <div style={{ fontSize: 13, fontWeight: 700, paddingRight: 16 }}>
            {employeeCard.label}
          </div>
          {employeeCard.sublabel && (
            <div style={{ fontSize: 12, color: "#8a93a3", marginTop: 2 }}>
              {employeeCard.sublabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
