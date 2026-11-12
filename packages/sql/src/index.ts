/**
 * @nexora/sql: what a SQL file defines (tables, views, materialized views, functions,
 * procedures, triggers, indexes, sequences, types, domains, packages, policies, rules,
 * schemas, extensions, synonyms and events), with parameters, return types, columns and the
 * relations and routines each body reads, writes and calls.
 *
 * PostgreSQL files (and plain SQL that PostgreSQL accepts) are parsed by PostgreSQL's own
 * parser. Other dialects are read by the statement reader, and the result says so.
 */
import { detectDialect } from './dialect';
import { Bytes, initPg, PG_PARSER, pgReady, pgStatement, tryParse } from './pg';
import { readStatement } from './reader';
import { splitStatements } from './split';
import {
  DIALECT_LABEL,
  type Dialect,
  type SqlComment,
  type SqlObject,
  type SqlProblem,
  type SqlResult,
} from './types';

export * from './types';
export { detectDialect } from './dialect';
export { tokenize } from './lex';
export { splitStatements } from './split';
export { PG_PARSER } from './pg';

export const READER = 'Nexora SQL statement reader';

/** Loads the PostgreSQL parser. Call once before analyseSql; without it every file is read by the statement reader. */
export async function initSql(): Promise<void> {
  await initPg();
}

/**
 * psql meta-commands (`\connect`) and COPY … FROM stdin data are client input, not SQL: they
 * are blanked (line breaks kept) so the parser sees only statements.
 */
export function blankClientInput(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let out = text.replace(
    /^(COPY\s[^;]*\bFROM\s+stdin\b[^;]*;[^\n]*\n)([\s\S]*?^\\\.[ \t]*$)/gim,
    (_m, head: string, data: string) => head + blank(data),
  );
  const meta = /^[ \t]*\\[A-Za-z!?][^\n]*$/gm;
  if (!meta.test(out)) return out;
  // \g, \gset, \gx and \gexec send the query buffer, like a semicolon.
  out = out.replace(
    /^([ \t]*)\\g(set|x|exec|desc)?\b[^\n]*$/gm,
    (m, lead: string) => `${lead};${' '.repeat(m.length - lead.length - 1)}`,
  );
  out = out.replace(meta, blank);
  // psql variables (:name, :'name', :"name") become placeholders of the same length.
  return out.replace(/(?<![:\w]):(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))/g, (m) =>
    m.startsWith(":'")
      ? `'${'x'.repeat(m.length - 2)}'`
      : m.startsWith(':"')
        ? `"${'x'.repeat(m.length - 2)}"`
        : `_${m.slice(1)}`,
  );
}

const PG_LIKE = new Set<Dialect>(['postgresql', 'generic', 'sqlite']);

const QUERY_START =
  /^(select|with|insert|update|delete|create|alter|drop|truncate|grant|revoke|comment|merge|call|copy|values|explain|table|begin|start|commit|rollback|end|abort|savepoint|release|show|set|reset|lock|vacuum|analyze|refresh|reindex|cluster|listen|notify|prepare|execute|deallocate|discard|declare|fetch|close|do)\b/i;

/**
 * Pieces of a text that holds several queries without `;` between them (generated query
 * snapshots do this). The PostgreSQL parser finds the boundaries: where it stops at a line that
 * starts (column 0) with a statement keyword, a new piece starts. Empty unless there are at
 * least two pieces and every piece parses on its own.
 */
export function unterminatedQueries(text: string): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = [];
  let start = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    const rest = text.slice(start);
    const r = tryParse(rest);
    if ('tree' in r) {
      pieces.push({ start, end: text.length });
      return pieces.length > 1 ? pieces : [];
    }
    if (r.offset === undefined) return [];
    // Start of the line holding the token the parser stopped at.
    const stop = Buffer.from(rest, 'utf8').subarray(0, r.offset).toString('utf8').length;
    const at = rest.lastIndexOf('\n', stop - 1) + 1;
    if (at === 0 || !QUERY_START.test(rest.slice(at))) return [];
    if ('error' in tryParse(rest.slice(0, at))) return [];
    pieces.push({ start, end: start + at });
    start += at;
  }
  return [];
}

export function analyseSql(text: string, language?: string): SqlResult {
  const { dialect } = detectDialect(text, language);
  const objects: SqlObject[] = [];
  const comments: SqlComment[] = [];
  const problems: SqlProblem[] = [];
  let statements = 0;
  let understood = 0;
  let viaParser = 0;

  const src = PG_LIKE.has(dialect) ? blankClientInput(text) : text;
  if (pgReady() && PG_LIKE.has(dialect)) {
    const b = new Bytes(src);
    const whole = tryParse(src);
    if ('tree' in whole) {
      const stmts = whole.tree.stmts ?? [];
      for (const s of stmts) {
        const start = s.stmt_location ?? 0;
        const end = s.stmt_len ? start + s.stmt_len : b.buf.length;
        const r = pgStatement(s.stmt, b, start, end, 0);
        objects.push(...r.objects);
        if (r.comment) comments.push(r.comment);
        problems.push(...r.problems);
      }
      statements = understood = viaParser = stmts.length;
      return finish(
        {
          dialect,
          mode: 'parser',
          method: PG_PARSER,
          statements,
          understood,
          objects,
          comments,
          problems,
        },
        viaParser,
      );
    }
    // Not every statement parses: parse them one by one, and read the others.
    let byteAt = 0;
    let charAt = 0;
    for (const st of splitStatements(src, 'postgresql')) {
      statements++;
      byteAt += Buffer.byteLength(src.slice(charAt, st.start), 'utf8');
      charAt = st.start;
      const stmtText = src.slice(st.start, st.end);
      const parsed = tryParse(stmtText);
      // Generated query files list queries without semicolons between them; read them as
      // separate statements when every piece then parses.
      const pieces = 'tree' in parsed ? [] : unterminatedQueries(stmtText);
      const trees = pieces.map((p) => tryParse(stmtText.slice(p.start, p.end)));
      if (pieces.length && trees.every((t) => 'tree' in t)) {
        statements += pieces.length - 1;
        pieces.forEach((p, k) => {
          const t = trees[k] as Extract<ReturnType<typeof tryParse>, { tree: unknown }>;
          const pieceAt = byteAt + Buffer.byteLength(stmtText.slice(0, p.start), 'utf8');
          for (const s of t.tree.stmts ?? []) {
            const start = pieceAt + (s.stmt_location ?? 0);
            const end = s.stmt_len
              ? start + s.stmt_len
              : pieceAt + Buffer.byteLength(stmtText.slice(p.start, p.end), 'utf8');
            const r = pgStatement(s.stmt, b, start, end, pieceAt);
            objects.push(...r.objects);
            if (r.comment) comments.push(r.comment);
            problems.push(...r.problems);
          }
          understood++;
          viaParser++;
        });
        continue;
      }
      if ('tree' in parsed) {
        for (const s of parsed.tree.stmts ?? []) {
          const start = byteAt + (s.stmt_location ?? 0);
          const end = s.stmt_len
            ? start + s.stmt_len
            : byteAt + Buffer.byteLength(stmtText, 'utf8');
          const r = pgStatement(s.stmt, b, start, end, byteAt);
          objects.push(...r.objects);
          if (r.comment) comments.push(r.comment);
          problems.push(...r.problems);
        }
        understood++;
        viaParser++;
        continue;
      }
      problems.push({
        line: st.line + parsed.line - 1,
        message:
          dialect === 'postgresql'
            ? `syntax error: ${parsed.error}`
            : `not accepted by the PostgreSQL parser (${parsed.error}); read by the statement reader`,
      });
      const r = readStatement(src, st, dialect);
      objects.push(...r.objects);
      if (r.comment) comments.push(r.comment);
      if (r.understood) understood++;
      else if (r.problem) problems.push({ line: st.line, message: r.problem });
    }
    const allParsed = viaParser === statements && !problems.length;
    return finish(
      {
        dialect,
        mode: allParsed ? 'parser' : 'reader',
        method: allParsed
          ? `${PG_PARSER}, one query at a time`
          : `${PG_PARSER}, with the ${READER} for statements it does not accept`,
        statements,
        understood,
        objects,
        comments,
        problems,
      },
      viaParser,
    );
  }
  for (const st of splitStatements(src, dialect)) {
    statements++;
    const r = readStatement(src, st, dialect);
    objects.push(...r.objects);
    if (r.comment) comments.push(r.comment);
    if (r.understood) understood++;
    else if (r.problem) problems.push({ line: st.line, message: r.problem });
  }
  return finish(
    {
      dialect,
      mode: 'reader',
      method: `${READER} (${DIALECT_LABEL[dialect]})`,
      statements,
      understood,
      objects,
      comments,
      problems,
    },
    0,
  );
}

/** Attaches comments to the objects they describe, and records how many statements the parser read. */
function finish(r: SqlResult, viaParser: number): SqlResult {
  for (const c of r.comments) {
    const o = r.objects.find(
      (x) =>
        x.name.toLowerCase() === c.name.toLowerCase() &&
        (c.on === 'column'
          ? x.kind === 'table' || x.kind === 'view' || x.kind === 'materialized-view'
          : kindMatches(c.on, x.kind)),
    );
    if (!o) continue;
    if (c.column) {
      const col = o.columns?.find((x) => x.name.toLowerCase() === c.column!.toLowerCase());
      if (col) col.comment = c.text;
    } else o.comment = c.text;
  }
  r.parsedStatements = viaParser;
  return r;
}

function kindMatches(on: string, kind: SqlObject['kind']): boolean {
  if (on === 'view') return kind === 'view' || kind === 'materialized-view';
  return on.replace(/_/g, '-') === kind;
}
