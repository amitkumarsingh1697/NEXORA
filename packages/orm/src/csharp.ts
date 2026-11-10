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
    } else if (
      /^(DropTable|RenameTable|DropColumn|RenameColumn)$/.test(m.name) &&
      m.target?.text === 'migrationBuilder'
    ) {
      const name = str(arg(as, 'name', 0));
      const ops = (out.tableOps ??= []);
      const ln = line(inv);
      if (m.name === 'DropTable' && name)
        ops.push({ framework: 'ef-core', op: 'drop-table', table: name, line: ln });
      else if (m.name === 'RenameTable' && name) {
        const to = str(arg(as, 'newName'));
        if (to) ops.push({ framework: 'ef-core', op: 'rename-table', table: name, to, line: ln });
      } else {
        const table = str(arg(as, 'table', 1));
        const to = str(arg(as, 'newName'));
        if (name && table && m.name === 'DropColumn')
          ops.push({ framework: 'ef-core', op: 'drop-column', table, column: name, line: ln });
        else if (name && table && to)
          ops.push({
            framework: 'ef-core',
            op: 'rename-column',
            table,
            column: name,
            to,
            line: ln,
          });
      }
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
  interface Ent {
    clr: string;
    line: number;
    table?: string;
    keys: string[];
    fields: OrmField[];
    /** Owned type: its owner and navigation, whose table it shares unless it names its own. */
    owner?: string;
    nav?: string;
    many?: boolean;
  }
  interface Rel {
    dependent: string;
    principal: string;
    props: string[];
    principalKeys: string[];
    line: number;
  }
  const ents = new Map<string, Ent>();
  const rels: Rel[] = [];
  const paramOf = (lam: N) => /^\s*\(?\s*(\w+)/.exec(lam.text)?.[1];
  /** The lambda that directly encloses a node. */
  const lambdaOf = (n: N): N | undefined => {
    for (let p = n.parent; p; p = p.parent) if (p.type === 'lambda_expression') return p;
    return undefined;
  };
  /** The identifier at the root of a call chain (`b` in `b.HasOne(…).WithMany()`). */
  const rootOf = (n: N | undefined): N | undefined => {
    let cur = n;
    while (cur && cur.type === 'invocation_expression') cur = methodOf(cur).target;
    return cur;
  };

  const readBlock = (
    clr: string,
    lam: N,
    line0: number,
    owner?: { clr: string; nav: string; many: boolean },
  ) => {
    const param = paramOf(lam);
    const e: Ent = ents.get(clr) ?? { clr, line: line0, keys: [], fields: [] };
    if (owner) {
      e.owner = owner.clr;
      e.nav = owner.nav;
      e.many = owner.many;
    }
    ents.set(clr, e);
    for (const ci of findAll(lam, (x) => x.type === 'invocation_expression')) {
      // tree-sitter hands out new node objects on each access: compare positions.
      const enc = lambdaOf(ci);
      if (!enc || enc.startIndex !== lam.startIndex || enc.endIndex !== lam.endIndex) continue;
      const cm = methodOf(ci);
      const ca = args(ci);
      const onParam = cm.target?.type === 'identifier' && cm.target.text === param;
      if (cm.name === 'ToTable' && onParam) e.table = str(ca[0]?.value);
      else if (cm.name === 'HasKey' && onParam)
        e.keys.push(...ca.map((a) => str(a.value)).filter((x): x is string => !!x));
      else if (cm.name === 'Property' && onParam) {
        const prop = str(ca[0]?.value);
        if (!prop || e.fields.some((x) => x.field === prop)) continue;
        // The chain above this call: .IsRequired() .HasMaxLength(n) .HasColumnType("…") .HasColumnName("…")
        let chain = ci.parent;
        const f: OrmField = {
          field: prop,
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
            else if (mm.name === 'HasColumnName') f.column = str(ma[0]?.value);
          }
          chain = chain.parent;
        }
        e.fields.push(f);
      } else if ((cm.name === 'OwnsOne' || cm.name === 'OwnsMany') && onParam) {
        const type = str(ca[0]?.value);
        const nav = str(ca[1]?.value);
        const inner = ca[ca.length - 1]?.value;
        if (type && nav && inner?.type === 'lambda_expression')
          readBlock(`${clr}.${nav}#${type}`, inner, line(ci), {
            clr,
            nav,
            many: cm.name === 'OwnsMany',
          });
      } else if (cm.name === 'HasForeignKey' && rootOf(ci)?.text === param) {
        // b.HasOne("Target", nav).WithMany(…).HasForeignKey("Prop"), or for one-to-one
        // .WithOne(…).HasForeignKey("Dependent", "Prop"). WithOwner() keys are the owner's.
        let cur = cm.target;
        let target: string | undefined;
        let owned = false;
        while (cur?.type === 'invocation_expression') {
          const mm = methodOf(cur);
          if (mm.name === 'HasOne') target = str(args(cur)[0]?.value);
          if (mm.name === 'WithOwner') owned = true;
          cur = mm.target;
        }
        if (owned || !target) continue;
        let names = ca.map((a) => str(a.value)).filter((x): x is string => !!x);
        let dependent = clr;
        let principal = target;
        if (names.length > 1 && names[0]!.includes('.')) {
          dependent = names[0]!;
          principal = dependent === clr ? target : clr;
          names = names.slice(1);
        }
        let pk: string[] = [];
        for (let up = ci.parent; up; up = up.parent) {
          if (up.type === 'invocation_expression' && methodOf(up).name === 'HasPrincipalKey')
            pk = args(up)
              .map((a) => str(a.value))
              .filter((x): x is string => !!x);
          if (up.type === 'expression_statement') break;
        }
        rels.push({ dependent, principal, props: names, principalKeys: pk, line: line(ci) });
      }
    }
  };

  for (const inv of findAll(root, (n) => n.type === 'invocation_expression')) {
    const m = methodOf(inv);
    if (m.name !== 'Entity' || m.target?.text !== 'modelBuilder') continue;
    const as = args(inv);
    const entity = str(as[0]?.value);
    const body = as[as.length - 1]?.value;
    if (!entity || body?.type !== 'lambda_expression') continue;
    readBlock(entity, body, line(inv));
  }

  const tableOf = (e: Ent | undefined): string | undefined =>
    e ? (e.table ?? (e.owner && !e.many ? tableOf(ents.get(e.owner)) : undefined)) : undefined;
  /** Column names: written, or the property name; an owned type in its owner's table gets Nav_Prop. */
  const sharesOwner = (e: Ent) => !!e.owner && !e.many && tableOf(e) === tableOf(ents.get(e.owner));
  const columnOf = (e: Ent, prop: string) => {
    const f = e.fields.find((x) => x.field === prop);
    return f?.column ?? (sharesOwner(e) ? `${e.nav}_${prop}` : prop);
  };
  const byTable = new Map<string, OrmTable>();
  for (const e of ents.values()) {
    const table = tableOf(e);
    if (!table) continue;
    let t = byTable.get(table.toLowerCase());
    if (!t) {
      t = { framework: 'ef-core', name: table, line: e.line, fields: [] };
      byTable.set(table.toLowerCase(), t);
      out.tables.push(t);
    }
    const shared = sharesOwner(e);
    for (const f0 of e.fields) {
      // An owned type's key in its owner's table is the owner's own key.
      if (shared && e.keys.includes(f0.field!)) continue;
      const f = { ...f0, column: columnOf(e, f0.field!) };
      if (e.keys.includes(f0.field!)) {
        f.primaryKey = true;
        f.nullable = false;
      }
      if (!t.fields.some((x) => x.column === f.column)) t.fields.push(f);
    }
  }
  for (const r of rels) {
    const d = ents.get(r.dependent);
    const p = ents.get(r.principal);
    const dt = tableOf(d);
    const pt = tableOf(p);
    if (!d || !p || !dt || !pt) continue;
    r.props.forEach((prop, i) => {
      const pk = r.principalKeys[i] ?? p.keys[i];
      out.foreignKeys.push({
        framework: 'ef-core',
        table: dt,
        column: columnOf(d, prop),
        refTable: pt,
        refColumn: pk ? columnOf(p, pk) : undefined,
        line: r.line,
      });
    });
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
    else if (isSnapshot) {
      snapshot(root, out);
      if (out.tables.length) out.snapshot = {};
    } else {
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
