import {
  BRAIN_FORMAT,
  DEFAULT_REGIONS,
  classifyFile,
  inventoryOf,
  type BrainColumn,
  type BrainDetail,
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
  fires_on: 'fires_on',
  indexes: 'indexes',
  maps_to: 'maps_to',
};

/** Links between files (from build, CI, container and config files). */
const FILE_LINKS = new Set(['builds', 'runs', 'includes', 'references']);

/**
 * What build, configuration, data and documentation files declare (structured readers and
 * the Markdown reader), by symbol kind. A kind not listed here is drawn as an element.
 */
const STRUCT_KINDS = new Map<string, NeuronKind>([
  ['dependency', 'dependency'],
  ['plugin', 'plugin'],
  ['task', 'task'],
  ['ci-job', 'task'],
  ['make-target', 'task'],
  ['build-target', 'task'],
  ['build-stage', 'task'],
  ['build-module', 'module'],
  ['profile', 'config'],
  ['bean', 'bean'],
  ['key', 'key'],
  ['element', 'element'],
  ['section', 'section'],
  ['heading', 'section'],
  ['operation', 'route'],
  ['service', 'service'],
  ['k8s-object', 'service'],
  ['node', 'element'],
]);
/** Keys and elements deeper than this are in the index and search, not drawn. */
export const MAX_DRAWN_DEPTH = 3;
/** Kinds left out first when a brain is too big to draw whole. */
const MINOR_KINDS = new Set<NeuronKind>(['key', 'element', 'section']);

const SYMBOL_KINDS = new Map<string, NeuronKind>([
  ['class', 'class'],
  ['interface', 'interface'],
  ['function', 'function'],
  ['method', 'method'],
  ['constructor', 'method'],
  ['accessor', 'method'],
]);

/** Database objects read from SQL files (symbol kind → neuron kind). */
const SQL_KINDS = new Map<string, NeuronKind>([
  ['view', 'view'],
  ['function', 'function'],
  ['procedure', 'procedure'],
  ['trigger', 'trigger'],
  ['index', 'index'],
  ['sequence', 'sequence'],
  ['datatype', 'datatype'],
  ['package', 'package'],
  ['policy', 'policy'],
  ['rule', 'rule'],
  ['event', 'event'],
  ['synonym', 'synonym'],
  ['schema', 'schema'],
  ['extension', 'extension'],
]);

const KIND_WORD: Record<string, string> = {
  'materialized-view': 'materialized view',
  'package-body': 'package body',
  'type-body': 'type body',
};

/** The facts of a database object, for its details panel. */
function sqlDetails(d: Record<string, unknown>): BrainDetail[] {
  const out: BrainDetail[] = [];
  const add = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    out.push({ label, value: Array.isArray(v) ? v.join(', ') : String(v) });
  };
  const declKind = String(d.declKind ?? '');
  add('Kind', KIND_WORD[declKind] ?? declKind);
  if (declKind === 'trigger')
    add(
      'Fires',
      [
        d.timing,
        Array.isArray(d.events) ? d.events.join(' OR ') : undefined,
        d.forEach ? `for each ${String(d.forEach)}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    );
  add('On', d.table);
  add('Runs', d.executes);
  if (declKind === 'index') add('Columns', d.indexColumns);
  if (d.unique) add('Unique', 'yes');
  add('Method', d.method);
  if (d.options && typeof d.options === 'object')
    add(
      'Options',
      Object.entries(d.options as Record<string, string>).map(([k, v]) => `${k} ${v}`),
    );
  add('Owned by', d.ownedBy);
  add('Values', d.values);
  add('Language', d.routineLanguage);
  add('Schema', d.schema);
  add('Reads', d.reads);
  add('Writes', d.writes);
  if (Array.isArray(d.dynamicSql) && d.dynamicSql.length)
    add('Not analysed', `SQL built at run time (line ${d.dynamicSql.join(', ')})`);
  add('Not in this repository', d.unresolvedReads);
  add('Calls not linked', d.unresolvedCalls);
  if (Number(d.overloads) > 1)
    add('Overloads', `${String(d.overloads)} definitions share this name`);
  add(
    'Read by',
    [d.parser, d.dialect ? `(${String(d.dialect)})` : undefined].filter(Boolean).join(' '),
  );
  return out;
}

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
export const BRAIN_MAX_NEURONS = 100_000;

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
/** Where an ORM table is defined, by which model, and how its name was found. */
function tableDetails(data: Record<string, unknown>): { details?: BrainDetail[] } {
  const by = Array.isArray(data.definedBy) ? (data.definedBy as Record<string, unknown>[]) : [];
  if (!by.length) return {};
  const details: BrainDetail[] = [];
  if (data.tableKind === 'collection')
    details.push({ label: 'Kind', value: 'document collection' });
  if (data.tableKind === 'join-table')
    details.push({ label: 'Kind', value: 'join table created by the ORM' });
  for (const d of by.slice(0, 6)) {
    const where = `${String(d.path)}:${String(d.line)}`;
    const what = d.change
      ? `${String(d.label)} migration adds columns`
      : d.model
        ? `${String(d.label)} model ${String(d.model)}`
        : `${String(d.label)} migration`;
    details.push({ label: 'Defined by', value: `${what} (${where})` });
    if (d.rule) details.push({ label: 'Name', value: String(d.rule) });
  }
  return { details };
}

const UNREAD_SCHEMA_KINDS: {
  label: string;
  path: RegExp;
  content?: RegExp;
}[] = [
  // Read since sprint L3 (ADR 0017): Liquibase, JPA, Django, SQLAlchemy, Rails, EF Core and the
  // other frameworks in @nexora/orm. These mapping formats are still not read:
  { label: 'Hibernate XML mappings', path: /\.hbm\.xml$/i },
  { label: 'JPA orm.xml mapping files', path: /(^|\/)orm\.xml$/i, content: /<entity-mappings\b/ },
  {
    label: 'MyBatis mapper files',
    path: /\.xml$/i,
    content: /<!DOCTYPE\s+mapper\b|<mapper\s+namespace=/,
  },
  { label: 'Doctrine XML or YAML mappings', path: /\.orm\.(xml|ya?ml)$/i },
  {
    label: 'Flyway Java migrations',
    path: /(^|\/)V\d+[\w.]*__\w+\.(java|kt)$/,
    content: /\bBaseJavaMigration\b/,
  },
  {
    label: 'Entity Framework 6 code-first migrations',
    path: /\.cs$/,
    content: /\bDbMigration\b[\s\S]*\bCreateTable\(/,
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

/** What a part read from a build, configuration or documentation file is, and how it was read. */
function structuredDoc(
  n: { data: Record<string, unknown>; filePath: string | null },
  kind: NeuronKind,
): string {
  const file = n.filePath ?? 'its file';
  const lang = str(n.data.language) ?? 'file';
  switch (kind) {
    case 'section':
      return `Section of ${file} (Markdown heading level ${String(n.data.level ?? '?')}).`;
    case 'key':
      return `Key in ${file} (${lang}), read by its parser. Values are not kept: they can be credentials.`;
    case 'element':
      return `Element in ${file} (${lang}), read by the XML element scanner.`;
    case 'dependency':
      return `Dependency declared in ${file} (${lang}).`;
    case 'plugin':
      return `Build plugin applied in ${file} (${lang}).`;
    case 'task':
      return `Task, job or target defined in ${file} (${lang}).`;
    case 'module':
      return `Project included by ${file}.`;
    case 'bean':
      return `Bean, servlet, filter or persistence unit declared in ${file}; its class is linked when the class is in this repository.`;
    default:
      return `Declared in ${file} (${lang}) and read by its file-format reader.`;
  }
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
      `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind IN ('symbol','file','route','service','config','table','doc')`,
      repoId,
    ) as Parameters<typeof toNode>[0][]
  ).map(toNode);
  const edges = (
    rows(
      db,
      `SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND kind IN (${[
        ...Object.keys(SYNAPSE_OF),
        'mentions',
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

  const containerOf = new Map<number, number>();
  for (const e of edges) if (e.kind === 'contains') containerOf.set(e.dst, e.src);

  // Files at either end of a build, run or include link are drawn, so the link is visible.
  const linkedFiles = new Set<number>();
  for (const e of edges)
    if (
      FILE_LINKS.has(e.kind) &&
      nodeById.get(e.src)?.kind === 'file' &&
      nodeById.get(e.dst)?.kind === 'file'
    )
      linkedFiles.add(e.src).add(e.dst);

  // Files whose declarations come from a structured or Markdown reader are drawn themselves,
  // with what they declare inside them.
  const structuredFiles = new Set<number>();
  for (const e of edges)
    if (e.kind === 'contains' && nodeById.get(e.dst)?.data.structured) {
      let src = nodeById.get(e.src);
      while (src && src.kind === 'symbol') {
        const up = containerOf.get(src.id);
        src = up === undefined ? undefined : nodeById.get(up);
      }
      if (src?.kind === 'file') structuredFiles.add(src.id);
    }
  // A Markdown document node stands for its file.
  const fileIdByPath = new Map<string, number>();
  for (const n of nodes) if (n.kind === 'file') fileIdByPath.set(n.key, n.id);
  const docFile = new Map<number, number>();
  for (const n of nodes)
    if (n.kind === 'doc') {
      const f = fileIdByPath.get(n.key);
      if (f !== undefined) {
        docFile.set(n.id, f);
        structuredFiles.add(f);
      }
    }

  const depthCache = new Map<number, number>();
  /** How many symbols deep a structured symbol is in its file (a top-level key is 1). */
  const depthOf = (id: number): number => {
    const hit = depthCache.get(id);
    if (hit !== undefined) return hit;
    const up = containerOf.get(id);
    const d = up === undefined || nodeById.get(up)?.kind !== 'symbol' ? 1 : depthOf(up) + 1;
    depthCache.set(id, d);
    return d;
  };

  const neuronOf = new Map<number, BrainNeuron>();
  const placeFile = (path: string | null) =>
    classifyFile(path ?? undefined, {
      imports: path ? importsOf.get(path) : undefined,
      uiPackage: path ? uiPackageOf(path, uiPkgs) : undefined,
    });

  for (const n of nodes) {
    if (n.filePath && isTestSupportPath(n.filePath)) continue;
    let kind: NeuronKind | undefined;
    const fromSql = n.kind === 'symbol' && n.data.extraction === 'sql';
    const structured = n.kind === 'symbol' && !!n.data.structured;
    if (fromSql) kind = SQL_KINDS.get(n.symbolKind ?? '');
    else if (structured) {
      kind =
        SYMBOL_KINDS.get(n.symbolKind ?? '') ?? STRUCT_KINDS.get(n.symbolKind ?? '') ?? 'element';
      // Deep keys and elements stay in the index and search; the brain draws the top levels.
      if ((kind === 'key' || kind === 'element') && depthOf(n.id) > MAX_DRAWN_DEPTH) continue;
    } else if (n.kind === 'symbol') {
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
    else if (
      n.kind === 'file' &&
      (isDevopsFile(n.key, n.data.role) || linkedFiles.has(n.id) || structuredFiles.has(n.id))
    )
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
    else if (fromSql)
      place = {
        region: 'database',
        reason: `database ${KIND_WORD[String(n.data.declKind)] ?? String(n.data.declKind ?? kind)} defined in ${n.filePath ?? 'SQL'}`,
      };
    else if (kind === 'section') place = { region: 'docs', reason: 'documentation section' };
    else if (structured || kind === 'file') {
      const p = placeFile(n.filePath);
      // Configuration files with no other signal sit with DevOps, not with core code.
      place =
        p.region === 'core' ? { region: 'devops', reason: 'build, configuration or data file' } : p;
    } else place = placeFile(n.filePath);

    const params = Array.isArray(n.data.params)
      ? (n.data.params as BrainParam[]).map((p) => ({
          name: String(p.name).replace(/\s+/g, ' '),
          // An empty type means the source does not declare one (Python, Ruby, Lua…).
          type: p.type === undefined || p.type === null ? '' : String(p.type),
          optional: !!p.optional,
          ...(p.mode && p.mode !== 'in' ? { mode: p.mode } : {}),
          ...(p.default !== undefined ? { default: String(p.default) } : {}),
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
      ...(structured ? { name: str(n.data.label) ?? n.name, doc: structuredDoc(n, kind) } : {}),
      ...(n.data.extraction === 'pattern' && !structured && !str(n.data.doc)
        ? {
            doc: `Found by the ${str(n.data.language) ?? 'source'} declaration pattern (${str(n.data.declKind) ?? n.symbolKind ?? 'declaration'}); not checked by a compiler, and calls are not traced.`,
          }
        : {}),
      columns:
        (kind === 'table' || fromSql) && Array.isArray(n.data.columns)
          ? (n.data.columns as BrainColumn[])
          : undefined,
      ...(fromSql ? { details: sqlDetails(n.data) } : kind === 'table' ? tableDetails(n.data) : {}),
      ref: n.id,
    });
  }

  // Members sit inside their class; what a build, configuration or documentation file declares
  // sits inside its nearest drawn ancestor (the file itself at the top).
  for (const e of edges) {
    if (e.kind !== 'contains') continue;
    const child = neuronOf.get(e.dst);
    if (!child) continue;
    const structured = !!nodeById.get(e.dst)?.data.structured;
    let up: number | undefined = e.src;
    let parent = neuronOf.get(up);
    while (structured && !parent && up !== undefined) {
      up = containerOf.get(up);
      parent = up === undefined ? undefined : neuronOf.get(up);
    }
    const src = up === undefined ? undefined : nodeById.get(up);
    if (parent && (src?.kind === 'symbol' || (src?.kind === 'file' && structured))) {
      child.parent = parent.id;
      child.region = parent.region;
      child.regionReason = parent.regionReason;
    }
  }

  // A file read by declaration patterns or the syntax layer has no file neuron; its links and
  // imports are drawn from its first top-level declaration instead.
  const primaryOf = new Map<number, BrainNeuron>();
  for (const e of edges) {
    if (e.kind !== 'contains' || nodeById.get(e.src)?.kind !== 'file') continue;
    const child = nodeById.get(e.dst);
    const neuron = neuronOf.get(e.dst);
    if (
      !child ||
      !neuron ||
      (child.data.extraction !== 'pattern' &&
        child.data.extraction !== 'syntax' &&
        child.data.extraction !== 'sql')
    )
      continue;
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
    // Documentation that names a file or symbol: from the document's file.
    else if (e.kind === 'mentions' && docFile.has(e.src))
      add({ ...e, src: docFile.get(e.src) as number }, 'references');
    // Imports between files resolved by the pattern or syntax analysers (TypeScript imports are drawn as calls).
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
            Number(MINOR_KINDS.has(x.kind)) - Number(MINOR_KINDS.has(y.kind)) ||
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
    'Tables and columns are read from SQL files (CREATE TABLE, ALTER TABLE), Prisma schemas, Drizzle table definitions and CREATE TABLE statements inside code, with types, sizes and keys as written. A Drizzle query that names a table is an observed read or write; a Prisma call or a table named in a SQL string is inferred. Views, materialized views, functions, procedures, triggers, indexes, sequences, types, packages, policies, rules and events are read from SQL files with their parameters and columns: PostgreSQL by its own parser (bodies included, PL/pgSQL through its compiler front end), other dialects by a statement reader, and each object says which. The tables a body reads and writes and the routines it calls are matched to the schema by name: observed from the PostgreSQL parser, inferred from the statement reader. SQL built at run time (EXECUTE, sp_executesql) and the Drizzle relational query API are not linked.',
    'Inputs and return types of TypeScript and JavaScript, including the scripts and templates of Svelte, Vue and Astro components, come from the type checker, which also resolves their calls (observed). Languages with a tree-sitter grammar are parsed in full: classes, functions and methods with parameters and return types as written, imports, and calls matched to a declaration by name (inferred), or resolved by a SCIP index when one was given (observed). Languages without a grammar get declarations from patterns: names, lines and parameters as written, and no calls. Languages & files says which method read each language. An import between two files outside TypeScript is drawn from the first declaration of each. Test files, type aliases and plain variables are left out.',
    `Build, configuration, data and documentation files are drawn with what they declare: Maven and Gradle dependencies, plugins, profiles, tasks and included projects; package.json, Cargo and other manifests' dependencies and scripts; every key of JSON, YAML and TOML files (never their values, which can be credentials) and every element of XML files, with keys and elements deeper than ${MAX_DRAWN_DEPTH} levels kept in the index and search but not drawn; Spring beans, servlets and filters linked to their class when it is in this repository (inferred, by package path); a Maven dependency linked to the POM that builds it (observed when the coordinates match); and every Markdown heading as a section in the Documentation lobe, with the files and symbols the text links to (inferred). Gradle scripts are read by patterns on top of their syntax parse, so a dependency added by a loop or a helper function is not seen.`,
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
