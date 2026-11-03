import type { Db } from '../store/db';
import type { Confidence } from '../indexer/model';
import {
  EDGE_COLS,
  NODE_COLS,
  nodesByIds,
  toEdge,
  toNode,
  type EdgeRow,
  type NodeRow,
} from './graph';
import { findCycles, type Cycle } from './cycles';

export interface ViewNode {
  id: string;
  kind: string;
  label: string;
  group?: string;
  ref?: number; // underlying node id, for drill-down
  metrics?: Record<string, number | string | boolean | null>;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  confidence: Confidence;
  weight: number;
  evidence?: { path: string; line: number | null }[];
}

export interface GraphView {
  nodes: ViewNode[];
  edges: ViewEdge[];
  truncated: boolean;
  notes: string[];
}

function allNodes(db: Db, repoId: number, kinds: string[]): NodeRow[] {
  return (
    db
      .prepare(
        `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind IN (${kinds.map(() => '?').join(',')})`,
      )
      .all(repoId, ...kinds) as unknown as Parameters<typeof toNode>[0][]
  ).map(toNode);
}

function allEdges(db: Db, repoId: number, kinds: string[]): EdgeRow[] {
  return (
    db
      .prepare(
        `SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND kind IN (${kinds.map(() => '?').join(',')})`,
      )
      .all(repoId, ...kinds) as unknown as Parameters<typeof toEdge>[0][]
  ).map(toEdge);
}

const strongest = (a: Confidence, b: Confidence): Confidence =>
  a === 'observed' || b === 'observed'
    ? 'observed'
    : a === 'inferred' || b === 'inferred'
      ? 'inferred'
      : 'unknown';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Packages/modules and how they depend on each other (aggregated file imports). */
export function modulesView(db: Db, repoId: number): GraphView & { cycles: Cycle[] } {
  const files = allNodes(db, repoId, ['file']);
  const modules = allNodes(db, repoId, ['module']);
  const symbols = allNodes(db, repoId, ['symbol']);
  const fileMod = new Map(files.map((f) => [f.id, f.module ?? '?']));
  const stats = new Map<string, { files: number; loc: number; tests: number; symbols: number }>();
  for (const f of files) {
    const s = stats.get(f.module ?? '?') ?? { files: 0, loc: 0, tests: 0, symbols: 0 };
    s.files++;
    s.loc += num(f.data.loc);
    if (f.data.isTest) s.tests++;
    stats.set(f.module ?? '?', s);
  }
  for (const sym of symbols) {
    const s = stats.get(sym.module ?? '?');
    if (s) s.symbols++;
  }
  const agg = new Map<string, ViewEdge>();
  for (const e of allEdges(db, repoId, ['imports'])) {
    const a = fileMod.get(e.src);
    const b = fileMod.get(e.dst);
    if (!a || !b || a === b) continue;
    const id = `${a}->${b}`;
    const prev = agg.get(id);
    if (prev) {
      prev.weight++;
      prev.confidence = strongest(prev.confidence, e.confidence);
      if ((prev.evidence?.length ?? 0) < 5 && e.evidencePath)
        prev.evidence?.push({ path: e.evidencePath, line: e.evidenceLine });
    } else
      agg.set(id, {
        id,
        source: `m:${a}`,
        target: `m:${b}`,
        kind: 'depends_on',
        confidence: e.confidence,
        weight: 1,
        evidence: e.evidencePath ? [{ path: e.evidencePath, line: e.evidenceLine }] : [],
      });
  }
  return {
    nodes: modules.map((m) => ({
      id: `m:${m.key}`,
      kind: 'module',
      label: m.name,
      ref: m.id,
      metrics: {
        dir: String(m.data.dir ?? ''),
        ...(stats.get(m.key) ?? { files: 0, loc: 0, tests: 0, symbols: 0 }),
      },
    })),
    edges: [...agg.values()],
    truncated: false,
    cycles: findCycles(db, repoId).module,
    notes: [
      'Module dependencies are aggregated from resolved file imports; edge weight is the number of importing statements.',
      'Cycles are strongly connected groups of modules in the resolved import graph; type-only imports are marked because they have no runtime effect.',
    ],
  };
}

/** File-level import graph, optionally scoped to one module, with external packages. */
export function dependencyView(
  db: Db,
  repoId: number,
  opts: { module?: string; includeExternal?: boolean; limit?: number } = {},
): GraphView {
  const limit = opts.limit ?? 250;
  let files = allNodes(db, repoId, ['file']).filter(
    (f) => f.data.lang === 'typescript' || f.data.lang === 'javascript',
  );
  if (opts.module) files = files.filter((f) => f.module === opts.module);
  const imports = allEdges(db, repoId, ['imports']);
  const ids = new Set(files.map((f) => f.id));
  const degree = new Map<number, number>();
  for (const e of imports) {
    if (ids.has(e.src)) degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    if (ids.has(e.dst)) degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }
  const truncated = files.length > limit;
  if (truncated)
    files = [...files]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, limit);
  const keep = new Set(files.map((f) => f.id));
  const externals = new Map<number, NodeRow>();
  if (opts.includeExternal)
    for (const n of allNodes(db, repoId, ['external'])) externals.set(n.id, n);
  const nodes: ViewNode[] = files.map((f) => ({
    id: `n:${f.id}`,
    kind: 'file',
    label: f.key,
    group: f.module ?? undefined,
    ref: f.id,
    metrics: { loc: num(f.data.loc), isTest: !!f.data.isTest, fanIn: 0, fanOut: 0 },
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: ViewEdge[] = [];
  const usedExt = new Set<number>();
  for (const e of imports) {
    if (!keep.has(e.src)) continue;
    if (keep.has(e.dst) || externals.has(e.dst)) {
      if (externals.has(e.dst)) usedExt.add(e.dst);
      edges.push({
        id: `e:${e.id}`,
        source: `n:${e.src}`,
        target: `n:${e.dst}`,
        kind: 'imports',
        confidence: e.confidence,
        weight: 1,
        evidence: e.evidencePath ? [{ path: e.evidencePath, line: e.evidenceLine }] : [],
      });
      const s = byId.get(`n:${e.src}`);
      const d = byId.get(`n:${e.dst}`);
      if (s?.metrics) s.metrics.fanOut = num(s.metrics.fanOut) + 1;
      if (d?.metrics) d.metrics.fanIn = num(d.metrics.fanIn) + 1;
    }
  }
  for (const id of usedExt) {
    const n = externals.get(id) as NodeRow;
    nodes.push({
      id: `n:${id}`,
      kind: 'external',
      label: n.name,
      ref: id,
      metrics: { builtin: !!n.data.builtin },
    });
  }
  return {
    nodes,
    edges,
    truncated,
    notes: truncated
      ? [`Showing the ${limit} most connected files of ${ids.size}. Filter by module to see all.`]
      : [],
  };
}

const FLOW_KINDS = ['handled_by', 'starts_at', 'calls', 'instantiates', 'renders'];

export function flowStarts(db: Db, repoId: number): NodeRow[] {
  return allNodes(db, repoId, ['route', 'entrypoint']).sort((a, b) => a.key.localeCompare(b.key));
}

/** Execution flow reachable from a route, entry point or symbol (bounded BFS over handler and call edges). */
export function flowView(
  db: Db,
  repoId: number,
  startId: number,
  opts: { depth?: number; maxNodes?: number } = {},
): GraphView {
  const depth = opts.depth ?? 4;
  const maxNodes = opts.maxNodes ?? 120;
  const edges = allEdges(db, repoId, FLOW_KINDS);
  const out = new Map<number, EdgeRow[]>();
  for (const e of edges) out.set(e.src, [...(out.get(e.src) ?? []), e]);
  const level = new Map<number, number>([[startId, 0]]);
  const queue = [startId];
  const used: EdgeRow[] = [];
  let truncated = false;
  while (queue.length) {
    const id = queue.shift() as number;
    const d = level.get(id) as number;
    if (d >= depth) continue;
    for (const e of out.get(id) ?? []) {
      if (e.dst === e.src) continue; // recursion is shown in node details, not as a loop
      if (!level.has(e.dst)) {
        if (level.size >= maxNodes) {
          truncated = true;
          continue;
        }
        level.set(e.dst, d + 1);
        queue.push(e.dst);
      }
      used.push(e);
    }
  }
  const nodes = nodesByIds(db, repoId, [...level.keys()]);
  return {
    nodes: nodes.map((n) => ({
      id: `n:${n.id}`,
      kind: n.kind === 'symbol' ? (n.symbolKind ?? 'symbol') : n.kind,
      label: n.kind === 'symbol' ? n.name : n.key,
      group: n.module ?? undefined,
      ref: n.id,
      metrics: { depth: level.get(n.id) ?? 0, file: n.filePath, line: n.startLine },
    })),
    edges: used
      .filter((e) => level.has(e.dst))
      .map((e) => ({
        id: `e:${e.id}`,
        source: `n:${e.src}`,
        target: `n:${e.dst}`,
        kind: e.kind,
        confidence: e.confidence,
        weight: 1,
        evidence: e.evidencePath ? [{ path: e.evidencePath, line: e.evidenceLine }] : [],
      })),
    truncated,
    notes: [
      'Flows follow resolved calls from the starting point. Calls through callbacks or computed members are not followed (see the coverage report).',
      ...(truncated
        ? [`Stopped at ${maxNodes} nodes; increase depth or start deeper to see more.`]
        : []),
    ],
  };
}

export interface RiskFindings {
  /** Module-level cycles first, then file-level. */
  cycles: Cycle[];
  /** Files that look like credentials. CodeAtlas never read them; only the path is known. */
  sensitiveConfig: { path: string; confidence: 'observed'; note: string }[];
}

/** Secret-like paths skipped by the latest successful index (path only, never content). */
function sensitiveConfig(db: Db, repoId: number): RiskFindings['sensitiveConfig'] {
  const run = db
    .prepare(
      "SELECT coverage FROM index_runs WHERE repo_id = ? AND status = 'succeeded' ORDER BY id DESC LIMIT 1",
    )
    .get(repoId) as { coverage: string | null } | undefined;
  let paths: string[];
  try {
    paths =
      (JSON.parse(run?.coverage ?? '{}') as { files?: { skippedSecretPaths?: string[] } }).files
        ?.skippedSecretPaths ?? [];
  } catch {
    paths = [];
  }
  return paths.map((path) => ({
    path,
    confidence: 'observed' as const,
    note: 'Potentially sensitive configuration. Its name matches a credential pattern, so CodeAtlas did not read it. If it holds real secrets, keep it out of version control and rotate anything that was committed. It may be a test fixture.',
  }));
}

export interface RiskFactor {
  name: string;
  value: number;
  percentile: number;
  weight: number;
  explanation: string;
}

export interface RiskItem {
  nodeId: number;
  path: string;
  module: string | null;
  score: number;
  factors: RiskFactor[];
}

function percentiles(values: number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    if (!sorted.length) return 0;
    let lo = 0;
    while (lo < sorted.length && (sorted[lo] as number) < v) lo++;
    return Math.round((lo / sorted.length) * 100);
  };
}

/**
 * Explainable change-risk ranking for source files. Every factor is a
 * percentile within this repository, so scores are relative, not absolute.
 */
export function riskView(
  db: Db,
  repoId: number,
  limit = 50,
): { items: RiskItem[]; notes: string[]; findings: RiskFindings } {
  const files = allNodes(db, repoId, ['file']).filter(
    (f) => (f.data.lang === 'typescript' || f.data.lang === 'javascript') && !f.data.isTest,
  );
  const imports = allEdges(db, repoId, ['imports']);
  const tests = allEdges(db, repoId, ['tests']);
  const fanIn = new Map<number, Set<number>>();
  for (const e of imports) fanIn.set(e.dst, (fanIn.get(e.dst) ?? new Set()).add(e.src));
  const tested = new Set(tests.map((e) => e.dst));
  const gitAvailable = files.some((f) => f.data.commits !== undefined);
  const metric = {
    complexity: files.map((f) => num(f.data.complexity)),
    churn: files.map((f) => num(f.data.churn)),
    fanIn: files.map((f) => fanIn.get(f.id)?.size ?? 0),
    loc: files.map((f) => num(f.data.loc)),
  };
  const pct = {
    complexity: percentiles(metric.complexity),
    churn: percentiles(metric.churn),
    fanIn: percentiles(metric.fanIn),
    loc: percentiles(metric.loc),
  };
  const W = gitAvailable
    ? { complexity: 0.3, churn: 0.25, fanIn: 0.2, untested: 0.15, loc: 0.1 }
    : { complexity: 0.4, churn: 0, fanIn: 0.27, untested: 0.2, loc: 0.13 };
  const items: RiskItem[] = files.map((f, i) => {
    const c = metric.complexity[i] as number;
    const ch = metric.churn[i] as number;
    const fi = metric.fanIn[i] as number;
    const l = metric.loc[i] as number;
    const isTested = tested.has(f.id);
    const factors: RiskFactor[] = [
      {
        name: 'complexity',
        value: c,
        percentile: pct.complexity(c),
        weight: W.complexity,
        explanation: `Branching complexity ${c} (higher than ${pct.complexity(c)}% of files).`,
      },
      ...(gitAvailable
        ? [
            {
              name: 'churn',
              value: ch,
              percentile: pct.churn(ch),
              weight: W.churn,
              explanation: `${ch} lines changed across ${num(f.data.commits)} commits (higher than ${pct.churn(ch)}% of files).`,
            },
          ]
        : []),
      {
        name: 'fan-in',
        value: fi,
        percentile: pct.fanIn(fi),
        weight: W.fanIn,
        explanation: `Imported by ${fi} files; changes here ripple outward.`,
      },
      {
        name: 'untested',
        value: isTested ? 0 : 1,
        percentile: isTested ? 0 : 100,
        weight: W.untested,
        explanation: isTested
          ? 'Imported directly by at least one test file.'
          : 'No test file imports this file directly.',
      },
      {
        name: 'size',
        value: l,
        percentile: pct.loc(l),
        weight: W.loc,
        explanation: `${l} non-blank lines.`,
      },
    ];
    const score = Math.round(factors.reduce((a, x) => a + x.percentile * x.weight, 0));
    return { nodeId: f.id, path: f.key, module: f.module, score, factors };
  });
  items.sort((a, b) => b.score - a.score);
  const cycles = findCycles(db, repoId);
  return {
    items: items.slice(0, limit),
    findings: {
      cycles: [...cycles.module, ...cycles.file],
      sensitiveConfig: sensitiveConfig(db, repoId),
    },
    notes: [
      'Risk is relative to this repository: each factor is a percentile among its source files, combined with fixed weights.',
      gitAvailable
        ? 'Churn comes from git history (lines added + deleted).'
        : 'No git history available: churn is excluded and its weight redistributed.',
      'Untested means no test file imports the file directly; indirect coverage is not measured.',
    ],
  };
}

export interface OwnershipEntry {
  module: string;
  files: number;
  authors: { name: string; share: number }[];
  busFactor: number;
  soleOwnerFiles: string[];
  staleFiles: string[];
}

/** Who has changed what, from git history (lines changed, not blame). */
export function ownershipView(
  db: Db,
  repoId: number,
  now = Date.now(),
): { modules: OwnershipEntry[]; notes: string[] } {
  const files = allNodes(db, repoId, ['file']).filter((f) => f.data.lang !== 'json');
  const byMod = new Map<string, NodeRow[]>();
  for (const f of files) byMod.set(f.module ?? '?', [...(byMod.get(f.module ?? '?') ?? []), f]);
  const modules: OwnershipEntry[] = [];
  const yearAgo = now / 1000 - 365 * 86400;
  for (const [mod, list] of byMod) {
    const totals = new Map<string, number>();
    let all = 0;
    const sole: string[] = [];
    const stale: string[] = [];
    for (const f of list) {
      const authors = (f.data.authors as { name: string; share: number }[] | undefined) ?? [];
      const churn = num(f.data.churn);
      for (const a of authors) {
        totals.set(a.name, (totals.get(a.name) ?? 0) + a.share * churn);
        all += a.share * churn;
      }
      if (authors.length && num(f.data.authorCount) === 1 && num(f.data.commits) >= 3)
        sole.push(f.key);
      if (num(f.data.lastChange) && num(f.data.lastChange) < yearAgo) stale.push(f.key);
    }
    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, v]) => ({ name, share: all ? Math.round((v / all) * 100) / 100 : 0 }));
    let cum = 0;
    let bus = 0;
    for (const a of ranked) {
      if (cum >= 0.5) break;
      cum += a.share;
      bus++;
    }
    modules.push({
      module: mod,
      files: list.length,
      authors: ranked.slice(0, 8),
      busFactor: bus,
      soleOwnerFiles: sole.slice(0, 20),
      staleFiles: stale.slice(0, 20),
    });
  }
  modules.sort((a, b) => a.module.localeCompare(b.module));
  const hasGit = files.some((f) => f.data.commits !== undefined);
  return {
    modules,
    notes: hasGit
      ? [
          'Shares are lines changed per author in git history, weighted by file churn. Bus factor is the fewest authors covering half of all changes.',
          'Sole-owner files have 3+ commits from a single author.',
        ]
      : ['No git history is available, so ownership cannot be determined.'],
  };
}

/** Documentation coverage: what docs describe, and important code nobody documented. */
export function knowledgeView(
  db: Db,
  repoId: number,
): {
  docs: {
    id: number;
    path: string;
    title: string;
    adr: boolean;
    mentions: { key: string; kind: string }[];
  }[];
  modules: { module: string; documented: boolean; docCount: number }[];
  undocumentedHotspots: { path: string; fanIn: number }[];
  notes: string[];
} {
  const docs = allNodes(db, repoId, ['doc']);
  const mentions = allEdges(db, repoId, ['mentions']);
  const targets = new Map(
    nodesByIds(db, repoId, [...new Set(mentions.map((m) => m.dst))]).map((n) => [n.id, n]),
  );
  const files = allNodes(db, repoId, ['file']);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const modules = allNodes(db, repoId, ['module']);
  const documentedFiles = new Set<string>();
  const docMods = new Map<string, number>();
  for (const d of docs) docMods.set(d.module ?? '?', (docMods.get(d.module ?? '?') ?? 0) + 1);
  for (const m of mentions) {
    const t = targets.get(m.dst);
    if (t?.filePath) documentedFiles.add(t.filePath);
  }
  const fanIn = new Map<number, number>();
  for (const e of allEdges(db, repoId, ['imports'])) fanIn.set(e.dst, (fanIn.get(e.dst) ?? 0) + 1);
  const hotspots = [...fanIn.entries()]
    .map(([id, n]) => ({ f: fileById.get(id), n }))
    .filter(
      (x): x is { f: NodeRow; n: number } =>
        !!x.f &&
        !x.f.data.isTest &&
        !documentedFiles.has(x.f.key) &&
        (x.f.data.lang === 'typescript' || x.f.data.lang === 'javascript'),
    )
    .sort((a, b) => b.n - a.n)
    .slice(0, 15)
    .map((x) => ({ path: x.f.key, fanIn: x.n }));
  return {
    docs: docs.map((d) => ({
      id: d.id,
      path: d.key,
      title: d.name,
      adr: !!d.data.adr,
      mentions: mentions
        .filter((m) => m.src === d.id)
        .flatMap((m) =>
          targets.get(m.dst)
            ? [
                {
                  key: (targets.get(m.dst) as NodeRow).key,
                  kind: (targets.get(m.dst) as NodeRow).kind,
                },
              ]
            : [],
        )
        .slice(0, 50),
    })),
    modules: modules.map((m) => ({
      module: m.key,
      documented: (docMods.get(m.key) ?? 0) > 0,
      docCount: docMods.get(m.key) ?? 0,
    })),
    undocumentedHotspots: hotspots,
    notes: [
      'Links from docs to code are inferred from backticked identifiers and paths in markdown.',
      'Hotspots are widely imported files that no document mentions.',
    ],
  };
}

const IMPACT_KINDS = [
  'calls',
  'imports',
  'renders',
  'instantiates',
  'extends',
  'implements',
  'handled_by',
  'contains',
  'tests',
];

/** Reverse dependency closure: what could be affected if this node changes. */
export function impactOf(
  db: Db,
  repoId: number,
  startId: number,
  opts: { depth?: number; maxNodes?: number } = {},
): {
  affected: (NodeRow & { distance: number; via: string })[];
  routes: NodeRow[];
  tests: NodeRow[];
  truncated: boolean;
} {
  const depth = opts.depth ?? 3;
  const maxNodes = opts.maxNodes ?? 200;
  const edges = allEdges(db, repoId, IMPACT_KINDS);
  const inc = new Map<number, EdgeRow[]>();
  for (const e of edges) inc.set(e.dst, [...(inc.get(e.dst) ?? []), e]);
  // A symbol's file is affected too: walk "contains" upward as well.
  const dist = new Map<number, { d: number; via: string }>([[startId, { d: 0, via: 'start' }]]);
  const queue = [startId];
  let truncated = false;
  while (queue.length) {
    const id = queue.shift() as number;
    const d = (dist.get(id) as { d: number }).d;
    if (d >= depth) continue;
    for (const e of inc.get(id) ?? []) {
      if (dist.has(e.src)) continue;
      if (dist.size >= maxNodes) {
        truncated = true;
        break;
      }
      dist.set(e.src, { d: e.kind === 'contains' ? d : d + 1, via: e.kind });
      queue.push(e.src);
    }
  }
  const nodes = nodesByIds(db, repoId, [...dist.keys()]);
  const affected = nodes
    .filter((n) => n.id !== startId && n.kind !== 'module')
    .map((n) => ({ ...n, distance: dist.get(n.id)?.d ?? 0, via: dist.get(n.id)?.via ?? '' }))
    .sort((a, b) => a.distance - b.distance);
  return {
    affected,
    routes: nodes.filter((n) => n.kind === 'route'),
    tests: nodes.filter((n) => n.kind === 'file' && !!n.data.isTest),
    truncated,
  };
}
