/**
 * Relations read and written, routines called and dynamic SQL in a body, read from tokens.
 * Used for dialects without a bundled grammar. Every name it returns is written in the body;
 * what the name refers to is decided later, by matching it against the repository's schema.
 */
import type { Tok } from './lex';
import type { Dialect, SqlRef } from './types';

export interface BodyRefs {
  reads: SqlRef[];
  writes: SqlRef[];
  calls: SqlRef[];
  dynamicSql: number[];
}

/** Words that can follow FROM or JOIN but are not relation names. */
const NOT_RELATION = new Set([
  'SELECT',
  'LATERAL',
  'ONLY',
  'DUAL',
  'UNNEST',
  'VALUES',
  'TABLE',
  'WHERE',
  'ON',
  'USING',
  'SET',
  'AS',
  'INNER',
  'OUTER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'NATURAL',
  'JOIN',
  'GROUP',
  'ORDER',
  'HAVING',
  'LIMIT',
  'UNION',
  'INSERTED',
  'DELETED',
  'NEW',
  'OLD',
  'STDIN',
  'STDOUT',
  'OPENJSON',
  'OPENXML',
  'OPENROWSET',
  'STRING_SPLIT',
  'JSON_TABLE',
  'XMLTABLE',
]);

const NOT_ALIAS =
  /^(WHERE|JOIN|ON|GROUP|ORDER|LEFT|RIGHT|INNER|FULL|CROSS|OUTER|UNION|LIMIT|HAVING|WINDOW|FOR|INTO|SET|USING|WHEN|THEN|ELSE|END|NATURAL|OFFSET|FETCH|EXCEPT|INTERSECT|MINUS|CONNECT|START|PIVOT|UNPIVOT|RETURNING|LOOP|STRAIGHT_JOIN|OPTION|TABLESAMPLE|WITH|VALUES|SELECT|DEFAULT|OUTPUT|AND|OR|NOT)$/;

/** Functions whose argument list uses FROM as a keyword. */
const FROM_INSIDE = new Set(['EXTRACT', 'TRIM', 'SUBSTRING', 'OVERLAY', 'POSITION', 'SUBSTR']);

/** Keywords that look like a call when followed by a parenthesis. */
const NOT_CALL = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'VALUES',
  'INTO',
  'AS',
  'ON',
  'IF',
  'WHILE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'RETURN',
  'RETURNS',
  'TABLE',
  'KEY',
  'PRIMARY',
  'FOREIGN',
  'REFERENCES',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'USING',
  'OVER',
  'PARTITION',
  'WITH',
  'JOIN',
  'SET',
  'UPDATE',
  'INSERT',
  'DELETE',
  'MERGE',
  'CALL',
  'EXEC',
  'EXECUTE',
  'PERFORM',
  'LIKE',
  'ANY',
  'ALL',
  'SOME',
  'BETWEEN',
  'IS',
  'NULL',
  'CAST',
  'CONVERT',
  'TRY_CAST',
  'TRY_CONVERT',
  'COALESCE',
  'NULLIF',
  'GREATEST',
  'LEAST',
  'ROW',
  'ARRAY',
  'INTERVAL',
  'FILTER',
  'WITHIN',
  'GROUPING',
  'CUBE',
  'ROLLUP',
  'SETS',
  'LATERAL',
  'RAISERROR',
  'THROW',
  'PRINT',
  'OUTPUT',
  'INCLUDE',
  'CONSTRAINT',
  'INDEX',
  'VARCHAR',
  'NVARCHAR',
  'CHAR',
  'NCHAR',
  'VARCHAR2',
  'NVARCHAR2',
  'NUMBER',
  'NUMERIC',
  'DECIMAL',
  'DEC',
  'FLOAT',
  'REAL',
  'INT',
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'BIT',
  'BINARY',
  'VARBINARY',
  'DATETIME2',
  'DATETIMEOFFSET',
  'TIME',
  'TIMESTAMP',
  'RAW',
  'CLOB',
  'BLOB',
  'DOUBLE',
  'TEXT',
  'BOOLEAN',
  'STRING',
  'CHARACTER',
  'VARYING',
  'ENUM',
  'BEGIN',
  'END',
  'LOOP',
  'EXCEPTION',
  'RAISE',
  'SIGNAL',
  'DECLARE',
  'CURSOR',
  'FOR',
  'OF',
  'BY',
  'TO',
  'DO',
  'ELSIF',
  'ELSEIF',
  'COLLATE',
  'CONTAINS',
  'FREETEXT',
  'MATCH',
  'AGAINST',
  'OPTION',
  'TOP',
  'IDENTITY',
  'GENERATED',
  'STORED',
  'VIRTUAL',
  'NO',
  'MAX',
]);

const isName = (t: Tok | undefined): t is Tok =>
  !!t && (t.kind === 'ident' || (t.kind === 'word' && !NOT_RELATION.has(t.up)));

/** A qualified name starting at `i`: parts and the index after it. */
export function readName(toks: Tok[], i: number): { parts: string[]; next: number } | undefined {
  const first = toks[i];
  if (!first || (first.kind !== 'word' && first.kind !== 'ident')) return undefined;
  const parts = [first.text];
  let j = i + 1;
  while (toks[j]?.text === '.' && toks[j]!.kind === 'op') {
    const t = toks[j + 1];
    if (!t || (t.kind !== 'word' && t.kind !== 'ident')) break;
    parts.push(t.text);
    j += 2;
  }
  // SQL Server allows server.db..table: an empty part.
  return { parts: parts.filter(Boolean), next: j };
}

const ref = (parts: string[], line: number, explicit?: boolean): SqlRef => {
  const name = parts[parts.length - 1]!;
  const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
  return { name, ...(schema ? { schema } : {}), line, ...(explicit ? { explicit } : {}) };
};

/** Names defined by WITH … AS ( … ) in the tokens: common table expressions, not tables. */
function cteNames(toks: Tok[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.up !== 'WITH' && t.text !== ',') continue;
    let j = i + 1;
    if (toks[j]?.up === 'RECURSIVE') j++;
    const n = toks[j];
    if (!n || (n.kind !== 'word' && n.kind !== 'ident')) continue;
    j++;
    if (toks[j]?.text === '(') {
      let depth = 0;
      for (; j < toks.length; j++) {
        if (toks[j]!.text === '(') depth++;
        else if (toks[j]!.text === ')' && --depth === 0) break;
      }
      j++;
    }
    if (
      toks[j]?.up === 'AS' &&
      (toks[j + 1]?.text === '(' || toks[j + 1]?.up === 'MATERIALIZED' || toks[j + 1]?.up === 'NOT')
    )
      out.add(n.text.toLowerCase());
  }
  return out;
}

export function bodyRefs(toks: Tok[], dialect: Dialect): BodyRefs {
  const reads: SqlRef[] = [];
  const writes: SqlRef[] = [];
  const calls: SqlRef[] = [];
  const dynamicSql: number[] = [];
  const ctes = cteNames(toks);
  // Tables the body creates for itself (CREATE TEMPORARY TABLE, DECLARE … TABLE) are not the schema's.
  for (let i = 0; i < toks.length; i++) {
    if (toks[i]!.up !== 'CREATE') continue;
    let j = i + 1;
    while (toks[j] && /^(GLOBAL|LOCAL|TEMP|TEMPORARY)$/.test(toks[j]!.up)) j++;
    if (toks[j]?.up !== 'TABLE' || j === i + 1) continue;
    j++;
    if (toks[j]?.up === 'IF') j += 3;
    const n = readName(toks, j);
    if (n) ctes.add(n.parts[n.parts.length - 1]!.toLowerCase());
  }
  const aliases = new Map<string, string[]>();
  const isCte = (parts: string[]) => parts.length === 1 && ctes.has(parts[0]!.toLowerCase());
  /** Names of the functions whose parentheses enclose each token. */
  const parens: string[] = [];
  const prev = (i: number) => toks[i - 1];
  const tempAt = (i: number) => {
    // #temp (SQL Server) and @table variables are not repository tables.
    const p = toks[i - 1];
    return p && p.text === '#' && p.end === toks[i]!.start;
  };
  const relation = (i: number, into: SqlRef[]): number => {
    const t = toks[i];
    if (!t) return i;
    if (t.text === '#') return i + 2;
    if (!isName(t)) return i;
    const n = readName(toks, i);
    if (!n) return i;
    // A name read from, followed by (, is a table function; INSERT INTO t (cols) is a table.
    if (into === reads && toks[n.next]?.text === '(') {
      calls.push(ref(n.parts, t.line));
      return n.next;
    }
    if (!isCte(n.parts) && !tempAt(i)) {
      into.push(ref(n.parts, t.line));
      // Remember an alias (FROM dbo.Accounts a): SQL Server's UPDATE a … FROM names it.
      let j = n.next;
      if (toks[j]?.up === 'AS') j++;
      const al = toks[j];
      if (al && (al.kind === 'word' || al.kind === 'ident') && !NOT_ALIAS.test(al.up))
        aliases.set(al.text.toLowerCase(), n.parts);
    }
    return n.next;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.text === '(') {
      const p = prev(i);
      parens.push(p && p.kind === 'word' ? p.up : '');
      continue;
    }
    if (t.text === ')') {
      parens.pop();
      continue;
    }
    if (t.kind !== 'word') continue;
    const p = prev(i);
    switch (t.up) {
      case 'FROM': {
        if (FROM_INSIDE.has(parens[parens.length - 1] ?? '')) break;
        if (p?.up === 'DISTINCT') break; // IS DISTINCT FROM
        if (p?.up === 'DELETE' || (p && toks[i - 2]?.up === 'DELETE' && p.up === 'TOP')) {
          i = relation(i + 1, writes) - 1;
          break;
        }
        if (p?.up === 'PREPARE' || toks[i - 2]?.up === 'PREPARE') break;
        let j = i + 1;
        if (toks[j]?.up === 'ONLY') j++;
        for (;;) {
          if (toks[j]?.text === '(') break; // a subquery: its own FROM is read in turn
          const next = relation(j, reads);
          if (next === j) break;
          j = next;
          // Skip an alias: [AS] name, and table hints WITH (NOLOCK).
          if (toks[j]?.up === 'AS') j++;
          if (toks[j] && toks[j]!.kind !== 'op' && isName(toks[j]) && !NOT_ALIAS.test(toks[j]!.up))
            j++;
          if (toks[j]?.text !== ',') break;
          j++;
        }
        i = j - 1;
        break;
      }
      case 'JOIN':
      case 'STRAIGHT_JOIN':
        if (toks[i + 1]?.up === 'LATERAL') break;
        i = relation(i + 1, reads) - 1;
        break;
      case 'INTO':
        if (p && /^(INSERT|REPLACE|MERGE|IGNORE|ALL|FIRST|OVERWRITE)$/.test(p.up)) {
          i = relation(i + 1, writes) - 1;
        }
        break;
      case 'INSERT':
        // SQL Server allows INSERT table (…) without INTO.
        if (
          toks[i + 1] &&
          toks[i + 1]!.up !== 'INTO' &&
          isName(toks[i + 1]) &&
          dialect === 'tsql' &&
          !/^(TOP|ALL|FIRST|OVERWRITE|IGNORE|OR)$/.test(toks[i + 1]!.up)
        )
          i = relation(i + 1, writes) - 1;
        break;
      case 'UPDATE': {
        if (p && /^(FOR|ON|OF|OR|BEFORE|AFTER|INSTEAD|KEY|SKIP)$/.test(p.up)) break;
        const n = toks[i + 1];
        if (
          !n ||
          n.up === 'STATISTICS' ||
          n.up === 'OF' ||
          n.up === 'ON' ||
          n.text === ',' ||
          n.text === ';'
        )
          break;
        let j = i + 1;
        if (toks[j]?.up === 'ONLY') j++;
        if (toks[j]?.up === 'TOP') j += toks[j + 1]?.text === '(' ? 4 : 2;
        i = relation(j, writes) - 1;
        break;
      }
      case 'DELETE': {
        if (p && /^(ON|OR|BEFORE|AFTER|INSTEAD|FOR)$/.test(p.up)) break;
        const n = toks[i + 1];
        if (n && n.up !== 'FROM' && n.up !== 'TOP' && isName(n) && n.up !== 'ON' && n.text !== ',')
          i = relation(i + 1, writes) - 1;
        break;
      }
      case 'MERGE':
        if (toks[i + 1] && toks[i + 1]!.up !== 'INTO' && isName(toks[i + 1]))
          i = relation(i + 1, writes) - 1;
        break;
      case 'USING':
        // MERGE … USING source: a read, when the source is a name.
        if (writes.length && toks[i + 1] && toks[i + 1]!.text !== '(') {
          const back = toks.slice(Math.max(0, i - 12), i).some((x) => x.up === 'MERGE');
          if (back) i = relation(i + 1, reads) - 1;
        }
        break;
      case 'TRUNCATE': {
        let j = i + 1;
        if (toks[j]?.up === 'TABLE') j++;
        if (toks[j]?.up === 'ONLY') j++;
        i = relation(j, writes) - 1;
        break;
      }
      case 'CALL':
      case 'PERFORM': {
        const n = readName(toks, i + 1);
        if (n && !NOT_CALL.has(toks[i + 1]!.up)) calls.push(ref(n.parts, t.line, true));
        break;
      }
      case 'EXEC':
      case 'EXECUTE': {
        let j = i + 1;
        const n0 = toks[j];
        if (!n0) break;
        if (
          n0.up === 'IMMEDIATE' ||
          n0.text === '(' ||
          n0.kind === 'string' ||
          (n0.kind === 'var' && toks[j + 1]?.text !== '=')
        ) {
          dynamicSql.push(t.line);
          break;
        }
        if (n0.kind === 'var' && toks[j + 1]?.text === '=') j += 2; // EXEC @rc = proc
        if (dialect === 'postgresql' && (n0.up === 'FUNCTION' || n0.up === 'PROCEDURE')) j++;
        const n = readName(toks, j);
        if (!n) break;
        const last = n.parts[n.parts.length - 1]!.toLowerCase();
        if (last === 'sp_executesql') {
          dynamicSql.push(t.line);
          break;
        }
        // PostgreSQL's EXECUTE format(…) / EXECUTE 'text' is dynamic too.
        if (dialect === 'postgresql' || dialect === 'generic') {
          if (toks[n.next]?.text === '(' && !/^(FUNCTION|PROCEDURE)$/.test(n0.up)) {
            dynamicSql.push(t.line);
            break;
          }
        }
        calls.push(ref(n.parts, t.line, true));
        i = n.next - 1;
        break;
      }
      case 'PREPARE':
        if (dialect === 'mysql' || dialect === 'db2') dynamicSql.push(t.line);
        break;
      default: {
        // name( and schema.name( : a function call, unless a keyword or a type.
        const n = readName(toks, i);
        if (!n) break;
        if (toks[n.next]?.text !== '(') {
          i = n.next - 1;
          break;
        }
        if (n.parts.length === 1 && NOT_CALL.has(t.up)) break;
        if (p?.up === 'TABLE' || isCte(n.parts)) break; // CREATE TABLE t ( … ), not a call
        if (p?.text === '.') break;
        calls.push(ref(n.parts, t.line));
        i = n.next - 1;
      }
    }
  }
  // UPDATE a SET … FROM dbo.Accounts a: the write is to the aliased table.
  const realWrites = writes.map((w) => {
    const target = !w.schema ? aliases.get(w.name.toLowerCase()) : undefined;
    return target ? ref(target, w.line) : w;
  });
  return {
    reads: dedupe(reads),
    writes: dedupe(realWrites),
    calls: dedupe(calls),
    dynamicSql: [...new Set(dynamicSql)],
  };
}

/** One reference per name and line. */
export function dedupe(refs: SqlRef[]): SqlRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${(r.schema ?? '').toLowerCase()}.${r.name.toLowerCase()}@${r.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
