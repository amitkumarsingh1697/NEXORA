/**
 * Database objects from SQL files (@nexora/sql) in the CodeAtlas graph: views, materialized
 * views, functions, procedures, triggers, indexes, sequences, types, domains, packages,
 * policies, rules, events, synonyms, schemas and extensions, with their parameters, columns
 * and the tables and routines their bodies use.
 *
 * Labelling:
 * - An object, its parameters and columns are **observed**: they are written at the cited line.
 * - A table, view or routine named in a body is matched to the repository's schema by name.
 *   From PostgreSQL's parser the name is certainly a relation or a function (observed); from
 *   the statement reader the role of the name is read from the surrounding keywords
 *   (inferred). A call matched in another file is inferred, and one with several candidates is
 *   not drawn.
 * - Names that match nothing in the repository are kept on the object (`unresolvedReads`,
 *   `unresolvedCalls`), never drawn.
 */
import {
  analyseSql,
  DIALECT_LABEL,
  initSql,
  type SqlObject,
  type SqlRef,
  type SqlResult,
} from '@nexora/sql';
import type { FileRecord } from '@nexora/languages';
import type { GraphBuilder, NodeRef } from '../model';
import { tableKey, type ColumnDef, type TableDef } from '../schema';

let initError: string | undefined;
try {
  await initSql();
} catch (e) {
  initError = `the PostgreSQL parser did not load: ${(e as Error).message.slice(0, 160)}`;
}

/** Why the PostgreSQL parser cannot run in this process, if it cannot. */
export function sqlParserUnavailable(): string | undefined {
  return initError;
}

export { analyseSql };

/** symbolKind of each object kind in the graph. */
const SYMBOL_KIND: Record<SqlObject['kind'], string | undefined> = {
  table: undefined, // tables are `table` nodes, from the schema readers
  view: 'view',
  'materialized-view': 'view',
  function: 'function',
  procedure: 'procedure',
  trigger: 'trigger',
  index: 'index',
  sequence: 'sequence',
  type: 'datatype',
  domain: 'datatype',
  'type-body': 'datatype',
  package: 'package',
  'package-body': 'package',
  schema: 'schema',
  extension: 'extension',
  policy: 'policy',
  rule: 'rule',
  synonym: 'synonym',
  event: 'event',
};

/** Objects whose names live in their own namespace (or per table), so their keys carry the kind. */
const KEY_PREFIX: Partial<Record<SqlObject['kind'], string>> = {
  trigger: 'trigger:',
  index: 'index:',
  sequence: 'sequence:',
  schema: 'schema:',
  extension: 'extension:',
  policy: 'policy:',
  rule: 'rule:',
  synonym: 'synonym:',
  event: 'event:',
};

/** The graph key of an object in a file. */
export function sqlObjectKey(path: string, o: SqlObject): string {
  const prefix = KEY_PREFIX[o.kind] ?? '';
  // Trigger, policy and rule names are unique per table, not per schema.
  const scoped =
    (o.kind === 'trigger' || o.kind === 'policy' || o.kind === 'rule') && o.table
      ? `${o.table}.${o.name}`
      : o.name;
  const q = o.parent ? `${o.parent}.${scoped}` : scoped;
  return `${path}#${prefix}${q}`;
}

/** Tables the SQL reader found that the CREATE TABLE reader did not (partitions, CREATE TABLE AS, LIKE). */
export function extraTables(sql: SqlResult, known: TableDef[]): TableDef[] {
  const have = new Set(known.map((t) => tableKey(t.name)));
  const out: TableDef[] = [];
  for (const o of sql.objects) {
    if (o.kind !== 'table' || !o.name || have.has(tableKey(o.name))) continue;
    have.add(tableKey(o.name));
    out.push({
      name: o.name,
      line: o.line,
      source: 'sql',
      columns: (o.columns ?? []).map((c): ColumnDef => ({
        name: c.name,
        type: c.type ?? '',
        nullable: c.nullable ?? true,
        ...(c.primaryKey ? { primaryKey: true } : {}),
        ...(c.default ? { default: c.default } : {}),
        ...(c.line ? { line: c.line } : {}),
      })),
    });
  }
  return out;
}

export interface SqlFileResult {
  path: string;
  result: SqlResult;
  /** Graph key of each object (undefined for tables). */
  keys: (string | undefined)[];
}

/** File status for a SQL file. */
export function sqlStatus(
  r: SqlResult,
): Pick<FileRecord, 'status' | 'method' | 'reason' | 'resolution'> {
  const unavailable = initError ? `; ${initError}` : '';
  if (r.mode === 'parser' && !r.problems.length)
    return {
      status: 'full',
      method: `Full parse (${r.method})`,
      reason: undefined,
      resolution: 'syntax',
    };
  const first = r.problems[0];
  const parts: string[] = [];
  const notParsed = r.statements - (r.parsedStatements ?? 0);
  if (r.dialect === 'postgresql' && first) {
    const errors = r.problems.length;
    parts.push(
      `${errors} problem${errors === 1 ? '' : 's'}; first at line ${first.line} (${first.message.slice(0, 120)})`,
    );
  } else if (r.parsedStatements) {
    parts.push(
      `${notParsed} of ${r.statements} statements are not PostgreSQL syntax and were read by the statement reader${first ? `; first at line ${first.line}` : ''}`,
    );
  } else {
    parts.push(
      `no complete ${DIALECT_LABEL[r.dialect]} grammar is bundled; read by the statement reader`,
    );
  }
  const unread = r.statements - r.understood;
  if (unread > 0) parts.push(`${unread} statement${unread === 1 ? '' : 's'} not recognised`);
  return {
    status: 'partial',
    method: r.method,
    reason: parts.join('; ') + unavailable,
    resolution: 'syntax',
  };
}

const refData = (refs: SqlRef[] | undefined) =>
  (refs ?? []).slice(0, 50).map((r) => `${r.schema ? `${r.schema}.` : ''}${r.name}`);

/** Adds a file's objects (not its tables) to the graph. */
export function addSqlObjects(
  graph: GraphBuilder,
  path: string,
  language: string,
  module: string,
  r: SqlResult,
): SqlFileResult {
  const keys: (string | undefined)[] = [];
  const parentKey = new Map<string, string>();
  for (const o of r.objects) {
    const symbolKind = SYMBOL_KIND[o.kind];
    if (!symbolKind || !o.name) {
      keys.push(undefined);
      continue;
    }
    const key = sqlObjectKey(path, o);
    keys.push(key);
    if (
      o.kind === 'package' ||
      o.kind === 'package-body' ||
      o.kind === 'type' ||
      o.kind === 'type-body'
    )
      parentKey.set(o.name.toLowerCase(), key);
    const prev = graph.get({ kind: 'symbol', key });
    graph.addNode({
      kind: 'symbol',
      key,
      name: o.parent ? `${o.parent}.${o.name}` : o.name,
      filePath: path,
      module,
      symbolKind,
      exported: true,
      startLine: o.line,
      endLine: o.endLine,
      data: {
        extraction: 'sql',
        language,
        dialect: DIALECT_LABEL[r.dialect],
        parser: r.method,
        declKind: o.kind,
        ...(o.schema ? { schema: o.schema } : {}),
        ...(o.signature ? { signature: o.signature } : {}),
        ...(o.params
          ? {
              params: o.params.map((p) => ({
                name: p.name,
                type: p.type,
                optional: p.default !== undefined,
                mode: p.mode,
                ...(p.default !== undefined ? { default: p.default } : {}),
              })),
            }
          : {}),
        ...(o.returns ? { returns: o.returns, returnsDeclared: true } : {}),
        ...(o.language ? { routineLanguage: o.language } : {}),
        ...(o.columns
          ? {
              columns: o.columns.map((c) => ({
                name: c.name,
                type: c.type ?? '',
                nullable: c.nullable ?? true,
                ...(c.line ? { line: c.line } : {}),
                ...(c.comment ? { comment: c.comment } : {}),
              })),
            }
          : {}),
        ...(o.values ? { values: o.values } : {}),
        ...(o.table ? { table: o.table } : {}),
        ...(o.timing ? { timing: o.timing } : {}),
        ...(o.events ? { events: o.events } : {}),
        ...(o.forEach ? { forEach: o.forEach } : {}),
        ...(o.executes ? { executes: o.executes } : {}),
        ...(o.indexColumns ? { indexColumns: o.indexColumns } : {}),
        ...(o.unique ? { unique: true } : {}),
        ...(o.method ? { method: o.method } : {}),
        ...(o.options ? { options: o.options } : {}),
        ...(o.ownedBy ? { ownedBy: o.ownedBy } : {}),
        ...(o.comment ? { doc: o.comment } : {}),
        ...(o.dynamicSql ? { dynamicSql: o.dynamicSql } : {}),
        ...(o.reads ? { reads: refData(o.reads) } : {}),
        ...(o.writes ? { writes: refData(o.writes) } : {}),
        // Overloads (same name, other parameters) share a node; the count says so.
        ...(prev &&
        o.kind !== 'package-body' &&
        o.kind !== 'type-body' &&
        (o.kind === 'function' || o.kind === 'procedure') &&
        !o.parent
          ? { overloads: Number(prev.data?.overloads ?? 1) + 1 }
          : {}),
      },
    });
    const container = o.parent ? parentKey.get(o.parent.toLowerCase()) : undefined;
    graph.addEdge({
      kind: 'contains',
      src: container ? { kind: 'symbol', key: container } : { kind: 'file', key: path },
      dst: { kind: 'symbol', key },
      confidence: 'observed',
      evidencePath: path,
      evidenceLine: o.line,
    });
  }
  return { path, result: r, keys };
}

export interface SqlLinkStats {
  tables: { observed: number; inferred: number; unresolved: number };
  calls: { observed: number; inferred: number; unresolved: number };
}

/**
 * Links every object's references once all schemas are in the graph: reads and writes to
 * tables and views, calls to functions and procedures, triggers and indexes to their tables.
 */
export function linkSqlObjects(graph: GraphBuilder, files: SqlFileResult[]): SqlLinkStats {
  const stats: SqlLinkStats = {
    tables: { observed: 0, inferred: 0, unresolved: 0 },
    calls: { observed: 0, inferred: 0, unresolved: 0 },
  };
  // Views and routines by lower-case name, across the repository.
  const views = new Map<string, NodeRef[]>();
  const routines = new Map<string, { ref: NodeRef; path: string; parent?: string }[]>();
  for (const f of files)
    f.result.objects.forEach((o, i) => {
      const key = f.keys[i];
      if (!key) return;
      const ref: NodeRef = { kind: 'symbol', key };
      const n = o.name.toLowerCase();
      if (o.kind === 'view' || o.kind === 'materialized-view')
        views.set(n, [...(views.get(n) ?? []), ref]);
      if (o.kind === 'function' || o.kind === 'procedure') {
        const list = routines.get(n) ?? [];
        if (!list.some((x) => x.ref.key === key))
          list.push({ ref, path: f.path, parent: o.parent?.toLowerCase() });
        routines.set(n, list);
      }
    });
  const relation = (name: string): { ref: NodeRef; what: string } | undefined => {
    const t: NodeRef = { kind: 'table', key: `table:${tableKey(name)}` };
    if (graph.has(t)) return { ref: t, what: 'table' };
    const v = views.get(name.toLowerCase());
    if (v?.length === 1) return { ref: v[0]!, what: 'view' };
    return undefined;
  };

  for (const f of files) {
    const viaParser = f.result.mode === 'parser';
    f.result.objects.forEach((o, i) => {
      const key = f.keys[i];
      if (!key) return;
      const src: NodeRef = { kind: 'symbol', key };
      const unresolvedReads: string[] = [];
      const unresolvedCalls: string[] = [];
      const linkRel = (refs: SqlRef[] | undefined, kind: 'reads_table' | 'writes_table') => {
        for (const r of refs ?? []) {
          const hit = relation(r.name);
          if (!hit) {
            stats.tables.unresolved++;
            if (unresolvedReads.length < 20 && !unresolvedReads.includes(r.name))
              unresolvedReads.push(r.name);
            continue;
          }
          const confidence = viaParser ? 'observed' : 'inferred';
          stats.tables[confidence]++;
          graph.addEdge({
            kind,
            src,
            dst: hit.ref,
            confidence,
            evidencePath: f.path,
            evidenceLine: r.line,
            detail: `${kind === 'reads_table' ? 'reads' : 'writes'} ${hit.what} ${r.schema ? `${r.schema}.` : ''}${r.name}${viaParser ? '' : ' (read by the statement reader)'}`,
          });
        }
      };
      linkRel(o.reads, 'reads_table');
      linkRel(o.writes, 'writes_table');
      for (const c of o.calls ?? []) {
        const all = routines.get(c.name.toLowerCase()) ?? [];
        // A package-qualified call (pkg.proc) selects that package's member.
        const qual = c.schema?.toLowerCase();
        const members = qual ? all.filter((x) => x.parent === qual) : [];
        const cands = members.length ? members : all;
        // Prefer the same file (a body and its specification share the name).
        const local = cands.filter((x) => x.path === f.path);
        const pick = local.length === 1 ? local : cands;
        if (pick.length !== 1 || pick[0]!.ref.key === key) {
          if (pick.length === 0 && c.explicit) {
            stats.calls.unresolved++;
            if (unresolvedCalls.length < 20 && !unresolvedCalls.includes(c.name))
              unresolvedCalls.push(c.name);
          } else if (pick.length > 1) {
            stats.calls.unresolved++;
            if (unresolvedCalls.length < 20)
              unresolvedCalls.push(`${c.name} (${pick.length} candidates)`);
          }
          continue;
        }
        const same = pick[0]!.path === f.path;
        const confidence = same && viaParser ? 'observed' : 'inferred';
        stats.calls[confidence]++;
        graph.addEdge({
          kind: 'calls',
          src,
          dst: pick[0]!.ref,
          confidence,
          evidencePath: f.path,
          evidenceLine: c.line,
          detail: `${c.schema ? `${c.schema}.` : ''}${c.name}: ${o.kind === 'trigger' && o.executes === c.name ? 'the function the trigger runs' : 'called in the body'}${same ? '' : `, matched by name in ${pick[0]!.path}`}`,
        });
      }
      // Triggers, indexes, policies, rules and sequences belong to a table.
      if (o.table) {
        const hit = relation(o.table);
        const kind =
          o.kind === 'trigger' ? 'fires_on' : o.kind === 'index' ? 'indexes' : 'references';
        if (hit)
          graph.addEdge({
            kind,
            src,
            dst: hit.ref,
            confidence: 'observed',
            evidencePath: f.path,
            evidenceLine: o.line,
            detail:
              o.kind === 'trigger'
                ? `${o.timing ?? ''} ${(o.events ?? []).join(' OR ')} ON ${o.table}`.trim()
                : o.kind === 'index'
                  ? `${o.unique ? 'unique ' : ''}index on ${o.table} (${(o.indexColumns ?? []).join(', ')})`
                  : o.kind === 'sequence'
                    ? `owned by ${o.ownedBy ?? o.table}`
                    : `${o.kind} on ${o.table}`,
          });
        else if (unresolvedReads.length < 20 && !unresolvedReads.includes(o.table))
          unresolvedReads.push(o.table);
      }
      if (unresolvedReads.length || unresolvedCalls.length)
        graph.mergeData(src, {
          ...(unresolvedReads.length ? { unresolvedReads } : {}),
          ...(unresolvedCalls.length ? { unresolvedCalls } : {}),
        });
    });
  }
  return stats;
}
