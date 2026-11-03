/**
 * Circular dependency detection (spec §5.6, AB-5.6-02).
 *
 * Strongly connected components of the resolved import graph, computed with
 * Tarjan's algorithm (iterative, so deep graphs cannot overflow the stack).
 * Only file-to-file imports inside the repository are considered. A cycle is
 * reported with the exact import statements that form it as evidence.
 */
import type { Db } from '../store/db';
import { EDGE_COLS, NODE_COLS, toEdge, toNode } from './graph';

export interface CycleEdge {
  from: string;
  to: string;
  path: string | null;
  line: number | null;
  typeOnly: boolean;
}

export interface Cycle {
  level: 'file' | 'module';
  /** Members of the strongly connected component, sorted. */
  members: string[];
  /** Import statements between members (capped at 50). */
  edges: CycleEdge[];
  /** True when every import in the cycle is type-only, so it has no runtime effect. */
  typeOnly: boolean;
}

/**
 * Tarjan's strongly connected components. Returns components with more than
 * one member, or a single member with an edge to itself.
 */
export function stronglyConnected<T>(nodes: T[], next: (n: T) => Iterable<T>): T[][] {
  const index = new Map<T, number>();
  const low = new Map<T, number>();
  const onStack = new Set<T>();
  const stack: T[] = [];
  const out: T[][] = [];
  let counter = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: { node: T; it: Iterator<T> }[] = [];
    const visit = (n: T) => {
      index.set(n, counter);
      low.set(n, counter);
      counter++;
      stack.push(n);
      onStack.add(n);
      work.push({ node: n, it: next(n)[Symbol.iterator]() });
    };
    visit(root);
    while (work.length) {
      const top = work[work.length - 1] as { node: T; it: Iterator<T> };
      const step = top.it.next();
      if (!step.done) {
        const w = step.value;
        if (!index.has(w)) visit(w);
        else if (onStack.has(w))
          low.set(top.node, Math.min(low.get(top.node) as number, index.get(w) as number));
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent)
        low.set(parent.node, Math.min(low.get(parent.node) as number, low.get(top.node) as number));
      if (low.get(top.node) === index.get(top.node)) {
        const comp: T[] = [];
        let w: T;
        do {
          w = stack.pop() as T;
          onStack.delete(w);
          comp.push(w);
        } while (w !== top.node);
        const selfLoop = comp.length === 1 && [...next(top.node)].includes(top.node);
        if (comp.length > 1 || selfLoop) out.push(comp);
      }
    }
  }
  return out;
}

function cyclesFrom(level: Cycle['level'], edges: CycleEdge[]): Cycle[] {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    (adj.get(e.from) as Set<string>).add(e.to);
  }
  const comps = stronglyConnected([...adj.keys()].sort(), (n) => adj.get(n) ?? []);
  return comps
    .map((comp) => {
      const set = new Set(comp);
      const within = edges.filter((e) => set.has(e.from) && set.has(e.to));
      return {
        level,
        members: [...comp].sort(),
        edges: within.slice(0, 50),
        typeOnly: within.every((e) => e.typeOnly),
      };
    })
    .sort(
      (a, b) => b.members.length - a.members.length || a.members[0]!.localeCompare(b.members[0]!),
    );
}

/** File-level and module-level import cycles in an indexed repository. */
export function findCycles(db: Db, repoId: number): { file: Cycle[]; module: Cycle[] } {
  const files = new Map(
    (
      db
        .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = 'file'`)
        .all(repoId) as unknown as Parameters<typeof toNode>[0][]
    )
      .map(toNode)
      .map((n) => [n.id, n]),
  );
  const imports = (
    db
      .prepare(`SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND kind = 'imports'`)
      .all(repoId) as unknown as Parameters<typeof toEdge>[0][]
  ).map(toEdge);
  const fileEdges: CycleEdge[] = [];
  const moduleEdges: CycleEdge[] = [];
  for (const e of imports) {
    const a = files.get(e.src);
    const b = files.get(e.dst);
    if (!a || !b || e.detail === 'asset') continue;
    const ce = {
      path: e.evidencePath,
      line: e.evidenceLine,
      typeOnly: (e.detail ?? '').startsWith('type-only:'),
    };
    if (a.id !== b.id) fileEdges.push({ from: a.key, to: b.key, ...ce });
    if (a.module && b.module && a.module !== b.module)
      moduleEdges.push({ from: a.module, to: b.module, ...ce });
  }
  return { file: cyclesFrom('file', fileEdges), module: cyclesFrom('module', moduleEdges) };
}
