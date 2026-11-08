import {
  BRAIN_FORMAT,
  DEFAULT_REGIONS,
  classifyFile,
  type BrainModel,
  type BrainNeuron,
  type BrainParam,
  type BrainSynapse,
  type NeuronKind,
  type SynapseKind,
} from '@nexora/brain';
import type { Db } from '../store/db';
import { isTestPath } from '../indexer/ts-indexer';
import { EDGE_COLS, NODE_COLS, getRepo, toEdge, toNode, type EdgeRow } from './graph';

/** CodeAtlas edge kinds drawn as synapses, and what they become. */
const SYNAPSE_OF: Record<string, SynapseKind> = {
  calls: 'calls',
  renders: 'renders',
  extends: 'extends',
  implements: 'implements',
  instantiates: 'instantiates',
  handled_by: 'handles',
  accesses_db: 'accesses_db',
  reads_config: 'reads_config',
  writes_config: 'writes_config',
  calls_service: 'calls_service',
};

const SYMBOL_KINDS = new Map<string, NeuronKind>([
  ['class', 'class'],
  ['interface', 'interface'],
  ['function', 'function'],
  ['method', 'method'],
  ['constructor', 'method'],
  ['accessor', 'method'],
]);

/** Non-code files that still belong in the brain (CI, containers, deployment). */
const DEVOPS_FILE =
  /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Makefile|Procfile)$|\.(sh|bash|tf)$/i;

/** Above this many neurons the least-connected parts are left out so the page stays fast. */
export const BRAIN_MAX_NEURONS = 6000;

function rows(db: Db, sql: string, ...params: (string | number)[]) {
  return db.prepare(sql).all(...params) as unknown[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Builds the 3D architecture brain for an indexed repository: classes, functions, methods,
 * components, routes, databases, external services and configuration as neurons; calls,
 * renders, inheritance, route handling and data access as synapses, each with the
 * confidence and evidence CodeAtlas recorded. Test files are left out.
 */
/** Test helpers and fixtures are not part of the architecture. */
const TEST_SUPPORT = /(^|\/)(test|tests|__mocks__|fixtures?)\//;

export function buildBrain(db: Db, repoId: number): BrainModel | null {
  const repo = getRepo(db, repoId);
  if (!repo) return null;
  const nodes = (
    rows(
      db,
      `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind IN ('symbol','file','route','service','config')`,
      repoId,
    ) as Parameters<typeof toNode>[0][]
  ).map(toNode);
  const edges = (
    rows(
      db,
      `SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND kind IN (${[
        ...Object.keys(SYNAPSE_OF),
        'contains',
        'imports',
      ]
        .map((k) => `'${k}'`)
        .join(',')})`,
      repoId,
    ) as Parameters<typeof toEdge>[0][]
  ).map(toEdge);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Packages each file imports, to help place it (react → frontend, pg → database…).
  const externalNames = new Map<number, string>(
    (
      rows(db, `SELECT id, name FROM nodes WHERE repo_id = ? AND kind = 'external'`, repoId) as {
        id: number;
        name: string;
      }[]
    ).map((r) => [r.id, r.name]),
  );
  const importsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== 'imports') continue;
    const src = nodeById.get(e.src);
    const pkg = externalNames.get(e.dst);
    if (!src?.filePath || !pkg) continue;
    const list = importsOf.get(src.filePath) ?? [];
    list.push(pkg);
    importsOf.set(src.filePath, list);
  }
  const renders = new Set(edges.filter((e) => e.kind === 'renders').map((e) => e.dst));

  const neuronOf = new Map<number, BrainNeuron>();
  const placeFile = (path: string | null) =>
    classifyFile(path ?? undefined, { imports: path ? importsOf.get(path) : undefined });

  for (const n of nodes) {
    if (n.filePath && (isTestPath(n.filePath) || TEST_SUPPORT.test(n.filePath))) continue;
    let kind: NeuronKind | undefined;
    if (n.kind === 'symbol') {
      kind = SYMBOL_KINDS.get(n.symbolKind ?? '');
      if (
        kind === 'function' &&
        /\.(t|j)sx$/.test(n.filePath ?? '') &&
        (renders.has(n.id) || /^[A-Z]/.test(n.name))
      )
        kind = 'component';
    } else if (n.kind === 'route') kind = 'route';
    else if (n.kind === 'service') kind = n.data.category === 'database' ? 'database' : 'service';
    else if (n.kind === 'config') kind = 'config';
    else if (n.kind === 'file' && DEVOPS_FILE.test(n.key)) kind = 'file';
    if (!kind) continue;

    let place: { region: BrainNeuron['region']; reason: string };
    if (kind === 'route') place = { region: 'backend', reason: 'HTTP route' };
    else if (kind === 'database') place = { region: 'database', reason: 'database client' };
    else if (kind === 'service') place = { region: 'backend', reason: 'external service call' };
    else if (kind === 'config') place = { region: 'devops', reason: 'configuration value' };
    else place = placeFile(n.filePath);

    const params = Array.isArray(n.data.params)
      ? (n.data.params as BrainParam[]).map((p) => ({
          name: String(p.name).replace(/\s+/g, ' '),
          type: String(p.type),
          optional: !!p.optional,
        }))
      : undefined;
    neuronOf.set(n.id, {
      id: `n${n.id}`,
      name: n.name,
      kind,
      region: place.region,
      regionReason: place.reason,
      file: n.filePath ?? undefined,
      line: n.startLine ?? undefined,
      signature: str(n.data.signature),
      params,
      returns: str(n.data.returns),
      returnsDeclared:
        typeof n.data.returnsDeclared === 'boolean' ? n.data.returnsDeclared : undefined,
      doc: str(n.data.doc),
      ref: n.id,
    });
  }

  // Members sit inside their class.
  for (const e of edges) {
    if (e.kind !== 'contains') continue;
    const parent = neuronOf.get(e.src);
    const child = neuronOf.get(e.dst);
    if (parent && child && nodeById.get(e.src)?.kind === 'symbol') {
      child.parent = parent.id;
      child.region = parent.region;
      child.regionReason = parent.regionReason;
    }
  }

  const seen = new Set<string>();
  const synapses: BrainSynapse[] = [];
  const add = (e: EdgeRow, kind: SynapseKind) => {
    const a = neuronOf.get(e.src);
    const b = neuronOf.get(e.dst);
    if (!a || !b || a === b) return;
    const k = `${a.id}>${b.id}>${kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    synapses.push({
      source: a.id,
      target: b.id,
      kind,
      confidence: e.confidence,
      file: e.evidencePath ?? undefined,
      line: e.evidenceLine ?? undefined,
      detail: e.detail ?? undefined,
    });
  };
  for (const e of edges) {
    const kind = SYNAPSE_OF[e.kind];
    if (kind) add(e, kind);
  }

  let neurons = [...neuronOf.values()];
  const notes: string[] = [];
  if (neurons.length > BRAIN_MAX_NEURONS) {
    const degree = new Map<string, number>();
    for (const s of synapses) {
      degree.set(s.source, (degree.get(s.source) ?? 0) + 1);
      degree.set(s.target, (degree.get(s.target) ?? 0) + 1);
    }
    const keep = new Set(
      [...neurons]
        .sort((x, y) => (degree.get(y.id) ?? 0) - (degree.get(x.id) ?? 0))
        .slice(0, BRAIN_MAX_NEURONS)
        .map((n) => n.id),
    );
    notes.push(
      `This repository has ${neurons.length} parts; the ${BRAIN_MAX_NEURONS} most connected are shown.`,
    );
    neurons = neurons.filter((n) => keep.has(n.id));
    for (const n of neurons) if (n.parent && !keep.has(n.parent)) delete n.parent;
  }
  const kept = new Set(neurons.map((n) => n.id));

  notes.push(
    `Built by CodeAtlas from its index${repo.headCommit ? ` at commit ${repo.headCommit.slice(0, 10)}` : ''}. Links are labelled observed (resolved by the TypeScript compiler), inferred (matched by name or convention) or unknown.`,
    'Which lobe a part sits in is inferred from its file path and the packages the file imports.',
    'Inputs and return types come from the TypeScript type checker. Test files, type aliases and plain variables are left out. Only TypeScript and JavaScript have method-level detail.',
  );
  return {
    format: BRAIN_FORMAT,
    title: `${repo.name} — architecture brain`,
    source: {
      producer: 'codeatlas',
      repository: repo.name,
      revision: repo.headCommit ?? undefined,
      generatedAt: new Date().toISOString(),
    },
    regions: DEFAULT_REGIONS,
    neurons,
    synapses: synapses.filter((s) => kept.has(s.source) && kept.has(s.target)),
    notes,
  };
}
