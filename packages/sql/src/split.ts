/**
 * Splits a SQL script into statements the way each dialect's client does: `;` outside
 * blocks, `GO` batches (SQL Server), `DELIMITER` (MySQL), `--#SET TERMINATOR` (Db2), and `/`
 * after a PL/SQL unit (Oracle). Procedure bodies that contain `;` stay one statement.
 */
import { tokenize, type Tok } from './lex';
import type { Dialect } from './types';

export interface Statement {
  toks: Tok[];
  start: number;
  end: number;
  line: number;
  endLine: number;
}

const ROUTINE = new Set(['PROCEDURE', 'PROC', 'FUNCTION', 'TRIGGER', 'VIEW', 'PACKAGE', 'TYPE']);
const NOT_BLOCK_AFTER_BEGIN = new Set([
  'TRAN',
  'TRANSACTION',
  'WORK',
  'DISTRIBUTED',
  'ISOLATION',
  'DEFERRED',
  'IMMEDIATE',
  'EXCLUSIVE',
]);
const END_NOT_CLOSING = new Set(['IF', 'LOOP', 'WHILE', 'REPEAT', 'FOR']);

/** The kind word after CREATE [OR REPLACE | OR ALTER] [modifiers], or ALTER. */
export function createdKind(toks: Tok[]): { verb: string; kind: string; at: number } | undefined {
  const verb = toks[0]?.up;
  if (verb !== 'CREATE' && verb !== 'ALTER' && verb !== 'REPLACE') return undefined;
  let i = 1;
  const skip = new Set([
    'OR',
    'REPLACE',
    'ALTER',
    'EDITIONABLE',
    'NONEDITIONABLE',
    'EDITIONING',
    'FORCE',
    'NOFORCE',
    'NO',
    'TEMP',
    'TEMPORARY',
    'GLOBAL',
    'LOCAL',
    'UNLOGGED',
    'SECURE',
    'RECURSIVE',
    'UNIQUE',
    'CLUSTERED',
    'NONCLUSTERED',
    'BITMAP',
    'FULLTEXT',
    'SPATIAL',
    'CONSTRAINT',
    'AGGREGATE',
    'DEFINER',
    'ALGORITHM',
    'SQL',
    'SECURITY',
    'INVOKER',
    'UNDEFINED',
    'MERGE',
    'TEMPTABLE',
    'PUBLIC',
    'COLUMNSTORE',
    'XML',
    'MATERIALIZED',
    'CURRENT_USER',
  ]);
  while (i < toks.length && i < 16) {
    const t = toks[i]!;
    // DEFINER = user@host, ALGORITHM = MERGE
    if (t.text === '=' || t.kind === 'var' || t.kind === 'string' || t.kind === 'ident') {
      i++;
      continue;
    }
    if (t.kind === 'op' && (t.text === '@' || t.text === '.')) {
      i++;
      continue;
    }
    if (t.kind === 'word' && skip.has(t.up)) {
      i++;
      continue;
    }
    break;
  }
  const t = toks[i];
  if (!t || t.kind !== 'word') return undefined;
  return { verb, kind: t.up, at: i };
}

interface Directive {
  offset: number;
  end: number;
  delimiter: string;
}

/** `DELIMITER $$` (MySQL client) and `--#SET TERMINATOR @` (Db2 CLP) lines. */
function directives(text: string, dialect: Dialect): Directive[] {
  const out: Directive[] = [];
  const re =
    dialect === 'db2'
      ? /^[ \t]*--#SET[ \t]+TERMINATOR[ \t]+(\S+)[ \t]*$/gim
      : /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*$/gim;
  if (dialect !== 'mysql' && dialect !== 'db2' && dialect !== 'generic') return out;
  for (const m of text.matchAll(re))
    out.push({ offset: m.index!, end: m.index! + m[0].length, delimiter: m[1]! });
  return out;
}

export function splitStatements(
  text: string,
  dialect: Dialect,
  toks = tokenize(text, dialect),
): Statement[] {
  const dirs = directives(text, dialect);
  const out: Statement[] = [];
  let cur: Tok[] = [];
  let depth = 0;
  /** An END has closed the outermost block of the current statement. */
  let closed = false;
  let delimiter = ';';
  let d = 0;
  /** SQL Server routine (or Oracle PL/SQL unit): `;` does not end it. */
  let unit: 'batch' | 'plsql' | undefined;

  const flush = () => {
    if (cur.length) {
      const a = cur[0]!;
      const b = cur[cur.length - 1]!;
      const endLine = b.line + (text.slice(b.start, b.end).match(/\n/g)?.length ?? 0);
      out.push({ toks: cur, start: a.start, end: b.end, line: a.line, endLine });
    }
    cur = [];
    depth = 0;
    closed = false;
    unit = undefined;
  };
  const aloneOnLine = (k: number) => {
    const t = toks[k]!;
    return (
      (k === 0 || toks[k - 1]!.line < t.line) &&
      (k === toks.length - 1 || toks[k + 1]!.line > t.line)
    );
  };

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    // Client directives change the delimiter; their tokens (if any: Db2's is a comment) are not SQL.
    let inDirective = false;
    while (d < dirs.length && dirs[d]!.offset <= t.start) {
      flush();
      delimiter = dirs[d]!.delimiter;
      const end = dirs[d]!.end;
      d++;
      if (t.start < end) {
        while (k + 1 < toks.length && toks[k + 1]!.start < end) k++;
        inDirective = true;
        break;
      }
    }
    if (inDirective) continue;
    // A custom delimiter (`$$`, `//`, `@`) ends the statement wherever it appears, also
    // straight after a word (`END$$`: `$` is a name character).
    if (
      delimiter !== ';' &&
      t.kind === 'word' &&
      t.text.length > delimiter.length &&
      t.text.endsWith(delimiter)
    ) {
      const w = t.text.slice(0, -delimiter.length);
      cur.push({ ...t, text: w, up: w.toUpperCase(), end: t.end - delimiter.length });
      flush();
      continue;
    }
    if (delimiter !== ';' && t.kind === 'op' && text.startsWith(delimiter, t.start)) {
      flush();
      while (k + 1 < toks.length && toks[k + 1]!.start < t.start + delimiter.length) k++;
      continue;
    }
    if (dialect === 'tsql' && t.kind === 'word' && t.up === 'GO' && aloneOnLine(k)) {
      flush();
      // GO 5: the count belongs to the separator.
      if (toks[k + 1]?.kind === 'number' && toks[k + 1]!.line === t.line) k++;
      continue;
    }
    if (dialect === 'oracle' && t.text === '/' && aloneOnLine(k)) {
      flush();
      continue;
    }
    // A new routine definition at the top of the script ends a SQL Server batch without GO.
    if (
      unit &&
      depth === 0 &&
      (t.up === 'CREATE' || (t.up === 'ALTER' && dialect === 'tsql')) &&
      (k === 0 || toks[k - 1]!.line < t.line)
    ) {
      const kind = createdKind(toks.slice(k, k + 18));
      if (kind && ROUTINE.has(kind.kind)) flush();
    }
    if (!cur.length) {
      const kind = createdKind(toks.slice(k, k + 18));
      if (kind && ROUTINE.has(kind.kind)) {
        if (dialect === 'tsql') unit = 'batch';
        else if (
          dialect === 'oracle' &&
          (kind.kind !== 'TYPE' || toks[kind.at + 1 + k]?.up === 'BODY') &&
          kind.kind !== 'VIEW'
        )
          unit = 'plsql';
        const body = toks[k + kind.at + 1]?.up === 'BODY';
        if (dialect === 'oracle' && (kind.kind === 'PACKAGE' || (kind.kind === 'TYPE' && body)))
          depth = 1;
      }
    }
    if (t.kind === 'word') {
      if (t.up === 'BEGIN') {
        const next = toks[k + 1];
        const atStart = cur.length === 0;
        const tx =
          (next && NOT_BLOCK_AFTER_BEGIN.has(next.up)) || (atStart && (!next || next.text === ';'));
        if (!tx) depth++;
      } else if (t.up === 'CASE') depth++;
      else if (t.up === 'END') {
        const next = toks[k + 1];
        if (!(next && next.line === t.line && END_NOT_CLOSING.has(next.up)) && depth > 0) {
          depth--;
          if (depth === 0) closed = true;
        }
      }
    }
    if (delimiter === ';' && t.text === ';' && t.kind === 'op') {
      if (depth === 0 && (unit === undefined || (unit === 'plsql' && closed))) {
        flush();
        continue;
      }
    }
    cur.push(t);
  }
  flush();
  return out;
}
