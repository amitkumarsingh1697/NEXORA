/**
 * Deterministic module documentation (spec §5.8, S3-5). Every line comes from the index:
 * exports, dependencies in both directions, external packages, routes, entry points,
 * tests, integrations and docs, each with the file and line it was read from.
 */
import type { Db } from '../store/db';
import { indexRevision, type IndexRevision } from '../chat/retrieve';
import { EDGE_COLS, NODE_COLS, toEdge, toNode, type EdgeRow, type NodeRow } from './graph';

type RawNode = Parameters<typeof toNode>[0];
type RawEdge = Parameters<typeof toEdge>[0];

export interface Cite {
  path: string;
  line: number | null;
}

export interface ModuleDoc {
  module: string;
  dir: string | null;
  revision: IndexRevision;
  files: { total: number; source: number; tests: number; loc: number };
  exports: {
    key: string;
    name: string;
    kind: string;
    signature: string | null;
    doc: string | null;
    at: Cite;
  }[];
  dependsOn: { module: string; imports: number; at: Cite }[];
  usedBy: { module: string; imports: number; at: Cite }[];
  externals: { name: string; files: number }[];
  routes: { name: string; at: Cite }[];
  entrypoints: { name: string; target: string | null }[];
  integrations: { name: string; category: string; uses: number; at: Cite }[];
  docs: { path: string; title: string }[];
  notes: string[];
}

export function moduleDoc(db: Db, repoId: number, module: string): ModuleDoc | null {
  const mod = db
    .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = 'module' AND key = ?`)
    .get(repoId, module) as RawNode | undefined;
  if (!mod) return null;
  const nodes = (
    db
      .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ?`)
      .all(repoId) as unknown as RawNode[]
  ).map(toNode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (
    db
      .prepare(
        `SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND kind IN ('imports','reads_config','writes_config','calls_service','accesses_db','mentions')`,
      )
      .all(repoId) as unknown as RawEdge[]
  ).map(toEdge);
  const inMod = (n: NodeRow | undefined) => !!n && n.module === module;
  const files = nodes.filter((n) => n.kind === 'file' && n.module === module);
  const code = files.filter((f) => f.data.lang === 'typescript' || f.data.lang === 'javascript');
  const cite = (e: EdgeRow): Cite => ({ path: e.evidencePath ?? '', line: e.evidenceLine });

  const exports = nodes
    .filter(
      (n) => n.kind === 'symbol' && n.module === module && n.exported && !n.name.includes('.'),
    )
    .filter((n) => !files.find((f) => f.key === n.filePath)?.data.isTest)
    .sort(
      (a, b) =>
        (a.filePath ?? '').localeCompare(b.filePath ?? '') ||
        (a.startLine ?? 0) - (b.startLine ?? 0),
    )
    .map((n) => ({
      key: n.key,
      name: n.name,
      kind: n.symbolKind ?? 'symbol',
      signature: typeof n.data.signature === 'string' ? n.data.signature : null,
      doc: typeof n.data.doc === 'string' ? n.data.doc : null,
      at: { path: n.filePath ?? '', line: n.startLine },
    }));

  const across = (dir: 'out' | 'in') => {
    const m = new Map<string, { module: string; imports: number; at: Cite }>();
    for (const e of edges) {
      if (e.kind !== 'imports') continue;
      const s = byId.get(e.src);
      const d = byId.get(e.dst);
      if (!s || !d || d.kind !== 'file' || s.module === d.module) continue;
      const [self, other] = dir === 'out' ? [s, d] : [d, s];
      if (!inMod(self) || !other.module) continue;
      const cur = m.get(other.module) ?? { module: other.module, imports: 0, at: cite(e) };
      cur.imports++;
      m.set(other.module, cur);
    }
    return [...m.values()].sort(
      (a, b) => b.imports - a.imports || a.module.localeCompare(b.module),
    );
  };

  const ext = new Map<string, Set<number>>();
  for (const e of edges) {
    const s = byId.get(e.src);
    const d = byId.get(e.dst);
    if (e.kind === 'imports' && inMod(s) && d?.kind === 'external' && !d.data.builtin) {
      const set = ext.get(d.name) ?? new Set();
      set.add(e.src);
      ext.set(d.name, set);
    }
  }

  const integ = new Map<number, { name: string; category: string; uses: number; at: Cite }>();
  for (const e of edges) {
    if (!['reads_config', 'writes_config', 'calls_service', 'accesses_db'].includes(e.kind))
      continue;
    const s = byId.get(e.src);
    const d = byId.get(e.dst);
    if (!inMod(s) && !(s && s.kind === 'symbol' && files.some((f) => f.key === s.filePath)))
      continue;
    if (!d) continue;
    const category =
      d.kind === 'service'
        ? d.key.startsWith('db:')
          ? 'database'
          : 'http'
        : d.key.startsWith('env:')
          ? 'environment variable'
          : 'configuration file';
    const cur = integ.get(d.id) ?? {
      name: d.kind === 'file' ? d.key : d.name,
      category,
      uses: 0,
      at: cite(e),
    };
    cur.uses++;
    integ.set(d.id, cur);
  }

  const docs = nodes
    .filter((n) => n.kind === 'doc' && n.module === module)
    .map((n) => ({ path: n.key, title: n.name }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    module,
    dir: (() => {
      const dir = toNode(mod).data.dir;
      return typeof dir === 'string' ? dir : null;
    })(),
    revision: indexRevision(db, repoId),
    files: {
      total: files.length,
      source: code.filter((f) => !f.data.isTest).length,
      tests: code.filter((f) => f.data.isTest).length,
      loc: code.reduce((a, f) => a + (typeof f.data.loc === 'number' ? f.data.loc : 0), 0),
    },
    exports,
    dependsOn: across('out'),
    usedBy: across('in'),
    externals: [...ext.entries()]
      .map(([name, s]) => ({ name, files: s.size }))
      .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)),
    routes: nodes
      .filter((n) => n.kind === 'route' && n.module === module)
      .map((n) => ({ name: n.key, at: { path: n.filePath ?? '', line: n.startLine } }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    entrypoints: nodes
      .filter((n) => n.kind === 'entrypoint' && n.module === module)
      .map((n) => ({
        name: n.name,
        target: typeof n.data.target === 'string' ? n.data.target : null,
      })),
    integrations: [...integ.values()].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    ),
    docs,
    notes: [
      'Generated from the index, not written by a model. Each item links to the line it was read from.',
      'Dependencies count import statements between files of different modules.',
      'Integrations are inferred except environment variable names, which are observed.',
    ],
  };
}

/** The same documentation as Markdown, for export. */
export function moduleDocMarkdown(d: ModuleDoc): string {
  const at = (c: Cite) => (c.path ? ` (\`${c.path}${c.line ? `:${c.line}` : ''}\`)` : '');
  const out: string[] = [`# Module ${d.module}`, ''];
  out.push(
    `Indexed at ${d.revision.commit ? `commit \`${d.revision.commit.slice(0, 10)}\`` : 'a folder without git history'}${d.revision.dirty ? ' with uncommitted changes' : ''}.`,
    '',
    `${d.files.source} source files, ${d.files.tests} test files, ${d.files.loc} lines of code.`,
    '',
  );
  const section = (title: string, rows: string[], empty: string) => {
    out.push(`## ${title}`, '', ...(rows.length ? rows : [empty]), '');
  };
  section(
    'Exports',
    d.exports.map((e) => `- \`${e.name}\` (${e.kind})${at(e.at)}${e.doc ? `: ${e.doc}` : ''}`),
    'No exported symbols.',
  );
  section(
    'Depends on',
    d.dependsOn.map((x) => `- ${x.module}: ${x.imports} imports, e.g.${at(x.at)}`),
    'No other modules.',
  );
  section(
    'Used by',
    d.usedBy.map((x) => `- ${x.module}: ${x.imports} imports, e.g.${at(x.at)}`),
    'No other modules.',
  );
  section(
    'External packages',
    d.externals.map((x) => `- ${x.name} (imported by ${x.files} files)`),
    'None.',
  );
  section(
    'Routes',
    d.routes.map((r) => `- ${r.name}${at(r.at)}`),
    'None.',
  );
  section(
    'Entry points',
    d.entrypoints.map((e) => `- ${e.name}${e.target ? ` → \`${e.target}\`` : ''}`),
    'None.',
  );
  section(
    'Configuration and services',
    d.integrations.map((i) => `- ${i.category}: ${i.name} (${i.uses} uses, e.g.${at(i.at)})`),
    'None found.',
  );
  section(
    'Documentation',
    d.docs.map((x) => `- ${x.title} (\`${x.path}\`)`),
    'No documents in this module.',
  );
  out.push('---', '', ...d.notes.map((n) => `_${n}_`), '');
  return out.join('\n');
}
