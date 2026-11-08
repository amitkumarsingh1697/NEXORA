/**
 * Database schema reading: tables, columns and foreign keys from SQL (`CREATE TABLE`,
 * `ALTER TABLE … ADD`), Prisma schema files and Drizzle table definitions in TypeScript.
 *
 * Labelling:
 * - A table, its columns and a foreign key are **observed**: they are written in the
 *   schema at the cited line. Types, lengths, precision and scale are recorded exactly as
 *   written; nothing is filled in from database defaults.
 * - A Drizzle query that names a table object (`db.select().from(users)`,
 *   `db.insert(users)`) is an **observed** read or write.
 * - A Prisma client call (`prisma.user.findMany()`) and a table named inside a SQL string
 *   (`'SELECT … FROM users'`) are **inferred**: the model or the string is only matched by
 *   name.
 *
 * The parsers are deliberately small. They cover the common forms and say nothing about
 * what they cannot read: views, stored procedures, dynamic SQL and the Drizzle relational
 * query API (`db.query.users`) are not linked.
 */
import ts from 'typescript';
import type { GraphBuilder, NodeRef } from './model';

export interface ColumnDef {
  name: string;
  /** Type as written: `varchar`, `numeric`, `Int`, `timestamp with time zone`… */
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  /** Default as written in the schema. */
  default?: string;
  references?: { table: string; column?: string };
  line?: number;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  line: number;
  source: 'sql' | 'prisma' | 'drizzle';
  /** Prisma: the model name when the table is mapped to another name. */
  model?: string;
}

/** The key that matches a table across schema and queries: the bare, lower-case name. */
export function tableKey(name: string): string {
  const bare = name.split('.').pop() ?? name;
  return bare.replace(/^["'`[]|["'`\]]$/g, '').toLowerCase();
}

const unquote = (s: string): string => s.replace(/^["'`[]|["'`\]]$/g, '');

// ---------------------------------------------------------------------------------------
// SQL

/** Replaces comments with spaces, keeping line breaks so positions still map to lines. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** The text between the parenthesis at `open` and its match, or null. */
function balanced(text: string, open: number): { body: string; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return { body: text.slice(open + 1, i), end: i };
  }
  return null;
}

/** Splits on commas that are not inside parentheses or quotes. */
function splitTop(text: string): { part: string; offset: number }[] {
  const out: { part: string; offset: number }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push({ part: text.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  out.push({ part: text.slice(start), offset: start });
  return out.filter((p) => p.part.trim());
}

const NAME = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Za-z_][\w$]*))?`;
const COLUMN_STOP =
  /^(NOT|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|CONSTRAINT|GENERATED|COLLATE|AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|ON|AS)$/i;
const LENGTH_TYPES = /char|binary|bit|varchar|string/i;
const DECIMAL_TYPES = /^(numeric|decimal|number|dec|money)$/i;

function sizeOf(type: string, args: number[]): Partial<ColumnDef> {
  if (!args.length) return {};
  if (DECIMAL_TYPES.test(type))
    return { precision: args[0], ...(args[1] !== undefined ? { scale: args[1] } : {}) };
  if (LENGTH_TYPES.test(type)) return { length: args[0] };
  return { precision: args[0] };
}

function names(list: string): string[] {
  return list
    .split(',')
    .map((s) => unquote(s.trim()))
    .filter(Boolean);
}

/** Parses one column definition (`price numeric(10, 2) NOT NULL DEFAULT 0`). */
export function parseSqlColumn(def: string): ColumnDef | null {
  const m = new RegExp(`^\\s*(${NAME})\\s+([\\s\\S]*)$`).exec(def);
  if (!m) return null;
  const name = unquote(m[1]!);
  const rest = m[2]!;
  const tokens = rest.match(/"[^"]*"|'[^']*'|\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s(]+/g) ?? [];
  const typeWords: string[] = [];
  let args: number[] = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (COLUMN_STOP.test(t)) break;
    if (t.startsWith('(')) {
      args = t
        .slice(1, -1)
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x));
      continue;
    }
    typeWords.push(t);
  }
  const type = typeWords.join(' ').replace(/\s*\[\]$/, '[]');
  if (!type) return null;
  const col: ColumnDef = { name, type, nullable: true, ...sizeOf(typeWords[0] ?? type, args) };
  // Re-attach argument lists the tokenizer split off (`now ()` → `now()`).
  const tail = tokens
    .slice(i)
    .join(' ')
    .replace(/(\w) \(/g, '$1(');
  if (/\bNOT\s+NULL\b/i.test(tail)) col.nullable = false;
  if (/\bPRIMARY\s+KEY\b/i.test(tail)) {
    col.primaryKey = true;
    col.nullable = false;
  }
  if (/\bUNIQUE\b/i.test(tail)) col.unique = true;
  if (/^(serial|bigserial|smallserial)$/i.test(type)) col.nullable = false;
  const d = /\bDEFAULT\s+('(?:[^']|'')*'|\((?:[^()]|\([^()]*\))*\)|[^\s,]+(?:\([^()]*\))?)/i.exec(
    tail,
  );
  if (d) col.default = d[1];
  const r = new RegExp(`\\bREFERENCES\\s+(${NAME})\\s*(?:\\(\\s*([^)]+)\\))?`, 'i').exec(tail);
  if (r)
    col.references = { table: unquote(r[1]!.split('.').pop()!), column: r[2] && names(r[2])[0] };
  return col;
}

/** Tables in SQL text. `lineBase` is the line of the first character (for SQL inside code). */
export function parseSqlSchema(
  sqlText: string,
  lineBase = 1,
): { tables: TableDef[]; foreignKeys: ForeignKey[] } {
  const sql = stripSqlComments(sqlText);
  const lineAt = (pos: number) => lineBase + (sql.slice(0, pos).match(/\n/g)?.length ?? 0);
  const tables: TableDef[] = [];
  const foreignKeys: ForeignKey[] = [];
  const create = new RegExp(
    `\\bCREATE\\s+(?:(?:GLOBAL\\s+|LOCAL\\s+)?(?:TEMP|TEMPORARY)\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${NAME})\\s*\\(`,
    'gi',
  );
  for (let m; (m = create.exec(sql));) {
    const open = m.index + m[0].length - 1;
    const b = balanced(sql, open);
    if (!b) continue;
    const name = unquote(m[1]!.split('.').pop()!);
    const table: TableDef = { name, columns: [], line: lineAt(m.index), source: 'sql' };
    for (const { part, offset } of splitTop(b.body)) {
      const item = part.trim();
      const line = lineAt(open + 1 + offset + (part.length - part.trimStart().length));
      const body = item.replace(/^CONSTRAINT\s+\S+\s+/i, '');
      let c;
      if ((c = /^PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(body))) {
        for (const n of names(c[1]!)) {
          const col = table.columns.find((x) => x.name === n);
          if (col) Object.assign(col, { primaryKey: true, nullable: false });
        }
      } else if (
        (c = new RegExp(
          `^FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+(${NAME})\\s*(?:\\(([^)]*)\\))?`,
          'i',
        ).exec(body))
      ) {
        const from = names(c[1]!);
        const to = c[3] ? names(c[3]) : [];
        const target = unquote(c[2]!.split('.').pop()!);
        from.forEach((f, k) => {
          const col = table.columns.find((x) => x.name === f);
          if (col) col.references = { table: target, column: to[k] };
          foreignKeys.push({ table: name, column: f, refTable: target, refColumn: to[k], line });
        });
      } else if ((c = /^UNIQUE\s*(?:KEY|INDEX)?\s*\S*?\s*\(([^)]*)\)/i.exec(body))) {
        const cols = names(c[1]!);
        if (cols.length === 1) {
          const col = table.columns.find((x) => x.name === cols[0]);
          if (col) col.unique = true;
        }
      } else if (/^(CHECK|INDEX|KEY|EXCLUDE|FULLTEXT|SPATIAL)\b/i.test(body)) {
        continue;
      } else {
        const col = parseSqlColumn(item);
        if (!col) continue;
        col.line = line;
        table.columns.push(col);
        if (col.references)
          foreignKeys.push({
            table: name,
            column: col.name,
            refTable: col.references.table,
            refColumn: col.references.column,
            line,
          });
      }
    }
    tables.push(table);
    create.lastIndex = b.end;
  }

  // ALTER TABLE t ADD [COLUMN] … / ADD [CONSTRAINT x] FOREIGN KEY (…) REFERENCES …
  const alter = new RegExp(
    `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${NAME})\\s+([^;]*)`,
    'gi',
  );
  for (let m; (m = alter.exec(sql));) {
    const name = unquote(m[1]!.split('.').pop()!);
    const line = lineAt(m.index);
    for (const { part } of splitTop(m[2]!)) {
      const act = part.trim();
      let c;
      if (
        (c = new RegExp(
          `^ADD\\s+(?:CONSTRAINT\\s+\\S+\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+(${NAME})\\s*(?:\\(([^)]*)\\))?`,
          'i',
        ).exec(act))
      ) {
        const to = c[3] ? names(c[3]) : [];
        names(c[1]!).forEach((f, k) =>
          foreignKeys.push({
            table: name,
            column: f,
            refTable: unquote(c![2]!.split('.').pop()!),
            refColumn: to[k],
            line,
          }),
        );
      } else if ((c = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.+)$/is.exec(act))) {
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|INDEX)\b/i.test(c[1]!)) continue;
        const col = parseSqlColumn(c[1]!);
        if (!col) continue;
        col.line = line;
        let t = tables.find((x) => x.name === name);
        if (!t) {
          t = { name, columns: [], line, source: 'sql' };
          tables.push(t);
        }
        if (!t.columns.some((x) => x.name === col.name)) t.columns.push(col);
        if (col.references)
          foreignKeys.push({
            table: name,
            column: col.name,
            refTable: col.references.table,
            refColumn: col.references.column,
            line,
          });
      }
    }
  }
  return { tables, foreignKeys };
}

export interface ForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn?: string;
  line: number;
}

// ---------------------------------------------------------------------------------------
// Prisma

const PRISMA_SCALARS = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
]);

/** Models in a Prisma schema file. The table key is the model name (Prisma's client name). */
export function parsePrismaSchema(text: string): { tables: TableDef[]; foreignKeys: ForeignKey[] } {
  const lines = text.split('\n');
  const enums = new Set<string>();
  for (const l of lines) {
    const e = /^\s*enum\s+(\w+)\s*\{/.exec(l);
    if (e) enums.add(e[1]!);
  }
  const models = new Set<string>();
  for (const l of lines) {
    const e = /^\s*model\s+(\w+)\s*\{/.exec(l);
    if (e) models.add(e[1]!);
  }
  const tables: TableDef[] = [];
  const foreignKeys: ForeignKey[] = [];
  let cur: TableDef | null = null;
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const l = raw.replace(/\/\/.*$/, '').trim();
    const start = /^model\s+(\w+)\s*\{/.exec(l);
    if (start) {
      cur = { name: start[1]!, columns: [], line, source: 'prisma' };
      tables.push(cur);
      return;
    }
    if (!cur) return;
    const table: TableDef = cur;
    if (l === '}') {
      cur = null;
      return;
    }
    const map = /^@@map\(\s*"([^"]+)"\s*\)/.exec(l);
    if (map) {
      table.model = table.name;
      table.name = map[1]!;
      return;
    }
    const id = /^@@id\(\s*\[([^\]]*)\]/.exec(l);
    if (id) {
      for (const n of names(id[1]!)) {
        const col = table.columns.find((c) => c.name === n);
        if (col) Object.assign(col, { primaryKey: true, nullable: false });
      }
      return;
    }
    if (l.startsWith('@@') || !l) return;
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(l);
    if (!f) return;
    const [, fname, ftype, list, optional, attrs] = f as unknown as string[];
    if (models.has(ftype!)) {
      // A relation field, not a column: the foreign key is on the `fields` columns.
      const rel = /@relation\([^)]*fields:\s*\[([^\]]*)\][^)]*references:\s*\[([^\]]*)\]/.exec(
        attrs!,
      );
      if (rel) {
        const to = names(rel[2]!);
        names(rel[1]!).forEach((from, k) =>
          foreignKeys.push({
            table: table.model ?? table.name,
            column: from,
            refTable: ftype!,
            refColumn: to[k],
            line,
          }),
        );
      }
      return;
    }
    if (!PRISMA_SCALARS.has(ftype!) && !enums.has(ftype!)) return;
    const col: ColumnDef = {
      name: fname!,
      type: ftype! + (list ? '[]' : ''),
      nullable: optional === '?',
      line,
    };
    const mapped = /@map\(\s*"([^"]+)"\s*\)/.exec(attrs!);
    if (mapped) col.name = mapped[1]!;
    const db = /@db\.(\w+)(?:\(([^)]*)\))?/.exec(attrs!);
    if (db) {
      col.type = db[1]!;
      const args = (db[2] ?? '')
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x > 0);
      Object.assign(col, sizeOf(col.type, args));
    }
    if (/@id\b/.test(attrs!)) Object.assign(col, { primaryKey: true, nullable: false });
    if (/@unique\b/.test(attrs!)) col.unique = true;
    const def = /@default\(((?:[^()]|\([^()]*\))*)\)/.exec(attrs!);
    if (def) col.default = def[1];
    table.columns.push(col);
  });
  // Foreign key columns point at the referenced model.
  for (const fk of foreignKeys) {
    const t = tables.find((x) => (x.model ?? x.name) === fk.table);
    const col = t?.columns.find((c) => c.name === fk.column);
    if (col) col.references = { table: fk.refTable, column: fk.refColumn };
  }
  return { tables, foreignKeys };
}

// ---------------------------------------------------------------------------------------
// Graph

/** The graph key of a table. Prisma tables are keyed by model name, the name client code uses. */
export function tableRef(t: Pick<TableDef, 'name' | 'model'>): NodeRef {
  return { kind: 'table', key: `table:${tableKey(t.model ?? t.name)}` };
}

/** Adds tables and their foreign keys to the graph. Foreign keys to unknown tables are dropped at save. */
export function addSchema(
  graph: GraphBuilder,
  path: string,
  parsed: { tables: TableDef[]; foreignKeys: ForeignKey[] },
): void {
  for (const t of parsed.tables) {
    const ref = tableRef(t);
    const prev = graph.get(ref);
    const prevCols = (prev?.data?.columns as ColumnDef[] | undefined) ?? [];
    // The same table can appear in several places (a Drizzle schema and its migration, or a
    // migration and a later ALTER): the first definition of each column wins, gaps are filled.
    const columns = prevCols.map((c) => ({ ...c }));
    for (const c of t.columns) {
      const same = columns.find((x) => x.name === c.name);
      if (!same) columns.push(c);
      else
        // Fill what the first definition left out (a key, a size, a default); never overwrite.
        for (const [k, v] of Object.entries(c))
          if (v !== undefined && (same as unknown as Record<string, unknown>)[k] === undefined)
            (same as unknown as Record<string, unknown>)[k] = v;
    }
    graph.addNode({
      kind: 'table',
      key: ref.key,
      name: t.name,
      filePath: prev?.filePath ?? path,
      startLine: t.line,
      data: {
        source: t.source,
        columns,
        ...(t.model ? { model: t.model } : {}),
      },
    });
  }
  for (const fk of parsed.foreignKeys) {
    graph.addEdge({
      kind: 'references',
      src: { kind: 'table', key: `table:${tableKey(fk.table)}` },
      dst: { kind: 'table', key: `table:${tableKey(fk.refTable)}` },
      confidence: 'observed',
      evidencePath: path,
      evidenceLine: fk.line,
      detail: `${fk.table}.${fk.column} → ${fk.refTable}${fk.refColumn ? `.${fk.refColumn}` : ''}`,
    });
  }
}

// ---------------------------------------------------------------------------------------
// TypeScript: Drizzle tables, Drizzle queries, SQL strings

const DRIZZLE_TABLE_FN = /^(pg|mysql|sqlite|singlestore|gel)Table$/;
const DRIZZLE_READ = new Set([
  'from',
  'join',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'crossJoin',
]);
const DRIZZLE_WRITE = new Set(['insert', 'update', 'delete']);
const SQL_START = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|REPLACE|MERGE)\b/i;

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function str(e: ts.Expression | undefined): string | undefined {
  return e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined;
}

function num(o: ts.ObjectLiteralExpression | undefined, key: string): number | undefined {
  if (!o) return undefined;
  for (const p of o.properties)
    if (
      ts.isPropertyAssignment(p) &&
      p.name.getText() === key &&
      ts.isNumericLiteral(p.initializer)
    )
      return Number(p.initializer.text);
  return undefined;
}

/** `pgTable('users', …)` → 'users', when `call` is a Drizzle table definition. */
function drizzleTableName(call: ts.Expression | undefined): string | undefined {
  if (!call || !ts.isCallExpression(call)) return undefined;
  const callee = call.expression;
  const fn = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : '';
  if (!DRIZZLE_TABLE_FN.test(fn) && !(fn === 'table' && ts.isPropertyAccessExpression(callee)))
    return undefined;
  return str(call.arguments[0]);
}

/** One Drizzle column: `varchar('email', { length: 255 }).notNull().unique()`. */
function drizzleColumn(
  prop: string,
  init: ts.Expression,
  sf: ts.SourceFile,
  resolveTable: (e: ts.Expression) => string | undefined,
  expandHelper: (call: ts.CallExpression) => ts.Expression | undefined,
): ColumnDef | null {
  const chainOf = (start: ts.Expression): ts.CallExpression[] => {
    const out: ts.CallExpression[] = [];
    let e: ts.Expression = start;
    while (ts.isCallExpression(e)) {
      out.unshift(e);
      if (ts.isPropertyAccessExpression(e.expression)) e = e.expression.expression;
      else break;
    }
    return out;
  };
  let chain = chainOf(init);
  // A local column helper (`const id = () => uuid('id').primaryKey()`): read one level into it.
  const first = chain[0];
  const helper = first && expandHelper(first);
  if (helper) chain = [...chainOf(helper), ...chain.slice(1)];
  const base = chain[0];
  if (!base) return null;
  const type = ts.isIdentifier(base.expression)
    ? base.expression.text
    : ts.isPropertyAccessExpression(base.expression)
      ? base.expression.name.text
      : '';
  if (!type) return null;
  const nameArg = str(base.arguments[0]);
  const opts = base.arguments.find(ts.isObjectLiteralExpression);
  const col: ColumnDef = {
    name: nameArg ?? prop,
    type,
    nullable: !/^(serial|bigserial|smallserial)$/.test(type),
    line: lineOf(sf, init.getStart(sf)),
  };
  const length = num(opts, 'length');
  const precision = num(opts, 'precision');
  const scale = num(opts, 'scale');
  if (length !== undefined) col.length = length;
  if (precision !== undefined) col.precision = precision;
  if (scale !== undefined) col.scale = scale;
  for (const c of chain.slice(1)) {
    if (!ts.isPropertyAccessExpression(c.expression)) continue;
    const m = c.expression.name.text;
    if (m === 'notNull') col.nullable = false;
    else if (m === 'primaryKey') Object.assign(col, { primaryKey: true, nullable: false });
    else if (m === 'unique') col.unique = true;
    else if (m === 'defaultNow') col.default = 'now()';
    else if (m === 'default' || m === '$default' || m === '$defaultFn')
      col.default = c.arguments[0]?.getText(c.getSourceFile()).slice(0, 80);
    else if (m === 'array') col.type += '[]';
    else if (m === 'references') {
      const fn = c.arguments[0];
      const body =
        fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
          ? ts.isArrowFunction(fn) && !ts.isBlock(fn.body)
            ? fn.body
            : undefined
          : undefined;
      if (body && ts.isPropertyAccessExpression(body)) {
        const table =
          resolveTable(body.expression) ?? body.expression.getText(body.getSourceFile());
        col.references = { table, column: body.name.text };
      }
    }
  }
  return col;
}

/**
 * Finds Drizzle tables, Drizzle queries and SQL in string literals. Runs from the reference
 * pass for every node, after the declaration pass.
 */
export class SchemaDetector {
  constructor(private readonly graph: GraphBuilder) {}

  /** The Drizzle table an expression names (`users`, `schema.users`), resolved through imports. */
  private tableOf(e: ts.Expression, checker: ts.TypeChecker): string | undefined {
    const at = ts.isPropertyAccessExpression(e) ? e.name : e;
    let sym = checker.getSymbolAtLocation(at);
    if (sym && sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        return undefined;
      }
    }
    const decl = sym?.valueDeclaration;
    if (decl && ts.isVariableDeclaration(decl)) return drizzleTableName(decl.initializer);
    return undefined;
  }

  /** The returned expression of a zero-argument arrow helper a column calls, if any. */
  private helperBody(call: ts.CallExpression, checker: ts.TypeChecker): ts.Expression | undefined {
    if (!ts.isIdentifier(call.expression) || call.arguments.length) return undefined;
    let sym = checker.getSymbolAtLocation(call.expression);
    if (sym && sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        return undefined;
      }
    }
    const decl = sym?.valueDeclaration;
    const fn = decl && ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
    if (fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body) && ts.isCallExpression(fn.body))
      return fn.body;
    return undefined;
  }

  visit(
    node: ts.Node,
    sf: ts.SourceFile,
    path: string,
    checker: ts.TypeChecker,
    ownerOf: () => NodeRef,
  ): void {
    if (ts.isCallExpression(node)) {
      const name = drizzleTableName(node);
      if (name !== undefined) {
        this.drizzleTable(node, name, sf, path, checker);
        return;
      }
      const callee = node.expression;
      if (!ts.isPropertyAccessExpression(callee)) return;
      const verb = callee.name.text;
      const write = DRIZZLE_WRITE.has(verb);
      if (!write && !DRIZZLE_READ.has(verb)) return;
      const arg = node.arguments[0];
      const table = arg && this.tableOf(arg, checker);
      if (!table) return;
      this.useEdge(
        write ? 'writes_table' : 'reads_table',
        table,
        ownerOf(),
        'observed',
        path,
        lineOf(sf, node.getStart(sf)),
        `${verb}(${arg.getText(sf).slice(0, 40)})`,
      );
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      if (node.parent && ts.isTemplateExpression(node.parent)) return;
      if (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) return;
      const text = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((s) => ` ? ${s.literal.text}`).join('')
        : node.text;
      if (text.length < 12) return;
      const line = lineOf(sf, node.getStart(sf));
      if (/\bCREATE\s+(?:\w+\s+)?TABLE\b/i.test(text)) {
        addSchema(this.graph, path, parseSqlSchema(text, line));
        return;
      }
      if (!SQL_START.test(text)) return;
      for (const u of sqlTableUses(text))
        this.useEdge(
          u.write ? 'writes_table' : 'reads_table',
          u.table,
          ownerOf(),
          'inferred',
          path,
          line,
          `table named in a SQL string: ${text.trim().split('\n')[0]!.slice(0, 80)}`,
        );
    }
  }

  /** A Prisma client call (`prisma.user.findMany()`): inferred read or write of model `user`. */
  prismaCall(node: ts.CallExpression, sf: ts.SourceFile, path: string, owner: NodeRef): void {
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    const model = callee.expression;
    if (!ts.isPropertyAccessExpression(model)) return;
    const op = callee.name.text;
    const read = /^(find|count|aggregate|groupBy)/.test(op);
    const write = /^(create|update|upsert|delete)/.test(op);
    if (!read && !write) return;
    this.useEdge(
      write ? 'writes_table' : 'reads_table',
      model.name.text,
      owner,
      'inferred',
      path,
      lineOf(sf, node.getStart(sf)),
      `Prisma ${model.name.text}.${op}()`,
    );
  }

  private useEdge(
    kind: 'reads_table' | 'writes_table',
    table: string,
    owner: NodeRef,
    confidence: 'observed' | 'inferred',
    path: string,
    line: number,
    detail: string,
  ): void {
    this.graph.addEdge({
      kind,
      src: owner,
      dst: { kind: 'table', key: `table:${tableKey(table)}` },
      confidence,
      evidencePath: path,
      evidenceLine: line,
      detail,
    });
  }

  private drizzleTable(
    call: ts.CallExpression,
    name: string,
    sf: ts.SourceFile,
    path: string,
    checker: ts.TypeChecker,
  ): void {
    const cols = call.arguments[1];
    const table: TableDef = {
      name,
      columns: [],
      line: lineOf(sf, call.getStart(sf)),
      source: 'drizzle',
    };
    const fks: ForeignKey[] = [];
    const resolve = (e: ts.Expression) => this.tableOf(e, checker);
    if (cols && ts.isObjectLiteralExpression(cols)) {
      for (const p of cols.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const col = drizzleColumn(p.name.getText(sf), p.initializer, sf, resolve, (call) =>
          this.helperBody(call, checker),
        );
        if (!col) continue;
        table.columns.push(col);
        if (col.references)
          fks.push({
            table: name,
            column: col.name,
            refTable: col.references.table,
            refColumn: col.references.column,
            line: col.line ?? table.line,
          });
      }
    }
    // Table extras: primaryKey({ columns: [t.a, t.b] }) and foreignKey({ columns, foreignColumns }).
    const extra = call.arguments[2];
    if (extra) {
      const byProp = new Map<string, ColumnDef>();
      if (cols && ts.isObjectLiteralExpression(cols))
        cols.properties.forEach((p, k) => {
          if (ts.isPropertyAssignment(p) && table.columns[k])
            byProp.set(p.name.getText(sf), table.columns[k]!);
        });
      const colOf = (e: ts.Expression) =>
        ts.isPropertyAccessExpression(e) ? byProp.get(e.name.text) : undefined;
      const prop = (o: ts.ObjectLiteralExpression, k: string) => {
        for (const x of o.properties)
          if (ts.isPropertyAssignment(x) && x.name.getText(sf) === k) return x.initializer;
        return undefined;
      };
      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
          const o = n.arguments[0];
          if (o && ts.isObjectLiteralExpression(o)) {
            const columns = prop(o, 'columns');
            if (
              n.expression.text === 'primaryKey' &&
              columns &&
              ts.isArrayLiteralExpression(columns)
            )
              for (const c of columns.elements) {
                const col = colOf(c);
                if (col) Object.assign(col, { primaryKey: true, nullable: false });
              }
            const foreign = prop(o, 'foreignColumns');
            if (
              n.expression.text === 'foreignKey' &&
              columns &&
              foreign &&
              ts.isArrayLiteralExpression(columns) &&
              ts.isArrayLiteralExpression(foreign)
            )
              columns.elements.forEach((c, k) => {
                const col = colOf(c);
                const f = foreign.elements[k];
                if (!col || !f || !ts.isPropertyAccessExpression(f)) return;
                const ref = resolve(f.expression) ?? name;
                col.references = { table: ref, column: f.name.text };
                fks.push({
                  table: name,
                  column: col.name,
                  refTable: ref,
                  refColumn: f.name.text,
                  line: lineOf(sf, n.getStart(sf)),
                });
              });
          }
        }
        ts.forEachChild(n, walk);
      };
      walk(extra);
    }
    addSchema(this.graph, path, { tables: [table], foreignKeys: fks });
  }
}

/** Tables a SQL statement reads (FROM, JOIN) and writes (INSERT INTO, UPDATE, DELETE FROM). */
export function sqlTableUses(sql: string): { table: string; write: boolean }[] {
  const out = new Map<string, boolean>();
  const add = (name: string, write: boolean) => {
    const t = tableKey(name);
    if (!t || /^(select|lateral|unnest|json_each|values)$/.test(t)) return;
    out.set(t, (out.get(t) ?? false) || write);
  };
  const text = stripSqlComments(sql);
  for (const m of text.matchAll(
    new RegExp(`\\bINSERT\\s+(?:OR\\s+\\w+\\s+)?INTO\\s+(${NAME})`, 'gi'),
  ))
    add(m[1]!, true);
  for (const m of text.matchAll(
    new RegExp(`\\bUPDATE\\s+(?:OR\\s+\\w+\\s+)?(${NAME})\\s+SET\\b`, 'gi'),
  ))
    add(m[1]!, true);
  for (const m of text.matchAll(new RegExp(`\\bDELETE\\s+FROM\\s+(${NAME})`, 'gi')))
    add(m[1]!, true);
  const reads = text.replace(/\bDELETE\s+FROM\b/gi, 'DELETE');
  for (const m of reads.matchAll(new RegExp(`\\b(?:FROM|JOIN)\\s+(${NAME})`, 'gi')))
    if (!/^\(/.test(m[1]!)) add(m[1]!, false);
  return [...out].map(([table, write]) => ({ table, write }));
}
