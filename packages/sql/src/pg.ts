/**
 * PostgreSQL through PostgreSQL's own parser (libpg-query: the server's parser compiled to
 * WebAssembly), including PL/pgSQL function bodies through the server's PL/pgSQL compiler
 * front end. Everything here is read from the parse tree, not from patterns.
 *
 * libpg-query positions are byte offsets into the UTF-8 text; `Bytes` converts them.
 */
import { loadModule, parsePlPgSQLSync, parseSync } from 'libpg-query';
import { dedupe } from './refs';
import type { ParamMode, SqlColumn, SqlComment, SqlObject, SqlParam, SqlRef } from './types';

export const PG_PARSER = 'libpg-query 18.2.2 (PostgreSQL 18 parser)';

let loaded: Promise<void> | undefined;
let ready = false;
export function initPg(): Promise<void> {
  loaded ??= loadModule().then(() => {
    ready = true;
  });
  return loaded;
}
export const pgReady = () => ready;

/* eslint-disable @typescript-eslint/no-explicit-any -- the parse tree is a tagged union of
   several hundred node types (typed in @pgsql/types); the walker reads it generically. */
type Node = any;

/** Byte offsets ↔ characters and lines of one text. */
export class Bytes {
  readonly buf: Buffer;
  private readonly nl: number[] = [];
  constructor(readonly text: string) {
    this.buf = Buffer.from(text, 'utf8');
    for (let i = 0; i < this.buf.length; i++) if (this.buf[i] === 10) this.nl.push(i);
  }
  /** 1-based line of a byte offset. */
  line(off: number): number {
    let lo = 0;
    let hi = this.nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nl[mid]! < off) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }
  slice(a: number, b?: number): string {
    return this.buf.subarray(a, b).toString('utf8');
  }
}

const str = (n: Node): string | undefined => n?.String?.sval;
const names = (list: Node[] | undefined): string[] =>
  (list ?? []).map(str).filter((x): x is string => !!x);

/** A type name as it reads: `varchar(255)`, `int4[]`, `public.mood`, `setof users`. */
export function typeName(t: Node): string {
  if (!t) return '';
  const parts = names(t.names).filter((p) => p !== 'pg_catalog');
  let s = parts.join('.');
  const mods = (t.typmods ?? [])
    .map(
      (m: Node) =>
        m?.A_Const?.ival?.ival ?? m?.A_Const?.ival ?? m?.ColumnRef?.fields?.map(str).join('.'),
    )
    .filter((x: unknown) => x !== undefined && typeof x !== 'object');
  if (mods.length) s += `(${mods.join(', ')})`;
  if (t.arrayBounds?.length) s += '[]'.repeat(t.arrayBounds.length);
  if (t.setof) s = `setof ${s}`;
  if (t.pct_type) s += '%TYPE';
  return s;
}

const MODE: Record<string, ParamMode> = {
  FUNC_PARAM_IN: 'in',
  FUNC_PARAM_DEFAULT: 'in',
  FUNC_PARAM_OUT: 'out',
  FUNC_PARAM_INOUT: 'inout',
  FUNC_PARAM_VARIADIC: 'variadic',
  FUNC_PARAM_TABLE: 'table',
};

/** A small expression printer for defaults and index expressions. */
function expr(n: Node): string {
  if (!n || typeof n !== 'object') return '';
  if (n.A_Const) {
    const c = n.A_Const;
    if (c.isnull) return 'NULL';
    if (c.sval) return `'${c.sval.sval ?? ''}'`;
    if (c.ival) return String(c.ival.ival ?? 0);
    if (c.fval) return c.fval.fval;
    if (c.boolval) return String(c.boolval.boolval ?? false);
    return '';
  }
  if (n.ColumnRef)
    return (n.ColumnRef.fields ?? []).map((f: Node) => (f.A_Star ? '*' : str(f))).join('.');
  if (n.FuncCall)
    return `${names(n.FuncCall.funcname)
      .filter((p) => p !== 'pg_catalog')
      .join('.')}(${n.FuncCall.agg_star ? '*' : (n.FuncCall.args ?? []).map(expr).join(', ')})`;
  if (n.TypeCast) return `${expr(n.TypeCast.arg)}::${typeName(n.TypeCast.typeName)}`;
  if (n.SQLValueFunction)
    return String(n.SQLValueFunction.op ?? '')
      .replace(/^SVFOP_/, '')
      .toLowerCase();
  if (n.A_Expr) {
    const op = names(n.A_Expr.name).join('');
    return `${expr(n.A_Expr.lexpr)} ${op} ${expr(n.A_Expr.rexpr)}`.trim();
  }
  if (n.ParamRef) return `$${n.ParamRef.number}`;
  return '…';
}

interface Collected {
  reads: SqlRef[];
  writes: SqlRef[];
  calls: SqlRef[];
}

/** Relations read and written and functions called anywhere under `root`. */
function collect(
  root: Node,
  at: (byteOff: number) => number,
  out: Collected,
  ctes = new Set<string>(),
): void {
  const writeTargets = new Set<Node>();
  const visit = (n: Node) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x);
      return;
    }
    const wc = n.withClause?.WithClause ?? n.withClause;
    if (wc?.ctes)
      for (const c of wc.ctes)
        if (c.CommonTableExpr?.ctename) ctes.add(c.CommonTableExpr.ctename.toLowerCase());
    for (const k of ['InsertStmt', 'UpdateStmt', 'DeleteStmt', 'MergeStmt']) {
      const s = n[k];
      if (s?.relation) {
        writeTargets.add(s.relation);
        const r = s.relation;
        out.writes.push(ref(r.relname, r.schemaname, at(r.location ?? 0)));
      }
    }
    if (n.TruncateStmt)
      for (const rel of n.TruncateStmt.relations ?? []) {
        const r = rel.RangeVar;
        if (r) {
          writeTargets.add(r);
          out.writes.push(ref(r.relname, r.schemaname, at(r.location ?? 0)));
        }
      }
    if (n.RangeVar && !writeTargets.has(n.RangeVar)) {
      const r = n.RangeVar;
      if (!(r.schemaname === undefined && ctes.has(String(r.relname).toLowerCase())))
        out.reads.push(ref(r.relname, r.schemaname, at(r.location ?? 0)));
    }
    if (n.FuncCall) {
      const parts = names(n.FuncCall.funcname);
      if (parts.length && parts[0] !== 'pg_catalog')
        out.calls.push(
          ref(
            parts[parts.length - 1]!,
            parts.length > 1 ? parts[parts.length - 2] : undefined,
            at(n.FuncCall.location ?? 0),
          ),
        );
    }
    if (n.CallStmt?.funccall?.funcname) {
      const f = n.CallStmt.funccall;
      const parts = names(f.funcname);
      out.calls.push({
        ...ref(
          parts[parts.length - 1]!,
          parts.length > 1 ? parts[parts.length - 2] : undefined,
          at(f.location ?? 0),
        ),
        explicit: true,
      });
      for (const a of f.args ?? []) visit(a);
      return;
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v);
  };
  visit(root);
}

function ref(name: string, schema: string | undefined, line: number, explicit?: boolean): SqlRef {
  return { name, ...(schema ? { schema } : {}), line, ...(explicit ? { explicit } : {}) };
}

function setRefs(o: SqlObject, c: Collected, dynamic: number[] = []) {
  const reads = dedupe(c.reads);
  const writes = dedupe(c.writes);
  // A function called through CALL/PERFORM appears once, explicitly.
  const calls = dedupe(c.calls.sort((a, b) => Number(!!b.explicit) - Number(!!a.explicit)));
  if (reads.length) o.reads = reads;
  if (writes.length) o.writes = writes;
  if (calls.length) o.calls = calls;
  if (dynamic.length) o.dynamicSql = [...new Set(dynamic)];
}

/** Parses SQL text; returns the tree or the error with its line (relative to `text`). */
export function tryParse(text: string): { tree: Node } | { error: string; line: number } {
  try {
    return { tree: parseSync(text) };
  } catch (e) {
    const err = e as Error & { sqlDetails?: { cursorPosition?: number } };
    const pos = err.sqlDetails?.cursorPosition;
    const line = pos !== undefined ? new Bytes(text).line(Math.max(0, pos - 1)) : 1;
    return { error: err.message, line };
  }
}

/**
 * PL/pgSQL body references. `stmtText` is the whole CREATE FUNCTION statement; `bodyLine` the
 * file line where the body string starts (PL/pgSQL line 1).
 */
function plpgsql(
  stmtText: string,
  bodyLine: number,
): { c: Collected; dynamic: number[] } | { error: string } {
  let tree: Node;
  try {
    tree = parsePlPgSQLSync(stmtText);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const c: Collected = { reads: [], writes: [], calls: [] };
  const dynamic: number[] = [];
  const walk = (n: Node, lineno: number, explicit = false) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const x of n) walk(x, lineno, explicit);
      return;
    }
    const here = typeof n.lineno === 'number' ? n.lineno : lineno;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'PLpgSQL_stmt_dynexecute' || k === 'PLpgSQL_stmt_dynfors')
        dynamic.push(bodyLine + ((v as Node).lineno ?? here) - 1);
      if (k === 'PLpgSQL_stmt_open' && (v as Node).dynquery)
        dynamic.push(bodyLine + ((v as Node).lineno ?? here) - 1);
      if (k === 'PLpgSQL_expr') {
        const q: string = (v as Node).query ?? '';
        const mode: number = (v as Node).parseMode ?? 0;
        const line = bodyLine + here - 1;
        let sql = q;
        if (mode >= 3) {
          // Assignment target := expression
          const m = /^[\s\S]*?:=([\s\S]*)$/.exec(q) ?? /^[^=]*=([\s\S]*)$/.exec(q);
          sql = `SELECT ${m ? m[1] : q}`;
        } else if (mode !== 0) sql = `SELECT ${q}`;
        const parsed = tryParse(sql);
        if ('tree' in parsed) {
          const sub: Collected = { reads: [], writes: [], calls: [] };
          collect(parsed.tree, () => line, sub);
          c.reads.push(...sub.reads);
          c.writes.push(...sub.writes);
          c.calls.push(...sub.calls.map((x) => (explicit ? { ...x, explicit: true } : x)));
        }
        continue;
      }
      // PERFORM f() and CALL p() are call statements in PL/pgSQL.
      if (v && typeof v === 'object')
        walk(v, here, explicit || k === 'PLpgSQL_stmt_perform' || k === 'PLpgSQL_stmt_call');
    }
  };
  walk(tree, 1);
  return { c, dynamic };
}

/** Line in `file` where the quoted body after `asByte` starts. */
function bodyStartLine(b: Bytes, fromByte: number, stmtLine: number): number {
  const rest = b.slice(fromByte);
  const m = /\$[A-Za-z_0-9]*\$|'/.exec(rest);
  if (!m) return stmtLine;
  const prefix = Buffer.byteLength(rest.slice(0, m.index), 'utf8');
  return b.line(fromByte + prefix);
}

const TRIGGER_TIMING = (t: number) => (t & 64 ? 'INSTEAD OF' : t & 2 ? 'BEFORE' : 'AFTER');
function triggerEvents(ev: number, cols: string[]): string[] {
  const out: string[] = [];
  if (ev & 4) out.push('INSERT');
  if (ev & 16) out.push(cols.length ? `UPDATE OF ${cols.join(', ')}` : 'UPDATE');
  if (ev & 8) out.push('DELETE');
  if (ev & 32) out.push('TRUNCATE');
  return out;
}

export interface PgStatement {
  objects: SqlObject[];
  comment?: SqlComment;
  problems: { line: number; message: string }[];
}

/**
 * Objects defined by one parsed statement. `b` is the whole file, `startByte`/`endByte` the
 * statement's bytes in it (statement-relative locations are offset by `baseByte`).
 */
export function pgStatement(
  stmt: Node,
  b: Bytes,
  startByte: number,
  endByte: number,
  baseByte: number,
): PgStatement {
  const [kind] = Object.keys(stmt) as [string];
  const s = stmt[kind];
  const at = (off: number) => b.line(baseByte + off);
  const text = b.slice(startByte, endByte);
  const lead = text.length - text.trimStart().length;
  const line = b.line(startByte + Buffer.byteLength(text.slice(0, lead), 'utf8'));
  const endLine = b.line(Math.max(startByte, endByte - 1));
  const sig = (upTo?: RegExp) => {
    let t = text.trim();
    if (upTo) {
      const m = upTo.exec(t);
      if (m) t = t.slice(0, m.index);
    }
    return t.replace(/\s+/g, ' ').trim().slice(0, 400);
  };
  const base = (k: SqlObject['kind'], name: string, schema?: string): SqlObject => ({
    kind: k,
    name,
    ...(schema ? { schema } : {}),
    line,
    endLine,
  });
  const problems: PgStatement['problems'] = [];
  const objects: SqlObject[] = [];
  const refs = (root: Node) => {
    const c: Collected = { reads: [], writes: [], calls: [] };
    collect(root, at, c);
    return c;
  };

  switch (kind) {
    case 'CreateStmt': {
      const r = s.relation;
      const o = base('table', r.relname, r.schemaname);
      o.columns = (s.tableElts ?? [])
        .filter((e: Node) => e.ColumnDef)
        .map((e: Node): SqlColumn => {
          const c = e.ColumnDef;
          const cons = (c.constraints ?? []).map((x: Node) => x.Constraint);
          const def = cons.find((x: Node) => x?.contype === 'CONSTR_DEFAULT');
          return {
            name: c.colname,
            type: typeName(c.typeName),
            nullable: !cons.some(
              (x: Node) => x?.contype === 'CONSTR_NOTNULL' || x?.contype === 'CONSTR_PRIMARY',
            ),
            ...(cons.some((x: Node) => x?.contype === 'CONSTR_PRIMARY')
              ? { primaryKey: true }
              : {}),
            ...(def ? { default: expr(def.raw_expr) } : {}),
            line: at(c.location ?? 0),
          };
        });
      if (s.partbound || s.inhRelations?.length) {
        const parents = (s.inhRelations ?? []).map((x: Node) => x.RangeVar).filter(Boolean);
        if (parents.length)
          o.reads = parents.map((p: Node) => ref(p.relname, p.schemaname, at(p.location ?? 0)));
      }
      objects.push(o);
      break;
    }
    case 'ViewStmt': {
      const r = s.view;
      const o = base('view', r.relname, r.schemaname);
      o.signature = sig(/\bAS\b/i);
      const aliases = names(s.aliases);
      const sel = s.query?.SelectStmt;
      const targets: Node[] = sel?.targetList ?? [];
      o.columns = aliases.length
        ? aliases.map((name) => ({ name }))
        : targets.map((t: Node) => {
            const rt = t.ResTarget;
            const f = rt?.val?.ColumnRef?.fields;
            const last = f ? (f[f.length - 1]?.A_Star ? '*' : str(f[f.length - 1])) : undefined;
            return { name: rt?.name ?? last ?? expr(rt?.val), line: at(rt?.location ?? 0) };
          });
      setRefs(o, refs(s.query));
      objects.push(o);
      break;
    }
    case 'CreateTableAsStmt': {
      const r = s.into?.rel;
      const mat = s.objtype === 'OBJECT_MATVIEW';
      const o = base(mat ? 'materialized-view' : 'table', r?.relname ?? '', r?.schemaname);
      if (mat) {
        o.signature = sig(/\bAS\b/i);
        const targets: Node[] = s.query?.SelectStmt?.targetList ?? [];
        o.columns = targets.map((t: Node) => {
          const rt = t.ResTarget;
          const f = rt?.val?.ColumnRef?.fields;
          return {
            name: rt?.name ?? (f ? str(f[f.length - 1]) : undefined) ?? expr(rt?.val),
            line: at(rt?.location ?? 0),
          };
        });
      }
      setRefs(o, refs(s.query));
      objects.push(o);
      break;
    }
    case 'CreateFunctionStmt': {
      const fn = names(s.funcname);
      const o = base(
        s.is_procedure ? 'procedure' : 'function',
        fn[fn.length - 1]!,
        fn.length > 1 ? fn[fn.length - 2] : undefined,
      );
      const params: SqlParam[] = [];
      const tableCols: string[] = [];
      for (const p of s.parameters ?? []) {
        const fp = p.FunctionParameter;
        const mode = MODE[fp.mode] ?? 'in';
        const type = typeName(fp.argType);
        if (mode === 'table') {
          tableCols.push(`${fp.name ?? ''} ${type}`.trim());
          continue;
        }
        params.push({
          name: fp.name ?? '',
          type,
          mode,
          ...(fp.defexpr ? { default: expr(fp.defexpr) } : {}),
        });
      }
      o.params = params;
      if (tableCols.length) o.returns = `TABLE(${tableCols.join(', ')})`;
      else if (s.returnType) o.returns = typeName(s.returnType);
      const opts: Record<string, Node> = {};
      for (const d of s.options ?? []) if (d.DefElem) opts[d.DefElem.defname] = d.DefElem;
      const lang = str(opts.language?.arg)?.toLowerCase();
      if (lang) o.language = lang;
      o.signature = sig(/\b(AS|LANGUAGE|BEGIN\s+ATOMIC|RETURN\s)/i);
      const asItems = opts.as?.arg?.List?.items;
      const body = asItems?.length === 1 ? str(asItems[0]) : undefined;
      if (s.sql_body) setRefs(o, refs(s.sql_body));
      else if (body !== undefined && lang === 'plpgsql') {
        const bodyLine = bodyStartLine(b, baseByte + (opts.as.location ?? 0), line);
        const r = plpgsql(text, bodyLine);
        if ('error' in r)
          problems.push({ line: bodyLine, message: `PL/pgSQL body of ${o.name}: ${r.error}` });
        else setRefs(o, r.c, r.dynamic);
      } else if (body !== undefined && lang === 'sql') {
        const bodyLine = bodyStartLine(b, baseByte + (opts.as.location ?? 0), line);
        const parsed = tryParse(body);
        if ('tree' in parsed) {
          const bb = new Bytes(body);
          const c: Collected = { reads: [], writes: [], calls: [] };
          collect(parsed.tree, (off) => bodyLine + bb.line(off) - 1, c);
          setRefs(o, c);
        } else
          problems.push({
            line: bodyLine + parsed.line - 1,
            message: `SQL body of ${o.name}: ${parsed.error}`,
          });
      }
      // Other languages (C, Python, JavaScript…) run outside SQL: their bodies are not read.
      objects.push(o);
      break;
    }
    case 'CreateTrigStmt': {
      const o = base('trigger', s.trigname);
      o.table = s.relation?.relname;
      o.timing = TRIGGER_TIMING(s.timing ?? 0);
      o.events = triggerEvents(s.events ?? 0, names(s.columns));
      o.forEach = s.row ? 'row' : 'statement';
      const fn = names(s.funcname);
      if (fn.length) {
        o.executes = fn[fn.length - 1];
        o.calls = [
          {
            name: o.executes!,
            ...(fn.length > 1 ? { schema: fn[fn.length - 2] } : {}),
            line: endLine,
            explicit: true,
          },
        ];
      }
      if (s.whenClause) {
        const c = refs(s.whenClause);
        if (c.calls.length) o.calls = [...(o.calls ?? []), ...dedupe(c.calls)];
      }
      o.signature = sig(/\bEXECUTE\b/i);
      objects.push(o);
      break;
    }
    case 'CreateEventTrigStmt': {
      const o = base('trigger', s.trigname);
      o.timing = s.eventname;
      const fn = names(s.funcname);
      if (fn.length) {
        o.executes = fn[fn.length - 1];
        o.calls = [{ name: o.executes!, line: endLine, explicit: true }];
      }
      o.signature = sig(/\bEXECUTE\b/i);
      objects.push(o);
      break;
    }
    case 'IndexStmt': {
      const cols = (s.indexParams ?? []).map((p: Node) => {
        const e = p.IndexElem;
        return e?.name ?? (e?.expr ? expr(e.expr) : '');
      });
      const table = s.relation?.relname;
      const o = base('index', s.idxname ?? `${table}(${cols.join(', ')})`, s.relation?.schemaname);
      o.table = table;
      o.indexColumns = cols;
      if (s.unique) o.unique = true;
      if (s.accessMethod) o.method = s.accessMethod;
      o.signature = sig();
      objects.push(o);
      break;
    }
    case 'CreateSeqStmt': {
      const r = s.sequence;
      const o = base('sequence', r.relname, r.schemaname);
      const opts: Record<string, string> = {};
      for (const d of s.options ?? []) {
        const e = d.DefElem;
        if (!e) continue;
        if (e.defname === 'owned_by') {
          const parts = names(e.arg?.List?.items);
          if (parts.length >= 2) {
            o.ownedBy = parts.slice(-2).join('.');
            o.table = parts[parts.length - 2];
          }
          continue;
        }
        const v =
          e.arg?.Integer?.ival ??
          e.arg?.Float?.fval ??
          (e.arg?.TypeName
            ? typeName(e.arg.TypeName)
            : (e.arg?.Boolean?.boolval ?? (e.arg === undefined ? 'yes' : undefined)));
        opts[e.defname === 'as' ? 'as' : e.defname] = String(v ?? '');
      }
      if (Object.keys(opts).length) o.options = opts;
      objects.push(o);
      break;
    }
    case 'CreateEnumStmt': {
      const n = names(s.typeName);
      const o = base('type', n[n.length - 1]!, n.length > 1 ? n[n.length - 2] : undefined);
      o.values = names(s.vals);
      objects.push(o);
      break;
    }
    case 'CompositeTypeStmt': {
      const r = s.typevar;
      const o = base('type', r.relname, r.schemaname);
      o.columns = (s.coldeflist ?? []).map((c: Node) => ({
        name: c.ColumnDef.colname,
        type: typeName(c.ColumnDef.typeName),
        line: at(c.ColumnDef.location ?? 0),
      }));
      objects.push(o);
      break;
    }
    case 'CreateRangeStmt': {
      const n = names(s.typeName);
      objects.push(base('type', n[n.length - 1]!, n.length > 1 ? n[n.length - 2] : undefined));
      break;
    }
    case 'CreateDomainStmt': {
      const n = names(s.domainname);
      const o = base('domain', n[n.length - 1]!, n.length > 1 ? n[n.length - 2] : undefined);
      o.returns = typeName(s.typeName);
      objects.push(o);
      break;
    }
    case 'DefineStmt': {
      if (s.kind !== 'OBJECT_AGGREGATE') break;
      // CREATE AGGREGATE: a function whose steps are other functions.
      const n = names(s.defnames);
      const o = base('function', n[n.length - 1]!, n.length > 1 ? n[n.length - 2] : undefined);
      o.language = 'aggregate';
      const args: Node[] = s.args?.[0]?.List?.items ?? [];
      o.params = args.map((a: Node) => ({
        name: a.FunctionParameter?.name ?? '',
        type: typeName(a.FunctionParameter?.argType),
        mode: 'in' as const,
      }));
      const calls: SqlRef[] = [];
      for (const d of s.definition ?? []) {
        const e = d.DefElem;
        if (e?.defname === 'stype') o.returns = typeName(e.arg?.TypeName);
        if (
          /^(sfunc|finalfunc|combinefunc|serialfunc|deserialfunc|msfunc|minvfunc|mfinalfunc)$/.test(
            e?.defname ?? '',
          )
        ) {
          const fn = names(e.arg?.TypeName?.names ?? e.arg?.List?.items);
          if (fn.length)
            calls.push({
              name: fn[fn.length - 1]!,
              ...(fn.length > 1 ? { schema: fn[fn.length - 2] } : {}),
              line: at(e.location ?? 0),
              explicit: true,
            });
        }
      }
      if (calls.length) o.calls = calls;
      o.signature = sig(/\(\s*SFUNC\b/i);
      objects.push(o);
      break;
    }
    case 'CreateSchemaStmt':
      objects.push(base('schema', s.schemaname ?? ''));
      for (const e of s.schemaElts ?? []) {
        const sub = pgStatement(e, b, startByte, endByte, baseByte);
        objects.push(...sub.objects);
        problems.push(...sub.problems);
      }
      break;
    case 'CreateExtensionStmt':
      objects.push(base('extension', s.extname));
      break;
    case 'CreatePolicyStmt': {
      const o = base('policy', s.policy_name);
      o.table = s.table?.relname;
      if (s.cmd_name) o.events = [String(s.cmd_name).toUpperCase()];
      const c: Collected = { reads: [], writes: [], calls: [] };
      collect(s.qual, at, c);
      collect(s.with_check, at, c);
      setRefs(o, c);
      o.signature = sig();
      objects.push(o);
      break;
    }
    case 'RuleStmt': {
      const o = base('rule', s.rulename);
      o.table = s.relation?.relname;
      o.events = [String(s.event ?? '').replace(/^CMD_/, '')];
      setRefs(o, refs(s.actions));
      objects.push(o);
      break;
    }
    case 'CommentStmt': {
      const on = String(s.objtype ?? '')
        .replace(/^OBJECT_/, '')
        .toLowerCase();
      const items: Node[] = s.object?.List?.items ?? [];
      const parts = names(items);
      let name = parts[parts.length - 1] ?? '';
      let column: string | undefined;
      if (on === 'column') {
        column = parts[parts.length - 1];
        name = parts[parts.length - 2] ?? '';
      }
      // Functions: COMMENT ON FUNCTION f(int) carries an ObjectWithArgs.
      const owa = s.object?.ObjectWithArgs;
      if (owa) name = names(owa.objname).pop() ?? name;
      const typeNames = s.object?.TypeName ? names(s.object.TypeName.names) : [];
      if (typeNames.length) name = typeNames[typeNames.length - 1]!;
      if (name && s.comment !== undefined)
        return {
          objects,
          problems,
          comment: {
            on: on === 'matview' ? 'view' : on,
            name,
            ...(column ? { column } : {}),
            text: s.comment ?? '',
            line,
          },
        };
      break;
    }
    default:
      break;
  }
  return { objects, problems };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
