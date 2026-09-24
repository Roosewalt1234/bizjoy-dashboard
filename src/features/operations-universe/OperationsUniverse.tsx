import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
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

  const graph = useMemo(() => {
    if (centerEntity.kind === "today") return todayGraph();
    // A later task adds real handling for the other CenterEntity kinds here.
    return todayGraph();
  }, [centerEntity]);

  return (
    <div style={{ width: "100%", height: "calc(100vh - 4rem)" }}>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.data.clickable && node.data.center) {
            setCenterEntity(node.data.center);
          }
        }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
