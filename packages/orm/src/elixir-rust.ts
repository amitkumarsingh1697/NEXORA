/**
 * Ecto (Elixir) schemas and migrations, read from the tree-sitter Elixir tree; Diesel
 * `table!` schemas and SeaORM entities (Rust), read from their macro and attribute text, which
 * the Rust grammar leaves as unparsed token trees. SeaORM relations (the Relation enum) name
 * entity modules, not tables, and are not read.
 */
import { parseTree } from '@nexora/syntax';
import { snake } from './naming';
import { field, findAll, line, endLine, named, words, type N } from './tree';
import type { OrmField, OrmFile, OrmTable } from './types';

// ---------------------------------------------------------------------------------- Ecto

interface ExCall {
  target: string;
  args: N[];
  kw: Map<string, N>;
  block?: N;
  node: N;
}

function exCall(n: N): ExCall | undefined {
  if (n.type !== 'call') return undefined;
  const target = field(n, 'target')?.text;
  if (!target) return undefined;
  const argsNode = named(n).find((x) => x.type === 'arguments');
  const args: N[] = [];
  const kw = new Map<string, N>();
  for (const a of named(argsNode)) {
    if (a.type === 'keywords')
      for (const p of named(a)) {
        const k = field(p, 'key')?.text.replace(/:\s*$/, '');
        const v = field(p, 'value');
        if (k && v) kw.set(k, v);
      }
    else args.push(a);
  }
  return { target, args, kw, block: named(n).find((x) => x.type === 'do_block'), node: n };
}

const exStr = (n: N | undefined) => {
  if (!n) return undefined;
  if (n.type === 'string') return named(n).find((x) => x.type === 'quoted_content')?.text ?? '';
  if (n.type === 'atom') return n.text.replace(/^:/, '');
  return undefined;
};
const exBool = (n: N | undefined) => (n?.type === 'boolean' ? n.text === 'true' : undefined);

function children(block: N | undefined): ExCall[] {
  return named(block)
    .map((x) => exCall(x))
    .filter((x): x is ExCall => !!x);
}

function ectoSchema(mod: N, modName: string, out: OrmFile): void {
  const body = named(mod).find((x) => x.type === 'do_block');
  let pk: OrmField | null | undefined;
  for (const u of named(body)) {
    if (u.type !== 'unary_operator') continue;
    const t = words(u.text);
    if (/^@primary_key\s+false/.test(t)) pk = null;
    const m = /^@primary_key\s*\{\s*:(\w+)\s*,\s*:?([\w.]+)/.exec(t);
    if (m)
      pk = {
        column: m[1],
        field: m[1],
        type: m[2]!,
        primaryKey: true,
        nullable: false,
        line: line(u),
      };
  }
  for (const c of children(body)) {
    if (c.target !== 'schema' && c.target !== 'embedded_schema') continue;
    if (c.target === 'embedded_schema') continue;
    const table = exStr(c.args[0]);
    if (!table) continue;
    const fields: OrmField[] = [];
    const model = modName.split('.').pop()!;
    for (const f of children(c.block)) {
      const name = exStr(f.args[0]);
      const ln = line(f.node);
      if (f.target === 'field' && name) {
        if (exBool(f.kw.get('virtual'))) continue;
        const fd: OrmField = {
          field: name,
          column: exStr(f.kw.get('source')) ?? name,
          type: f.args[1] ? words(f.args[1].text).replace(/^:/, '') : 'string',
          nullable: true,
          line: ln,
        };
        const d = f.kw.get('default');
        if (d) fd.default = words(d.text);
        if (exBool(f.kw.get('primary_key'))) {
          fd.primaryKey = true;
          fd.nullable = false;
        }
        fields.push(fd);
      } else if (f.target === 'belongs_to' && name) {
        if (f.kw.get('define_field')?.text === 'false') continue;
        const target = f.args[1]?.text;
        fields.push({
          field: name,
          column: exStr(f.kw.get('foreign_key')) ?? `${name}_id`,
          type: exStr(f.kw.get('type')) ?? 'id',
          nullable: true,
          line: ln,
          // Ecto: references defaults to :id on the other schema, whatever its primary key is.
          ...(target
            ? {
                ref: {
                  model: target.split('.').pop()!,
                  column: exStr(f.kw.get('references')) ?? 'id',
                },
              }
            : {}),
        });
      } else if ((f.target === 'embeds_one' || f.target === 'embeds_many') && name) {
        fields.push({
          field: name,
          column: exStr(f.kw.get('source')) ?? name,
          type: f.target === 'embeds_one' ? 'map' : '{:array, :map}',
          nullable: true,
          line: ln,
        });
      } else if (f.target === 'many_to_many' && name) {
        const jt = exStr(f.kw.get('join_through'));
        const target = f.args[1]?.text.split('.').pop();
        if (jt && target)
          fields.push({
            field: name,
            type: 'many_to_many',
            line: ln,
            joinTable: {
              target: { model: target },
              name: jt,
              ownColumn: (own) => `${snake(own.model)}_id`,
              otherColumn: (other) => `${snake(other.model)}_id`,
            },
          });
      } else if (f.target === 'timestamps') {
        const ins = exStr(f.kw.get('inserted_at')) ?? 'inserted_at';
        const upd = exStr(f.kw.get('updated_at')) ?? 'updated_at';
        for (const col of [ins, upd])
          fields.push({
            column: col,
            type: exStr(f.kw.get('type')) ?? 'naive_datetime',
            nullable: false,
            line: ln,
            implicit: 'Ecto timestamps()',
          });
      }
    }
    out.models.push({
      framework: 'ecto',
      model,
      line: line(c.node),
      endLine: endLine(c.node),
      table,
      bases: [],
      root: true,
      role: 'entity',
      fields,
      ...(pk === null
        ? {}
        : {
            implicitPk: pk ?? {
              column: 'id',
              field: 'id',
              type: 'id',
              primaryKey: true,
              nullable: false,
              line: line(c.node),
              implicit: 'Ecto adds an id primary key unless @primary_key false',
            },
          }),
    });
  }
}

function ectoMigration(root: N, out: OrmFile): void {
  const downs = findAll(root, (n) => {
    const c = n.type === 'call' ? exCall(n) : undefined;
    return !!c && c.target === 'def' && c.args[0]?.text === 'down';
  });
  const inDown = (n: N) =>
    downs.some((d) => n.startIndex >= d.startIndex && n.endIndex <= d.endIndex);
  for (const n of findAll(root, (x) => x.type === 'call')) {
    const c = exCall(n);
    if (!c || inDown(n) || !['create', 'create_if_not_exists', 'alter'].includes(c.target))
      continue;
    const tcall = c.args[0] && exCall(c.args[0]);
    if (!tcall || tcall.target !== 'table') continue;
    const name = exStr(tcall.args[0]);
    if (!name) continue;
    const t: OrmTable = {
      framework: 'ecto',
      name,
      line: line(n),
      fields: [],
      ...(c.target === 'alter' ? { alter: true } : {}),
    };
    if (c.target !== 'alter' && tcall.kw.get('primary_key')?.text !== 'false')
      t.fields.push({
        column: 'id',
        type: 'bigserial',
        primaryKey: true,
        nullable: false,
        line: line(n),
        implicit: 'Ecto migrations add an id primary key unless primary_key: false',
      });
    for (const a of children(c.block)) {
      const col = exStr(a.args[0]);
      const ln = line(a.node);
      if ((a.target === 'add' || a.target === 'add_if_not_exists') && col) {
        const typeNode = a.args[1];
        const ref = typeNode && exCall(typeNode);
        const f: OrmField = {
          column: col,
          type: typeNode ? words(typeNode.text).replace(/^:/, '') : 'unknown',
          nullable: true,
          line: ln,
        };
        if (ref?.target === 'references') {
          const rt = exStr(ref.args[0]);
          f.type = exStr(ref.kw.get('type')) ?? 'bigint';
          if (rt) f.ref = { table: rt, column: exStr(ref.kw.get('column')) ?? 'id' };
        }
        if (exBool(a.kw.get('null')) === false) f.nullable = false;
        if (exBool(a.kw.get('primary_key'))) {
          f.primaryKey = true;
          f.nullable = false;
        }
        const size = a.kw.get('size');
        if (size?.type === 'integer') f.length = Number(size.text);
        const d = a.kw.get('default');
        if (d) f.default = words(d.text);
        t.fields.push(f);
      } else if (a.target === 'timestamps') {
        for (const cn of [
          exStr(a.kw.get('inserted_at')) ?? 'inserted_at',
          exStr(a.kw.get('updated_at')) ?? 'updated_at',
        ])
          t.fields.push({
            column: cn,
            type: exStr(a.kw.get('type')) ?? 'naive_datetime',
            nullable: false,
            line: ln,
            implicit: 'Ecto timestamps()',
          });
      }
    }
    out.tables.push(t);
  }
}

export function readElixir(path: string, source: string): OrmFile | null {
  const schema = /use\s+Ecto\.Schema\b/.test(source);
  const migration = /use\s+Ecto\.Migration\b/.test(source);
  if (!schema && !migration) return null;
  const tree = parseTree('elixir', source);
  const out: OrmFile = {
    path,
    frameworks: ['ecto'],
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
    if (schema)
      for (const n of findAll(tree.rootNode, (x) => x.type === 'call')) {
        const c = exCall(n);
        if (c?.target === 'defmodule' && c.args[0]?.type === 'alias')
          ectoSchema(n, c.args[0].text, out);
      }
    if (migration) ectoMigration(tree.rootNode, out);
  } finally {
    tree.delete();
  }
  return out;
}

// ---------------------------------------------------------------------------------- Rust

const lineAt = (text: string, i: number) => text.slice(0, i).split('\n').length;

function diesel(source: string, out: OrmFile): void {
  const re = /\btable!\s*\{/g;
  for (let m; (m = re.exec(source));) {
    // The macro body, by brace depth.
    let d = 0;
    let end = m.index + m[0].length - 1;
    for (; end < source.length; end++) {
      if (source[end] === '{') d++;
      else if (source[end] === '}' && --d === 0) break;
    }
    const body = source.slice(m.index + m[0].length, end);
    const base = m.index + m[0].length;
    const head = /^\s*(?:#\[[^\]]*\]\s*)*(?:(\w+)\.)?(\w+)\s*(?:\(([^)]*)\))?\s*\{/.exec(body);
    if (!head) continue;
    const name = head[2]!;
    const sqlName = /#\[sql_name\s*=\s*"([^"]+)"\]/.exec(
      body.slice(0, head.index + head[0].length),
    )?.[1];
    const pks = (head[3] ?? 'id')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const cols = body.slice(head[0].length);
    const t: OrmTable = {
      framework: 'diesel',
      name: sqlName ?? name,
      line: lineAt(source, base + head.index),
      fields: [],
    };
    const colRe = /((?:#\[[^\]]*\]\s*)*)(\w+)\s*->\s*([^,\n]+?)\s*,/g;
    for (let c; (c = colRe.exec(cols));) {
      const attrs = c[1] ?? '';
      const col = /#\[sql_name\s*=\s*"([^"]+)"\]/.exec(attrs)?.[1] ?? c[2]!;
      let type = c[3]!.trim();
      const nullable = /^Nullable<(.+)>$/.exec(type);
      if (nullable) type = nullable[1]!;
      const f: OrmField = {
        field: c[2],
        column: col,
        type,
        nullable: !!nullable,
        line: lineAt(source, base + head[0].length + c.index + attrs.length),
      };
      const ml = /#\[max_length\s*=\s*(\d+)\]/.exec(attrs);
      if (ml) f.length = Number(ml[1]);
      if (pks.includes(c[2]!)) {
        f.primaryKey = true;
        f.nullable = false;
      }
      t.fields.push(f);
    }
    out.tables.push(t);
  }
  const join = /\bjoinable!\s*\(\s*(\w+)\s*->\s*(\w+)\s*\(\s*(\w+)\s*\)\s*\)/g;
  for (let j; (j = join.exec(source));)
    out.foreignKeys.push({
      framework: 'diesel',
      table: j[1]!,
      column: j[3]!,
      refTable: j[2]!,
      line: lineAt(source, j.index),
    });
}

function seaOrm(source: string, out: OrmFile): void {
  const re =
    /#\[sea_orm\(([^\]]*table_name\s*=\s*"([^"]+)"[^\]]*)\)\]\s*(?:#\[[^\]]*\]\s*)*pub\s+struct\s+(\w+)\s*\{/g;
  for (let m; (m = re.exec(source));) {
    const start = m.index + m[0].length;
    let d = 1;
    let end = start;
    for (; end < source.length && d > 0; end++) {
      if (source[end] === '{') d++;
      else if (source[end] === '}') d--;
    }
    const body = source.slice(start, end - 1);
    const fields: OrmField[] = [];
    const fre = /((?:#\[[^\]]*\]\s*)*)pub\s+(\w+)\s*:\s*([^,\n]+?)\s*,/g;
    for (let f; (f = fre.exec(body));) {
      const attrs = f[1] ?? '';
      const sea = [...attrs.matchAll(/#\[sea_orm\(([^\]]*)\)\]/g)].map((x) => x[1]).join(',');
      if (/\bignore\b/.test(sea)) continue;
      let type = f[3]!.trim();
      const opt = /^Option<(.+)>$/.exec(type);
      if (opt) type = opt[1]!;
      const fd: OrmField = {
        field: f[2],
        column: /column_name\s*=\s*"([^"]+)"/.exec(sea)?.[1] ?? f[2],
        type: /column_type\s*=\s*"([^"]+)"/.exec(sea)?.[1] ?? type,
        nullable: !!opt || /\bnullable\b/.test(sea),
        line: lineAt(source, start + f.index + attrs.length),
      };
      if (/\bprimary_key\b/.test(sea)) {
        fd.primaryKey = true;
        fd.nullable = false;
      }
      if (/\bunique\b/.test(sea)) fd.unique = true;
      const dv = /default_value\s*=\s*("[^"]*"|[^,)]+)/.exec(sea);
      if (dv) fd.default = dv[1]!.trim();
      fields.push(fd);
    }
    out.tables.push({ framework: 'sea-orm', name: m[2]!, line: lineAt(source, m.index), fields });
    // The Relation enum names other entities by module path, not by table, so it is not read.
  }
}

export function readRust(path: string, source: string): OrmFile | null {
  const d = /\btable!\s*\{/.test(source);
  const s = /DeriveEntityModel|#\[sea_orm\(/.test(source);
  if (!d && !s) return null;
  const out: OrmFile = {
    path,
    frameworks: [],
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  if (d) {
    out.frameworks.push('diesel');
    diesel(source, out);
  }
  if (s) {
    out.frameworks.push('sea-orm');
    seaOrm(source, out);
  }
  return out;
}
