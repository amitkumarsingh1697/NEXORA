/**
 * GORM: struct models, their tags, `TableName()` methods and `AutoMigrate(&T{})`. Read from the
 * tree-sitter Go tree. A struct is a model when it embeds gorm.Model, carries gorm tags, or is
 * passed to AutoMigrate; other structs are kept as candidates for embedding and registration.
 */
import { parseTree } from '@nexora/syntax';
import { gormDbName, gormTableName } from './naming';
import { field, findAll, line, endLine, named, stringOf, words, type N } from './tree';
import type { OrmField, OrmFile, OrmModel, OrmRegistration } from './types';

/** `gorm:"size:254;uniqueIndex;not null"` → settings (keys in upper case, as GORM parses them). */
export function gormTag(tag: string): Map<string, string> {
  const m = /(?:^|\s)gorm:"((?:[^"\\]|\\.)*)"/.exec(tag);
  const out = new Map<string, string>();
  if (!m) return out;
  for (const part of m[1]!.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf(':');
    out.set((i < 0 ? p : p.slice(0, i)).trim().toUpperCase(), i < 0 ? '' : p.slice(i + 1).trim());
  }
  return out;
}

const GORM_MODEL: OrmField[] = [
  {
    column: 'id',
    field: 'ID',
    type: 'uint',
    primaryKey: true,
    nullable: false,
    line: 0,
    implicit: 'gorm.Model',
  },
  {
    column: 'created_at',
    field: 'CreatedAt',
    type: 'time.Time',
    nullable: true,
    line: 0,
    implicit: 'gorm.Model',
  },
  {
    column: 'updated_at',
    field: 'UpdatedAt',
    type: 'time.Time',
    nullable: true,
    line: 0,
    implicit: 'gorm.Model',
  },
  {
    column: 'deleted_at',
    field: 'DeletedAt',
    type: 'gorm.DeletedAt',
    nullable: true,
    line: 0,
    implicit: 'gorm.Model',
  },
];

const SCALAR =
  /^(\*?)(u?int(8|16|32|64)?|float(32|64)|string|bool|byte|rune|\[\]byte|time\.Time|time\.Duration|sql\.Null\w+|gorm\.DeletedAt|datatypes\.\w+|uuid\.UUID|decimal\.Decimal|json\.RawMessage|pq\.\w+|\w+\.\w*(Time|UUID|JSON|Decimal|String|Int\w*))$/;

interface GoStruct {
  name: string;
  node: N;
  fields: { name?: string; type: string; tag: string; line: number }[];
}

export function readGo(path: string, source: string, gormRepo: boolean): OrmFile | null {
  const uses = /"gorm\.io\/gorm"|"github\.com\/jinzhu\/gorm"/.test(source);
  if (!uses && !(gormRepo && /\bstruct\s*\{/.test(source))) return null;
  const tree = parseTree('go', source);
  const out: OrmFile = {
    path,
    frameworks: ['gorm'],
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
    const root = tree.rootNode;
    const structs: GoStruct[] = [];
    for (const ts of findAll(root, (n) => n.type === 'type_spec')) {
      const st = field(ts, 'type');
      const name = field(ts, 'name')?.text;
      if (st?.type !== 'struct_type' || !name) continue;
      const fl = named(st).find((x) => x.type === 'field_declaration_list');
      const fields: GoStruct['fields'] = [];
      for (const fd of named(fl)) {
        if (fd.type !== 'field_declaration') continue;
        const type = words(field(fd, 'type')?.text ?? '');
        const tag =
          stringOf(field(fd, 'tag')) ?? field(fd, 'tag')?.text.replace(/^`|`$/g, '') ?? '';
        const names = named(fd).filter((x) => x.type === 'field_identifier');
        if (!names.length) fields.push({ type, tag, line: line(fd) });
        for (const n of names) fields.push({ name: n.text, type, tag, line: line(fd) });
      }
      structs.push({ name, node: ts, fields });
    }
    const byName = new Map(structs.map((s) => [s.name, s]));
    // TableName() methods returning a literal.
    const tableName = new Map<string, string>();
    for (const m of findAll(root, (n) => n.type === 'method_declaration')) {
      if (field(m, 'name')?.text !== 'TableName') continue;
      const recv = words(field(m, 'receiver')?.text ?? '')
        .replace(/^\(|\)$/g, '')
        .split(' ')
        .pop()
        ?.replace(/^\*/, '');
      const ret = findAll(field(m, 'body') ?? m, (x) => x.type === 'return_statement')[0];
      const lit = ret
        ? findAll(
            ret,
            (x) => x.type === 'interpreted_string_literal' || x.type === 'raw_string_literal',
          )[0]
        : undefined;
      const v = stringOf(lit);
      if (recv && v) tableName.set(recv, v);
    }
    // AutoMigrate(&User{}, &Order{}).
    const regs: OrmRegistration[] = [];
    for (const c of findAll(root, (n) => n.type === 'call_expression')) {
      const fn = field(c, 'function');
      if (fn?.type !== 'selector_expression' || field(fn, 'field')?.text !== 'AutoMigrate')
        continue;
      for (const a of named(field(c, 'arguments'))) {
        const lit = findAll(a, (x) => x.type === 'composite_literal')[0];
        const t = lit ? field(lit, 'type')?.text.split('.').pop() : undefined;
        if (t) regs.push({ framework: 'gorm', model: t, line: line(a) });
      }
    }
    if (regs.length) out.registrations = regs;

    // Built twice: the first pass records which fields point at other structs (has-many keys
    // live in the other struct, which may come earlier in the file).
    const build = (s: GoStruct): OrmModel => {
      const fields: OrmField[] = [];
      let gormish = false;
      const names = new Set(s.fields.map((f) => f.name).filter(Boolean));
      for (const f of s.fields) {
        const tag = gormTag(f.tag);
        if (tag.size) gormish = true;
        if (tag.has('-') || f.tag.includes('gorm:"-')) continue;
        if (!f.name) {
          // An embedded (anonymous) struct: its fields are promoted into this table.
          if (f.type === 'gorm.Model') {
            gormish = true;
            fields.push(...GORM_MODEL.map((x) => ({ ...x, line: f.line })));
          } else
            fields.push({
              type: f.type,
              line: f.line,
              embed: { model: f.type.replace(/^\*/, '').split('.').pop()! },
            });
          continue;
        }
        if (!/^[A-Z]/.test(f.name)) continue;
        const bareType = f.type.replace(/^\*/, '');
        if (tag.has('EMBEDDED')) {
          fields.push({
            field: f.name,
            type: f.type,
            line: f.line,
            embed: { model: bareType.split('.').pop()!, prefix: tag.get('EMBEDDEDPREFIX') },
          });
          continue;
        }
        if (/^\[\]/.test(f.type)) {
          const el = f.type.replace(/^\[\]\*?/, '');
          const jt = tag.get('MANY2MANY');
          if (jt)
            fields.push({
              field: f.name,
              type: f.type,
              line: f.line,
              joinTable: {
                target: { model: el.split('.').pop()! },
                name: jt,
                ownColumn: (own) => `${gormDbName(own.model)}_${own.pk}`,
                otherColumn: (other) => `${gormDbName(other.model)}_${other.pk}`,
              },
            });
          else if (byName.has(el)) {
            // Has-many: the other struct's <Owner>ID field points back here.
            const other = byName.get(el)!;
            const fkField = tag.get('FOREIGNKEY') ?? `${s.name}ID`;
            const of = other.fields.find((x) => x.name === fkField);
            if (of) (of as { refTo?: string }).refTo = s.name;
          }
          continue;
        }
        if (/^map\[|^interface|^func|^chan /.test(f.type)) continue;
        const col = tag.get('COLUMN') ?? gormDbName(f.name);
        const scalar = SCALAR.test(f.type) || !!tag.get('TYPE') || tag.has('SERIALIZER');
        if (!scalar) {
          // Belongs-to: <Field>ID (or foreignKey:) holds the key.
          const fkField = tag.get('FOREIGNKEY') ?? `${f.name}ID`;
          if (names.has(fkField)) {
            const target = s.fields.find((x) => x.name === fkField);
            if (target) (target as { refTo?: string }).refTo = bareType.split('.').pop()!;
            continue;
          }
          // Has-one (the key is in the other table) or a value type: decided at resolution.
          fields.push({
            field: f.name,
            column: col,
            type: f.type,
            nullable: true,
            line: f.line,
            ref: { model: bareType.split('.').pop()! },
            navigation: true,
          });
          continue;
        }
        const out_: OrmField = {
          field: f.name,
          column: col,
          type: tag.get('TYPE') ?? f.type,
          nullable: !(tag.has('NOT NULL') || tag.has('PRIMARYKEY') || tag.has('PRIMARY_KEY')),
          line: f.line,
        };
        if (
          tag.has('PRIMARYKEY') ||
          tag.has('PRIMARY_KEY') ||
          (f.name === 'ID' && ![...s.fields].some((x) => gormTag(x.tag).has('PRIMARYKEY')))
        ) {
          out_.primaryKey = true;
          out_.nullable = false;
          if (!tag.has('PRIMARYKEY') && !tag.has('PRIMARY_KEY'))
            out_.implicit = 'GORM convention: a field named ID is the primary key';
        }
        if (tag.has('UNIQUE') || tag.has('UNIQUEINDEX')) out_.unique = true;
        if (tag.has('DEFAULT')) out_.default = tag.get('DEFAULT');
        const size = tag.get('SIZE');
        if (size && /^\d+$/.test(size)) out_.length = Number(size);
        const refTo = (f as { refTo?: string }).refTo;
        if (refTo) out_.ref = { model: refTo };
        fields.push(out_);
      }
      // refTo set on a field after it was turned into a column (has-many seen later).
      for (const f of s.fields) {
        const refTo = (f as { refTo?: string }).refTo;
        const of = fields.find((x) => x.field === f.name);
        if (refTo && of && !of.ref) of.ref = { model: refTo };
      }
      const table = tableName.get(s.name);
      return {
        framework: 'gorm',
        model: s.name,
        line: line(s.node),
        endLine: endLine(s.node),
        table,
        defaultTable: gormTableName(s.name),
        rule: 'GORM default: the struct name in snake_case, pluralised',
        bases: [],
        root: gormish || !!table,
        role: gormish || table ? 'entity' : 'abstract',
        fields,
      };
    };
    for (const s of structs) build(s);
    for (const s of structs) out.models.push(build(s));
  } finally {
    tree.delete();
  }
  return out;
}
