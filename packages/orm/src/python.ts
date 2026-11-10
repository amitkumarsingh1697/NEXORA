/**
 * Python ORMs: Django models and migrations, SQLAlchemy (declarative classes, Flask-SQLAlchemy
 * models and `Table(...)`), Alembic migrations and Peewee models. Read from the tree-sitter
 * Python tree; nothing is executed.
 */
import { parseTree } from '@nexora/syntax';
import { flaskSnake } from './naming';
import { field, findAll, line, endLine, named, stringOf, words, type N } from './tree';
import type { OrmField, OrmFile, OrmFramework, OrmTable } from './types';

/** Which Python ORMs a file uses, from its imports. */
export function pythonFrameworks(text: string): OrmFramework[] {
  const out: OrmFramework[] = [];
  if (/^\s*(from\s+django\.db\s+import|import\s+django\.db|from\s+django\.db\.models)/m.test(text))
    out.push('django');
  if (/^\s*(from|import)\s+(sqlalchemy|flask_sqlalchemy|sqlmodel)\b/m.test(text))
    out.push('sqlalchemy');
  if (/^\s*(from|import)\s+alembic\b/m.test(text)) out.push('alembic');
  if (/^\s*(from|import)\s+peewee\b/m.test(text)) out.push('peewee');
  return out;
}

const lastName = (s: string) => s.split('.').pop() ?? s;

interface Call {
  fn: string;
  pos: N[];
  kw: Map<string, N>;
  node: N;
}

function callOf(n: N | null | undefined): Call | undefined {
  if (!n || n.type !== 'call') return undefined;
  const fn = field(n, 'function');
  const args = field(n, 'arguments');
  if (!fn) return undefined;
  const pos: N[] = [];
  const kw = new Map<string, N>();
  for (const a of named(args)) {
    if (a.type === 'keyword_argument') {
      const k = field(a, 'name')?.text;
      const v = field(a, 'value');
      if (k && v) kw.set(k, v);
    } else if (a.type !== 'comment') pos.push(a);
  }
  return { fn: fn.text.replace(/\s+/g, ''), pos, kw, node: n };
}

const bool = (n: N | undefined) => (n ? n.type === 'true' : undefined);
const int = (n: N | undefined) => (n && n.type === 'integer' ? Number(n.text) : undefined);
const text = (n: N | undefined) => (n ? words(n.text).slice(0, 120) : undefined);

interface ClassInfo {
  name: string;
  node: N;
  bases: string[];
  body: N[];
  meta: Map<string, N>;
}

function classes(root: N): ClassInfo[] {
  const out: ClassInfo[] = [];
  for (const c of findAll(root, (n) => n.type === 'class_definition')) {
    // Skip `class Meta` and other classes nested inside a class.
    let p = c.parent;
    let nested = false;
    while (p) {
      if (p.type === 'class_definition') nested = true;
      p = p.parent;
    }
    if (nested) continue;
    const name = field(c, 'name')?.text;
    if (!name) continue;
    const bases = named(field(c, 'superclasses'))
      .filter((b) => b.type !== 'keyword_argument')
      .map((b) => b.text.replace(/\s+/g, ''));
    const body = named(field(c, 'body'));
    const meta = new Map<string, N>();
    for (const s of body)
      if (s.type === 'class_definition' && field(s, 'name')?.text === 'Meta')
        for (const st of named(field(s, 'body'))) {
          const a = st.type === 'expression_statement' ? named(st)[0] : undefined;
          if (a?.type === 'assignment') {
            const k = field(a, 'left')?.text;
            const v = field(a, 'right');
            if (k && v) meta.set(k, v);
          }
        }
    out.push({ name, node: c, bases, body, meta });
  }
  return out;
}

/** `name = value` and `name: T = value` statements in a class body. */
function assignments(body: N[]): { name: string; type?: N; value?: N; node: N }[] {
  const out: { name: string; type?: N; value?: N; node: N }[] = [];
  for (const s of body) {
    const a = s.type === 'expression_statement' ? named(s)[0] : undefined;
    if (a?.type !== 'assignment') continue;
    const left = field(a, 'left');
    if (left?.type !== 'identifier') continue;
    out.push({
      name: left.text,
      type: field(a, 'type') ?? undefined,
      value: field(a, 'right') ?? undefined,
      node: a,
    });
  }
  return out;
}

/** The model a relation names: an identifier, a dotted name or a string ('app.Model', 'self'). */
function targetOf(n: N | undefined): string | undefined {
  if (!n) return undefined;
  const s = stringOf(n);
  if (s !== undefined) return s;
  if (n.type === 'identifier' || n.type === 'attribute') return n.text;
  return undefined;
}

// ------------------------------------------------------------------------------- Django

const DJANGO_RELATION = new Set(['ForeignKey', 'OneToOneField', 'ManyToManyField']);
const DJANGO_NO_COLUMN = new Set(['GenericForeignKey', 'GenericRelation', 'ManyToManyField']);

function djangoField(
  name: string,
  value: N | undefined,
  owner: string,
): OrmField | OrmField[] | undefined {
  const c = callOf(value);
  if (!c) return undefined;
  const cls = lastName(c.fn);
  if (!/Field$|^ForeignKey$/.test(cls) || cls === 'Field') return undefined;
  if (DJANGO_NO_COLUMN.has(cls) && cls !== 'ManyToManyField') return [];
  const ln = line(c.node);
  if (cls === 'ManyToManyField') {
    const to = targetOf(c.kw.get('to') ?? c.pos[0]);
    if (!to || c.kw.has('through')) return [];
    const dbTable = stringOf(c.kw.get('db_table'));
    // Django names both columns after their models, with from_/to_ when a model relates to itself.
    const self = to === 'self' || lastName(to).toLowerCase() === owner.toLowerCase();
    return {
      field: name,
      type: cls,
      line: ln,
      joinTable: {
        target: { model: to },
        name: dbTable,
        derive: (own) => `${own.table}_${name}`,
        ownColumn: (own) => `${self ? 'from_' : ''}${own.model.toLowerCase()}_id`,
        otherColumn: (other) => `${self ? 'to_' : ''}${other.model.toLowerCase()}_id`,
      },
    };
  }
  const f: OrmField = {
    field: name,
    type: cls,
    line: ln,
    nullable: bool(c.kw.get('null')) ?? false,
  };
  if (bool(c.kw.get('primary_key'))) f.primaryKey = true;
  if (bool(c.kw.get('unique')) || cls === 'OneToOneField') f.unique = true;
  const dflt = c.kw.get('default');
  if (dflt) f.default = text(dflt);
  const ml = int(c.kw.get('max_length'));
  if (ml !== undefined) f.length = ml;
  const md = int(c.kw.get('max_digits'));
  if (md !== undefined) f.precision = md;
  const dp = int(c.kw.get('decimal_places'));
  if (dp !== undefined) f.scale = dp;
  const col = stringOf(c.kw.get('db_column'));
  if (DJANGO_RELATION.has(cls)) {
    const to = targetOf(c.kw.get('to') ?? c.pos[0]);
    if (to) f.ref = { model: to };
    const toField = stringOf(c.kw.get('to_field'));
    if (toField && f.ref) f.ref.column = toField;
    f.column = col ?? `${name}_id`;
  } else f.column = col ?? name;
  return f;
}

const djangoPk = (ln: number): OrmField => ({
  column: 'id',
  field: 'id',
  type: 'AutoField',
  primaryKey: true,
  nullable: false,
  line: ln,
  implicit: 'Django adds an id primary key (AutoField or BigAutoField, from DEFAULT_AUTO_FIELD)',
});

/** The app label: the package that holds models.py, or the one above a models/ or migrations/ package. */
export function djangoAppLabel(path: string): string {
  const parts = path.split('/');
  parts.pop();
  while (
    parts.length &&
    (parts[parts.length - 1] === 'models' || parts[parts.length - 1] === 'migrations')
  )
    parts.pop();
  return parts[parts.length - 1] ?? '';
}

function djangoModels(root: N, path: string, out: OrmFile): void {
  const app = djangoAppLabel(path);
  for (const c of classes(root)) {
    const root_ = c.bases.some(
      (b) => b === 'models.Model' || b === 'Model' || b === 'django.db.models.Model',
    );
    const fields: OrmField[] = [];
    for (const a of assignments(c.body)) {
      const f = djangoField(a.name, a.value, c.name);
      if (Array.isArray(f)) continue;
      if (f) fields.push(f);
    }
    if (!root_ && !fields.length && !c.meta.size) continue;
    const abstract = bool(c.meta.get('abstract')) === true;
    const proxy = bool(c.meta.get('proxy')) === true;
    const dbTable = stringOf(c.meta.get('db_table'));
    const label = stringOf(c.meta.get('app_label')) ?? app;
    out.models.push({
      framework: 'django',
      model: c.name,
      line: line(c.node),
      endLine: endLine(c.node),
      table: dbTable,
      defaultTable: `${label}_${c.name.toLowerCase()}`,
      rule: 'Django default: <app label>_<model name in lower case>',
      bases: c.bases,
      root: root_,
      role: abstract ? 'abstract' : proxy ? 'proxy' : 'entity',
      inherit: 'joined',
      fields,
      implicitPk: djangoPk(line(c.node)),
      parentLink: (p) => ({
        column: `${p.model.toLowerCase()}_ptr_id`,
        field: `${p.model.toLowerCase()}_ptr`,
        type: 'OneToOneField',
        primaryKey: true,
        nullable: false,
        line: line(c.node),
        ref: { table: p.table, column: p.pk },
        implicit: `Django multi-table inheritance: a one-to-one key to ${p.model}`,
      }),
      scope: label,
    });
  }
}

function djangoMigrations(root: N, path: string, out: OrmFile): void {
  const app = djangoAppLabel(path);
  for (const n of findAll(root, (x) => x.type === 'call')) {
    const c = callOf(n);
    if (!c) continue;
    const op = lastName(c.fn);
    if (op === 'CreateModel') {
      const name = stringOf(c.kw.get('name') ?? c.pos[0]);
      const list = c.kw.get('fields') ?? c.pos[1];
      if (!name || list?.type !== 'list') continue;
      const fields: OrmField[] = [];
      for (const t of named(list)) {
        if (t.type !== 'tuple') continue;
        const [k, v] = named(t);
        const fname = stringOf(k);
        if (!fname) continue;
        const f = djangoField(fname, v, name);
        if (f && !Array.isArray(f)) fields.push(f);
      }
      let dbTable: string | undefined;
      const opts = c.kw.get('options');
      if (opts?.type === 'dictionary')
        for (const p of named(opts))
          if (p.type === 'pair' && stringOf(field(p, 'key')) === 'db_table')
            dbTable = stringOf(field(p, 'value'));
      const bases = c.kw.get('bases');
      out.models.push({
        framework: 'django',
        model: name,
        line: line(n),
        table: dbTable,
        defaultTable: `${app}_${name.toLowerCase()}`,
        rule: 'Django default: <app label>_<model name in lower case>',
        bases: bases ? named(bases).map((b) => (stringOf(b) ?? b.text).split('.').pop()!) : [],
        root: true,
        role: 'entity',
        fields,
        implicitPk: djangoPk(line(n)),
        scope: app,
        virtual: true,
      });
    } else if (op === 'RenameField') {
      const model = stringOf(c.kw.get('model_name') ?? c.pos[0]);
      const from = stringOf(c.kw.get('old_name') ?? c.pos[1]);
      const to = stringOf(c.kw.get('new_name') ?? c.pos[2]);
      if (model && from && to)
        (out.migrationOps ??= []).push({
          framework: 'django',
          op: 'rename-field',
          model,
          value: from,
          to,
          scope: app,
          line: line(n),
        });
    } else if (
      op === 'RenameModel' ||
      op === 'DeleteModel' ||
      op === 'AlterModelTable' ||
      op === 'RemoveField'
    ) {
      const model = stringOf(
        c.kw.get(
          op === 'RenameModel' ? 'old_name' : op === 'RemoveField' ? 'model_name' : 'name',
        ) ?? c.pos[0],
      );
      const value =
        op === 'RenameModel'
          ? stringOf(c.kw.get('new_name') ?? c.pos[1])
          : op === 'AlterModelTable'
            ? (stringOf(c.kw.get('table') ?? c.pos[1]) ?? undefined)
            : op === 'RemoveField'
              ? stringOf(c.kw.get('name') ?? c.pos[1])
              : undefined;
      if (!model || ((op === 'RenameModel' || op === 'RemoveField') && !value)) continue;
      (out.migrationOps ??= []).push({
        framework: 'django',
        op:
          op === 'RenameModel'
            ? 'rename'
            : op === 'DeleteModel'
              ? 'delete'
              : op === 'AlterModelTable'
                ? 'table'
                : 'remove-field',
        model,
        ...(value !== undefined ? { value } : {}),
        scope: app,
        line: line(n),
      });
    } else if (op === 'AddField' || op === 'AlterField') {
      const model = stringOf(c.kw.get('model_name') ?? c.pos[0]);
      const fname = stringOf(c.kw.get('name') ?? c.pos[1]);
      const f =
        fname && model ? djangoField(fname, c.kw.get('field') ?? c.pos[2], model) : undefined;
      if (!model || !f || Array.isArray(f)) continue;
      out.models.push({
        framework: 'django',
        model,
        line: line(n),
        bases: [],
        root: true,
        role: 'patch',
        fields: [f],
        scope: app,
        virtual: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------- SQLAlchemy

const SA_COLUMN = new Set(['Column', 'mapped_column', 'Field']);

/** `Optional[X]`, `X | None`, `Union[X, None]`. */
function optionalType(t: string): { type: string; optional: boolean } {
  let m = /^Optional\[(.+)\]$/.exec(t);
  if (m) return { type: m[1]!, optional: true };
  m = /^(.+?)\s*\|\s*None$/.exec(t) ?? /^None\s*\|\s*(.+)$/.exec(t);
  if (m) return { type: m[1]!, optional: true };
  m = /^Union\[(.+),\s*None\]$/.exec(t);
  if (m) return { type: m[1]!, optional: true };
  return { type: t, optional: false };
}

function saColumn(attr: string | undefined, c: Call, mapped?: string): OrmField | undefined {
  const pos = [...c.pos];
  let column: string | undefined;
  const first = pos[0];
  if (first && stringOf(first) !== undefined) {
    column = stringOf(first);
    pos.shift();
  }
  column ??= stringOf(c.kw.get('name')) ?? attr;
  if (!column) return undefined;
  let type: string | undefined;
  let ref: OrmField['ref'];
  for (const p of pos) {
    const pc = callOf(p);
    if (pc && lastName(pc.fn) === 'ForeignKey') {
      const target = stringOf(pc.pos[0]);
      if (target) {
        const [t, col] = target.includes('.')
          ? [target.slice(0, target.lastIndexOf('.')), target.slice(target.lastIndexOf('.') + 1)]
          : [target, undefined];
        ref = { table: t.split('.').pop(), column: col };
      }
      continue;
    }
    if (pc && /Identity|Sequence|Computed/.test(pc.fn)) continue;
    type ??= words(p.text).replace(/^(sa|db|sqlalchemy)\./, '');
  }
  const typeKw = c.kw.get('type_');
  if (!type && typeKw) type = words(typeKw.text);
  let optional = false;
  if (mapped) {
    const o = optionalType(mapped);
    optional = o.optional;
    type ??= o.type;
  }
  const pk = bool(c.kw.get('primary_key')) === true;
  const nullableKw = bool(c.kw.get('nullable'));
  // Column(): nullable unless a primary key. mapped_column() under Mapped[]: from Optional.
  const nullable = nullableKw ?? (pk ? false : mapped !== undefined ? optional : true);
  const f: OrmField = {
    column,
    field: attr,
    // Without a type, SQLAlchemy takes the type of the column the foreign key points at.
    type: type ?? (ref ? `type of ${ref.table}.${ref.column ?? ''}` : 'unknown'),
    nullable,
    line: line(c.node),
  };
  if (pk) f.primaryKey = true;
  if (bool(c.kw.get('unique'))) f.unique = true;
  const d = c.kw.get('server_default') ?? c.kw.get('default');
  if (d) f.default = text(d);
  const len = /String\((\d+)\)|String\(length=(\d+)\)/.exec(type ?? '');
  if (len) f.length = Number(len[1] ?? len[2]);
  const num = /Numeric\((\d+),\s*(\d+)\)/.exec(type ?? '');
  if (num) {
    f.precision = Number(num[1]);
    f.scale = Number(num[2]);
  }
  if (ref) f.ref = ref;
  return f;
}

function mappedInner(t: N | undefined): string | undefined {
  if (!t) return undefined;
  const m = /^Mapped\[(.+)\]$/s.exec(words(t.text));
  return m?.[1];
}

function sqlalchemy(root: N, out: OrmFile, alembicOnly: boolean): void {
  if (!alembicOnly)
    for (const c of classes(root)) {
      const as = assignments(c.body);
      const tablename = as.find((a) => a.name === '__tablename__');
      const abstract = as.some((a) => a.name === '__abstract__' && bool(a.value));
      const flask = c.bases.some(
        (b) => b === 'db.Model' || (b.endsWith('.Model') && b.startsWith('db')),
      );
      const sqlmodel =
        c.bases.includes('SQLModel') && /table\s*=\s*True/.test(c.node.text.split('\n')[0] ?? '');
      const fields: OrmField[] = [];
      for (const a of as) {
        if (a.name.startsWith('__')) continue;
        const inner = mappedInner(a.type);
        const cl = callOf(a.value);
        if (cl && /relationship|backref|association_proxy|column_property|synonym/.test(cl.fn))
          continue;
        if (inner && /^(list|List|set|Set|dict)\[/.test(inner)) continue;
        if (cl && SA_COLUMN.has(lastName(cl.fn))) {
          const f = saColumn(
            a.name,
            cl,
            inner ?? (sqlmodel ? words(a.type?.text ?? '') : undefined),
          );
          if (f) fields.push(f);
        } else if (inner && !a.value) {
          const o = optionalType(inner);
          fields.push({
            column: a.name,
            field: a.name,
            type: o.type,
            nullable: o.optional,
            line: line(a.node),
          });
        } else if (sqlmodel && a.type && !a.value) {
          const o = optionalType(words(a.type.text));
          fields.push({
            column: a.name,
            field: a.name,
            type: o.type,
            nullable: o.optional,
            line: line(a.node),
          });
        }
      }
      const tname = tablename ? stringOf(tablename.value) : undefined;
      if (!tname && !flask && !sqlmodel && !fields.length) continue;
      const entity = !abstract && (tname !== undefined || flask || sqlmodel);
      out.models.push({
        framework: 'sqlalchemy',
        model: c.name,
        line: line(c.node),
        endLine: endLine(c.node),
        table: tname,
        defaultTable: flask ? flaskSnake(c.name) : sqlmodel ? c.name.toLowerCase() : undefined,
        rule: flask
          ? 'Flask-SQLAlchemy default: the class name in snake_case'
          : sqlmodel
            ? 'SQLModel default: the class name in lower case'
            : undefined,
        bases: c.bases,
        // A declarative class with a table name is a model whatever its base is.
        root: entity,
        role: entity ? 'entity' : 'abstract',
        fields,
      });
    }
  // Table("name", metadata, Column(...)) and Alembic's op.create_table / op.add_column.
  const upgrade = findAll(
    root,
    (n) => n.type === 'function_definition' && /^downgrade/.test(field(n, 'name')?.text ?? ''),
  );
  const inDowngrade = (n: N) =>
    upgrade.some((d) => n.startIndex >= d.startIndex && n.endIndex <= d.endIndex);
  // with op.batch_alter_table("t") as batch_op: batch_op.add_column(...)
  const batches: { alias: string; table: string; start: number; end: number }[] = [];
  for (const w of findAll(root, (x) => x.type === 'with_statement')) {
    const m =
      /op\.batch_alter_table\(\s*(?:table_name\s*=\s*)?["']([\w.]+)["'][^)]*\)\s+as\s+(\w+)/.exec(
        w.text,
      );
    if (m) batches.push({ table: m[1]!, alias: m[2]!, start: w.startIndex, end: w.endIndex });
  }
  const top = (n: N) => n.startIndex;
  for (const n of findAll(root, (x) => x.type === 'call')) {
    const c0 = callOf(n);
    if (!c0) continue;
    const batch = batches.find(
      (b) => top(n) >= b.start && top(n) <= b.end && c0.fn.startsWith(`${b.alias}.`),
    );
    // A batch call names no table: its arguments start one place earlier than op.<call>'s.
    const c = batch ? { ...c0, fn: `op.${lastName(c0.fn)}` } : c0;
    const off = batch ? -1 : 0;
    const p = (i: number) => (i + off >= 0 ? c.pos[i + off] : undefined);
    const fn = lastName(c.fn);
    const isAlembic = /^op\./.test(c.fn);
    const tableArg = () => batch?.table ?? stringOf(c.pos[0] ?? c.kw.get('table_name'));
    if (fn === 'Table' && !alembicOnly && !isAlembic) {
      const name = stringOf(c.pos[0]);
      if (!name) continue;
      out.tables.push(tableFromArgs('sqlalchemy', name, c.pos.slice(1), line(n), out));
    } else if (isAlembic && !inDowngrade(n)) {
      if (fn === 'create_table') {
        const name = stringOf(c.pos[0] ?? c.kw.get('table_name'));
        if (name) out.tables.push(tableFromArgs('alembic', name, c.pos.slice(1), line(n), out));
      } else if (fn === 'drop_table') {
        const name = tableArg();
        if (name)
          (out.tableOps ??= []).push({
            framework: 'alembic',
            op: 'drop-table',
            table: name,
            line: line(n),
          });
      } else if (fn === 'rename_table') {
        const from = stringOf(c.pos[0] ?? c.kw.get('old_table_name'));
        const to = stringOf(c.pos[1] ?? c.kw.get('new_table_name'));
        if (from && to)
          (out.tableOps ??= []).push({
            framework: 'alembic',
            op: 'rename-table',
            table: from,
            to,
            line: line(n),
          });
      } else if (fn === 'drop_column') {
        const name = tableArg();
        const col = stringOf(p(1) ?? c.kw.get('column_name'));
        if (name && col)
          (out.tableOps ??= []).push({
            framework: 'alembic',
            op: 'drop-column',
            table: name,
            column: col,
            line: line(n),
          });
      } else if (fn === 'alter_column') {
        const name = tableArg();
        const col = stringOf(p(1) ?? c.kw.get('column_name'));
        const to = stringOf(c.kw.get('new_column_name'));
        if (name && col && to)
          (out.tableOps ??= []).push({
            framework: 'alembic',
            op: 'rename-column',
            table: name,
            column: col,
            to,
            line: line(n),
          });
      } else if (fn === 'add_column') {
        const name = tableArg();
        const col = callOf(p(1) ?? c.kw.get('column'));
        const f = name && col ? saColumn(undefined, col) : undefined;
        if (name && f)
          out.tables.push({ framework: 'alembic', name, line: line(n), fields: [f], alter: true });
      } else if (fn === 'create_foreign_key') {
        const src = batch?.table ?? stringOf(c.pos[1] ?? c.kw.get('source_table'));
        const ref = stringOf((batch ? c.pos[1] : c.pos[2]) ?? c.kw.get('referent_table'));
        const lc = (batch ? c.pos[2] : c.pos[3]) ?? c.kw.get('local_cols');
        const rc = (batch ? c.pos[3] : c.pos[4]) ?? c.kw.get('remote_cols');
        const locals = named(lc)
          .map((x) => stringOf(x))
          .filter((x): x is string => !!x);
        const remotes = named(rc)
          .map((x) => stringOf(x))
          .filter((x): x is string => !!x);
        if (src && ref)
          locals.forEach((col, i) =>
            out.foreignKeys.push({
              framework: 'alembic',
              table: src,
              column: col,
              refTable: ref,
              refColumn: remotes[i],
              line: line(n),
            }),
          );
      }
    }
  }
}

function tableFromArgs(
  fw: OrmFramework,
  name: string,
  args: N[],
  ln: number,
  out: OrmFile,
): OrmTable {
  const fields: OrmField[] = [];
  const pks: string[] = [];
  const uniques: string[] = [];
  for (const a of args) {
    const c = callOf(a);
    if (!c) continue;
    const fn = lastName(c.fn);
    if (fn === 'Column') {
      const f = saColumn(undefined, c);
      if (f) fields.push(f);
    } else if (fn === 'PrimaryKeyConstraint')
      pks.push(...c.pos.map((p) => stringOf(p)).filter((x): x is string => !!x));
    else if (fn === 'UniqueConstraint' && c.pos.length === 1) {
      const u = stringOf(c.pos[0]);
      if (u) uniques.push(u);
    } else if (fn === 'ForeignKeyConstraint') {
      const locals = named(c.pos[0]).map((x) => stringOf(x));
      const remotes = named(c.pos[1]).map((x) => stringOf(x));
      locals.forEach((col, i) => {
        const r = remotes[i];
        if (!col || !r) return;
        const dot = r.lastIndexOf('.');
        out.foreignKeys.push({
          framework: fw,
          table: name,
          column: col,
          refTable: dot > 0 ? r.slice(0, dot).split('.').pop()! : r,
          refColumn: dot > 0 ? r.slice(dot + 1) : undefined,
          line: line(c.node),
        });
      });
    }
  }
  for (const f of fields) {
    if (f.column && pks.includes(f.column)) {
      f.primaryKey = true;
      f.nullable = false;
    }
    if (f.column && uniques.includes(f.column)) f.unique = true;
  }
  return { framework: fw, name, line: ln, fields };
}

// ------------------------------------------------------------------------------- Peewee

function peewee(root: N, out: OrmFile): void {
  for (const c of classes(root)) {
    const root_ = c.bases.some((b) => b === 'Model' || b === 'peewee.Model');
    const fields: OrmField[] = [];
    for (const a of assignments(c.body)) {
      const cl = callOf(a.value);
      if (!cl) continue;
      const cls = lastName(cl.fn);
      if (!/Field$/.test(cls) || cls === 'ManyToManyField') continue;
      const fk = cls === 'ForeignKeyField' || cls === 'DeferredForeignKey';
      const f: OrmField = {
        field: a.name,
        column: stringOf(cl.kw.get('column_name')) ?? (fk ? `${a.name}_id` : a.name),
        type: cls,
        nullable: bool(cl.kw.get('null')) ?? false,
        line: line(a.node),
      };
      if (bool(cl.kw.get('primary_key')) || cls === 'AutoField' || cls === 'BigAutoField')
        f.primaryKey = true;
      if (bool(cl.kw.get('unique'))) f.unique = true;
      const d = cl.kw.get('default');
      if (d) f.default = text(d);
      const ml = int(cl.kw.get('max_length'));
      if (ml !== undefined) f.length = ml;
      if (fk) {
        const to = targetOf(cl.pos[0] ?? cl.kw.get('model'));
        if (to)
          f.ref = { model: to === "'self'" ? c.name : to, column: stringOf(cl.kw.get('field')) };
      }
      fields.push(f);
    }
    if (!root_ && !fields.length && !c.meta.size) continue;
    const tname = stringOf(c.meta.get('table_name')) ?? stringOf(c.meta.get('db_table'));
    // A base model with no fields of its own only carries settings (Meta.database).
    const abstract = root_ && !fields.length && !tname;
    out.models.push({
      framework: 'peewee',
      model: c.name,
      line: line(c.node),
      endLine: endLine(c.node),
      table: tname,
      defaultTable: c.name.toLowerCase().replace(/[^\w]+/g, '_'),
      rule: 'Peewee default (legacy_table_names): the class name in lower case',
      bases: c.bases,
      root: root_,
      role: abstract ? 'abstract' : 'entity',
      fields,
      implicitPk: {
        column: 'id',
        field: 'id',
        type: 'AutoField',
        primaryKey: true,
        nullable: false,
        line: line(c.node),
        implicit: 'Peewee adds an id primary key (AutoField)',
      },
    });
  }
}

export function readPython(path: string, source: string): OrmFile | null {
  const fws = pythonFrameworks(source);
  if (!fws.length) return null;
  const tree = parseTree('python', source);
  if (tree instanceof Error)
    return {
      path,
      frameworks: fws,
      models: [],
      tables: [],
      foreignKeys: [],
      uses: [],
      problems: [{ line: 1, message: tree.message }],
    };
  const out: OrmFile = {
    path,
    frameworks: fws,
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  try {
    const root = tree.rootNode;
    if (fws.includes('django')) {
      if (/(^|\/)migrations\/[^/]+\.py$/.test(path)) djangoMigrations(root, path, out);
      else djangoModels(root, path, out);
    }
    if (fws.includes('sqlalchemy') || fws.includes('alembic'))
      sqlalchemy(root, out, !fws.includes('sqlalchemy'));
    if (fws.includes('peewee')) peewee(root, out);
    if (fws.includes('alembic')) {
      const id = /^revision\s*(?::[^=\n]+)?=\s*["']([^"']+)["']/m.exec(source)?.[1];
      const down = /^down_revision\s*(?::[^=\n]+)?=\s*([^\n]+)/m.exec(source)?.[1] ?? '';
      if (id)
        out.revision = { id, follows: [...down.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!) };
    }
  } finally {
    tree.delete();
  }
  return out;
}
