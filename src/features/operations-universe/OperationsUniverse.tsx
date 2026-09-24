import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function OperationsUniverse() {
  const nodes = [
    {
      id: 'today',
      position: { x: 0, y: 0 },
      data: { label: 'TODAY' },
      style: { borderRadius: 999, background: '#e8b44a', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
    },
  ];

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 4rem)' }}>
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
