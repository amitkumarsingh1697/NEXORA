import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useRef } from 'react';
import type { GraphView } from '../types';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Categorical palette (distinguishable in light and dark themes). */
export const PALETTE = [
  '#0e7490',
  '#7c3aed',
  '#c2410c',
  '#15803d',
  '#be185d',
  '#1d4ed8',
  '#a16207',
  '#0f766e',
  '#9333ea',
  '#b91c1c',
];

const KIND_SHAPE: Record<string, string> = {
  module: 'round-rectangle',
  file: 'ellipse',
  external: 'diamond',
  route: 'tag',
  entrypoint: 'star',
};

/** Cytoscape graph for module and dependency views. Edge style encodes confidence. */
export function Graph({
  view,
  onSelect,
  height = 560,
}: {
  view: GraphView;
  onSelect?: (ref: number | undefined, id: string) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const maxW = Math.max(1, ...view.edges.map((e) => e.weight));
    // Colour nodes by module so cross-module edges stand out.
    const groups = [
      ...new Set(view.nodes.map((n) => n.group).filter((g): g is string => !!g)),
    ].sort();
    const color = (g?: string) =>
      g && groups.length > 1 ? PALETTE[groups.indexOf(g) % PALETTE.length] : undefined;
    const elements: ElementDefinition[] = [
      ...view.nodes.map((n) => ({
        data: {
          id: n.id,
          color: color(n.group),
          label: n.label.length > 48 ? `…${n.label.slice(-46)}` : n.label,
          kind: n.kind,
          ref: n.ref,
          size: 16 + Math.min(28, Math.sqrt(Number(n.metrics?.loc ?? n.metrics?.files ?? 1))),
        },
      })),
      ...view.edges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          confidence: e.confidence,
          width: 1 + (e.weight / maxW) * 5,
          kind: e.kind,
        },
      })),
    ];
    const ink = cssVar('--ink');
    const cy = cytoscape({
      container: el.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'font-size': 10,
            color: ink,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-wrap': 'ellipsis',
            'text-max-width': '140px',
            'text-background-color': cssVar('--canvas'),
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            'background-color': cssVar('--accent'),
            shape: 'ellipse',
          },
        },
        { selector: 'node[size]', style: { width: 'data(size)', height: 'data(size)' } },
        ...Object.entries(KIND_SHAPE).map(([k, shape]) => ({
          selector: `node[kind = "${k}"]`,
          style: { shape } as cytoscape.Css.Node,
        })),
        { selector: 'node[kind = "external"]', style: { 'background-color': cssVar('--muted') } },
        { selector: 'node[color]', style: { 'background-color': 'data(color)' } },
        {
          selector: 'edge',
          style: {
            width: 'data(width)',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            opacity: 0.75,
          },
        },
        {
          selector: 'edge[confidence = "observed"]',
          style: {
            'line-color': cssVar('--observed'),
            'target-arrow-color': cssVar('--observed'),
            'line-style': 'solid',
          },
        },
        {
          selector: 'edge[confidence = "inferred"]',
          style: {
            'line-color': cssVar('--inferred'),
            'target-arrow-color': cssVar('--inferred'),
            'line-style': 'dashed',
          },
        },
        {
          selector: 'edge[confidence = "unknown"]',
          style: {
            'line-color': cssVar('--unknown'),
            'target-arrow-color': cssVar('--unknown'),
            'line-style': 'dotted',
          },
        },
        {
          selector: ':selected',
          style: { 'border-width': 3, 'border-color': cssVar('--inferred') },
        },
        { selector: '.faded', style: { opacity: 0.12 } },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 40000,
        idealEdgeLength: () => 120,
        nodeDimensionsIncludeLabels: true,
        componentSpacing: 120,
        padding: 30,
      } as cytoscape.LayoutOptions,
    });
    cy.on('tap', 'node', (evt) => {
      const n = evt.target;
      cy.elements().addClass('faded');
      n.closedNeighborhood().removeClass('faded');
      selectRef.current?.(n.data('ref') as number | undefined, n.id());
    });
    cy.on('tap', (evt) => {
      if (evt.target === cy) cy.elements().removeClass('faded');
    });
    cyRef.current = cy;
    return () => cy.destroy();
  }, [view]);

  return (
    <div
      ref={el}
      style={{ height }}
      className="w-full rounded-lg border border-line bg-canvas"
      aria-label="Dependency graph"
      role="img"
    />
  );
}
