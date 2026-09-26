import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, applyNodeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutAround } from "./layout";
import { UniverseNodeComponent } from "./UniverseNodeComponent";
import { useUniverseGraph } from "./useUniverseNodes";
import { EntityDetailPanel } from "./EntityDetailPanel";
import { UniverseSearch } from "./UniverseSearch";
import type { CenterEntity, ExceptionCategory, UniverseNodeData } from "./types";
import { useIsMobile } from "@/hooks/use-mobile";
import { detectAllExceptions, worstSeverity, type OperationalException } from "./exceptions";
import { buildMorningSummary } from "./attention-summary";

const nodeTypes = { universe: UniverseNodeComponent };

interface HistoryEntry {
  entity: CenterEntity;
  label: string;
}

// Stable reference so the "no data yet" fallback below doesn't create a brand new
// object on every render while a query is loading - see the `graph` useEffect.
const EMPTY_GRAPH: { nodes: Node<UniverseNodeData>[]; edges: Edge[] } = { nodes: [], edges: [] };

// Entity kinds that always have real detail once loaded - a fixed classification of
// the entity's STATIC KIND, not something that varies per-fetch. Used to decide
// whether the detail panel should auto-open on a genuine navigation (see the
// `panelOpen` effect below), so a background refetch of the SAME entity - which only
// changes `fetchedGraph`'s reference, never `centerEntity` itself - can't reopen a
// panel the user already dismissed.
const DETAIL_ENTITY_KINDS: CenterEntity["kind"][] = [
  "contract",
  "work-order",
  "ppm-visit",
  "contract-finance",
  "payment",
  "employee",
  "customer",
];

interface TodayAttention {
  totalCount: number;
  worstSeverity: OperationalException["severity"] | undefined;
  categoryCounts: Record<ExceptionCategory, number>;
  morningSummary: { operational: string; dataQuality?: string };
}

function todayGraph(attention: TodayAttention | undefined) {
  const operationsCount = attention?.categoryCounts.operations ?? 0;
  const peopleCount = attention?.categoryCounts.people ?? 0;
  const contractsBucketCount = attention
    ? attention.categoryCounts.finance +
      attention.categoryCounts.contracts +
      attention.categoryCounts["data-quality"]
    : 0;

  const centerData: UniverseNodeData = { kind: "today", label: "TODAY", clickable: false };
  const ringOne: { id: string; data: UniverseNodeData }[] = [
    {
      id: "hub:attention",
      data: {
        kind: "attention-hub",
        label: "ATTENTION",
        sublabel: attention ? `${attention.totalCount}` : "…",
        severity: attention?.worstSeverity,
        exception: Boolean(attention && attention.totalCount > 0),
        clickable: true,
        center: { kind: "attention", category: "__root__" },
        groupKey: "attention",
      },
    },
    {
      id: "hub:contracts",
      data: {
        kind: "contracts-hub",
        label: "CONTRACTS",
        sublabel:
          contractsBucketCount > 0 ? `${contractsBucketCount} attention` : "What must we deliver?",
        exception: contractsBucketCount > 0,
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
        sublabel: peopleCount > 0 ? `${peopleCount} attention` : "Who do I have?",
        exception: peopleCount > 0,
        clickable: true,
        center: { kind: "staff-category" },
        groupKey: "staff",
      },
    },
    {
      id: "hub:schedules",
      data: {
        kind: "schedules-hub",
        label: "SCHEDULES",
        sublabel: operationsCount > 0 ? `${operationsCount} attention` : "What is happening?",
        exception: operationsCount > 0,
        clickable: true,
        center: { kind: "schedule-category", category: "__root__" },
        groupKey: "schedules",
      },
    },
  ];
  return layoutAround({ centerId: "today", centerData, ringOne });
}

export function OperationsUniverse() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [centerEntity, setCenterEntity] = useState<CenterEntity>({ kind: "today" });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [relationshipReason, setRelationshipReason] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const handleBack = useCallback(() => {
    let previousEntry: HistoryEntry | undefined;
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      previousEntry = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    if (previousEntry) {
      setRelationshipReason(null);
      setCenterEntity(previousEntry.entity);
    }
  }, []);

  const handleReturnToToday = useCallback(() => {
    setRelationshipReason(null);
    setHistory([]);
    setCenterEntity({ kind: "today" });
  }, []);

  const jumpToHistoryIndex = useCallback((index: number) => {
    let target: HistoryEntry | undefined;
    setHistory((prev) => {
      target = prev[index];
      return prev.slice(0, index);
    });
    if (target) {
      setRelationshipReason(null);
      setCenterEntity(target.entity);
    }
  }, []);

  const isToday = centerEntity.kind === "today";
  const {
    data: fetchedGraph,
    isLoading,
    error,
    refetch,
  } = useUniverseGraph(centerEntity, { enabled: !isToday });

  // Always enabled (not gated by isToday) - reverse-navigation on other entity screens shares
  // this exact cache entry via useUniverseGraph's own queryClient.fetchQuery calls, so a click
  // into a Contract right after viewing TODAY reuses this result instead of re-running all 6
  // detectors.
  const {
    data: exceptionsData,
    error: exceptionsError,
    refetch: refetchExceptions,
  } = useQuery({
    queryKey: ["operational-exceptions"],
    queryFn: detectAllExceptions,
    staleTime: 60_000,
  });

  const todayAttention: TodayAttention | undefined = useMemo(() => {
    if (!exceptionsData) return undefined;
    const categoryCounts: Record<ExceptionCategory, number> = {
      operations: 0,
      people: 0,
      finance: 0,
      contracts: 0,
      "data-quality": 0,
    };
    for (const exception of exceptionsData) {
      categoryCounts[exception.category] += 1;
    }
    return {
      totalCount: exceptionsData.length,
      worstSeverity: worstSeverity(exceptionsData),
      categoryCounts,
      morningSummary: buildMorningSummary(exceptionsData),
    };
  }, [exceptionsData]);

  const todayGraphMemo = useMemo(() => todayGraph(todayAttention), [todayAttention]);
  const graph = isToday ? todayGraphMemo : (fetchedGraph ?? EMPTY_GRAPH);

  const currentLabel = isToday ? "Today" : (graph.nodes[0]?.data.label ?? "Loading...");

  const navigateTo = useCallback(
    (entity: CenterEntity) => {
      setRelationshipReason(null);
      setHistory((prev) => [...prev, { entity: centerEntity, label: currentLabel }]);
      setCenterEntity(entity);
    },
    [centerEntity, currentLabel],
  );

  // Local, draggable copy of the node positions. Re-synced to the freshly computed
  // layout whenever `graph` changes identity - which, thanks to the stable references
  // above, only happens on an actual recenter (or when a query's data actually
  // resolves/changes), not on unrelated re-renders like the relationshipReason popover
  // opening/closing.
  const [nodes, setNodes] = useState<Node<UniverseNodeData>[]>(graph.nodes);

  // Keyed on node ids, not `graph`'s object identity - a background refetch that updates the
  // same nodes' labels/counts (e.g. TODAY's attention counts refreshing) must not reset the
  // user's dragged positions; a genuine navigation to a different screen, which always has a
  // different node id set, still does.
  const nodeIdsKey = graph.nodes.map((node) => node.id).join(",");
  useEffect(() => {
    setNodes(graph.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIdsKey]);

  useEffect(() => {
    setPanelOpen(DETAIL_ENTITY_KINDS.includes(centerEntity.kind));
  }, [centerEntity]);

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
          setRelationshipReason(null);
          const data = node.data as UniverseNodeData;
          if (data.clickable && data.center) {
            navigateTo(data.center);
          }
        }}
        onEdgeClick={(_, edge) => {
          const reason = (edge.data as { reason?: string } | undefined)?.reason;
          setRelationshipReason(reason ?? null);
        }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      <UniverseSearch
        onSelect={(entity) => navigateTo(entity)}
        avoidTopLeftRow={centerEntity.kind !== "today"}
      />
      {centerEntity.kind !== "today" && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: "calc(100% - 32px)",
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              flexShrink: 0,
              background: "#1c2128",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#e6edf3",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 14px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            ← Back
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: "1 1 auto",
              minWidth: 0,
              maxWidth: isMobile ? 140 : 320,
              overflowX: "auto",
              background: "#1c2128",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "#8a93a3",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            <button
              type="button"
              onClick={handleReturnToToday}
              style={{
                background: "none",
                border: "none",
                color: "#e6edf3",
                cursor: "pointer",
                fontWeight: 700,
                padding: 0,
              }}
            >
              Today
            </button>
            {history.slice(1).map((entry, index) => (
              <span key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => jumpToHistoryIndex(index + 1)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8a93a3",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {entry.label}
                </button>
              </span>
            ))}
            <span>/</span>
            <span style={{ color: "#e6edf3", fontWeight: 700 }}>{currentLabel}</span>
          </div>
        </div>
      )}
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
      {isToday && (todayAttention || exceptionsError) && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            zIndex: 10,
            maxWidth: 320,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e6edf3",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {todayAttention ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div>{todayAttention.morningSummary.operational}</div>
                {todayAttention.morningSummary.dataQuality && (
                  <div style={{ marginTop: 6, color: "#8a93a3" }}>
                    {todayAttention.morningSummary.dataQuality}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["operational-exceptions"] })
                }
                title="Refresh attention data"
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  color: "#e6edf3",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 8px",
                }}
              >
                Refresh
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>{exceptionsError?.message}</div>
              <button
                type="button"
                onClick={() => refetchExceptions()}
                style={{
                  flexShrink: 0,
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  color: "#e6edf3",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 8px",
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      {relationshipReason && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
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
            onClick={() => setRelationshipReason(null)}
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
            Why is this connected?
          </div>
          <div style={{ fontSize: 12, color: "#8a93a3", marginTop: 2 }}>{relationshipReason}</div>
        </div>
      )}
      <EntityDetailPanel
        title={currentLabel}
        fields={!isToday ? fetchedGraph?.centerDetail : undefined}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
