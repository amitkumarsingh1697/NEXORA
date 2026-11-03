export type Confidence = 'observed' | 'inferred' | 'unknown';
export type NodeKind = 'file' | 'symbol' | 'module' | 'external' | 'route' | 'doc' | 'entrypoint';

export interface NodeRec {
  kind: NodeKind;
  key: string;
  name: string;
  filePath?: string;
  module?: string;
  symbolKind?: string;
  exported?: boolean;
  startLine?: number;
  endLine?: number;
  data?: Record<string, unknown>;
}

export interface NodeRef {
  kind: NodeKind;
  key: string;
}

export interface EdgeRec {
  kind: string;
  src: NodeRef;
  dst: NodeRef;
  confidence: Confidence;
  evidencePath?: string;
  evidenceLine?: number;
  detail?: string;
}

export interface UnresolvedRec {
  filePath: string;
  line: number;
  kind: 'import' | 'call' | 'route_handler' | 'heritage';
  text: string;
  reason: string;
}

export interface ChunkRec {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolKey?: string;
  kind: 'code' | 'doc' | 'text';
  body: string;
}

const RANK: Record<Confidence, number> = { observed: 3, inferred: 2, unknown: 1 };

/** Accumulates the graph, de-duplicating nodes and edges. */
export class GraphBuilder {
  readonly nodes = new Map<string, NodeRec>();
  private readonly edgeMap = new Map<string, EdgeRec & { count: number }>();
  readonly unresolved: UnresolvedRec[] = [];
  readonly chunks: ChunkRec[] = [];
  unresolvedDropped = 0;
  static readonly MAX_UNRESOLVED = 5000;

  static id(ref: NodeRef): string {
    return `${ref.kind}:${ref.key}`;
  }

  addNode(n: NodeRec): NodeRef {
    const id = GraphBuilder.id(n);
    const prev = this.nodes.get(id);
    if (prev) {
      // Merge: keep earliest location, union data.
      this.nodes.set(id, {
        ...prev,
        ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)),
        startLine: prev.startLine ?? n.startLine,
        data: { ...prev.data, ...n.data },
      });
    } else this.nodes.set(id, n);
    return { kind: n.kind, key: n.key };
  }

  has(ref: NodeRef): boolean {
    return this.nodes.has(GraphBuilder.id(ref));
  }

  get(ref: NodeRef): NodeRec | undefined {
    return this.nodes.get(GraphBuilder.id(ref));
  }

  addEdge(e: EdgeRec): void {
    if (GraphBuilder.id(e.src) === GraphBuilder.id(e.dst) && e.kind !== 'calls') return;
    const k = `${e.kind}|${GraphBuilder.id(e.src)}|${GraphBuilder.id(e.dst)}`;
    const prev = this.edgeMap.get(k);
    if (!prev) this.edgeMap.set(k, { ...e, count: 1 });
    else {
      prev.count++;
      if (RANK[e.confidence] > RANK[prev.confidence])
        Object.assign(prev, {
          confidence: e.confidence,
          evidencePath: e.evidencePath,
          evidenceLine: e.evidenceLine,
        });
    }
  }

  get edges(): (EdgeRec & { count: number })[] {
    return [...this.edgeMap.values()];
  }

  addUnresolved(u: UnresolvedRec): void {
    if (this.unresolved.length >= GraphBuilder.MAX_UNRESOLVED) this.unresolvedDropped++;
    else this.unresolved.push({ ...u, text: u.text.slice(0, 200) });
  }
}

/** Split identifiers into search terms: refreshDeviceToken -> "refresh device token". */
export function splitTerms(text: string): string {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
    const parts = m[0]
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_$]+/)
      .filter((p) => p.length >= 2);
    if (parts.length > 1) for (const p of parts) out.add(p.toLowerCase());
  }
  return [...out].join(' ');
}
