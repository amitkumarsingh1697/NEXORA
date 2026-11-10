/**
 * Rails (Active Record): db/schema.rb, migrations under db/migrate, and model classes. Read from
 * the tree-sitter Ruby tree. db/structure.sql is SQL and is read by the SQL analyser.
 */
import { parseTree } from '@nexora/syntax';
import { railsPlural, railsSingular, railsTableName } from './naming';
import { field, findAll, line, named, stringOf, words, type N } from './tree';
import type { OrmField, OrmFile, OrmTable } from './types';

interface Call {
  method: string;
  receiver?: string;
  pos: N[];
  opts: Map<string, N>;
  block?: N;
  node: N;
}

function callOf(n: N): Call | undefined {
  if (n.type !== 'call' && n.type !== 'method_call') return undefined;
  const method = field(n, 'method')?.text;
  if (!method) return undefined;
  const pos: N[] = [];
  const opts = new Map<string, N>();
  for (const a of named(field(n, 'arguments'))) {
    if (a.type === 'pair') {
      const k = field(a, 'key');
      const key = k ? (stringOf(k) ?? k.text).replace(/:$/, '') : undefined;
      const v = field(a, 'value');
      if (key && v) opts.set(key, v);
    } else if (a.type === 'hash') {
      for (const p of named(a)) {
        const k = field(p, 'key');
        const v = field(p, 'value');
        if (k && v) opts.set((stringOf(k) ?? k.text).replace(/:$/, ''), v);
      }
    } else pos.push(a);
  }
  return {
    method,
    receiver: field(n, 'receiver')?.text,
    pos,
    opts,
    block: field(n, 'block') ?? undefined,
    node: n,
  };
}

const val = (n: N | undefined) => (n ? (stringOf(n) ?? n.text) : undefined);
const isFalse = (n: N | undefined) => n?.type === 'false';
const isTrue = (n: N | undefined) => n?.type === 'true';
const int = (n: N | undefined) => (n?.type === 'integer' ? Number(n.text) : undefined);

const COLUMN_TYPES = new Set([
  'string',
  'text',
  'integer',
  'bigint',
  'float',
  'decimal',
  'numeric',
  'datetime',
  'timestamp',
  'timestamptz',
  'time',
  'date',
  'binary',
  'blob',
  'boolean',
  'json',
  'jsonb',
  'uuid',
  'hstore',
  'inet',
  'cidr',
  'macaddr',
  'citext',
  'ltree',
  'xml',
  'money',
  'interval',
  'bit',
  'bit_varying',
  'point',
  'line',
  'lseg',
  'box',
  'path',
  'polygon',
  'circle',
  'enum',
  'virtual',
  'int4range',
  'int8range',
  'tsrange',
  'tstzrange',
  'numrange',
  'daterange',
  'tsvector',
  'oid',
  'smallint',
  'serial',
  'bigserial',
  'char',
  'mediumtext',
  'longtext',
  'tinytext',
  'mediumblob',
  'longblob',
  'tinyblob',
  'unsigned_integer',
  'unsigned_bigint',
  'year',
  'set',
]);

function columnOpts(f: OrmField, opts: Map<string, N>): OrmField {
  if (isFalse(opts.get('null'))) f.nullable = false;
  else if (isTrue(opts.get('null'))) f.nullable = true;
  const d = opts.get('default');
  if (d) f.default = words(d.text);
  const lim = int(opts.get('limit'));
  if (lim !== undefined) f.length = lim;
  const p = int(opts.get('precision'));
  if (p !== undefined) f.precision = p;
  const s = int(opts.get('scale'));
  if (s !== undefined) f.scale = s;
  if (isTrue(opts.get('primary_key'))) {
    f.primaryKey = true;
    f.nullable = false;
  }
  if (isTrue(opts.get('unique'))) f.unique = true;
  return f;
}

function reference(
  name: string,
  opts: Map<string, N>,
  ln: number,
): { fields: OrmField[]; fk?: { refTable: string; column: string } } {
  const fields: OrmField[] = [];
  const type = val(opts.get('type')) ?? 'bigint';
  const col = columnOpts(
    { column: `${name}_id`, field: name, type, nullable: true, line: ln },
    opts,
  );
  fields.push(col);
  if (isTrue(opts.get('polymorphic')))
    fields.push({
      column: `${name}_type`,
      type: 'string',
      nullable: col.nullable,
      line: ln,
      implicit: 'polymorphic reference: the type column',
    });
  const fk = opts.get('foreign_key');
  if (fk && !isFalse(fk) && !isTrue(opts.get('polymorphic'))) {
    let table = railsPlural(name);
    if (fk.type === 'hash')
      for (const p of named(fk)) {
        const k = field(p, 'key');
        if (k && (stringOf(k) ?? k.text).replace(/:$/, '') === 'to_table')
          table = val(field(p, 'value') ?? undefined) ?? table;
      }
    return { fields, fk: { refTable: table, column: `${name}_id` } };
  }
  return { fields };
}

function readTableBlock(t: OrmTable, block: N | undefined, out: OrmFile): void {
  if (!block) return;
  const param = named(field(block, 'parameters'))[0]?.text ?? 't';
  for (const n of findAll(block, (x) => x.type === 'call')) {
    const c = callOf(n);
    if (!c || c.receiver !== param) continue;
    const ln = line(n);
    const names = c.pos.map((p) => stringOf(p)).filter((x): x is string => x !== undefined);
    if (c.method === 'timestamps') {
      for (const col of ['created_at', 'updated_at'])
        t.fields.push(
          columnOpts(
            {
              column: col,
              type: 'datetime',
              nullable: false,
              line: ln,
              implicit: 'Rails timestamps',
            },
            c.opts,
          ),
        );
    } else if (c.method === 'references' || c.method === 'belongs_to') {
      for (const nm of names) {
        const r = reference(nm, c.opts, ln);
        t.fields.push(...r.fields);
        if (r.fk)
          out.foreignKeys.push({
            framework: 'rails',
            table: t.name,
            column: r.fk.column,
            refTable: r.fk.refTable,
            refColumn: 'id',
            line: ln,
          });
      }
    } else if (c.method === 'primary_key') {
      const [nm, type] = names;
      if (nm)
        t.fields.push(
          columnOpts(
            { column: nm, type: type ?? 'bigint', nullable: false, primaryKey: true, line: ln },
            c.opts,
          ),
        );
    } else if (c.method === 'index') {
      const cols = c.pos[0];
      const one = cols?.type === 'array' ? named(cols) : cols ? [cols] : [];
      if (one.length === 1 && isTrue(c.opts.get('unique'))) {
        const f = t.fields.find((x) => x.column === stringOf(one[0]));
        if (f) f.unique = true;
      }
    } else if (COLUMN_TYPES.has(c.method) || c.method === 'column') {
      const type = c.method === 'column' ? (names[1] ?? 'unknown') : c.method;
      const cols = c.method === 'column' ? names.slice(0, 1) : names;
      for (const nm of cols)
        t.fields.push(columnOpts({ column: nm, type, nullable: true, line: ln }, c.opts));
    }
  }
}

function migrationsAndSchema(root: N, out: OrmFile): void {
  // In a migration, only `change` and `up`: `down` undoes it.
  const downs = findAll(root, (n) => n.type === 'method' && field(n, 'name')?.text === 'down');
  const inDown = (n: N) =>
    downs.some((d) => n.startIndex >= d.startIndex && n.endIndex <= d.endIndex);
  for (const n of findAll(root, (x) => x.type === 'call' || x.type === 'identifier')) {
    if (n.type !== 'call' || inDown(n)) continue;
    const c = callOf(n);
    if (!c || (c.receiver && c.receiver !== 'self')) continue;
    const ln = line(n);
    const [a0, a1, a2] = c.pos.map((p) => stringOf(p));
    if (c.method === 'create_table' && a0) {
      const t: OrmTable = { framework: 'rails', name: a0, line: ln, fields: [] };
      const id = c.opts.get('id');
      const pk = val(c.opts.get('primary_key'));
      if (!isFalse(id))
        t.fields.push({
          column: pk ?? 'id',
          type: id ? (val(id) ?? 'bigint') : 'bigint',
          nullable: false,
          primaryKey: true,
          line: ln,
          implicit: 'Rails adds an id primary key unless id: false',
        });
      readTableBlock(t, c.block, out);
      out.tables.push(t);
    } else if (c.method === 'change_table' && a0) {
      const t: OrmTable = { framework: 'rails', name: a0, line: ln, fields: [], alter: true };
      readTableBlock(t, c.block, out);
      if (t.fields.length) out.tables.push(t);
    } else if (c.method === 'add_column' && a0 && a1) {
      out.tables.push({
        framework: 'rails',
        name: a0,
        line: ln,
        fields: [
          columnOpts({ column: a1, type: a2 ?? 'unknown', nullable: true, line: ln }, c.opts),
        ],
        alter: true,
      });
    } else if ((c.method === 'add_reference' || c.method === 'add_belongs_to') && a0 && a1) {
      const r = reference(a1, c.opts, ln);
      out.tables.push({ framework: 'rails', name: a0, line: ln, fields: r.fields, alter: true });
      if (r.fk)
        out.foreignKeys.push({
          framework: 'rails',
          table: a0,
          column: r.fk.column,
          refTable: r.fk.refTable,
          refColumn: 'id',
          line: ln,
        });
    } else if (c.method === 'add_timestamps' && a0) {
      out.tables.push({
        framework: 'rails',
        name: a0,
        line: ln,
        alter: true,
        fields: ['created_at', 'updated_at'].map((col) =>
          columnOpts(
            {
              column: col,
              type: 'datetime',
              nullable: false,
              line: ln,
              implicit: 'Rails timestamps',
            },
            c.opts,
          ),
        ),
      });
    } else if (c.method === 'add_foreign_key' && a0 && a1) {
      const column = val(c.opts.get('column')) ?? `${railsSingular(a1)}_id`;
      out.foreignKeys.push({
        framework: 'rails',
        table: a0,
        column,
        refTable: a1,
        refColumn: val(c.opts.get('primary_key')) ?? 'id',
        line: ln,
      });
    } else if (c.method === 'create_join_table' && a0 && a1) {
      // ActiveRecord find_join_table_name: both names sorted, a shared prefix written once.
      const [x, y] = [a0, a1].sort() as [string, string];
      const joined = `${x}\0${y}`.replace(/^(.*_)(.+)\0\1(.+)/, '$1$2_$3').replace('\0', '_');
      const name = val(c.opts.get('table_name')) ?? joined;
      const t: OrmTable = {
        framework: 'rails',
        name,
        line: ln,
        fields: [a0, a1].map((tb) => ({
          column: `${railsSingular(tb)}_id`,
          type: 'bigint',
          nullable: false,
          line: ln,
          implicit: 'create_join_table column',
        })),
      };
      readTableBlock(t, c.block, out);
      out.tables.push(t);
    }
  }
}

function models(root: N, out: OrmFile): void {
  for (const k of findAll(root, (n) => n.type === 'class')) {
    const name = field(k, 'name')?.text;
    const sup = field(k, 'superclass')?.text.replace(/^<\s*/, '').trim();
    if (!name || !sup || !/^(ApplicationRecord|ActiveRecord::Base|\w*Record)$/.test(sup)) continue;
    if (name === 'ApplicationRecord') continue;
    let table: string | undefined;
    let abstract = false;
    for (const a of findAll(k, (n) => n.type === 'assignment')) {
      const l = field(a, 'left')?.text;
      if (l === 'self.table_name') table = stringOf(field(a, 'right'));
      if (l === 'self.abstract_class' && field(a, 'right')?.type === 'true') abstract = true;
    }
    if (abstract) continue;
    const bare = name.split('::').pop()!;
    out.uses.push({
      framework: 'rails',
      owner: name,
      line: line(k),
      ...(table ? { table } : { candidates: [railsTableName(bare)] }),
      access: 'maps',
      detail: table
        ? `${bare} maps to table ${table} (self.table_name)`
        : `${bare} maps to table ${railsTableName(bare)} (Rails default: the class name, underscored and pluralised)`,
    });
  }
}

export function readRuby(path: string, source: string): OrmFile | null {
  const schema =
    /(^|\/)db\/(schema|[\w-]+_schema)\.rb$/.test(path) ||
    /(^|\/)db\/migrate\//.test(path) ||
    /ActiveRecord::(Schema|Migration)/.test(source);
  const model = /<\s*(ApplicationRecord|ActiveRecord::Base)\b/.test(source);
  if (!schema && !model) return null;
  const tree = parseTree('ruby', source);
  const out: OrmFile = {
    path,
    frameworks: ['rails'],
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  if (tree instanceof Error) {
    out.problems.push({ line: 1, message: tree.message });
    return out;
  }
  try {
    if (schema) migrationsAndSchema(tree.rootNode, out);
    if (model) models(tree.rootNode, out);
  } finally {
    tree.delete();
  }
  return out;
}
