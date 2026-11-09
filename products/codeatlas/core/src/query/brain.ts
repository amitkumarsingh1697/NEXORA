import {
  BRAIN_FORMAT,
  DEFAULT_REGIONS,
  classifyFile,
  inventoryOf,
  type BrainColumn,
  type BrainCoverage,
  type BrainModel,
  type BrainNeuron,
  type BrainParam,
  type BrainSynapse,
  type NeuronKind,
  type SynapseKind,
} from '@nexora/brain';
import { roleInfo, roleOf } from '@nexora/languages';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db } from '../store/db';
import { isTestSupportPath } from '../indexer/test-paths';
import {
  EDGE_COLS,
  NODE_COLS,
  getRepo,
  latestCoverage,
  toEdge,
  toNode,
  type EdgeRow,
} from './graph';

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
  reads_table: 'reads_table',
  writes_table: 'writes_table',
  references: 'references',
  builds: 'builds',
  runs: 'runs',
  includes: 'includes',
};

/** Links between files (from build, CI, container and config files). */
const FILE_LINKS = new Set(['builds', 'runs', 'includes', 'references']);

const SYMBOL_KINDS = new Map<string, NeuronKind>([
  ['class', 'class'],
  ['interface', 'interface'],
  ['function', 'function'],
  ['method', 'method'],
  ['constructor', 'method'],
  ['accessor', 'method'],
]);

/**
 * Non-code files that still belong in the brain (CI, containers, orchestration, build and
 * infrastructure), by their file type in the shared registry; shell scripts and Procfiles too.
 */
const DEVOPS_GROUPS = new Set(['container', 'orchestration', 'ci', 'build', 'iac']);
const SCRIPT_FILE = /(^|\/)Procfile$|\.(sh|bash|zsh|ps1|bat|cmd)$/i;
function isDevopsFile(path: string, role: unknown): boolean {
  const info = typeof role === 'string' ? roleInfo(role) : roleOf(path);
  return (!!info && DEVOPS_GROUPS.has(info.group)) || SCRIPT_FILE.test(path);
}

/** Above this many neurons the least-connected parts are left out so the page stays fast. */
export const BRAIN_MAX_NEURONS = 6000;

/** UI frameworks whose presence in a package.json makes its package a browser app. */
const UI_FRAMEWORKS = ['react', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'];

/** Reads a small text file under the repository root; null when missing or too big. */
function readSmall(root: string, path: string, maxBytes = 512 * 1024): string | null {
  try {
    const abs = join(root, path);
    if (statSync(abs).size > maxBytes) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null; // a file deleted since indexing is simply not counted
  }
}

/**
 * Maps each workspace package directory to the UI framework it depends on, so browser
 * code in src/api/ is not drawn as a server (QA AL-03).
 */
function uiPackages(root: string, files: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) {
    if (!/(^|\/)package\.json$/.test(f) || f.includes('node_modules/')) continue;
    const text = readSmall(root, f, 256 * 1024);
    if (!text) continue;
    try {
      const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
      const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
      const ui = UI_FRAMEWORKS.find((d) => d in deps);
      if (ui) out.set(dirname(f) === '.' ? '' : dirname(f), ui);
    } catch {
      // not JSON: ignore this manifest
    }
  }
  return out;
}

function uiPackageOf(path: string, packages: Map<string, string>): string | undefined {
  let dir = dirname(path);
  for (;;) {
    const key = dir === '.' ? '' : dir;
    const hit = packages.get(key);
    if (hit) return hit;
    if (!key) return undefined;
    dir = dirname(dir);
  }
}

/** Schema sources in formats CodeAtlas does not parse, found by path or a bounded content check. */
const UNREAD_SCHEMA_KINDS: {
  label: string;
  path: RegExp;
  content?: RegExp;
}[] = [
  { label: 'Liquibase changelogs', path: /(^|\/)[^/]*change-?log[^/]*\.(xml|ya?ml)$/i },
  {
    label: 'JPA/Hibernate @Entity classes',
    path: /\.(java|kt)$/,
    content: /^\s*@(javax\.persistence\.|jakarta\.persistence\.)?Entity\b/m,
  },
  { label: 'Django models files', path: /(^|\/)models\.py$/, content: /models\.Model\b/ },
  {
    label: 'SQLAlchemy model files',
    path: /\.py$/,
    content: /\b(declarative_base\(|DeclarativeBase\b)/,
  },
  { label: 'Rails schema files', path: /(^|\/)db\/schema\.rb$/ },
  {
    label: 'Entity Framework migrations',
    path: /(^|\/)Migrations\/[^/]+\.cs$/,
    content: /migrationBuilder\.CreateTable/,
  },
];

/** Test trees hold fixture schemas, not the product's schema. */
const TEST_TREE = /(^|\/)(tests?|testsuite|test-providers|__tests__|fixtures?)\//i;

function unreadSchemas(root: string, files: string[]): string | undefined {
  const counts: string[] = [];
  for (const k of UNREAD_SCHEMA_KINDS) {
    let n = 0;
    for (const f of files) {
      if (!k.path.test(f) || isTestSupportPath(f) || TEST_TREE.test(f)) continue;
      if (k.content) {
        const text = readSmall(root, f);
        if (!text || !k.content.test(text)) continue;
      }
      n++;
    }
    if (n) counts.push(`${n} ${k.label}`);
  }
  if (!counts.length) return undefined;
  return `Schema sources in formats this brain does not read were found and are not drawn: ${counts.join(', ')}.`;
}

interface StoredCoverage {
  inventory?: BrainCoverage['inventory'] & { summary?: string };
  files?: {
    structurallyAnalysed?: number;
    textOnlyByExtension?: Record<string, number>;
    skipped?: Record<string, number>;
  };
  calls?: { resolutionRate?: number };
  limitations?: string[];
}

/**
 * What the brain covers, from the index's own coverage report, so a partial brain never
 * looks complete (QA AL-01, AL-06, AL-09).
 */
function coverageOf(
  stored: StoredCoverage | null,
  schemaNote: string | undefined,
  unresolvedAny: number,
): BrainCoverage {
  if (stored?.inventory) return inventoryCoverage(stored, schemaNote, unresolvedAny);
  // Indexes made before the file inventory (schema 6 and older) only knew TypeScript and JavaScript.
  const analysed = stored?.files?.structurallyAnalysed ?? 0;
  const textOnly = Object.entries(stored?.files?.textOnlyByExtension ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const notAnalysed = textOnly.reduce((t, [, n]) => t + n, 0);
  const total = analysed + notAnalysed;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const gaps: string[] = [];
  if (notAnalysed)
    gaps.push(
      `Not analysed (searchable as text only, nothing drawn): ${textOnly
        .map(([ext, n]) => `${fmt(n)} ${ext}`)
        .join(', ')} files.`,
    );
  for (const l of stored?.limitations ?? [])
    if (!l.startsWith('Searchable as text only')) gaps.push(l);
  const rate = stored?.calls?.resolutionRate;
  if (typeof rate === 'number' && rate < 1 && analysed)
    gaps.push(
      `${Math.round(rate * 100)}% of call sites in the analysed code were resolved to a target; a missing link is not proof that no call exists.`,
    );
  if (schemaNote) gaps.push(schemaNote);
  if (unresolvedAny)
    gaps.push(
      `${fmt(unresolvedAny)} return types could not be worked out (shown as "not resolved"), usually because the repository's dependencies were not installed.`,
    );
  const skippedByLimit = (stored?.files?.skipped?.limit ?? 0) > 0;
  const partial =
    notAnalysed > 0 ||
    skippedByLimit ||
    !!schemaNote ||
    (stored?.files?.skipped?.ignored_dir ?? 0) > 0;
  let summary: string;
  if (!stored) summary = 'No coverage report was found for this index.';
  else if (!total)
    summary = 'No TypeScript or JavaScript code was found, so no code structure is drawn.';
  else if (!analysed)
    summary = `None of the ${fmt(total)} code files were analysed: this brain reads only TypeScript and JavaScript structurally, so no code structure is drawn.`;
  else if (notAnalysed)
    summary = `Only ${fmt(analysed)} of ${fmt(total)} code files (${Math.round((analysed / total) * 100)}%) were analysed: TypeScript and JavaScript. The rest of the code is not in this brain.`;
  else summary = `All ${fmt(analysed)} TypeScript and JavaScript code files were analysed.`;
  if (skippedByLimit) summary += ' Some files were skipped by the file-count limit.';
  return { partial: partial || !stored, summary, gaps, unreadSchemas: schemaNote };
}

/** Coverage from the per-file inventory: every number is a count of processed files. */
function inventoryCoverage(
  stored: StoredCoverage,
  schemaNote: string | undefined,
  unresolvedAny: number,
): BrainCoverage {
  const inv = stored.inventory!;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const gaps: string[] = [...(stored.limitations ?? [])];
  const rate = stored.calls?.resolutionRate;
  if (typeof rate === 'number' && rate < 1 && inv.counts.full)
    gaps.push(
      `${Math.round(rate * 100)}% of call sites in the TypeScript and JavaScript code were resolved to a target; a missing link is not proof that no call exists.`,
    );
  if (schemaNote) gaps.push(schemaNote);
  if (unresolvedAny)
    gaps.push(
      `${fmt(unresolvedAny)} return types could not be worked out (shown as "not resolved"), usually because the repository's dependencies were not installed.`,
    );
  const readable = inv.total - inv.counts.excluded - inv.counts.binary;
  const partial =
    inv.counts.full < readable ||
    inv.counts.excluded > 0 ||
    (inv.unlisted?.length ?? 0) > 0 ||
    !!schemaNote;
  const summary =
    inv.summary ??
    `${fmt(inv.total)} files found; ${fmt(inv.counts.full + inv.counts.partial)} of ${fmt(readable)} readable files were analysed.`;
  // The same bounded copy the viewer makes, so the model survives validation unchanged.
  const inventory = inventoryOf(inv);
  return { partial, summary, gaps, unreadSchemas: schemaNote, ...(inventory ? { inventory } : {}) };
}

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
export function buildBrain(db: Db, repoId: number): BrainModel | null {
  const repo = getRepo(db, repoId);
  if (!repo) return null;
  const nodes = (
    rows(
      db,
      `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind IN ('symbol','file','route','service','config','table')`,
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

  const filePaths = (
    rows(db, `SELECT key FROM nodes WHERE repo_id = ? AND kind = 'file'`, repoId) as {
      key: string;
    }[]
  ).map((r) => r.key);
  const uiPkgs = uiPackages(repo.root, filePaths);

  // Files at either end of a build, run or include link are drawn, so the link is visible.
  const linkedFiles = new Set<number>();
  for (const e of edges)
    if (
      FILE_LINKS.has(e.kind) &&
      nodeById.get(e.src)?.kind === 'file' &&
      nodeById.get(e.dst)?.kind === 'file'
    )
      linkedFiles.add(e.src).add(e.dst);

  const neuronOf = new Map<number, BrainNeuron>();
  const placeFile = (path: string | null) =>
    classifyFile(path ?? undefined, {
      imports: path ? importsOf.get(path) : undefined,
      uiPackage: path ? uiPackageOf(path, uiPkgs) : undefined,
    });

  for (const n of nodes) {
    if (n.filePath && isTestSupportPath(n.filePath)) continue;
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
    else if (n.kind === 'table') kind = 'table';
    else if (n.kind === 'file' && (isDevopsFile(n.key, n.data.role) || linkedFiles.has(n.id)))
      kind = 'file';
    if (!kind) continue;

    let place: { region: BrainNeuron['region']; reason: string };
    if (kind === 'route') place = { region: 'backend', reason: 'HTTP route' };
    else if (kind === 'database') place = { region: 'database', reason: 'database client' };
    else if (kind === 'service') place = { region: 'backend', reason: 'external service call' };
    else if (kind === 'config') place = { region: 'devops', reason: 'configuration value' };
    else if (kind === 'table')
      place = {
        region: 'database',
        reason: `database table defined in ${n.filePath ?? 'a schema'}`,
      };
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
      ...(n.data.extraction === 'pattern' && !str(n.data.doc)
        ? {
            doc: `Found by the ${str(n.data.language) ?? 'source'} declaration pattern (${str(n.data.declKind) ?? n.symbolKind ?? 'declaration'}); not checked by a compiler, and calls are not traced.`,
          }
        : {}),
      columns:
        kind === 'table' && Array.isArray(n.data.columns)
          ? (n.data.columns as BrainColumn[])
          : undefined,
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

  // A file read by declaration patterns has no file neuron; its links and imports are drawn
  // from its first top-level declaration instead.
  const primaryOf = new Map<number, BrainNeuron>();
  for (const e of edges) {
    if (e.kind !== 'contains' || nodeById.get(e.src)?.kind !== 'file') continue;
    const child = nodeById.get(e.dst);
    const neuron = neuronOf.get(e.dst);
    if (!child || !neuron || child.data.extraction !== 'pattern') continue;
    const cur = primaryOf.get(e.src);
    if (!cur || (neuron.line ?? 0) < (cur.line ?? 0)) primaryOf.set(e.src, neuron);
  }
  const neuronFor = (id: number) => neuronOf.get(id) ?? primaryOf.get(id);

  const seen = new Set<string>();
  const synapses: BrainSynapse[] = [];
  const add = (e: EdgeRow, kind: SynapseKind) => {
    const a = neuronFor(e.src);
    const b = neuronFor(e.dst);
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
    // Imports between files resolved by the pattern analyser (TypeScript imports are drawn as calls).
    else if (e.kind === 'imports' && primaryOf.has(e.src) && primaryOf.has(e.dst))
      add(e, 'imports');
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
        .sort(
          (x, y) =>
            Number(y.kind === 'table') - Number(x.kind === 'table') ||
            (degree.get(y.id) ?? 0) - (degree.get(x.id) ?? 0),
        )
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

  const unresolvedAny = neurons.filter(
    (n) => n.returnsDeclared === false && n.returns?.trim() === 'any',
  ).length;
  const coverage = coverageOf(
    latestCoverage(db, repoId) as StoredCoverage | null,
    unreadSchemas(repo.root, filePaths),
    unresolvedAny,
  );
  notes.push(
    `Built by CodeAtlas from its index${repo.headCommit ? ` at commit ${repo.headCommit.slice(0, 10)}` : ''}. Links are labelled observed (resolved by the TypeScript compiler, or a path written literally in a build, CI or container file), inferred (matched by name or convention) or unknown.`,
    'Which lobe a part sits in is inferred from its file path and the packages the file imports.',
    'Tables and columns are read from SQL files (CREATE TABLE, ALTER TABLE), Prisma schemas, Drizzle table definitions and CREATE TABLE statements inside code, with types, sizes and keys as written. A Drizzle query that names a table is an observed read or write; a Prisma call or a table named in a SQL string is inferred. Views, stored procedures, dynamic SQL and the Drizzle relational query API are not linked.',
    'Inputs and return types of TypeScript and JavaScript come from the type checker. Classes, functions and methods of other languages come from declaration patterns: their names and lines are reliable, their parameters are as written, and calls between them are not extracted. An import between two such files is drawn from the first declaration of each. Test files, type aliases and plain variables are left out.',
    'Languages & files lists every language and file type found, with how each file was processed.',
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
    coverage,
  };
}
