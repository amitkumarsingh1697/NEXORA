/**
 * The statement reader: definitions of database objects in dialects that have no bundled
 * grammar (MySQL/MariaDB, SQL Server, Oracle, Db2, SQLite), read from tokens. It reads the
 * header of each definition exactly (name, parameters with modes, types and defaults, return
 * type, trigger timing and events, index columns, sequence options) and the body with
 * `bodyRefs`. A statement it cannot read is reported with its line, never guessed.
 */
import { stringValue, tokenize, type Tok } from './lex';
import { bodyRefs, readName } from './refs';
import { createdKind, type Statement } from './split';
import type {
  Dialect,
  ParamMode,
  SqlColumn,
  SqlComment,
  SqlObject,
  SqlObjectKind,
  SqlParam,
} from './types';

/** Statements that define nothing but are valid SQL the reader recognises. */
const KNOWN_VERBS = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'WITH',
  'VALUES',
  'TABLE',
  'REPLACE',
  'UPSERT',
  'GRANT',
  'REVOKE',
  'DENY',
  'SET',
  'RESET',
  'USE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'RENAME',
  'COMMIT',
  'ROLLBACK',
  'BEGIN',
  'START',
  'END',
  'SAVEPOINT',
  'RELEASE',
  'DECLARE',
  'PRINT',
  'IF',
  'WHILE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'DO',
  'ANALYZE',
  'ANALYSE',
  'VACUUM',
  'PRAGMA',
  'COPY',
  'REINDEX',
  'CLUSTER',
  'LOCK',
  'UNLOCK',
  'SHOW',
  'EXPLAIN',
  'DESCRIBE',
  'DESC',
  'LOAD',
  'CHECKPOINT',
  'DBCC',
  'RAISERROR',
  'THROW',
  'COMMENT',
  'PREPARE',
  'DEALLOCATE',
  'NOTIFY',
  'LISTEN',
  'UNLISTEN',
  'REFRESH',
  'SECURITY',
  'ATTACH',
  'DETACH',
  'OPTIMIZE',
  'FLUSH',
  'KILL',
  'SPOOL',
  'PROMPT',
  'WHENEVER',
  'CONNECT',
  'DISCONNECT',
  'EXIT',
  'QUIT',
  'DEFINE',
  'UNDEFINE',
  'VARIABLE',
  'COLUMN',
  'REM',
  'REMARK',
  'SOURCE',
  'BACKUP',
  'RESTORE',
  'BULK',
  'OPEN',
  'CLOSE',
  'FETCH',
  'MOVE',
  'RETURN',
  'GOTO',
  'WAITFOR',
  'REVERT',
  'NULL',
  'AUDIT',
  'NOAUDIT',
  'PURGE',
  'FLASHBACK',
  'ASSOCIATE',
  'DISASSOCIATE',
  'IMPORT',
  'EXPORT',
  'REORG',
  'RUNSTATS',
  'HANDLER',
  'CACHE',
  'CHECK',
  'CHECKSUM',
  'REPAIR',
  'INSTALL',
  'UNINSTALL',
  'SIGNAL',
  'RESIGNAL',
  'GET',
  'ABORT',
  'DISCARD',
  'IMPORT',
  'SUMMARIZE',
  'MSCK',
  'LOAD',
  'INSERT',
  'RAISE',
]);

const KIND_OF: Record<string, SqlObjectKind> = {
  TABLE: 'table',
  VIEW: 'view',
  PROCEDURE: 'procedure',
  PROC: 'procedure',
  FUNCTION: 'function',
  TRIGGER: 'trigger',
  INDEX: 'index',
  SEQUENCE: 'sequence',
  TYPE: 'type',
  DOMAIN: 'domain',
  PACKAGE: 'package',
  SCHEMA: 'schema',
  DATABASE: 'schema',
  EXTENSION: 'extension',
  POLICY: 'policy',
  RULE: 'rule',
  SYNONYM: 'synonym',
  EVENT: 'event',
};

/** Characteristics that end a RETURNS clause or a parameter list's header. */
const HEADER_STOP = new Set([
  'AS',
  'IS',
  'LANGUAGE',
  'BEGIN',
  'DETERMINISTIC',
  'NOT',
  'READS',
  'MODIFIES',
  'CONTAINS',
  'NO',
  'SQL',
  'COMMENT',
  'WITH',
  'RETURN',
  'PIPELINED',
  'PARALLEL_ENABLE',
  'RESULT_CACHE',
  'AUTHID',
  'CALLED',
  'STRICT',
  'IMMUTABLE',
  'STABLE',
  'VOLATILE',
  'SECURITY',
  'COST',
  'ROWS',
  'EXTERNAL',
  'SPECIFIC',
  'INHERIT',
  'DYNAMIC',
  'NULL',
  'FENCED',
  'THREADSAFE',
  'PARAMETER',
  'SET',
  'DECLARE',
  'ACCESSIBLE',
  'DEFAULT',
  'LEAKPROOF',
  'PARALLEL',
  'SUPPORT',
  'TRANSFORM',
  'WINDOW',
  'OLD',
  'ATOMIC',
  'NEW',
  'INLINE',
  'MODIFIES',
  'RETURNS',
  'NATIVE',
  'COLLATE',
  'BEFORE',
  'AFTER',
]);

export interface ReadStatement {
  understood: boolean;
  objects: SqlObject[];
  comment?: SqlComment;
  problem?: string;
}

/** The source text of tokens a..b on one line, capped. */
function textOf(src: string, toks: Tok[], a: number, b: number, cap = 400): string {
  if (a > b || !toks[a] || !toks[b]) return '';
  return src.slice(toks[a]!.start, toks[b]!.end).replace(/\s+/g, ' ').trim().slice(0, cap);
}

/** Index of the parenthesis matching the one at `i`. */
function closeParen(toks: Tok[], i: number): number {
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (toks[j]!.text === '(' && toks[j]!.kind === 'op') depth++;
    else if (toks[j]!.text === ')' && toks[j]!.kind === 'op' && --depth === 0) return j;
  }
  return toks.length - 1;
}

/** Splits tokens a..b (inclusive) on top-level commas. */
function splitCommas(toks: Tok[], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  let depth = 0;
  let s = a;
  for (let j = a; j <= b; j++) {
    const t = toks[j]!;
    if (t.kind !== 'op') continue;
    if (t.text === '(') depth++;
    else if (t.text === ')') depth--;
    else if (t.text === ',' && depth === 0) {
      if (j > s) out.push([s, j - 1]);
      s = j + 1;
    }
  }
  if (b >= s) out.push([s, b]);
  return out;
}

function parseParam(
  src: string,
  toks: Tok[],
  a: number,
  b: number,
  dialect: Dialect,
): SqlParam | undefined {
  let i = a;
  let mode: ParamMode = 'in';
  const leading = toks[i]?.up;
  if (leading === 'IN' && toks[i + 1]?.up === 'OUT') {
    mode = 'inout';
    i += 2;
  } else if (
    leading === 'IN' ||
    leading === 'OUT' ||
    leading === 'INOUT' ||
    leading === 'VARIADIC'
  ) {
    mode = leading === 'IN' ? 'in' : (leading.toLowerCase() as ParamMode);
    i++;
  }
  const nameTok = toks[i];
  if (!nameTok) return undefined;
  // PostgreSQL allows unnamed parameters: f(int, text).
  const rest = b - i;
  let name = '';
  if (nameTok.kind === 'var' || nameTok.kind === 'ident' || rest >= 1 || dialect !== 'postgresql') {
    name = nameTok.kind === 'var' ? nameTok.text : nameTok.text;
    i++;
  }
  // Oracle: name [IN | OUT | IN OUT] [NOCOPY] type
  if (toks[i]?.up === 'IN' && toks[i + 1]?.up === 'OUT') {
    mode = 'inout';
    i += 2;
  } else if (toks[i]?.up === 'IN') i++;
  else if (toks[i]?.up === 'OUT') {
    mode = 'out';
    i++;
  }
  if (toks[i]?.up === 'NOCOPY') i++;
  if (toks[i]?.up === 'AS' && dialect === 'tsql') i++;
  let typeEnd = i - 1;
  let def: string | undefined;
  for (let j = i; j <= b; j++) {
    const t = toks[j]!;
    if (t.up === 'DEFAULT' || t.text === '=' || t.text === ':=') {
      def = textOf(src, toks, j + 1, b);
      // A trailing OUTPUT after a default (T-SQL) still marks the mode.
      if (/\b(OUTPUT|OUT)\s*$/i.test(def)) {
        mode = 'out';
        def = def.replace(/\s*\b(OUTPUT|OUT)\s*$/i, '');
      }
      if (/\bREADONLY\s*$/i.test(def)) def = def.replace(/\s*\bREADONLY\s*$/i, '');
      break;
    }
    if (t.kind === 'word' && (t.up === 'OUTPUT' || (t.up === 'OUT' && dialect === 'tsql'))) {
      mode = 'out';
      break;
    }
    if (t.kind === 'word' && t.up === 'READONLY') break;
    typeEnd = j;
  }
  const type = textOf(src, toks, i, typeEnd);
  if (!name && !type) return undefined;
  if (!type && dialect === 'postgresql') return { name: '', type: name, mode };
  return { name, type, mode, ...(def ? { default: def } : {}) };
}

interface Header {
  name: string;
  schema?: string;
  /** Index of the first token after the name. */
  after: number;
}

function header(toks: Tok[], at: number): Header | undefined {
  let i = at;
  if (toks[i]?.up === 'IF' && toks[i + 1]?.up === 'NOT' && toks[i + 2]?.up === 'EXISTS') i += 3;
  if (toks[i]?.up === 'CONCURRENTLY') i++;
  const n = readName(toks, i);
  if (!n || !n.parts.length) return undefined;
  const parts = n.parts;
  return {
    name: parts[parts.length - 1]!,
    ...(parts.length > 1 ? { schema: parts[parts.length - 2] } : {}),
    after: n.next,
  };
}

/** Parameters, return type, language and where the body starts, for a routine header. */
function routine(
  src: string,
  toks: Tok[],
  i: number,
  dialect: Dialect,
  kind: 'function' | 'procedure',
) {
  const params: SqlParam[] = [];
  let j = i;
  if (toks[j]?.text === '(') {
    const close = closeParen(toks, j);
    for (const [a, b] of splitCommas(toks, j + 1, close - 1)) {
      const p = parseParam(src, toks, a, b, dialect);
      if (p) params.push(p);
    }
    j = close + 1;
  } else if (dialect === 'tsql' && toks[j]?.kind === 'var') {
    // CREATE PROCEDURE p @a int, @b int OUTPUT [WITH …] AS
    let end = j;
    let depth = 0;
    while (end < toks.length) {
      const t = toks[end]!;
      if (t.text === '(') depth++;
      else if (t.text === ')') depth--;
      else if (depth === 0 && (t.up === 'AS' || t.up === 'WITH' || t.up === 'FOR')) break;
      end++;
    }
    for (const [a, b] of splitCommas(toks, j, end - 1)) {
      const p = parseParam(src, toks, a, b, dialect);
      if (p) params.push(p);
    }
    j = end;
  }
  let returns: string | undefined;
  let language: string | undefined;
  let comment: string | undefined;
  let bodyStart = j;
  for (let k = j; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.kind === 'string' && k > j && toks[k - 1]?.up === 'AS') {
      bodyStart = k;
      break;
    }
    if (
      (t.up === 'RETURNS' || (t.up === 'RETURN' && dialect === 'oracle')) &&
      returns === undefined &&
      kind === 'function'
    ) {
      let e = k + 1;
      // RETURNS @t TABLE (…) and RETURNS TABLE (…)
      if (toks[e]?.kind === 'var') e++;
      if (toks[e]?.up === 'SETOF') e++;
      let last = e;
      for (; last < toks.length; last++) {
        const x = toks[last]!;
        if (x.text === '(') {
          last = closeParen(toks, last);
          continue;
        }
        if (x.kind === 'word' && HEADER_STOP.has(x.up) && last > e) break;
        if (x.text === ';') break;
        if (x.kind === 'string') break;
      }
      returns = textOf(src, toks, k + 1, last - 1);
      k = last - 1;
      continue;
    }
    if (t.up === 'COMMENT' && toks[k + 1]?.kind === 'string') {
      comment = stringValue(toks[k + 1]!);
      k++;
      continue;
    }
    // MySQL labels the body: label: BEGIN … END label
    if (t.kind === 'word' && toks[k + 1]?.text === ':' && toks[k + 2]?.up === 'BEGIN') {
      bodyStart = k;
      break;
    }
    if (t.up === 'LANGUAGE' && toks[k + 1]) {
      language = stringOrWord(toks[k + 1]!).toLowerCase();
      k++;
      continue;
    }
    if (
      t.up === 'AS' ||
      t.up === 'IS' ||
      t.up === 'BEGIN' ||
      (t.up === 'RETURN' && kind === 'function' && returns !== undefined && dialect !== 'oracle')
    ) {
      bodyStart = t.up === 'AS' || t.up === 'IS' ? k + 1 : k;
      break;
    }
    bodyStart = k + 1;
  }
  return { params, returns, language, comment, bodyStart, headerEnd: Math.max(i, bodyStart - 1) };
}

function stringOrWord(t: Tok): string {
  return t.kind === 'string' ? stringValue(t) : t.text;
}

/** The body tokens: inline, or the tokens of a quoted body (PostgreSQL-style AS '…' / $$…$$). */
function bodyTokens(src: string, toks: Tok[], from: number, dialect: Dialect): Tok[] {
  const first = toks[from];
  if (
    first &&
    first.kind === 'string' &&
    (first.text.startsWith('$') || first.text.startsWith("'"))
  ) {
    const inner = stringValue(first);
    const offset = first.text.indexOf(inner);
    const lineBase =
      first.line +
      (src.slice(first.start, first.start + Math.max(0, offset)).match(/\n/g)?.length ?? 0);
    return tokenize(inner, dialect === 'generic' ? 'postgresql' : dialect).map((t) => ({
      ...t,
      line: t.line + lineBase - 1,
    }));
  }
  return toks.slice(from);
}

function withRefs(o: SqlObject, body: Tok[], dialect: Dialect): SqlObject {
  const r = bodyRefs(body, dialect);
  if (r.reads.length) o.reads = r.reads;
  if (r.writes.length) o.writes = r.writes;
  if (r.calls.length) o.calls = r.calls;
  if (r.dynamicSql.length) o.dynamicSql = r.dynamicSql;
  return o;
}

/** Column names of a SELECT list: the alias, or the last part of a column reference. */
function selectColumns(src: string, toks: Tok[], from: number): SqlColumn[] {
  let i = from;
  while (i < toks.length && toks[i]!.up !== 'SELECT') i++;
  if (i >= toks.length) return [];
  i++;
  if (toks[i]?.up === 'DISTINCT' || toks[i]?.up === 'ALL') i++;
  if (toks[i]?.up === 'TOP') i += toks[i + 1]?.text === '(' ? 4 : 2;
  let end = i;
  let depth = 0;
  for (; end < toks.length; end++) {
    const t = toks[end]!;
    if (t.text === '(') depth++;
    else if (t.text === ')') depth--;
    else if (
      depth === 0 &&
      (t.up === 'FROM' || t.up === 'INTO' || t.up === 'WHERE' || t.text === ';' || t.up === 'UNION')
    )
      break;
  }
  const cols: SqlColumn[] = [];
  for (const [a, b] of splitCommas(toks, i, end - 1)) {
    const last = toks[b]!;
    const beforeLast = toks[b - 1];
    let name: string | undefined;
    if (
      beforeLast?.up === 'AS' ||
      (b > a &&
        (last.kind === 'word' || last.kind === 'ident') &&
        beforeLast &&
        beforeLast.kind !== 'op')
    )
      name = last.text;
    else if (b > a + 1 && toks[a + 1]?.text === '=' && isNameTok(toks[a]!))
      name = toks[a]!.text; // T-SQL alias = expr
    else if (last.kind === 'word' || last.kind === 'ident') name = last.text;
    else if (last.text === '*') name = textOf(src, toks, a, b);
    if (name) cols.push({ name, line: toks[a]!.line });
  }
  return cols;
}

const isNameTok = (t: Tok) => t.kind === 'word' || t.kind === 'ident';

function trigger(src: string, toks: Tok[], h: Header, dialect: Dialect, o: SqlObject): number {
  let i = h.after;
  const events: string[] = [];
  let bodyFrom = toks.length;
  for (; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.up === 'REFERENCING') {
      // REFERENCING NEW [ROW] AS n OLD [TABLE] AS o: names for the transition rows.
      while (
        toks[i + 1] &&
        /^(NEW|OLD|NEW_TABLE|OLD_TABLE|ROW|TABLE|AS|PARENT)$/.test(toks[i + 1]!.up)
      ) {
        i += toks[i + 1]!.up === 'AS' ? 2 : 1;
      }
      continue;
    }
    if (t.up === 'BEFORE' || t.up === 'AFTER') o.timing = t.up;
    else if (t.up === 'INSTEAD' && toks[i + 1]?.up === 'OF') {
      o.timing = 'INSTEAD OF';
      i++;
    } else if (t.up === 'FOR' && dialect === 'tsql' && !o.timing && toks[i + 1]?.up !== 'EACH')
      o.timing = 'AFTER';
    else if (t.up === 'INSERT' || t.up === 'UPDATE' || t.up === 'DELETE' || t.up === 'TRUNCATE') {
      let ev = t.up;
      if (t.up === 'UPDATE' && toks[i + 1]?.up === 'OF') {
        const cols: string[] = [];
        let j = i + 2;
        while (
          toks[j] &&
          (toks[j]!.kind === 'word' || toks[j]!.kind === 'ident') &&
          toks[j]!.up !== 'ON' &&
          toks[j]!.up !== 'OR'
        ) {
          cols.push(toks[j]!.text);
          j++;
          if (toks[j]?.text === ',') j++;
          else break;
        }
        ev = `UPDATE OF ${cols.join(', ')}`;
        i = j - 1;
      }
      events.push(ev);
    } else if (t.up === 'ON' && !o.table) {
      const n = readName(toks, i + 1);
      if (n) {
        o.table = n.parts[n.parts.length - 1];
        i = n.next - 1;
      }
    } else if (t.up === 'FOR' && toks[i + 1]?.up === 'EACH') {
      o.forEach = toks[i + 2]?.up === 'ROW' ? 'row' : 'statement';
      i += 2;
    } else if (
      t.up === 'EXECUTE' &&
      (toks[i + 1]?.up === 'FUNCTION' || toks[i + 1]?.up === 'PROCEDURE')
    ) {
      const n = readName(toks, i + 2);
      if (n) o.executes = n.parts[n.parts.length - 1];
      bodyFrom = i;
      break;
    } else if (
      t.up === 'AS' ||
      t.up === 'BEGIN' ||
      t.up === 'DECLARE' ||
      t.up === 'CALL' ||
      t.up === 'SET' ||
      t.up === 'COMPOUND' ||
      (dialect !== 'tsql' &&
        (t.up === 'INSERT' || t.up === 'UPDATE' || t.up === 'DELETE') &&
        o.forEach)
    ) {
      bodyFrom = t.up === 'AS' ? i + 1 : i;
      break;
    } else if (t.up === 'WHEN' && toks[i + 1]?.text === '(') i = closeParen(toks, i + 1);
  }
  if (events.length) o.events = events;
  // SQL Server triggers fire once per statement.
  if (dialect === 'tsql' && !o.forEach) o.forEach = 'statement';
  // SQLite has only row triggers (FOR EACH ROW is optional and implied).
  if (dialect === 'sqlite' && !o.forEach) o.forEach = 'row';
  return bodyFrom;
}

/** Members (procedures and functions) of an Oracle package specification or body. */
function packageMembers(
  src: string,
  toks: Tok[],
  from: number,
  pkg: string,
  dialect: Dialect,
  endLine: number,
): SqlObject[] {
  const out: SqlObject[] = [];
  let depth = 0;
  for (let i = from; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.up === 'BEGIN' || t.up === 'CASE') depth++;
    else if (t.up === 'END') {
      if (!/^(IF|LOOP|WHILE|FOR|REPEAT)$/.test(toks[i + 1]?.up ?? ''))
        depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || (t.up !== 'PROCEDURE' && t.up !== 'FUNCTION')) continue;
    const kind = t.up === 'PROCEDURE' ? 'procedure' : 'function';
    const n = readName(toks, i + 1);
    if (!n) continue;
    const r = routine(src, toks, n.next, dialect, kind);
    // A declaration ends at ';' before any IS/AS; a definition has a body up to its END name;
    let k = r.bodyStart;
    const declaration =
      toks.slice(n.next, r.bodyStart).some((x) => x.text === ';') ||
      toks[r.bodyStart - 1]?.text === ';';
    const o: SqlObject = {
      kind,
      name: n.parts[n.parts.length - 1]!,
      parent: pkg,
      line: t.line,
      endLine: t.line,
      signature: textOf(src, toks, i, Math.max(i, r.headerEnd)).replace(/\s+(IS|AS)$/i, ''),
      params: r.params,
      ...(r.returns ? { returns: r.returns } : {}),
    };
    if (declaration) {
      const semi = toks.findIndex((x, idx) => idx > n.next && x.text === ';');
      o.endLine = toks[semi]?.line ?? t.line;
      o.signature = textOf(src, toks, i, semi - 1);
      out.push(o);
      i = semi;
      continue;
    }
    // Body: from IS/AS to the END that closes its BEGIN.
    let d = 0;
    let started = false;
    for (; k < toks.length; k++) {
      const x = toks[k]!;
      if (x.up === 'BEGIN' || x.up === 'CASE') {
        d++;
        started = true;
      } else if (x.up === 'END' && !/^(IF|LOOP|WHILE|FOR|REPEAT)$/.test(toks[k + 1]?.up ?? '')) {
        d--;
        if (started && d === 0) break;
      }
    }
    o.endLine = toks[Math.min(k, toks.length - 1)]?.line ?? endLine;
    withRefs(o, toks.slice(r.bodyStart, k + 1), dialect);
    out.push(o);
    i = k;
  }
  return out;
}

/** Reads one statement. */
export function readStatement(src: string, st: Statement, dialect: Dialect): ReadStatement {
  const toks = st.toks;
  const verb = toks[0];
  if (!verb) return { understood: true, objects: [] };
  // COMMENT ON TABLE x IS '…' / COMMENT ON COLUMN t.c IS '…'
  if (verb.up === 'COMMENT' && toks[1]?.up === 'ON') {
    const on = toks[2]?.up.toLowerCase() ?? '';
    let at = 3;
    if (on === 'materialized') at = 4;
    const n = readName(toks, at);
    const is = toks.findIndex((t) => t.up === 'IS');
    const text = is > 0 && toks[is + 1]?.kind === 'string' ? stringValue(toks[is + 1]!) : '';
    if (!n) return { understood: true, objects: [] };
    const parts = n.parts;
    const comment: SqlComment =
      on === 'column'
        ? {
            on,
            name: parts[parts.length - 2] ?? '',
            column: parts[parts.length - 1]!,
            text,
            line: verb.line,
          }
        : {
            on: on === 'materialized' ? 'view' : on,
            name: parts[parts.length - 1]!,
            text,
            line: verb.line,
          };
    return { understood: true, objects: [], comment };
  }
  const ck = createdKind(toks);
  if (
    !ck ||
    (ck.verb === 'ALTER' &&
      !(dialect === 'tsql' && /^(PROC|PROCEDURE|FUNCTION|VIEW|TRIGGER)$/.test(ck.kind)))
  ) {
    if (KNOWN_VERBS.has(verb.up) || verb.kind === 'var' || toks[1]?.text === ':')
      return { understood: true, objects: [] };
    return {
      understood: false,
      objects: [],
      problem: `statement not recognised: ${textOf(src, toks, 0, Math.min(toks.length - 1, 3), 60)}`,
    };
  }
  let kindWord = ck.kind;
  let at = ck.at + 1;
  const materialized = toks.slice(1, ck.at).some((t) => t.up === 'MATERIALIZED');
  if ((kindWord === 'PACKAGE' || kindWord === 'TYPE') && toks[at]?.up === 'BODY') {
    kindWord = `${kindWord} BODY`;
    at++;
  }
  const unique = toks.slice(1, ck.at).some((t) => t.up === 'UNIQUE');
  const kind: SqlObjectKind | undefined =
    kindWord === 'PACKAGE BODY'
      ? 'package-body'
      : kindWord === 'TYPE BODY'
        ? 'type-body'
        : materialized && kindWord === 'VIEW'
          ? 'materialized-view'
          : KIND_OF[kindWord];
  if (!kind) {
    // CREATE USER, ROLE, LOGIN, TABLESPACE, SERVER… : understood, nothing to draw.
    return { understood: true, objects: [] };
  }
  // CREATE INDEX ON t (…) has no name in PostgreSQL.
  const h = kind === 'index' && toks[at]?.up === 'ON' ? { name: '', after: at } : header(toks, at);
  if (!h)
    return {
      understood: false,
      objects: [],
      problem: `${kindWord.toLowerCase()} without a readable name at line ${verb.line}`,
    };
  const o: SqlObject = {
    kind,
    name: h.name,
    ...(h.schema ? { schema: h.schema } : {}),
    line: verb.line,
    endLine: st.endLine,
  };
  switch (kind) {
    case 'table': {
      const asAt = toks.findIndex(
        (t, idx) =>
          idx >= h!.after &&
          t.up === 'AS' &&
          (toks[idx + 1]?.up === 'SELECT' ||
            toks[idx + 1]?.text === '(' ||
            toks[idx + 1]?.up === 'WITH'),
      );
      if (asAt > 0) withRefs(o, toks.slice(asAt + 1), dialect);
      break;
    }
    case 'view':
    case 'materialized-view': {
      let i = h.after;
      let aliases: string[] | undefined;
      if (toks[i]?.text === '(') {
        const close = closeParen(toks, i);
        aliases = splitCommas(toks, i + 1, close - 1).map(([a]) => toks[a]!.text);
        i = close + 1;
      }
      while (i < toks.length && toks[i]!.up !== 'AS') i++;
      const q = toks.slice(i + 1);
      o.signature = textOf(src, toks, 0, i);
      const cols = selectColumns(src, q, 0);
      o.columns = aliases
        ? aliases.map((name, k) => ({ name, line: cols[k]?.line ?? verb.line }))
        : cols;
      withRefs(o, q, dialect);
      break;
    }
    case 'function':
    case 'procedure': {
      const r = routine(src, toks, h.after, dialect, kind);
      o.params = r.params;
      if (r.returns) o.returns = r.returns;
      if (r.language) o.language = r.language;
      if (r.comment) o.comment = r.comment;
      o.signature = textOf(src, toks, 0, r.headerEnd).replace(/\s+(AS|IS)$/i, '');
      withRefs(o, bodyTokens(src, toks, r.bodyStart, dialect), dialect);
      break;
    }
    case 'trigger': {
      const from = trigger(src, toks, h, dialect, o);
      o.signature = textOf(src, toks, 0, Math.max(0, from - 1));
      if (from < toks.length) {
        const body = withRefs({ ...o }, toks.slice(from), dialect);
        if (o.executes) body.calls = [...(body.calls ?? []).filter((c) => c.name !== o.executes)];
        Object.assign(o, body);
      }
      if (o.executes)
        o.calls = [
          {
            name: o.executes,
            line: toks.find((t) => t.up === 'EXECUTE')?.line ?? verb.line,
            explicit: true,
          },
          ...(o.calls ?? []),
        ];
      break;
    }
    case 'index': {
      let i = h.after;
      if (toks[i]?.up === 'USING' && dialect === 'mysql') {
        o.method = toks[i + 1]?.text.toLowerCase();
        i += 2;
      }
      if (toks[i]?.up === 'ON') {
        let j = i + 1;
        if (toks[j]?.up === 'ONLY') j++;
        const n = readName(toks, j);
        if (n) {
          o.table = n.parts[n.parts.length - 1];
          i = n.next;
        }
      }
      if (toks[i]?.up === 'USING') {
        o.method = toks[i + 1]?.text.toLowerCase();
        i += 2;
      }
      if (toks[i]?.text === '(') {
        const close = closeParen(toks, i);
        o.indexColumns = splitCommas(toks, i + 1, close - 1).map(([a, b]) =>
          textOf(src, toks, a, b, 120),
        );
      }
      if (unique) o.unique = true;
      if (!o.name) o.name = `${o.table ?? 'index'}(${(o.indexColumns ?? []).join(', ')})`;
      o.signature = textOf(src, toks, 0, toks.length - 1, 300);
      break;
    }
    case 'sequence': {
      const opts: Record<string, string> = {};
      for (let i = h.after; i < toks.length; i++) {
        const t = toks[i]!;
        const v = toks[i + 1];
        if (/^(START|INCREMENT|MINVALUE|MAXVALUE|CACHE|AS)$/.test(t.up) && v) {
          const skip = v.up === 'WITH' || v.up === 'BY' ? 1 : 0;
          const val = toks[i + 1 + skip];
          if (val) opts[t.up.toLowerCase()] = (toks[i + skip]?.text === '-' ? '-' : '') + val.text;
          i += 1 + skip;
        } else if (t.up === 'CYCLE' || (t.up === 'NO' && v?.up === 'CYCLE'))
          opts.cycle = t.up === 'CYCLE' ? 'yes' : 'no';
        else if (t.up === 'OWNED' && v?.up === 'BY') {
          const n = readName(toks, i + 2);
          if (n && n.parts.length >= 2) {
            o.ownedBy = n.parts.slice(-2).join('.');
            o.table = n.parts[n.parts.length - 2];
          }
        }
      }
      if (Object.keys(opts).length) o.options = opts;
      break;
    }
    case 'type':
    case 'domain': {
      let i = h.after;
      if (toks[i]?.up === 'AS' || toks[i]?.up === 'IS') i++;
      if (toks[i]?.up === 'ENUM' && toks[i + 1]?.text === '(') {
        const close = closeParen(toks, i + 1);
        o.values = splitCommas(toks, i + 2, close - 1).map(([a]) => stringOrWord(toks[a]!));
      } else if (
        toks[i]?.up === 'OBJECT' ||
        toks[i]?.text === '(' ||
        (toks[i]?.up === 'TABLE' && toks[i + 1]?.text === '(')
      ) {
        const open = toks[i]!.text === '(' ? i : i + 1;
        if (toks[open]?.text === '(') {
          const close = closeParen(toks, open);
          o.columns = splitCommas(toks, open + 1, close - 1)
            .filter(
              ([a]) =>
                !/^(MEMBER|STATIC|CONSTRUCTOR|MAP|ORDER|PRIMARY|CONSTRAINT|UNIQUE|CHECK|INDEX)$/.test(
                  toks[a]!.up,
                ),
            )
            .map(([a, b]) => ({
              name: toks[a]!.text,
              type: textOf(src, toks, a + 1, b, 120),
              line: toks[a]!.line,
            }));
          const members = packageMembers(
            src,
            toks.slice(open + 1, close),
            0,
            o.name,
            dialect,
            st.endLine,
          );
          if (members.length) return { understood: true, objects: [o, ...members] };
        }
      } else if (toks[i]?.up === 'FROM' || kind === 'domain') {
        // T-SQL alias type (FROM base), or a domain over a base type.
        const from = toks[i]?.up === 'FROM' ? i + 1 : i;
        let e = from;
        while (
          e < toks.length &&
          !/^(CHECK|NOT|NULL|DEFAULT|CONSTRAINT|COLLATE)$/.test(toks[e]!.up)
        )
          e++;
        o.returns = textOf(src, toks, from, e - 1, 120);
      } else if (toks[i]) o.returns = textOf(src, toks, i, toks.length - 1, 120);
      break;
    }
    case 'package':
    case 'package-body':
    case 'type-body': {
      let i = h.after;
      while (i < toks.length && toks[i]!.up !== 'AS' && toks[i]!.up !== 'IS') i++;
      o.signature = textOf(src, toks, 0, i);
      const members = packageMembers(src, toks, i + 1, o.name, dialect, st.endLine);
      if (kind !== 'package') {
        // The initialisation block of a package body (BEGIN … at package level) is code too.
        withRefs(o, [], dialect);
      }
      return { understood: true, objects: [o, ...members] };
    }
    case 'policy':
    case 'rule': {
      const on = toks.findIndex(
        (t, idx) =>
          idx >= h!.after &&
          (t.up === 'ON' || (kind === 'rule' && t.up === 'TO')) &&
          readName(toks, idx + 1),
      );
      if (on > 0) {
        const n = readName(toks, on + 1)!;
        o.table = n.parts[n.parts.length - 1];
      }
      withRefs(o, toks.slice(h.after), dialect);
      if (o.reads) o.reads = o.reads.filter((r) => r.name !== o.table);
      break;
    }
    case 'synonym': {
      const f = toks.findIndex((t) => t.up === 'FOR');
      if (f > 0) {
        const n = readName(toks, f + 1);
        if (n) o.table = n.parts[n.parts.length - 1];
      }
      break;
    }
    case 'event': {
      const d = toks.findIndex((t, idx) => idx > h!.after && t.up === 'DO');
      if (d > 0) withRefs(o, toks.slice(d + 1), dialect);
      break;
    }
    default:
      break;
  }
  if (!o.signature && kind !== 'table')
    o.signature = textOf(src, toks, 0, Math.min(toks.length - 1, h.after + 12), 200);
  return { understood: true, objects: [o] };
}
