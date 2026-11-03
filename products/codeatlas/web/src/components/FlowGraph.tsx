import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type { GraphView } from '../types';

const STROKE: Record<string, string> = {
  observed: 'var(--observed)',
  inferred: 'var(--inferred)',
  unknown: 'var(--unknown)',
};
const DASH: Record<string, string | undefined> = {
  observed: undefined,
  inferred: '6 4',
  unknown: '2 4',
};

/** Layered left-to-right flow diagram; columns are call depth from the start. */
export function FlowGraph({
  view,
  onSelect,
}: {
  view: GraphView;
  onSelect?: (ref: number | undefined) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const cols = new Map<number, number>();
    const nodes: Node[] = view.nodes
      .slice()
      .sort((a, b) => Number(a.metrics?.depth ?? 0) - Number(b.metrics?.depth ?? 0))
      .map((n) => {
        const d = Number(n.metrics?.depth ?? 0);
        const row = cols.get(d) ?? 0;
        cols.set(d, row + 1);
        return {
          id: n.id,
          position: { x: d * 300, y: row * 80 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wide opacity-60">{n.kind}</div>
                <div className="truncate font-medium">{n.label}</div>
                <div className="truncate text-[10px] opacity-60">
                  {String(n.metrics?.file ?? '')}
                  {n.metrics?.line ? `:${n.metrics.line}` : ''}
                </div>
              </div>
            ),
            ref: n.ref,
          },
          style: {
            width: 240,
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--panel)',
            color: 'var(--ink)',
            padding: 8,
          },
        };
      });
    const edges: Edge[] = view.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.kind === 'calls' ? undefined : e.kind,
      style: {
        stroke: STROKE[e.confidence],
        strokeDasharray: DASH[e.confidence],
        strokeWidth: 1.6,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: STROKE[e.confidence] },
      labelStyle: { fontSize: 10, fill: 'var(--muted)' },
    }));
    return { nodes, edges };
  }, [view]);

  return (
    <div style={{ height: 600 }} className="rounded-lg border border-line bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable
        nodesConnectable={false}
        onNodeClick={(_e, n) => onSelect?.((n.data as { ref?: number }).ref)}
        minZoom={0.1}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
