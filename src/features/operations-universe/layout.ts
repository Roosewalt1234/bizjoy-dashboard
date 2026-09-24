import type { Node, Edge } from '@xyflow/react';
import type { UniverseNodeData } from './types';

const RING_RADIUS_STEP = 220;
const CENTER_NODE_SIZE = 110;
const RING_NODE_SIZE = 70;

// React Flow's `Node<NodeData>` generic requires NodeData to extend
// Record<string, unknown>. UniverseNodeData (defined in ./types, owned by a
// different task) is a plain interface without an index signature, so we
// intersect it locally rather than editing that shared type.
type FlowNodeData = UniverseNodeData & Record<string, unknown>;

export interface UniverseGraphInput {
  centerId: string;
  centerData: UniverseNodeData;
  /** all first-ring nodes, each carrying a groupKey used to cluster them into angular sectors */
  ringOne: { id: string; data: UniverseNodeData }[];
}

/**
 * Places centerData at the canvas origin and arranges ringOne nodes on a
 * single ring around it, clustered by groupKey into contiguous angular
 * sectors (so e.g. all "pending work order" nodes land next to each other
 * rather than scattered) rather than one flat evenly-spaced circle.
 */
export function layoutAround(input: UniverseGraphInput): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const { centerId, centerData, ringOne } = input;

  const nodes: Node<FlowNodeData>[] = [
    {
      id: centerId,
      type: 'universe',
      position: { x: 0, y: 0 },
      data: centerData as FlowNodeData,
      style: { width: CENTER_NODE_SIZE, height: CENTER_NODE_SIZE },
    },
  ];
  const edges: Edge[] = [];

  const groups = new Map<string, { id: string; data: UniverseNodeData }[]>();
  for (const item of ringOne) {
    const key = item.data.groupKey ?? 'default';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const groupKeys = [...groups.keys()];
  const totalGroups = groupKeys.length || 1;
  const sectorSize = (2 * Math.PI) / totalGroups;

  groupKeys.forEach((key, groupIndex) => {
    const items = groups.get(key)!;
    const sectorStart = groupIndex * sectorSize;
    const itemStep = items.length > 1 ? sectorSize / items.length : 0;

    items.forEach((item, itemIndex) => {
      const angle = sectorStart + itemStep * itemIndex + itemStep / 2;
      const x = Math.cos(angle) * RING_RADIUS_STEP;
      const y = Math.sin(angle) * RING_RADIUS_STEP;

      nodes.push({
        id: item.id,
        type: 'universe',
        position: { x, y },
        data: item.data as FlowNodeData,
        style: { width: RING_NODE_SIZE, height: RING_NODE_SIZE },
      });

      edges.push({
        id: `${centerId}->${item.id}`,
        source: centerId,
        target: item.id,
        animated: false,
        style: { stroke: item.data.exception ? '#dc4c4c' : '#3d4451' },
      });
    });
  });

  return { nodes, edges };
}
