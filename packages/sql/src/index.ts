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
    return finish(
      {
        dialect,
        mode: 'reader',
        method: `${PG_PARSER}, with the ${READER} for statements it does not accept`,
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
