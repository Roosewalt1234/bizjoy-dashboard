import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, applyNodeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
import { useUniverseGraph } from "./useUniverseNodes";
import type { CenterEntity, UniverseNodeData } from "./types";

const nodeTypes = { universe: UniverseNodeComponent };

// Stable reference so the "no data yet" fallback below doesn't create a brand new
// object on every render while a query is loading - see the `graph` useEffect.
const EMPTY_GRAPH: { nodes: Node<UniverseNodeData>[]; edges: Edge[] } = { nodes: [], edges: [] };

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
    refetch,
  } = useUniverseGraph(centerEntity, { enabled: !isToday });
  // Empty deps: todayGraph() is pure with no inputs, so this is computed once and
  // stays referentially stable for the life of the component.
  const todayGraphMemo = useMemo(() => todayGraph(), []);
  const graph = isToday ? todayGraphMemo : (fetchedGraph ?? EMPTY_GRAPH);

  // Local, draggable copy of the node positions. Re-synced to the freshly computed
  // layout whenever `graph` changes identity - which, thanks to the stable references
  // above, only happens on an actual recenter (or when a query's data actually
  // resolves/changes), not on unrelated re-renders like the employeeCard popover
  // opening/closing.
  const [nodes, setNodes] = useState<Node<UniverseNodeData>[]>(graph.nodes);

  useEffect(() => {
    setNodes(graph.nodes);
  }, [graph]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<UniverseNodeData>>[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  return (
    <div style={{ width: "100%", height: "calc(100vh - 4rem)", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
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
      {isLoading && !isToday && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "12px 18px",
            color: "#e6edf3",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Loading...
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            minWidth: 220,
            maxWidth: 320,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "14px 16px",
            color: "#e6edf3",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>{error.message}</div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{
              marginTop: 10,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 6,
              color: "#e6edf3",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 14px",
            }}
          >
            Retry
          </button>
        </div>
      )}
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
