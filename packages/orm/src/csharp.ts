/**
 * Entity Framework Core: DbContext sets and fluent table names, entity classes with their
 * data annotations and conventions, migrations (`CreateTable`, `AddColumn`) and model
 * snapshots. Read from the tree-sitter C# tree.
 *
 * Entity classes carry no EF marker, so every class with auto-properties is a candidate; a
 * candidate becomes an entity only when a DbContext registers it (`DbSet<T>`, `Entity<T>()`).
 * Fluent configuration is read for ToTable, HasKey and HasColumnName, in OnModelCreating and in
 * IEntityTypeConfiguration<T> classes. Other fluent configuration (owned types, table splitting,
 * relationships written only in fluent calls) is not read.
 */
import { parseTree } from '@nexora/syntax';
import { field, findAll, line, endLine, named, stringOf, words, type N } from './tree';
import type { OrmField, OrmFile, OrmModel, OrmRegistration, OrmTable } from './types';

interface Arg {
  name?: string;
  value: N;
}
function args(inv: N): Arg[] {
  return named(field(inv, 'arguments'))
    .filter((a) => a.type === 'argument')
    .map((a) => {
      const kids = named(a);
      const nm =
        field(a, 'name')?.text ??
        (kids[0]?.type === 'name_colon' ? named(kids[0])[0]?.text : undefined);
      const value = kids[kids.length - 1]!;
      return { name: nm, value };
    });
}
const arg = (as: Arg[], name: string, index?: number) =>
  as.find((a) => a.name === name)?.value ??
  (index !== undefined ? as.filter((a) => !a.name)[index]?.value : undefined);
const str = (n: N | undefined) => (n ? stringOf(n) : undefined);
const bool = (n: N | undefined) => (n?.type === 'boolean_literal' ? n.text === 'true' : undefined);
const int = (n: N | undefined) => (n?.type === 'integer_literal' ? Number(n.text) : undefined);

/** `x => x.Id` and `x => new { x.A, x.B }`: the member names. */
function lambdaMembers(n: N | undefined): string[] {
  if (!n) return [];
  return findAll(n, (x) => x.type === 'member_access_expression')
    .map((m) => field(m, 'name')?.text ?? '')
    .filter(Boolean);
}

/** The method name of an invocation (`Column` in `table.Column<int>(…)`). */
function methodOf(inv: N): { name: string; target?: N; typeArg?: string } {
  const fn = field(inv, 'function');
  const nameNode = fn?.type === 'member_access_expression' ? field(fn, 'name') : fn;
  const nm = nameNode?.type === 'generic_name' ? named(nameNode)[0]?.text : nameNode?.text;
  const ta = nameNode?.type === 'generic_name' ? named(named(nameNode)[1])[0]?.text : undefined;
  return {
    name: nm ?? '',
    target:
      fn?.type === 'member_access_expression' ? (field(fn, 'expression') ?? undefined) : undefined,
    typeArg: ta,
  };
}

interface Attr {
  name: string;
  args: Arg[];
}
function attrs(n: N): Attr[] {
  const out: Attr[] = [];
  for (const l of named(n).filter((x) => x.type === 'attribute_list'))
    for (const a of named(l).filter((x) => x.type === 'attribute')) {
      const nm = (field(a, 'name')?.text ?? '')
        .split('.')
        .pop()!
        .replace(/Attribute$/, '');
      const al = named(a).find((x) => x.type === 'attribute_argument_list');
      const as = named(al).map((x) => {
        const kids = named(x);
        const eq = kids[0]?.type === 'name_equals' || kids[0]?.type === 'name_colon';
        const nm = field(x, 'name')?.text ?? (eq ? named(kids[0])[0]?.text : undefined);
        return { name: nm, value: kids[kids.length - 1]! };
      });
      out.push({ name: nm, args: as });
    }
  return out;
}
const attr = (as: Attr[], n: string) => as.find((a) => a.name === n);

const VALUE_TYPES = new Set([
  'int',
  'long',
  'short',
  'byte',
  'sbyte',
  'uint',
  'ulong',
  'ushort',
  'bool',
  'decimal',
  'double',
  'float',
  'char',
  'Guid',
  'DateTime',
  'DateTimeOffset',
  'DateOnly',
  'TimeOnly',
  'TimeSpan',
  'Int32',
  'Int64',
  'Int16',
  'Boolean',
  'Decimal',
  'Double',
  'Single',
]);
const SCALAR = new Set([...VALUE_TYPES, 'string', 'String', 'byte[]']);
const COLLECTION =
  /^(I?List|ICollection|IEnumerable|HashSet|ISet|Collection|IReadOnlyCollection|IReadOnlyList)\s*</;

function entityCandidate(c: N, nrt: boolean): OrmModel | undefined {
  const name = field(c, 'name')?.text;
  if (!name) return undefined;
  const cAttrs = attrs(c);
  const bases = named(named(c).find((x) => x.type === 'base_list')).map((b) =>
    words(b.text).replace(/<.*$/, ''),
  );
  const fields: OrmField[] = [];
  const props: {
    name: string;
    type: string;
    nullable: boolean;
    a: Attr[];
    line: number;
    required: boolean;
  }[] = [];
  for (const p of named(field(c, 'body'))) {
    if (p.type !== 'property_declaration') continue;
    const mods = named(p)
      .filter((x) => x.type === 'modifier')
      .map((x) => x.text);
    if (mods.includes('static') || !mods.includes('public')) continue;
    if (!named(p).some((x) => x.type === 'accessor_list')) continue;
    const tn = field(p, 'type');
    const nm = field(p, 'name')?.text;
    if (!tn || !nm) continue;
    const nullable = tn.type === 'nullable_type';
    const type = words((nullable ? (field(tn, 'type') ?? named(tn)[0]) : tn)?.text ?? tn.text);
    props.push({
      name: nm,
      type,
      nullable,
      a: attrs(p),
      line: line(p),
      required: mods.includes('required'),
    });
  }
  if (!props.length) return undefined;
  const names = new Set(props.map((p) => p.name));
  const keyAttr = props.some((p) => attr(p.a, 'Key'));
  for (const p of props) {
    if (attr(p.a, 'NotMapped') || COLLECTION.test(p.type)) continue;
    const colAttr = attr(p.a, 'Column');
    const fkAttr = attr(p.a, 'ForeignKey');
    const scalar = SCALAR.has(p.type) || /\[\]$/.test(p.type);
    if (!scalar) {
      // A reference navigation: its key is <Nav>Id (or [ForeignKey]), when that property exists.
      const fkName = str(fkAttr?.args[0]?.value) ?? `${p.name}Id`;
      if (names.has(fkName)) continue;
      fields.push({
        field: p.name,
        type: p.type,
        nullable: true,
        line: p.line,
        ref: { model: p.type },
        navigation: true,
        fkColumn: (t) => `${p.name}${t.pk}`,
      });
      continue;
    }
    const valueType = VALUE_TYPES.has(p.type);
    const f: OrmField = {
      field: p.name,
      column: str(colAttr?.args.find((a) => !a.name)?.value) ?? p.name,
      type: (() => {
        const tn = colAttr?.args.find((a) => a.name === 'TypeName');
        return `${p.type}${p.nullable ? '?' : ''}${tn ? ` (${str(tn.value)})` : ''}`;
      })(),
      nullable: p.nullable || (!valueType && !nrt && !p.required && !attr(p.a, 'Required')),
      line: p.line,
    };
    if (attr(p.a, 'Required') || p.required) f.nullable = false;
    if (attr(p.a, 'Key') || (!keyAttr && (p.name === 'Id' || p.name === `${name}Id`))) {
      f.primaryKey = true;
      f.nullable = false;
      if (!attr(p.a, 'Key'))
        f.implicit = `Entity Framework Core convention: a property named Id or ${name}Id is the key`;
    }
    const len = int(
      attr(p.a, 'MaxLength')?.args[0]?.value ?? attr(p.a, 'StringLength')?.args[0]?.value,
    );
    if (len !== undefined) f.length = len;
    // A property named <Nav>Id next to a navigation <Nav> is that navigation's foreign key.
    for (const q of props) {
      const qfk = str(attr(q.a, 'ForeignKey')?.args[0]?.value);
      if (
        !SCALAR.has(q.type) &&
        !COLLECTION.test(q.type) &&
        (qfk === p.name || (!qfk && `${q.name}Id` === p.name))
      )
        f.ref = { model: q.type };
    }
    if (fkAttr) {
      const nav = str(fkAttr.args[0]?.value);
      const q = props.find((x) => x.name === nav);
      if (q) f.ref = { model: q.type };
    }
    fields.push(f);
  }
  const tableAttr = attr(cAttrs, 'Table');
  return {
    framework: 'ef-core',
    model: name,
    line: line(c),
    endLine: endLine(c),
    table: str(tableAttr?.args.find((a) => !a.name)?.value),
    defaultTable: name,
    rule: 'Entity Framework Core default: the class name, when no DbSet names it',
    bases,
    root: false,
    role: 'abstract',
    inherit: 'single',
    discriminator: {
      column: 'Discriminator',
      type: 'nvarchar',
      line: line(c),
      implicit: 'Entity Framework Core table-per-hierarchy: the discriminator column',
    },
    fields,
  };
}

function contexts(root: N, out: OrmFile): void {
  for (const c of findAll(root, (n) => n.type === 'class_declaration')) {
    const bases = named(named(c).find((x) => x.type === 'base_list')).map((b) => b.text);
    if (!bases.some((b) => /(^|\.)(Identity)?(Api)?(Authorization)?DbContext\b/.test(b))) continue;
    const regs: OrmRegistration[] = [];
    for (const p of named(field(c, 'body'))) {
      if (p.type !== 'property_declaration') continue;
      const t = field(p, 'type');
      if (t?.type !== 'generic_name' || named(t)[0]?.text !== 'DbSet') continue;
      const model = named(named(t)[1])[0]?.text;
      const nm = field(p, 'name')?.text;
      if (model && nm)
        regs.push({
          framework: 'ef-core',
          model: model.split('.').pop()!,
          line: line(p),
          defaultTable: nm,
          rule: 'Entity Framework Core default: the name of the DbSet property',
        });
    }
    fluent(c, new Map(), regs);
    if (regs.length) (out.registrations ??= []).push(...regs);
  }
  // IEntityTypeConfiguration<T>: Configure(EntityTypeBuilder<T> b) { b.ToTable("x"); ... }
  for (const c of findAll(root, (n) => n.type === 'class_declaration')) {
    const base = named(named(c).find((x) => x.type === 'base_list')).find(
      (b) => b.type === 'generic_name' && named(b)[0]?.text === 'IEntityTypeConfiguration',
    );
    const entity = base ? named(named(base)[1])[0]?.text : undefined;
    if (!entity) continue;
    const builders = new Map<string, string>();
    for (const md of findAll(c, (n) => n.type === 'method_declaration'))
      if (field(md, 'name')?.text === 'Configure') {
        const p = findAll(md, (n) => n.type === 'parameter')[0];
        const nm = p ? field(p, 'name')?.text : undefined;
        if (nm) builders.set(nm, entity.split('.').pop()!);
      }
    const regs: OrmRegistration[] = [];
    fluent(c, builders, regs);
    if (regs.length) (out.registrations ??= []).push(...regs);
  }
}

const FLUENT = new Set(['ToTable', 'HasKey', 'HasColumnName']);

/**
 * Fluent calls on an entity builder: `modelBuilder.Entity<T>().ToTable("x")`, the lambda form
 * `Entity<T>(b => b.ToTable("x"))`, and a builder parameter whose entity is known (`builders`).
 * Reads ToTable, HasKey and Property(x => x.P).HasColumnName("c").
 */
function fluent(scope: N, builders: Map<string, string>, regs: OrmRegistration[]): void {
  const known = new Map(builders);
  for (const inv of findAll(scope, (n) => n.type === 'invocation_expression')) {
    const m = methodOf(inv);
    if (m.name !== 'Entity' || !m.typeArg) continue;
    const lam = args(inv)[0]?.value;
    if (lam?.type !== 'lambda_expression') continue;
    const p = /^\s*\(?\s*(?:[\w<>.]+\s+)?(\w+)\s*\)?\s*=>/.exec(lam.text)?.[1];
    if (p) known.set(p, m.typeArg.split('.').pop()!);
  }
  for (const inv of findAll(scope, (n) => n.type === 'invocation_expression')) {
    const m = methodOf(inv);
    if (!FLUENT.has(m.name)) continue;
    let cur: N | undefined = m.target;
    let entity: string | undefined;
    let member: string | undefined;
    while (cur) {
      if (cur.type === 'invocation_expression') {
        const mm = methodOf(cur);
        if (mm.name === 'Entity' && mm.typeArg) {
          entity = mm.typeArg.split('.').pop()!;
          break;
        }
        if (mm.name === 'Property' && member === undefined) {
          const a = args(cur)[0]?.value;
          member = lambdaMembers(a)[0] ?? str(a);
        }
        cur = mm.target;
        continue;
      }
      if (cur.type === 'identifier') entity = known.get(cur.text);
      break;
    }
    if (!entity) continue;
    const as = args(inv);
    if (m.name === 'ToTable') {
      const t = str(arg(as, 'name', 0));
      if (t) regs.push({ framework: 'ef-core', model: entity, line: line(inv), table: t });
    } else if (m.name === 'HasKey')
      regs.push({
        framework: 'ef-core',
        model: entity,
        line: line(inv),
        keys: lambdaMembers(as[0]?.value),
      });
    else {
      const col = str(arg(as, 'name', 0));
      if (col && member)
        regs.push({
          framework: 'ef-core',
          model: entity,
          line: line(inv),
          columns: [{ member, column: col }],
        });
    }
  }
}

function migrations(root: N, out: OrmFile): void {
  // Only Up(): Down() undoes the migration.
  const downs = findAll(
    root,
    (n) => n.type === 'method_declaration' && field(n, 'name')?.text === 'Down',
  );
  const inDown = (n: N) =>
    downs.some((d) => n.startIndex >= d.startIndex && n.endIndex <= d.endIndex);
  for (const inv of findAll(root, (n) => n.type === 'invocation_expression')) {
    if (inDown(inv)) continue;
    const m = methodOf(inv);
    const as = args(inv);
    if (m.name === 'CreateTable') {
      const name = str(arg(as, 'name', 0));
      const cols = arg(as, 'columns', 1);
      if (!name || !cols) continue;
      const t: OrmTable = { framework: 'ef-core', name, line: line(inv), fields: [] };
      const obj = findAll(cols, (x) => x.type === 'anonymous_object_creation_expression', true)[0];
      const kids = named(obj);
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i]!;
        if (k.type !== 'identifier') continue;
        const v = kids[i + 1];
        if (!v) continue;
        // table.Column<int>(…).Annotation(…): find the Column call in the chain.
        const call = findAll(
          v,
          (x) => x.type === 'invocation_expression' && methodOf(x).name === 'Column',
        )[0];
        if (!call) continue;
        const cm = methodOf(call);
        const ca = args(call);
        const sqlType = str(arg(ca, 'type'));
        const f: OrmField = {
          field: k.text,
          column: str(arg(ca, 'name')) ?? k.text,
          type: sqlType ?? cm.typeArg ?? 'unknown',
          nullable: bool(arg(ca, 'nullable')) ?? true,
          line: line(k),
        };
        const ml = int(arg(ca, 'maxLength'));
        if (ml !== undefined) f.length = ml;
        const d = arg(ca, 'defaultValue') ?? arg(ca, 'defaultValueSql');
        if (d) f.default = words(d.text);
        t.fields.push(f);
      }
      const cons = arg(as, 'constraints');
      for (const ci of cons ? findAll(cons, (x) => x.type === 'invocation_expression') : []) {
        const cm = methodOf(ci);
        const ca = args(ci);
        if (cm.name === 'PrimaryKey') {
          for (const k of lambdaMembers(arg(ca, 'columns', 1))) {
            const f = t.fields.find((x) => x.field === k);
            if (f) {
              f.primaryKey = true;
              f.nullable = false;
            }
          }
        } else if (cm.name === 'ForeignKey') {
          const col = lambdaMembers(arg(ca, 'column', 1))[0];
          const pt = str(arg(ca, 'principalTable', 2));
          const pc = str(arg(ca, 'principalColumn', 3));
          const f = t.fields.find((x) => x.field === col);
          if (col && pt)
            out.foreignKeys.push({
              framework: 'ef-core',
              table: name,
              column: f?.column ?? col,
              refTable: pt,
              refColumn: pc,
              line: line(ci),
            });
        } else if (cm.name === 'UniqueConstraint') {
          const cols = lambdaMembers(arg(ca, 'columns', 1));
          if (cols.length === 1) {
            const f = t.fields.find((x) => x.field === cols[0]);
            if (f) f.unique = true;
          }
        }
      }
      out.tables.push(t);
    } else if (m.name === 'AddColumn' && m.target?.text === 'migrationBuilder') {
      const name = str(arg(as, 'name', 0));
      const table = str(arg(as, 'table', 1));
      if (!name || !table) continue;
      const f: OrmField = {
        column: name,
        type: str(arg(as, 'type')) ?? m.typeArg ?? 'unknown',
        nullable: bool(arg(as, 'nullable')) ?? true,
        line: line(inv),
      };
      const ml = int(arg(as, 'maxLength'));
      if (ml !== undefined) f.length = ml;
      out.tables.push({
        framework: 'ef-core',
        name: table,
        line: line(inv),
        fields: [f],
        alter: true,
      });
    } else if (m.name === 'AddForeignKey' && m.target?.text === 'migrationBuilder') {
      const table = str(arg(as, 'table'));
      const col = str(arg(as, 'column'));
      const pt = str(arg(as, 'principalTable'));
      if (table && col && pt)
        out.foreignKeys.push({
          framework: 'ef-core',
          table,
          column: col,
          refTable: pt,
          refColumn: str(arg(as, 'principalColumn')),
          line: line(inv),
        });
    }
  }
}

/** Model snapshots: `modelBuilder.Entity("Ns.Customer", b => { b.Property<int>("Id")…; b.ToTable("Customers"); })`. */
function snapshot(root: N, out: OrmFile): void {
  for (const inv of findAll(root, (n) => n.type === 'invocation_expression')) {
    const m = methodOf(inv);
    if (m.name !== 'Entity') continue;
    const as = args(inv);
    const entity = str(as[0]?.value);
    const body = as[1]?.value;
    if (!entity || body?.type !== 'lambda_expression') continue;
    let table: string | undefined;
    const fields: OrmField[] = [];
    const keys: string[] = [];
    for (const ci of findAll(body, (x) => x.type === 'invocation_expression')) {
      const cm = methodOf(ci);
      const ca = args(ci);
      if (cm.name === 'ToTable') table = str(ca[0]?.value);
      else if (cm.name === 'HasKey')
        keys.push(...ca.map((a) => str(a.value)).filter((x): x is string => !!x));
      else if (cm.name === 'Property' && cm.target && named(cm.target).length === 0) {
        const prop = str(ca[0]?.value);
        if (!prop) continue;
        // The chain above this call: .IsRequired() .HasMaxLength(n) .HasColumnType("…") .HasColumnName("…")
        let chain = ci.parent;
        const f: OrmField = {
          field: prop,
          column: prop,
          type: cm.typeArg ?? 'unknown',
          nullable: !!cm.typeArg?.endsWith('?') || cm.typeArg === 'string',
          line: line(ci),
        };
        while (
          chain &&
          (chain.type === 'member_access_expression' || chain.type === 'invocation_expression')
        ) {
          if (chain.type === 'invocation_expression') {
            const mm = methodOf(chain);
            const ma = args(chain);
            if (mm.name === 'IsRequired') f.nullable = false;
            else if (mm.name === 'HasMaxLength') f.length = int(ma[0]?.value);
            else if (mm.name === 'HasColumnType') f.type = str(ma[0]?.value) ?? f.type;
            else if (mm.name === 'HasColumnName') f.column = str(ma[0]?.value) ?? f.column;
          }
          chain = chain.parent;
        }
        fields.push(f);
      }
    }
    if (!table) continue;
    for (const k of keys) {
      const f = fields.find((x) => x.field === k);
      if (f) {
        f.primaryKey = true;
        f.nullable = false;
      }
    }
    out.tables.push({ framework: 'ef-core', name: table, line: line(inv), fields });
  }
}

export interface CsharpContext {
  /** The repository has a DbContext, so plain classes may be entities. */
  efCore: boolean;
}

const EF_HINT =
  /\b(DbContext|DbSet<|IEntityTypeConfiguration<|MigrationBuilder|ModelSnapshot|Microsoft\.EntityFrameworkCore)/;

/** `using X;` and `global using X;` (not aliases or `using static`), and namespace declarations. */
export function csharpImports(source: string): {
  namespaces: { name: string; line: number }[];
  usings: string[];
  global: string[];
} {
  source = source.replace(/^\uFEFF/, '');
  const usings: string[] = [];
  const global: string[] = [];
  for (const m of source.matchAll(/^[ \t]*(global[ \t]+)?using[ \t]+(?!static\b)([\w.]+)[ \t]*;/gm))
    (m[1] ? global : usings).push(m[2]!);
  const namespaces: { name: string; line: number }[] = [];
  for (const m of source.matchAll(/^[ \t]*namespace[ \t]+([\w.]+)/gm))
    namespaces.push({ name: m[1]!, line: source.slice(0, m.index).split('\n').length });
  return { namespaces, usings, global };
}

export function readCsharp(path: string, source: string, ctx: CsharpContext): OrmFile | null {
  const hinted = EF_HINT.test(source);
  if (!hinted && !ctx.efCore) return null;
  const imp = csharpImports(source);
  // A file of global usings declares no entity, but it decides which classes the others name.
  if (!hinted && imp.global.length && !/\{\s*get;/.test(source))
    return {
      path,
      frameworks: [],
      models: [],
      tables: [],
      foreignKeys: [],
      uses: [],
      imports: { usings: imp.usings, global: imp.global },
      problems: [],
    };
  if (!hinted && !/\{\s*get;/.test(source)) return null;
  const tree = parseTree('c_sharp', source);
  const out: OrmFile = {
    path,
    frameworks: hinted ? ['ef-core'] : [],
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    imports: { namespace: imp.namespaces[0]?.name, usings: imp.usings, global: imp.global },
    problems: [],
  };
  if (tree instanceof Error) {
    out.problems.push({ line: 1, message: tree.message });
    return out;
  }
  try {
    const root = tree.rootNode;
    const isMigration =
      /\bMigrationBuilder\b/.test(source) && /\bclass\s+\w+\s*:\s*Migration\b/.test(source);
    const isSnapshot = /:\s*ModelSnapshot\b/.test(source);
    if (isMigration) migrations(root, out);
    else if (isSnapshot) snapshot(root, out);
    else {
      contexts(root, out);
      const nrt = /#nullable\s+enable/.test(source) || /\bstring\?\s/.test(source);
      for (const c of findAll(
        root,
        (n) => n.type === 'class_declaration' || n.type === 'record_declaration',
      )) {
        const m = entityCandidate(c, nrt);
        if (m) {
          const ns = imp.namespaces.filter((x) => x.line <= m.line).pop();
          if (ns) m.namespace = ns.name;
          out.models.push(m);
        }
      }
    }
  } finally {
    tree.delete();
  }
  if (!out.frameworks.length && out.models.length) out.frameworks.push('ef-core');
  return out;
}
