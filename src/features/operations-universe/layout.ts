import type { Node, Edge } from '@xyflow/react';
import type { EntityKind, UniverseNodeData } from './types';

const RING_RADIUS_STEP = 220;
const CENTER_NODE_SIZE = 130;

const HUB_KINDS: EntityKind[] = ['today', 'contracts-hub', 'staff-hub', 'schedules-hub'];
const CATEGORY_KINDS: EntityKind[] = ['category', 'staff-category', 'schedule-category'];

function ringNodeSize(kind: EntityKind): number {
  if (HUB_KINDS.includes(kind)) return 100;
  if (CATEGORY_KINDS.includes(kind)) return 80;
  return 60;
}

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
 * rather than scattered) rather than one flat evenly-spaced circle. Ring
 * node size is tiered by kind (hub > category > individual record) rather
 * than uniform, per the node-importance hierarchy in the Phase 2 design.
 */
export function layoutAround(input: UniverseGraphInput): { nodes: Node<UniverseNodeData>[]; edges: Edge[] } {
  const { centerId, centerData, ringOne } = input;

  const nodes: Node<UniverseNodeData>[] = [
    {
      id: centerId,
      type: 'universe',
      position: { x: 0, y: 0 },
      data: centerData,
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
      const size = ringNodeSize(item.data.kind);

      nodes.push({
        id: item.id,
        type: 'universe',
        position: { x, y },
        data: item.data,
        style: { width: size, height: size },
      });

      // Edge style: explicit `edgeStyle` wins; otherwise an exception forces
      // the warning treatment; otherwise a normal solid "active" relationship.
      const style: EdgeStyleResolved = item.data.exception
        ? 'attention'
        : (item.data.edgeStyle ?? 'active');
      const stroke = style === 'attention' ? '#dc4c4c' : '#3d4451';
      const strokeDasharray = style === 'planned' ? '6,5' : undefined;

      edges.push({
        id: `${centerId}->${item.id}`,
        source: centerId,
        target: item.id,
        animated: false,
        selectable: true,
        style: { stroke, strokeDasharray, strokeWidth: style === 'attention' ? 2.5 : 1.5 },
        data: { reason: item.data.relationshipReason },
      });
    });
  });

  return { nodes, edges };
}

type EdgeStyleResolved = 'active' | 'planned' | 'attention';
