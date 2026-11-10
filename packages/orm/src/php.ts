/**
 * PHP ORMs: Laravel migrations (Schema::create / Schema::table), Eloquent models, and Doctrine
 * entities mapped by attributes (#[ORM\Column]) or docblock annotations (@ORM\Column). Read from
 * the tree-sitter PHP tree. Doctrine XML and YAML mapping files are not read.
 */
import { parseTree } from '@nexora/syntax';
import { laravelPlural, snake } from './naming';
import { field, findAll, line, endLine, named, stringOf, words, type N } from './tree';
import type { OrmField, OrmFile, OrmModel, OrmTable } from './types';

const str = (n: N | undefined) => (n ? stringOf(n) : undefined);

function callArgs(n: N): N[] {
  return named(field(n, 'arguments'))
    .filter((a) => a.type === 'argument')
    .map((a) => named(a)[named(a).length - 1]!)
    .filter(Boolean);
}

/** `$table->string('x')->nullable()->unique()` → base call and modifiers, in order. */
function chain(n: N): { root?: N; calls: { name: string; args: N[]; node: N }[] } {
  const calls: { name: string; args: N[]; node: N }[] = [];
  let cur: N | null = n;
  while (cur && cur.type === 'member_call_expression') {
    calls.unshift({ name: field(cur, 'name')?.text ?? '', args: callArgs(cur), node: cur });
    cur = field(cur, 'object');
  }
  return { root: cur ?? undefined, calls };
}

const NOT_COLUMN = new Set([
  'index',
  'unique',
  'primary',
  'foreign',
  'dropColumn',
  'dropColumns',
  'renameColumn',
  'dropForeign',
  'dropIndex',
  'dropUnique',
  'dropPrimary',
  'dropTimestamps',
  'dropSoftDeletes',
  'dropMorphs',
  'engine',
  'charset',
  'collation',
  'comment',
  'temporary',
  'fullText',
  'spatialIndex',
  'rawIndex',
  'dropConstrainedForeignId',
  'dropForeignIdFor',
  'renameIndex',
  'dropIfExists',
  'after',
]);
const INCREMENTS =
  /^(increments|bigIncrements|mediumIncrements|smallIncrements|tinyIncrements|integerIncrements)$/;

function laravelColumn(
  base: { name: string; args: N[] },
  mods: { name: string; args: N[] }[],
  ln: number,
  table: string,
  out: OrmFile,
): OrmField[] {
  const m = base.name;
  const a0 = str(base.args[0]);
  const fields: OrmField[] = [];
  const nullableMod = mods.some(
    (x) => x.name === 'nullable' && (!x.args[0] || x.args[0].text !== 'false'),
  );
  const mk = (column: string, type: string, extra: Partial<OrmField> = {}): OrmField => ({
    column,
    type,
    nullable: nullableMod,
    line: ln,
    ...extra,
  });
  if (m === 'id')
    fields.push(mk(a0 ?? 'id', 'bigIncrements', { primaryKey: true, nullable: false }));
  else if (INCREMENTS.test(m) && a0) fields.push(mk(a0, m, { primaryKey: true, nullable: false }));
  else if (m === 'timestamps' || m === 'timestampsTz' || m === 'nullableTimestamps')
    for (const c of ['created_at', 'updated_at'])
      fields.push(
        mk(c, m === 'timestampsTz' ? 'timestampTz' : 'timestamp', {
          nullable: true,
          implicit: `Laravel ${m}()`,
        }),
      );
  else if (m === 'softDeletes' || m === 'softDeletesTz')
    fields.push(
      mk(a0 ?? 'deleted_at', 'timestamp', { nullable: true, implicit: `Laravel ${m}()` }),
    );
  else if (m === 'rememberToken')
    fields.push(
      mk('remember_token', 'string', {
        length: 100,
        nullable: true,
        implicit: 'Laravel rememberToken()',
      }),
    );
  else if (
    /^(nullable)?(uuid|ulid)?Morphs$|^(nullable)?(Uuid|Ulid)Morphs$|^morphs$/i.test(m) &&
    a0
  ) {
    const nul = /^nullable/.test(m) || nullableMod;
    fields.push(mk(`${a0}_type`, 'string', { nullable: nul, implicit: `Laravel ${m}()` }));
    fields.push(
      mk(`${a0}_id`, /uuid/i.test(m) ? 'uuid' : /ulid/i.test(m) ? 'ulid' : 'unsignedBigInteger', {
        nullable: nul,
        implicit: `Laravel ${m}()`,
      }),
    );
  } else if (m === 'foreignIdFor' && base.args[0]) {
    const model = base.args[0].text
      .replace(/::class$/, '')
      .split('\\')
      .pop()!;
    const col = str(base.args[1]) ?? `${snake(model)}_id`;
    fields.push(mk(col, 'foreignId'));
    if (mods.some((x) => x.name === 'constrained'))
      out.foreignKeys.push({
        framework: 'laravel',
        table,
        column: col,
        refTable: laravelPlural(snake(model)),
        refColumn: 'id',
        line: ln,
      });
  } else if (!NOT_COLUMN.has(m) && a0 !== undefined) {
    const f = mk(a0, m);
    const n1 = base.args[1]?.type === 'integer' ? Number(base.args[1].text) : undefined;
    const n2 = base.args[2]?.type === 'integer' ? Number(base.args[2].text) : undefined;
    if (/^(string|char)$/.test(m)) f.length = n1 ?? 255;
    if (/^(decimal|unsignedDecimal|double|float)$/.test(m)) {
      if (n1 !== undefined) f.precision = n1;
      if (n2 !== undefined) f.scale = n2;
    }
    if (/^foreign(Id|Uuid|Ulid)$/.test(m)) {
      const con = mods.find((x) => x.name === 'constrained');
      if (con) {
        const refCol = str(con.args[1]) ?? 'id';
        // Laravel constrained(): the column name before _<column>, pluralised.
        const refTable =
          str(con.args[0]) ??
          laravelPlural(a0.endsWith(`_${refCol}`) ? a0.slice(0, -(refCol.length + 1)) : a0);
        f.ref = { table: refTable, column: refCol };
      }
    }
    fields.push(f);
  } else if (m === 'foreign') {
    const ref = mods.find((x) => x.name === 'references');
    const on = mods.find((x) => x.name === 'on');
    const cols =
      base.args[0]?.type === 'array_creation_expression'
        ? findAll(base.args[0], (x) => x.type === 'string').map((x) => stringOf(x)!)
        : [a0];
    const refs =
      ref?.args[0]?.type === 'array_creation_expression'
        ? findAll(ref.args[0], (x) => x.type === 'string').map((x) => stringOf(x)!)
        : [str(ref?.args[0])];
    const rt = str(on?.args[0]);
    if (rt)
      cols.forEach(
        (c, i) =>
          c &&
          out.foreignKeys.push({
            framework: 'laravel',
            table,
            column: c,
            refTable: rt,
            refColumn: refs[i],
            line: ln,
          }),
      );
  }
  for (const f of fields) {
    for (const x of mods) {
      if (x.name === 'unique') f.unique = true;
      else if (x.name === 'primary') {
        f.primaryKey = true;
        f.nullable = false;
      } else if (x.name === 'default' && x.args[0]) f.default = words(x.args[0].text);
      else if (x.name === 'useCurrent') f.default = 'CURRENT_TIMESTAMP';
    }
  }
  return fields;
}

function laravel(root: N, out: OrmFile): void {
  const downs = findAll(
    root,
    (n) => n.type === 'method_declaration' && field(n, 'name')?.text === 'down',
  );
  const inDown = (n: N) =>
    downs.some((d) => n.startIndex >= d.startIndex && n.endIndex <= d.endIndex);
  for (const call of findAll(root, (n) => n.type === 'scoped_call_expression')) {
    if (inDown(call)) continue;
    const scope = field(call, 'scope')?.text.split('\\').pop();
    const method = field(call, 'name')?.text;
    if (scope !== 'Schema' || (method !== 'create' && method !== 'table')) continue;
    const args = callArgs(call);
    const name = str(args[0]);
    const fn = args[1];
    if (!name || !fn) continue;
    const param = findAll(fn, (x) => x.type === 'variable_name', true)[0]?.text ?? '$table';
    const t: OrmTable = {
      framework: 'laravel',
      name,
      line: line(call),
      fields: [],
      ...(method === 'table' ? { alter: true } : {}),
    };
    const pks: string[] = [];
    const uniques: string[] = [];
    for (const st of findAll(field(fn, 'body') ?? fn, (x) => x.type === 'expression_statement')) {
      const e = named(st)[0];
      if (e?.type !== 'member_call_expression') continue;
      const ch = chain(e);
      if (ch.root?.text !== param || !ch.calls.length) continue;
      const [base, ...mods] = ch.calls as [
        { name: string; args: N[]; node: N },
        ...{ name: string; args: N[]; node: N }[],
      ];
      if (mods.some((x) => x.name === 'change')) continue;
      if (base.name === 'primary' || base.name === 'unique') {
        const cols =
          base.args[0]?.type === 'array_creation_expression'
            ? findAll(base.args[0], (x) => x.type === 'string').map((x) => stringOf(x)!)
            : [str(base.args[0])];
        if (base.name === 'primary') pks.push(...cols.filter((x): x is string => !!x));
        else if (cols.length === 1 && cols[0]) uniques.push(cols[0]);
        continue;
      }
      t.fields.push(...laravelColumn(base, mods, line(st), name, out));
    }
    for (const f of t.fields) {
      if (f.column && pks.includes(f.column)) {
        f.primaryKey = true;
        f.nullable = false;
      }
      if (f.column && uniques.includes(f.column)) f.unique = true;
    }
    out.tables.push(t);
  }
}

const ELOQUENT_BASE = /^(Model|Authenticatable|Pivot|MorphPivot|User)$/;

function eloquent(root: N, out: OrmFile): void {
  for (const c of findAll(root, (n) => n.type === 'class_declaration')) {
    const name = field(c, 'name')?.text;
    const base = named(named(c).find((x) => x.type === 'base_clause'))[0]
      ?.text.split('\\')
      .pop();
    if (!name || !base || !ELOQUENT_BASE.test(base)) continue;
    let table: string | undefined;
    for (const p of findAll(c, (n) => n.type === 'property_element')) {
      const v = named(p);
      if (v[0]?.text === '$table') table = str(findAll(p, (x) => x.type === 'string', true)[0]);
    }
    // Laravel default: Str::snake(Str::pluralStudly(class_basename)).
    const dflt = laravelPlural(snake(name));
    out.uses.push({
      framework: 'eloquent',
      owner: name,
      line: line(c),
      ...(table ? { table } : { candidates: [dflt] }),
      access: 'maps',
      detail: table
        ? `${name} maps to table ${table} ($table)`
        : `${name} maps to table ${dflt} (Eloquent default: the class name in snake_case, pluralised)`,
    });
  }
}

// ------------------------------------------------------------------------------- Doctrine

interface Ann {
  name: string;
  args: Map<string, string>;
  pos: string[];
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let d = 0;
  let q = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ',' && d === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (s.slice(start).trim()) out.push(s.slice(start).trim());
  return out;
}

function parseAnn(text: string): Ann | undefined {
  const m = /^@?\\?([\w\\]+)\s*(?:\(([\s\S]*)\))?$/.exec(text.trim());
  if (!m) return undefined;
  const args = new Map<string, string>();
  const pos: string[] = [];
  for (const a of splitTop(m[2] ?? '')) {
    const kv = /^(\w+)\s*[:=]\s*([\s\S]+)$/.exec(a);
    if (kv && !/^["']/.test(a)) args.set(kv[1]!, kv[2]!.trim());
    else pos.push(a);
  }
  return { name: m[1]!.split('\\').pop()!, args, pos };
}

const lit = (v: string | undefined) => {
  if (v === undefined) return undefined;
  const s = /^["']([\s\S]*)["']$/.exec(v.trim());
  if (s) return s[1];
  if (/^(true|false|-?\d+)$/i.test(v.trim())) return v.trim().toLowerCase();
  return undefined;
};
const classRef = (v: string | undefined) =>
  v ? (lit(v) ?? v.replace(/::class$/, '')).split('\\').pop() : undefined;

/** Attributes (#[ORM\X(...)]) and docblock annotations (@ORM\X(...)) on a declaration. */
function doctrineAnns(n: N): Ann[] {
  const out: Ann[] = [];
  for (const g of findAll(field(n, 'attributes') ?? n, (x) => x.type === 'attribute', true)) {
    if (!field(n, 'attributes')) break;
    const a = parseAnn(g.text);
    if (a) out.push(a);
  }
  // The comment right before the declaration.
  let prev = n.previousNamedSibling;
  while (prev && prev.type === 'comment' && !prev.text.startsWith('/**'))
    prev = prev.previousNamedSibling;
  if (prev?.type === 'comment' && prev.text.startsWith('/**')) {
    const body = prev.text.replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '');
    const re = /@((?:ORM\\|Doctrine\\ORM\\Mapping\\)?[A-Z]\w*)/g;
    for (let m; (m = re.exec(body));) {
      let end = m.index + m[0].length;
      if (body[end] === '(') {
        let d = 0;
        for (; end < body.length; end++) {
          if (body[end] === '(') d++;
          else if (body[end] === ')' && --d === 0) {
            end++;
            break;
          }
        }
      }
      const a = parseAnn(body.slice(m.index, end));
      if (a) out.push(a);
    }
  }
  return out;
}

function doctrine(root: N, out: OrmFile): void {
  for (const c of findAll(root, (n) => n.type === 'class_declaration')) {
    const name = field(c, 'name')?.text;
    if (!name) continue;
    const ca = doctrineAnns(c);
    const get = (as: Ann[], k: string) => as.find((a) => a.name === k);
    const entity = get(ca, 'Entity');
    const mapped = get(ca, 'MappedSuperclass');
    const embeddable = get(ca, 'Embeddable');
    if (!entity && !mapped && !embeddable) continue;
    const fields: OrmField[] = [];
    for (const p of named(field(c, 'body'))) {
      if (p.type !== 'property_declaration') continue;
      const pa = doctrineAnns(p);
      const prop = findAll(p, (x) => x.type === 'property_element', true)[0];
      const pname = named(prop)[0]?.text.replace(/^\$/, '');
      if (!pname) continue;
      const ptype = words(field(p, 'type')?.text ?? '');
      const ln = line(p);
      const col = get(pa, 'Column');
      const many = get(pa, 'ManyToOne');
      const one = get(pa, 'OneToOne');
      const m2m = get(pa, 'ManyToMany');
      const join = get(pa, 'JoinColumn');
      if (m2m) {
        if (m2m.args.has('mappedBy')) continue;
        const target = classRef(m2m.args.get('targetEntity') ?? m2m.pos[0]);
        if (!target) continue;
        const jt = get(pa, 'JoinTable');
        fields.push({
          field: pname,
          type: 'ManyToMany',
          line: ln,
          joinTable: {
            target: { model: target },
            name: lit(jt?.args.get('name')),
            // Doctrine DefaultNamingStrategy: lower-case short class names joined by _.
            derive: (own, other) => `${own.model}_${other.model}`.toLowerCase(),
            ownColumn: (own) => `${own.model.toLowerCase()}_${own.pk}`,
            otherColumn: (other) => `${other.model.toLowerCase()}_${other.pk}`,
          },
        });
        continue;
      }
      if (many || one) {
        const rel = (many ?? one)!;
        if (rel.args.has('mappedBy')) continue;
        const target =
          classRef(rel.args.get('targetEntity') ?? rel.pos[0]) ?? ptype.replace(/^\?/, '');
        const jcName = lit(join?.args.get('name'));
        fields.push({
          field: pname,
          column: jcName,
          type: rel.name,
          nullable: lit(join?.args.get('nullable')) !== 'false',
          line: ln,
          ref: { model: target, column: lit(join?.args.get('referencedColumnName')) },
          fkColumn: (t) => `${pname}_${t.pk}`,
          ...(one || lit(join?.args.get('unique')) === 'true' ? { unique: true } : {}),
        });
        continue;
      }
      const emb = get(pa, 'Embedded');
      if (emb) {
        const cls = classRef(emb.args.get('class') ?? emb.pos[0]) ?? ptype;
        const prefix = emb.args.get('columnPrefix');
        fields.push({
          field: pname,
          type: cls,
          line: ln,
          embed: {
            model: cls,
            prefix: prefix === 'false' ? undefined : (lit(prefix) ?? `${pname}_`),
          },
        });
        continue;
      }
      if (!col && !get(pa, 'Id')) continue;
      const f: OrmField = {
        field: pname,
        column: lit(col?.args.get('name')) ?? pname,
        type: lit(col?.args.get('type')) ?? (ptype || 'string'),
        // Doctrine columns are NOT NULL unless nullable: true.
        nullable: lit(col?.args.get('nullable')) === 'true',
        line: ln,
      };
      if (!lit(col?.args.get('name'))) f.defaultName = true;
      if (get(pa, 'Id')) {
        f.primaryKey = true;
        f.nullable = false;
      }
      if (lit(col?.args.get('unique')) === 'true') f.unique = true;
      const len = lit(col?.args.get('length'));
      if (len && /^\d+$/.test(len)) f.length = Number(len);
      const pr = lit(col?.args.get('precision'));
      if (pr && /^\d+$/.test(pr)) f.precision = Number(pr);
      const sc = lit(col?.args.get('scale'));
      if (sc && /^\d+$/.test(sc)) f.scale = Number(sc);
      fields.push(f);
    }
    const tableAnn = get(ca, 'Table');
    const base = named(named(c).find((x) => x.type === 'base_clause'))[0]
      ?.text.split('\\')
      .pop();
    const inh = get(ca, 'InheritanceType');
    const disc = get(ca, 'DiscriminatorColumn');
    const model: OrmModel = {
      framework: 'doctrine',
      model: name,
      line: line(c),
      endLine: endLine(c),
      table: lit(tableAnn?.args.get('name') ?? tableAnn?.pos[0]),
      defaultTable: name,
      rule: "Doctrine default: the short class name (Symfony's default naming strategy writes it in snake_case)",
      trySnake: true,
      bases: base ? [base] : [],
      root: true,
      role: entity ? 'entity' : mapped ? 'abstract' : 'embeddable',
      inherit: /JOINED/.test(inh?.pos[0] ?? inh?.args.get('value') ?? '') ? 'joined' : 'single',
      discriminator: {
        column: lit(disc?.args.get('name')) ?? 'discr',
        type: 'string',
        line: line(c),
        implicit: 'Doctrine single-table inheritance: the discriminator column',
      },
      parentLink: (p) => ({
        column: p.pk,
        type: '(key of the parent entity)',
        primaryKey: true,
        nullable: false,
        line: line(c),
        ref: { table: p.table, column: p.pk },
        implicit: `Doctrine joined inheritance: the key of ${p.model}`,
      }),
      fields,
    };
    out.models.push(model);
  }
}

export function readPhp(path: string, source: string): OrmFile | null {
  const lara = /\bSchema::(create|table)\s*\(/.test(source);
  const elo =
    /\bextends\s+(Model|Authenticatable|Pivot|MorphPivot)\b/.test(source) &&
    /Illuminate\\/.test(source);
  const doc = /(#\[|@)(ORM\\|Doctrine\\ORM\\Mapping\\)(Entity|MappedSuperclass|Embeddable)\b/.test(
    source,
  );
  if (!lara && !elo && !doc) return null;
  const tree = parseTree('php', source);
  const out: OrmFile = {
    path,
    frameworks: [],
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  if (lara) out.frameworks.push('laravel');
  if (elo) out.frameworks.push('eloquent');
  if (doc) out.frameworks.push('doctrine');
  if (tree instanceof Error) {
    out.problems.push({ line: 1, message: tree.message });
    return out;
  }
  try {
    if (lara) laravel(tree.rootNode, out);
    if (elo) eloquent(tree.rootNode, out);
    if (doc) doctrine(tree.rootNode, out);
  } finally {
    tree.delete();
  }
  return out;
}
