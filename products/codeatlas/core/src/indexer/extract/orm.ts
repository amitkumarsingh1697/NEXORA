/**
 * ORM and migration schemas (Django, SQLAlchemy, JPA, Entity Framework Core, Rails, Laravel,
 * GORM, TypeORM, Liquibase and the rest; see packages/orm and ADR 0017) in the graph: tables
 * and columns, foreign keys, and the model classes that map to them.
 *
 * Labelling: a table, a column or a key whose name the source writes is observed; one whose
 * name comes from a framework default (Django's <app>_<model>, Rails's pluralised class name)
 * carries the rule on the table node, and the link from the model to it is inferred. A
 * repository that reads and writes a table (Spring Data) is an inferred read and write.
 */
import { scanXml } from './structured';
import {
  FRAMEWORK_LABEL,
  liquibaseFromYaml,
  readLiquibaseTree,
  readOrm,
  repositoryContext,
  resolveOrm,
  tableKey,
  type LbNode,
  type OrmFile,
  type OrmFramework,
  type OrmSchema,
} from '@nexora/orm';
import type { GraphBuilder, NodeRef, NodeRec } from '../model';
import { addSchema, type ColumnDef, type TableDef } from '../schema';
import { isTestSupportPath } from '../test-paths';

export interface OrmStats {
  files: number;
  frameworks: Partial<Record<OrmFramework, number>>;
  tables: number;
  mappings: number;
  foreignKeys: number;
  unresolved: number;
}

const LIQUIBASE_PATH = /\.(xml|ya?ml|json)$/i;

/** Reads every file that uses an ORM this build reads. */
export function readOrmFiles(
  files: { path: string; language: string }[],
  texts: Map<string, string>,
): OrmFile[] {
  const ctx = repositoryContext(texts.values());
  const out: OrmFile[] = [];
  for (const f of files) {
    const text = texts.get(f.path);
    if (text === undefined || isTestSupportPath(f.path)) continue;
    let r: OrmFile | null = null;
    if (LIQUIBASE_PATH.test(f.path) && text.includes('databaseChangeLog')) {
      if (/\.xml$/i.test(f.path)) {
        const x = scanXml(text);
        if (x.root) r = readLiquibaseTree(f.path, x.root as unknown as LbNode);
      } else {
        const y = liquibaseFromYaml(text);
        if (!(y instanceof Error)) r = readLiquibaseTree(f.path, y);
      }
    } else r = readOrm(f.path, f.language, text, ctx);
    if (
      r &&
      (r.models.length ||
        r.tables.length ||
        r.foreignKeys.length ||
        r.uses.length ||
        r.registrations?.length ||
        r.imports?.global.length ||
        r.tableOps?.length ||
        r.migrationOps?.length ||
        r.revision)
    )
      out.push(r);
  }
  return out;
}

function toColumns(cols: OrmSchema['tables'][number]['columns']): ColumnDef[] {
  return cols.map((c) => {
    const d: ColumnDef = { name: c.name, type: c.type, nullable: c.nullable, line: c.line };
    if (c.primaryKey) d.primaryKey = true;
    if (c.unique) d.unique = true;
    if (c.default !== undefined) d.default = c.default;
    if (c.length !== undefined) d.length = c.length;
    if (c.precision !== undefined) d.precision = c.precision;
    if (c.scale !== undefined) d.scale = c.scale;
    if (c.references) d.references = c.references;
    const extra = d as ColumnDef & { field?: string; implicit?: string };
    if (c.field) extra.field = c.field;
    if (c.implicit) extra.implicit = c.implicit;
    return d;
  });
}

/** The class node for a model: same file, same name, nearest declaration line. */
function classNode(
  byFile: Map<string, NodeRec[]>,
  path: string,
  owner: string,
  line: number,
): NodeRef | undefined {
  const cands = (byFile.get(path) ?? []).filter(
    (n) =>
      n.kind === 'symbol' &&
      (n.name === owner || n.name.endsWith(`.${owner}`) || n.name.endsWith(`::${owner}`)),
  );
  if (!cands.length) return undefined;
  cands.sort((a, b) => Math.abs((a.startLine ?? 0) - line) - Math.abs((b.startLine ?? 0) - line));
  const n = cands[0]!;
  return { kind: n.kind, key: n.key };
}

/** Adds the resolved schema to the graph. Call after every SQL, Prisma and code file is in it. */
export function addOrm(
  graph: GraphBuilder,
  files: OrmFile[],
): { stats: OrmStats; schema: OrmSchema } {
  const known = new Set<string>();
  const knownColumns = new Map<string, Set<string>>();
  for (const n of graph.nodes.values())
    if (n.kind === 'table') {
      const k = n.key.replace(/^table:/, '');
      known.add(k);
      const cols = (n.data?.columns as ColumnDef[] | undefined) ?? [];
      knownColumns.set(k, new Set(cols.map((c) => c.name.toLowerCase())));
    }
  const schema = resolveOrm(files, known, knownColumns);
  const stats: OrmStats = {
    files: files.length,
    frameworks: {},
    tables: 0,
    mappings: 0,
    foreignKeys: 0,
    unresolved: schema.unresolved.length,
  };
  for (const f of files)
    for (const fw of f.frameworks) stats.frameworks[fw] = (stats.frameworks[fw] ?? 0) + 1;

  // Tables first, then the changes migrations make to them.
  const ordered = [
    ...schema.tables.filter((t) => !t.alter),
    ...schema.tables.filter((t) => t.alter),
  ];
  for (const t of ordered) {
    if (isTestSupportPath(t.path)) continue;
    const def: TableDef = {
      name: t.name,
      columns: toColumns(t.columns),
      line: t.line,
      source: t.framework,
    };
    const ref: NodeRef = { kind: 'table', key: `table:${tableKey(t.name)}` };
    const existed = graph.has(ref);
    const prevSource = graph.get(ref)?.data?.source;
    addSchema(graph, t.path, { tables: [def], foreignKeys: [] });
    stats.tables++;
    const node = graph.get(ref);
    if (!node) continue;
    const prev = (node.data?.definedBy as unknown[] | undefined) ?? [];
    const entry = {
      framework: t.framework,
      label: FRAMEWORK_LABEL[t.framework],
      path: t.path,
      line: t.line,
      ...(t.model ? { model: t.model } : {}),
      naming: t.naming,
      ...(t.rule ? { rule: t.rule } : {}),
      ...(t.alter ? { change: true } : {}),
    };
    graph.mergeData(ref, {
      definedBy: [...prev, entry].slice(0, 20),
      ...(t.kind !== 'table' ? { tableKind: t.kind } : {}),
      // A table only an ORM defines keeps its source; a SQL table keeps SQL as its source.
      ...(existed && prevSource !== undefined ? { source: prevSource } : {}),
    });
  }
  for (const k of schema.foreignKeys) {
    if (isTestSupportPath(k.path)) continue;
    const src: NodeRef = { kind: 'table', key: `table:${tableKey(k.table)}` };
    const dst: NodeRef = { kind: 'table', key: `table:${tableKey(k.refTable)}` };
    if (!graph.has(src) || !graph.has(dst)) continue;
    graph.addEdge({
      kind: 'references',
      src,
      dst,
      confidence: k.confidence,
      evidencePath: k.path,
      evidenceLine: k.line,
      detail: `${k.table}.${k.column} → ${k.refTable}${k.refColumn ? `.${k.refColumn}` : ''} (${FRAMEWORK_LABEL[k.framework]}${k.confidence === 'inferred' ? ', a name derived by the framework default' : ''})`,
    });
    stats.foreignKeys++;
  }
  const byFile = new Map<string, NodeRec[]>();
  for (const n of graph.nodes.values())
    if (n.kind === 'symbol' && n.filePath)
      byFile.set(n.filePath, [...(byFile.get(n.filePath) ?? []), n]);
  for (const m of schema.mappings) {
    if (isTestSupportPath(m.path)) continue;
    const table: NodeRef = { kind: 'table', key: `table:${tableKey(m.table)}` };
    if (!graph.has(table)) {
      graph.addUnresolved({
        filePath: m.path,
        line: m.line,
        kind: 'heritage',
        text: `${m.owner} → table ${m.table}`,
        reason: 'the table this model maps to is not defined in this repository',
      });
      continue;
    }
    const src = classNode(byFile, m.path, m.owner, m.line) ?? {
      kind: 'file' as const,
      key: m.path,
    };
    const edge = {
      src,
      dst: table,
      confidence: m.confidence,
      evidencePath: m.path,
      evidenceLine: m.line,
      detail: m.detail,
    };
    if (m.access === 'maps') graph.addEdge({ kind: 'maps_to', ...edge });
    else {
      graph.addEdge({ kind: 'reads_table', ...edge, confidence: 'inferred' });
      graph.addEdge({ kind: 'writes_table', ...edge, confidence: 'inferred' });
    }
    stats.mappings++;
  }
  for (const u of schema.unresolved.slice(0, 500))
    graph.addUnresolved({
      filePath: u.path,
      line: u.line,
      kind: 'heritage',
      text: u.text,
      reason: 'ORM relation or base class not found in this repository',
    });
  return { stats, schema };
}
