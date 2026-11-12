/**
 * JVM ORMs: JPA/Hibernate entities in Java and Kotlin, Spring Data repositories, and Exposed
 * tables in Kotlin. Read from the tree-sitter Java and Kotlin trees.
 *
 * JPA mapping on fields is read (the common case). Mapping on getters (property access),
 * orm.xml mapping files and @ElementCollection tables are not read; a class that uses them gets
 * fewer columns than the database has.
 */
import { parseTree } from '@nexora/syntax';
import { field, findAll, line, endLine, named, words, type N } from './tree';
import type { OrmField, OrmFile, OrmModel } from './types';

interface Annotation {
  name: string;
  args: Map<string, string>;
  /** Positional arguments (the `value` element). */
  pos: string[];
  text: string;
}

/** Splits `a = 1, b = @X(c = 2)` on top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) out.push(last);
  return out;
}

export function parseAnnotation(text: string): Annotation | undefined {
  const m = /^@(?:(?:field|get|set|param|property):)?([\w.]+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(
    text.trim(),
  );
  if (!m) return undefined;
  const name = m[1]!.split('.').pop()!;
  const args = new Map<string, string>();
  const pos: string[] = [];
  for (const a of splitArgs(m[2] ?? '')) {
    const kv = /^(\w+)\s*=\s*([\s\S]+)$/.exec(a);
    if (kv && !a.startsWith('@')) args.set(kv[1]!, kv[2]!.trim());
    else pos.push(a);
  }
  return { name, args, pos, text };
}

/** A string, number or boolean literal's value; undefined for anything else. */
export function lit(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = /^"((?:[^"\\]|\\.)*)"$/.exec(v.trim());
  if (s) return s[1];
  if (/^(true|false|-?\d+[lL]?)$/.test(v.trim())) return v.trim().replace(/[lL]$/, '');
  return undefined;
}
const num = (v: string | undefined) => {
  const s = lit(v);
  return s !== undefined && /^-?\d+$/.test(s) ? Number(s) : undefined;
};

function annotationsOf(mods: N | null | undefined): Annotation[] {
  return named(mods)
    .filter((a) => a.type === 'annotation' || a.type === 'marker_annotation')
    .map((a) => parseAnnotation(a.text))
    .filter((a): a is Annotation => !!a);
}

interface Member {
  name: string;
  type: string;
  nullableType: boolean;
  ann: Annotation[];
  isStatic: boolean;
  line: number;
}

interface Klass {
  name: string;
  node: N;
  ann: Annotation[];
  bases: string[];
  members: Member[];
}

const has = (as: Annotation[], n: string) => as.find((a) => a.name === n);
const baseType = (t: string) => t.replace(/<.*$/s, '').replace(/\?$/, '').split('.').pop()!.trim();
const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'boolean', 'char', 'float', 'double']);
const NOT_NULL = ['NotNull', 'NonNull', 'NotBlank', 'NotEmpty'];

function javaClasses(root: N): Klass[] {
  const out: Klass[] = [];
  for (const c of findAll(
    root,
    (n) => n.type === 'class_declaration' || n.type === 'interface_declaration',
  )) {
    const name = field(c, 'name')?.text;
    if (!name) continue;
    const mods = named(c).find((x) => x.type === 'modifiers');
    const sup = field(c, 'superclass');
    const bases: string[] = [];
    if (sup) bases.push(...named(sup).map((x) => x.text));
    const ifs = field(c, 'interfaces') ?? named(c).find((x) => x.type === 'extends_interfaces');
    if (ifs)
      for (const t of findAll(ifs, (x) => x.type === 'type_list', true))
        bases.push(...named(t).map((x) => words(x.text)));
    const members: Member[] = [];
    for (const f of named(field(c, 'body'))) {
      if (f.type !== 'field_declaration') continue;
      const fm = named(f).find((x) => x.type === 'modifiers');
      const modText = fm?.text ?? '';
      const type = words(field(f, 'type')?.text ?? '');
      for (const d of named(f).filter((x) => x.type === 'variable_declarator'))
        members.push({
          name: field(d, 'name')?.text ?? '',
          type,
          nullableType: false,
          ann: annotationsOf(fm),
          isStatic: /\bstatic\b/.test(modText) || /\btransient\b/.test(modText),
          line: line(f),
        });
    }
    out.push({ name, node: c, ann: annotationsOf(mods), bases, members });
  }
  return out;
}

function kotlinAnnotations(mods: N | undefined): Annotation[] {
  return named(mods)
    .filter((a) => a.type === 'annotation')
    .map((a) => parseAnnotation(a.text))
    .filter((a): a is Annotation => !!a);
}

function kotlinClasses(root: N): Klass[] {
  const out: Klass[] = [];
  for (const c of findAll(
    root,
    (n) => n.type === 'class_declaration' || n.type === 'object_declaration',
  )) {
    const name =
      field(c, 'name')?.text ??
      named(c).find((x) => x.type === 'type_identifier' || x.type === 'simple_identifier')?.text;
    if (!name) continue;
    const mods = named(c).find((x) => x.type === 'modifiers');
    const bases: string[] = [];
    const del = named(c).find((x) => x.type === 'delegation_specifiers');
    for (const d of named(del)) {
      const ut = findAll(d, (x) => x.type === 'user_type', true)[0];
      if (ut) bases.push(words(ut.text));
    }
    const members: Member[] = [];
    const typeOf = (n: N | undefined) => {
      const t = n ? words(n.text) : '';
      return { type: t.replace(/\?$/, ''), nullableType: n?.type === 'nullable_type' };
    };
    const ctor = named(c).find((x) => x.type === 'primary_constructor');
    for (const p of findAll(ctor ?? c, (x) => x.type === 'class_parameter')) {
      if (!ctor) break;
      const ids = named(p);
      const nm = ids.find((x) => x.type === 'identifier' || x.type === 'simple_identifier');
      const ty = ids.find((x) => x.type === 'user_type' || x.type === 'nullable_type');
      if (!nm) continue;
      members.push({
        name: nm.text,
        ...typeOf(ty),
        ann: kotlinAnnotations(ids.find((x) => x.type === 'modifiers')),
        isStatic: false,
        line: line(p),
      });
    }
    const body = named(c).find((x) => x.type === 'class_body');
    for (const p of named(body)) {
      if (p.type !== 'property_declaration') continue;
      const vd = named(p).find((x) => x.type === 'variable_declaration');
      const nm = named(vd).find((x) => x.type === 'identifier' || x.type === 'simple_identifier');
      const ty = named(vd).find((x) => x.type === 'user_type' || x.type === 'nullable_type');
      if (!nm) continue;
      const pm = named(p).find((x) => x.type === 'modifiers');
      members.push({
        name: nm.text,
        ...typeOf(ty),
        ann: kotlinAnnotations(pm),
        isStatic: false,
        line: line(p),
      });
    }
    out.push({ name, node: c, ann: kotlinAnnotations(mods), bases, members });
  }
  return out;
}

const RELATION_SKIP = new Set(['OneToMany', 'Transient', 'ElementCollection']);

/**
 * A unidirectional `@OneToMany @JoinColumn(name = "x")` puts the key column on the target
 * entity's table, so it is read as a patch on that entity. Without `@JoinColumn` JPA uses a join
 * table, and with `mappedBy` the other side owns the key: neither is read here.
 */
function oneToManyJoins(k: Klass): OrmModel[] {
  const out: OrmModel[] = [];
  for (const m of k.members) {
    const otm = has(m.ann, 'OneToMany');
    const join = has(m.ann, 'JoinColumn');
    if (!otm || !join || otm.args.has('mappedBy')) continue;
    const column = lit(join.args.get('name'));
    const target =
      lit(otm.args.get('targetEntity')?.replace(/::class(\.java)?$|\.class$/, '')) ??
      /<\s*([\w.]+)\s*>/.exec(m.type)?.[1];
    if (!column || !target) continue;
    out.push({
      framework: 'jpa',
      model: baseType(target),
      line: m.line,
      bases: [],
      root: true,
      role: 'patch',
      fields: [
        {
          field: `${k.name}.${m.name}`,
          column,
          type: `(key of ${k.name})`,
          nullable: lit(join.args.get('nullable')) !== 'false',
          line: m.line,
          ref: { model: k.name, column: lit(join.args.get('referencedColumnName')) },
        },
      ],
    });
  }
  return out;
}

function jpaModel(k: Klass): OrmModel | undefined {
  const entity = has(k.ann, 'Entity');
  const mapped = has(k.ann, 'MappedSuperclass');
  const embeddable = has(k.ann, 'Embeddable');
  if (!entity && !mapped && !embeddable) return undefined;
  const fields: OrmField[] = [];
  for (const m of k.members) {
    if (m.isStatic || !m.name || m.ann.some((a) => RELATION_SKIP.has(a.name))) continue;
    const col = has(m.ann, 'Column');
    const join = has(m.ann, 'JoinColumn');
    const many = has(m.ann, 'ManyToOne');
    const one = has(m.ann, 'OneToOne');
    const m2m = has(m.ann, 'ManyToMany');
    const notNull = m.ann.some((a) => NOT_NULL.includes(a.name));
    if (m2m) {
      if (m2m.args.has('mappedBy')) continue;
      const jt = has(m.ann, 'JoinTable');
      const target = /<\s*([\w.]+)\s*>/.exec(m.type)?.[1] ?? lit(m2m.args.get('targetEntity'));
      if (!target) continue;
      const jtName = jt ? lit(jt.args.get('name')) : undefined;
      const jc = jt
        ? /joinColumns\s*=\s*\[?\s*@?JoinColumn\(\s*name\s*=\s*"([^"]+)"/.exec(jt.text)?.[1]
        : undefined;
      const ijc = jt
        ? /inverseJoinColumns\s*=\s*\[?\s*@?JoinColumn\(\s*name\s*=\s*"([^"]+)"/.exec(jt.text)?.[1]
        : undefined;
      fields.push({
        field: m.name,
        type: m.type,
        line: m.line,
        joinTable: {
          target: { model: baseType(target) },
          name: jtName,
          derive: (own, other) => `${own.table}_${other.table}`,
          ownColumn: jc ?? ((own) => `${own.model}_${own.pk}`),
          otherColumn: ijc ?? ((other) => `${m.name}_${other.pk}`),
        },
      });
      continue;
    }
    if (many || one) {
      if (one?.args.has('mappedBy')) continue;
      const rel = (many ?? one)!;
      const target =
        lit(rel.args.get('targetEntity')?.replace(/::class(\.java)?$|\.class$/, '')) ??
        baseType(m.type);
      const name = join ? lit(join.args.get('name')) : undefined;
      const optional = lit(rel.args.get('optional'));
      const f: OrmField = {
        field: m.name,
        column: name,
        type: m.type,
        nullable: !(lit(join?.args.get('nullable')) === 'false' || optional === 'false' || notNull),
        line: m.line,
        ref: { model: target, column: lit(join?.args.get('referencedColumnName')) },
        fkColumn: (t) => `${m.name}_${t.pk}`,
      };
      if (one || lit(join?.args.get('unique')) === 'true') f.unique = true;
      if (has(m.ann, 'Id') || has(m.ann, 'MapsId')) f.primaryKey = true;
      fields.push(f);
      continue;
    }
    if (has(m.ann, 'Embedded') || has(m.ann, 'EmbeddedId')) {
      fields.push({
        field: m.name,
        type: m.type,
        line: m.line,
        embed: { model: baseType(m.type) },
      });
      continue;
    }
    const f: OrmField = {
      field: m.name,
      column: lit(col?.args.get('name')) ?? m.name,
      type: m.nullableType ? `${m.type}?` : m.type,
      nullable: !(lit(col?.args.get('nullable')) === 'false' || PRIMITIVES.has(m.type) || notNull),
      line: m.line,
    };
    if (!lit(col?.args.get('name'))) f.defaultName = true;
    if (has(m.ann, 'Id')) {
      f.primaryKey = true;
      f.nullable = false;
    }
    if (lit(col?.args.get('unique')) === 'true') f.unique = true;
    const len = num(col?.args.get('length'));
    if (len !== undefined) f.length = len;
    const p = num(col?.args.get('precision'));
    if (p !== undefined) f.precision = p;
    const s = num(col?.args.get('scale'));
    if (s !== undefined) f.scale = s;
    const def = lit(col?.args.get('columnDefinition'));
    if (def) f.type = `${f.type} (${def})`;
    fields.push(f);
  }
  const tableAnn = has(k.ann, 'Table');
  const entityName = lit(entity?.args.get('name') ?? entity?.pos[0]);
  const inh = has(k.ann, 'Inheritance');
  const strategy = inh ? /JOINED|TABLE_PER_CLASS|SINGLE_TABLE/.exec(inh.text)?.[0] : undefined;
  const disc = has(k.ann, 'DiscriminatorColumn');
  return {
    framework: 'jpa',
    model: k.name,
    line: line(k.node),
    endLine: endLine(k.node),
    table: lit(tableAnn?.args.get('name') ?? tableAnn?.pos[0]),
    defaultTable: entityName ?? k.name,
    rule: "JPA default: the entity name (Spring Boot's default naming strategy writes it in snake_case)",
    trySnake: true,
    bases: k.bases.map(baseType),
    root: true,
    role: entity ? 'entity' : mapped ? 'abstract' : 'embeddable',
    inherit: strategy === 'JOINED' || strategy === 'TABLE_PER_CLASS' ? 'joined' : 'single',
    discriminator: {
      column: lit(disc?.args.get('name')) ?? 'DTYPE',
      type: 'VARCHAR(31)',
      line: line(k.node),
      implicit: 'JPA single-table inheritance: the discriminator column',
    },
    parentLink: (p) => ({
      column: p.pk,
      field: p.pk,
      type: '(key of the parent entity)',
      primaryKey: true,
      nullable: false,
      line: line(k.node),
      ref: { table: p.table, column: p.pk },
      implicit: `JPA joined inheritance: the key of ${p.model}`,
    }),
    fields,
  };
}

const REPOSITORY =
  /^(Jpa|Crud|ListCrud|PagingAndSorting|ListPagingAndSorting|JpaSpecificationExecutor|Revision|QuerydslPredicateExecutor)?Repository$|^JpaRepository$|^CrudRepository$/;

function springData(k: Klass, out: OrmFile): void {
  for (const b of k.bases) {
    const m = /^([\w.]+)\s*<\s*([\w.]+)/.exec(b);
    if (!m || !REPOSITORY.test(m[1]!.split('.').pop()!)) continue;
    out.uses.push({
      framework: 'spring-data',
      owner: k.name,
      line: line(k.node),
      model: m[2]!,
      access: 'reads-writes',
      detail: `Spring Data repository of ${m[2]} (${m[1]}): its methods read and write the table`,
    });
    if (!out.frameworks.includes('spring-data')) out.frameworks.push('spring-data');
  }
}

// --------------------------------------------------------------------------- Exposed

const EXPOSED_BASES =
  /^(Table|IdTable|IntIdTable|LongIdTable|UUIDTable|UIntIdTable|ULongIdTable|CompositeIdTable)$/;

function exposed(c: N, k: Klass, out: OrmFile): void {
  const base = k.bases.map((b) => b.split('.').pop()!).find((b) => EXPOSED_BASES.test(b));
  if (!base) return;
  const del = named(c).find((x) => x.type === 'delegation_specifiers');
  const nameArg = del ? /"([^"]+)"/.exec(del.text)?.[1] : undefined;
  const fields: OrmField[] = [];
  let pkCols: string[] = [];
  const body = named(c).find((x) => x.type === 'class_body');
  for (const p of named(body)) {
    if (p.type !== 'property_declaration') continue;
    const vd = named(p).find((x) => x.type === 'variable_declaration');
    const prop = named(vd)[0]?.text;
    const init = named(p).find((x) => x.type === 'call_expression');
    if (!prop || !init) continue;
    const t = words(init.text);
    if (prop === 'primaryKey') {
      const ids = /PrimaryKey\(([^)]*)\)/.exec(t)?.[1];
      if (ids) pkCols = splitArgs(ids).filter((x) => !x.includes('=') && !x.startsWith('"'));
      continue;
    }
    const head = /^(\w+)\(\s*"([^"]+)"\s*(?:,\s*([^)]*))?\)/.exec(t);
    if (!head) continue;
    const [, fn, column, rest] = head as unknown as [string, string, string, string | undefined];
    const f: OrmField = {
      field: prop,
      column,
      type: fn,
      nullable: /\.nullable\(\)/.test(t) ? true : false,
      line: line(p),
    };
    const len = rest && /^\d+/.exec(rest.trim())?.[0];
    if (len && /char|binary/i.test(fn)) f.length = Number(len);
    if (/\.uniqueIndex\(/.test(t)) f.unique = true;
    const d = /\.default\(([^)]*)\)/.exec(t);
    if (d) f.default = d[1];
    if (/\.primaryKey\(\)/.test(t) || /\.entityId\(\)/.test(t)) f.primaryKey = true;
    if (fn === 'reference' || fn === 'optReference') {
      const target = rest?.split(',')[0]?.trim();
      if (target)
        f.ref = {
          model: target.split('.')[0],
          column: target.includes('.') ? target.split('.')[1] : undefined,
        };
      if (fn === 'optReference') f.nullable = true;
    }
    const r = /\.references\(\s*([\w]+)\.(\w+)/.exec(t);
    if (r) f.ref = { model: r[1], column: r[2] };
    fields.push(f);
  }
  for (const f of fields) if (pkCols.includes(f.field ?? '')) f.primaryKey = true;
  const idTable = base !== 'Table';
  out.models.push({
    framework: 'exposed',
    model: k.name,
    line: line(c),
    endLine: endLine(c),
    table: nameArg,
    defaultTable: k.name.replace(/Table$/, ''),
    rule: 'Exposed default: the object name without a Table suffix',
    bases: [],
    root: true,
    role: 'entity',
    fields,
    ...(idTable
      ? {
          implicitPk: {
            column: /"([^"]+)"/.exec(del?.text.split(',')[1] ?? '')?.[1] ?? 'id',
            field: 'id',
            type: base.replace(/IdTable$/, '') || 'id',
            primaryKey: true,
            nullable: false,
            line: line(c),
            implicit: `Exposed ${base} adds an id primary key`,
          },
        }
      : {}),
  });
  if (!out.frameworks.includes('exposed')) out.frameworks.push('exposed');
}

const JPA_HINT =
  /@(jakarta\.persistence\.|javax\.persistence\.)?(Entity|MappedSuperclass|Embeddable)\b/;
const SPRING_HINT = /\b(Jpa|Crud|PagingAndSorting|ListCrud)Repository\s*</;
const EXPOSED_HINT = /org\.jetbrains\.exposed|:\s*(Int|Long|UUID)?(Id)?Table\(/;

export function readJvm(path: string, language: 'Java' | 'Kotlin', source: string): OrmFile | null {
  const jpa = JPA_HINT.test(source);
  const spring = SPRING_HINT.test(source);
  const exp = language === 'Kotlin' && EXPOSED_HINT.test(source);
  if (!jpa && !spring && !exp) return null;
  const tree = parseTree(language === 'Java' ? 'java' : 'kotlin', source);
  const out: OrmFile = {
    path,
    frameworks: jpa ? ['jpa'] : [],
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
    const ks = language === 'Java' ? javaClasses(tree.rootNode) : kotlinClasses(tree.rootNode);
    for (const k of ks) {
      if (jpa) {
        const m = jpaModel(k);
        if (m) out.models.push(m, ...(m.role === 'entity' ? oneToManyJoins(k) : []));
      }
      if (spring) springData(k, out);
      if (exp) exposed(k.node, k, out);
    }
  } finally {
    tree.delete();
  }
  return out;
}
