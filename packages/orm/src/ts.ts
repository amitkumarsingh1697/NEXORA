/**
 * TypeScript and JavaScript ORMs: TypeORM and MikroORM entities (decorators), sequelize-typescript
 * models, Sequelize `define` / `Model.init` and queryInterface migrations, Mongoose schemas and
 * models, Knex schema builders, and Objection.js models. Parsed with the TypeScript compiler's
 * parser (syntax only: no type checking, nothing is executed).
 *
 * Prisma and Drizzle are read by CodeAtlas's own schema reader and are not repeated here.
 */
import ts from 'typescript';
import {
  mikroUnderscore,
  mongooseCollection,
  sequelizePlural,
  typeormCamel,
  typeormSnake,
} from './naming';
import type { OrmField, OrmFile, OrmFramework, OrmModel, OrmTable } from './types';

const HINTS: [OrmFramework, RegExp][] = [
  ['typeorm', /from\s+['"]typeorm['"]|require\(['"]typeorm['"]\)/],
  ['mikro-orm', /from\s+['"]@mikro-orm\/[\w-]+['"]/],
  [
    'sequelize',
    /from\s+['"]sequelize(-typescript)?['"]|require\(['"]sequelize(-typescript)?['"]\)|queryInterface\.(createTable|addColumn|dropTable|renameTable|removeColumn|renameColumn)/,
  ],
  ['mongoose', /from\s+['"]mongoose['"]|require\(['"]mongoose['"]\)/],
  [
    'knex',
    /\.schema\s*\.\s*(createTable|alterTable|table|createTableIfNotExists|dropTable|dropTableIfExists|renameTable)\s*\(/,
  ],
  ['objection', /from\s+['"]objection['"]|require\(['"]objection['"]\)/],
];

const lineOf = (sf: ts.SourceFile, n: ts.Node) =>
  sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const strOf = (e: ts.Node | undefined): string | undefined =>
  e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined;
const numOf = (e: ts.Node | undefined): number | undefined =>
  e && ts.isNumericLiteral(e) ? Number(e.text) : undefined;
const boolOf = (e: ts.Node | undefined): boolean | undefined =>
  e?.kind === ts.SyntaxKind.TrueKeyword
    ? true
    : e?.kind === ts.SyntaxKind.FalseKeyword
      ? false
      : undefined;

function props(o: ts.Node | undefined): Map<string, ts.Expression> {
  const m = new Map<string, ts.Expression>();
  if (!o || !ts.isObjectLiteralExpression(o)) return m;
  for (const p of o.properties) {
    if (ts.isPropertyAssignment(p) && p.name) {
      const k =
        ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
      m.set(k, p.initializer);
    } else if (ts.isShorthandPropertyAssignment(p)) m.set(p.name.text, p.name);
  }
  return m;
}

const calleeName = (c: ts.CallExpression) =>
  ts.isIdentifier(c.expression)
    ? c.expression.text
    : ts.isPropertyAccessExpression(c.expression)
      ? c.expression.name.text
      : '';

interface Deco {
  name: string;
  args: readonly ts.Expression[];
}
function decorators(n: ts.Node): Deco[] {
  const ds = ts.canHaveDecorators(n) ? (ts.getDecorators(n) ?? []) : [];
  return ds.map((d) => {
    const e = d.expression;
    if (ts.isCallExpression(e)) return { name: calleeName(e), args: e.arguments };
    return { name: ts.isIdentifier(e) ? e.text : e.getText(), args: [] };
  });
}
const deco = (ds: Deco[], n: string) => ds.find((d) => d.name === n);
/** `() => User` or `'User'` or `User`: the class a relation decorator names. */
function targetOf(e: ts.Expression | undefined): string | undefined {
  if (!e) return undefined;
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
    const b = e.body;
    if (ts.isIdentifier(b)) return b.text;
    if (ts.isArrayLiteralExpression(b) && b.elements[0] && ts.isIdentifier(b.elements[0]))
      return b.elements[0].text;
    return undefined;
  }
  return strOf(e) ?? (ts.isIdentifier(e) ? e.text : undefined);
}

// ------------------------------------------------------------------- TypeORM and MikroORM

const TYPEORM_COLUMN = new Set([
  'Column',
  'PrimaryColumn',
  'PrimaryGeneratedColumn',
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
  'ObjectIdColumn',
  'ViewColumn',
  'Generated',
]);
const MIKRO_COLUMN = new Set(['Property', 'PrimaryKey', 'SerializedPrimaryKey', 'Enum', 'Formula']);

function decoratedEntities(sf: ts.SourceFile, fw: 'typeorm' | 'mikro-orm', out: OrmFile): void {
  const visit = (n: ts.Node) => {
    if (ts.isClassDeclaration(n) && n.name) {
      const cd = decorators(n);
      const ent = deco(cd, 'Entity');
      const embeddable = fw === 'mikro-orm' ? deco(cd, 'Embeddable') : undefined;
      const ventity = deco(cd, 'ViewEntity');
      if (ent || embeddable || ventity) entity(n, n.name.text, ent ?? ventity, embeddable);
    }
    ts.forEachChild(n, visit);
  };
  const entity = (
    c: ts.ClassDeclaration,
    name: string,
    ent: Deco | undefined,
    embeddable: Deco | undefined,
  ) => {
    const a0 = ent?.args[0];
    const opts = props(ent?.args.find((x) => ts.isObjectLiteralExpression(x)));
    const table =
      strOf(a0) ??
      strOf(opts.get(fw === 'typeorm' ? 'name' : 'tableName')) ??
      strOf(opts.get('collection'));
    const fields: OrmField[] = [];
    for (const m of c.members) {
      if (!ts.isPropertyDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
      const pn = m.name.text;
      const ds = decorators(m);
      const ln = lineOf(sf, m);
      const tsType = m.type?.getText(sf) ?? '';
      const optional = !!m.questionToken;
      const colDeco = ds.find((d) =>
        (fw === 'typeorm' ? TYPEORM_COLUMN : MIKRO_COLUMN).has(d.name),
      );
      const many = deco(ds, 'ManyToOne');
      const one = deco(ds, 'OneToOne');
      const m2m = deco(ds, 'ManyToMany');
      const embedded = fw === 'mikro-orm' ? deco(ds, 'Embedded') : undefined;
      if (embedded) {
        const t = targetOf(embedded.args[0]) ?? tsType;
        fields.push({
          field: pn,
          type: t,
          line: ln,
          embed: { model: t, prefix: `${mikroUnderscore(pn)}_` },
        });
        continue;
      }
      if (m2m) {
        const jt = deco(ds, 'JoinTable');
        const ro = props(m2m.args.find((x) => ts.isObjectLiteralExpression(x)));
        const owner =
          fw === 'typeorm'
            ? !!jt
            : !ro.has('mappedBy') &&
              boolOf(ro.get('owner')) !== false &&
              !m2m.args.some((x, i) => i > 0 && (ts.isArrowFunction(x) || ts.isStringLiteral(x)));
        if (!owner) continue;
        const target = targetOf(m2m.args[0]);
        if (!target) continue;
        const jo = props(jt?.args[0]);
        const jc = props(jo.get('joinColumn'));
        const ijc = props(jo.get('inverseJoinColumn'));
        fields.push({
          field: pn,
          type: 'ManyToMany',
          line: ln,
          joinTable: {
            target: { model: target },
            name: strOf(jo.get('name')) ?? strOf(ro.get('pivotTable')),
            derive:
              fw === 'typeorm'
                ? (own, other) => typeormSnake(`${own.table}_${pn}_${other.table}`)
                : (own) => `${own.table}_${mikroUnderscore(pn)}`,
            ownColumn:
              strOf(jc.get('name')) ??
              (fw === 'typeorm'
                ? (own) => typeormCamel(`${own.table}_${own.pk}`)
                : (own) => `${mikroUnderscore(own.model)}_${own.pk}`),
            otherColumn:
              strOf(ijc.get('name')) ??
              (fw === 'typeorm'
                ? (other) => typeormCamel(`${other.table}_${other.pk}`)
                : (other) => `${mikroUnderscore(other.model)}_${other.pk}`),
          },
        });
        continue;
      }
      if (many || one) {
        const rel = (many ?? one)!;
        const ro = props(rel.args.find((x) => ts.isObjectLiteralExpression(x)));
        // TypeORM: only the side with @JoinColumn holds the key of a one-to-one.
        const jcD = deco(ds, 'JoinColumn');
        if (one && fw === 'typeorm' && !jcD) continue;
        if (
          one &&
          fw === 'mikro-orm' &&
          (ro.has('mappedBy') ||
            (rel.args.some((x, i) => i > 0 && (ts.isArrowFunction(x) || ts.isStringLiteral(x))) &&
              boolOf(ro.get('owner')) !== true))
        )
          continue;
        const target = targetOf(rel.args[0]) ?? tsType;
        const jc = props(jcD?.args[0]);
        const written = strOf(jc.get('name')) ?? strOf(ro.get('fieldName'));
        fields.push({
          field: pn,
          column: written,
          type: rel.name,
          nullable: boolOf(ro.get('nullable')) ?? (fw === 'typeorm' ? true : optional),
          line: ln,
          ref: { model: target, column: strOf(jc.get('referencedColumnName')) },
          // TypeORM: camelCase(relation_pk); MikroORM: underscore(relation)_id.
          fkColumn:
            fw === 'typeorm'
              ? (t) => typeormCamel(`${pn}_${t.pk}`)
              : () => `${mikroUnderscore(pn)}_id`,
          ...(one ? { unique: true } : {}),
        });
        continue;
      }
      if (!colDeco) continue;
      const o = props(colDeco.args.find((x) => ts.isObjectLiteralExpression(x)));
      const typeArg = strOf(colDeco.args[0]);
      const written = strOf(o.get(fw === 'typeorm' ? 'name' : 'fieldName'));
      const column = written ?? (fw === 'typeorm' ? pn : mikroUnderscore(pn));
      const primary = /^Primary/.test(colDeco.name) || boolOf(o.get('primary')) === true;
      const f: OrmField = {
        field: pn,
        column,
        type:
          (typeArg && colDeco.name !== 'PrimaryGeneratedColumn' ? typeArg : undefined) ??
          strOf(o.get('type')) ??
          (o.get('type')?.getText(sf) || tsType || colDeco.name),
        nullable: primary
          ? false
          : (boolOf(o.get('nullable')) ?? (fw === 'mikro-orm' ? optional : false)),
        line: ln,
      };
      if (colDeco.name === 'PrimaryGeneratedColumn')
        f.type = typeArg === 'uuid' ? 'uuid' : `${tsType || 'number'} (generated)`;
      if (primary) f.primaryKey = true;
      if (boolOf(o.get('unique'))) f.unique = true;
      const d = o.get('default');
      if (d) f.default = d.getText(sf);
      const len = numOf(o.get('length'));
      if (len !== undefined) f.length = len;
      const p = numOf(o.get('precision'));
      if (p !== undefined) f.precision = p;
      const s = numOf(o.get('scale'));
      if (s !== undefined) f.scale = s;
      fields.push(f);
    }
    const base = c.heritageClauses
      ?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
      ?.types[0]?.expression.getText(sf);
    const model: OrmModel = {
      framework: fw,
      model: name,
      line: lineOf(sf, c),
      endLine: sf.getLineAndCharacterOfPosition(c.end).line + 1,
      table,
      defaultTable: fw === 'typeorm' ? typeormSnake(name) : mikroUnderscore(name),
      rule:
        fw === 'typeorm'
          ? 'TypeORM default: the class name in snake_case'
          : 'MikroORM default (UnderscoreNamingStrategy): the class name in snake_case',
      bases: base ? [base] : [],
      root: true,
      role: embeddable ? 'embeddable' : 'entity',
      inherit: 'single',
      fields,
    };
    out.models.push(model);
  };
  visit(sf);
  // Abstract base classes with column decorators lend their columns to entities.
  const visitBases = (n: ts.Node) => {
    if (ts.isClassDeclaration(n) && n.name && !out.models.some((m) => m.model === n.name!.text)) {
      const has = n.members.some((m) =>
        decorators(m).some((d) => (fw === 'typeorm' ? TYPEORM_COLUMN : MIKRO_COLUMN).has(d.name)),
      );
      if (has) {
        entity(n, n.name.text, undefined, undefined);
        const m = out.models[out.models.length - 1];
        if (m && m.model === n.name.text) {
          m.role = 'abstract';
          m.root = false;
        }
      }
    }
    ts.forEachChild(n, visitBases);
  };
  visitBases(sf);
}

// --------------------------------------------------------------------------- Sequelize

/** One attribute: `DataTypes.STRING` or `{ type: DataTypes.STRING(120), allowNull: false }`. */
function sequelizeAttr(
  name: string,
  e: ts.Expression,
  sf: ts.SourceFile,
  underscored: boolean,
): OrmField {
  const o = ts.isObjectLiteralExpression(e) ? props(e) : new Map([['type', e]]);
  const typeE = o.get('type');
  const type = (typeE?.getText(sf) ?? 'unknown').replace(/^(DataTypes|Sequelize|DataType)\./, '');
  const snakeName = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const f: OrmField = {
    field: name,
    column: strOf(o.get('field')) ?? (underscored ? snakeName : name),
    type,
    nullable: boolOf(o.get('allowNull')) ?? true,
    line: sf.getLineAndCharacterOfPosition(e.getStart(sf)).line + 1,
  };
  if (boolOf(o.get('primaryKey'))) {
    f.primaryKey = true;
    f.nullable = boolOf(o.get('allowNull')) ?? false;
  }
  if (o.get('unique') && boolOf(o.get('unique')) !== false) f.unique = true;
  const d = o.get('defaultValue');
  if (d) f.default = d.getText(sf);
  const len = /\w+\((\d+)\)/.exec(type);
  if (len && /STRING|CHAR/i.test(type)) f.length = Number(len[1]);
  const ref = props(o.get('references'));
  const rm = ref.get('model');
  if (rm) {
    const t = strOf(rm);
    if (t) f.ref = { table: t, column: strOf(ref.get('key')) };
    else if (ts.isIdentifier(rm)) f.ref = { model: rm.text, column: strOf(ref.get('key')) };
  }
  return f;
}

function sequelizeModel(
  name: string,
  attrs: ts.Expression,
  options: ts.Expression | undefined,
  sf: ts.SourceFile,
  node: ts.Node,
  out: OrmFile,
) {
  const o = props(options);
  const underscored = boolOf(o.get('underscored')) === true;
  const fields: OrmField[] = [];
  for (const [k, v] of props(attrs)) fields.push(sequelizeAttr(k, v, sf, underscored));
  const freeze = boolOf(o.get('freezeTableName')) === true;
  const ln = lineOf(sf, node);
  const modelName = strOf(o.get('modelName')) ?? name;
  const dflt = freeze ? modelName : sequelizePlural(modelName);
  const timestamps = boolOf(o.get('timestamps')) !== false;
  const ts_: OrmField[] = [];
  if (timestamps)
    for (const [k, snake] of [
      ['createdAt', 'created_at'],
      ['updatedAt', 'updated_at'],
    ] as const) {
      const custom = o.get(k);
      if (boolOf(custom) === false) continue;
      ts_.push({
        column: strOf(custom) ?? (underscored ? snake : k),
        type: 'DATE',
        nullable: false,
        line: ln,
        implicit: 'Sequelize timestamps',
      });
    }
  if (boolOf(o.get('paranoid')) === true && timestamps)
    ts_.push({
      column: underscored ? 'deleted_at' : 'deletedAt',
      type: 'DATE',
      nullable: true,
      line: ln,
      implicit: 'Sequelize paranoid',
    });
  out.models.push({
    framework: 'sequelize',
    model: name,
    line: ln,
    table: strOf(o.get('tableName')),
    defaultTable: underscored ? dflt.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() : dflt,
    rule: freeze
      ? 'Sequelize: freezeTableName keeps the model name'
      : 'Sequelize default: the model name pluralised (inflection)',
    bases: [],
    root: true,
    role: 'entity',
    fields,
    implicitPk: {
      column: 'id',
      field: 'id',
      type: 'INTEGER',
      primaryKey: true,
      nullable: false,
      line: ln,
      implicit: 'Sequelize adds an id primary key when none is defined',
    },
    implicitColumns: ts_,
  });
}

// --------------------------------------------------------------------------- Mongoose

function mongooseFields(
  o: ts.Expression,
  sf: ts.SourceFile,
  prefix: string,
  out: OrmField[],
): void {
  for (const [k, v] of props(o)) {
    const name = `${prefix}${k}`;
    const ln = sf.getLineAndCharacterOfPosition(v.getStart(sf)).line + 1;
    if (ts.isObjectLiteralExpression(v)) {
      const p = props(v);
      const t = p.get('type');
      if (!t) {
        mongooseFields(v, sf, `${name}.`, out);
        continue;
      }
      const f: OrmField = {
        field: name,
        column: name,
        type: t
          .getText(sf)
          .replace(/^(Schema\.Types|mongoose\.Schema\.Types|mongoose\.Types)\./, ''),
        nullable: !(p.get('required') && boolOf(p.get('required')) !== false),
        line: ln,
      };
      if (p.get('unique') && boolOf(p.get('unique')) !== false) f.unique = true;
      const d = p.get('default');
      if (d) f.default = d.getText(sf);
      const ref =
        strOf(p.get('ref')) ??
        (p.get('ref') && ts.isIdentifier(p.get('ref')!)
          ? (p.get('ref') as ts.Identifier).text
          : undefined);
      if (ref) f.ref = { model: ref, column: '_id' };
      const ml = numOf(p.get('maxlength') ?? p.get('maxLength'));
      if (ml !== undefined) f.length = ml;
      out.push(f);
    } else
      out.push({
        field: name,
        column: name,
        type: v.getText(sf).replace(/^(Schema\.Types|mongoose\.Schema\.Types)\./, ''),
        nullable: true,
        line: ln,
      });
  }
}

// ------------------------------------------------------------------------------- Knex

function knexTable(
  name: string,
  fn: ts.Expression,
  sf: ts.SourceFile,
  alter: boolean,
  ln: number,
  out: OrmFile,
): void {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return;
  const param = fn.parameters[0]?.name.getText(sf) ?? 'table';
  const t: OrmTable = {
    framework: 'knex',
    name,
    line: ln,
    fields: [],
    ...(alter ? { alter: true } : {}),
  };
  const visit = (n: ts.Node) => {
    if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)) {
      // Flatten table.string('x', 40).notNullable().unique()
      const calls: ts.CallExpression[] = [];
      let e: ts.Expression = n.expression;
      while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        calls.unshift(e);
        e = e.expression.expression;
      }
      if (ts.isIdentifier(e) && e.text === param && calls.length) {
        const [base, ...mods] = calls as [ts.CallExpression, ...ts.CallExpression[]];
        const m = calleeName(base);
        const a0 = strOf(base.arguments[0]);
        const sl = lineOf(sf, n);
        const modNames = mods.map(calleeName);
        const mk = (column: string, type: string, extra: Partial<OrmField> = {}): OrmField => ({
          column,
          type,
          nullable: !modNames.includes('notNullable'),
          line: sl,
          ...extra,
        });
        let fs: OrmField[] = [];
        const tableOp = (op: 'drop-column' | 'rename-column', column: string, to?: string) =>
          (out.tableOps ??= []).push({
            framework: 'knex',
            op,
            table: name,
            column,
            ...(to ? { to } : {}),
            line: sl,
          });
        if (m === 'dropColumn' || m === 'dropColumns') {
          for (const a of base.arguments) {
            const c = strOf(a);
            if (c) tableOp('drop-column', c);
          }
          return;
        }
        if (m === 'renameColumn') {
          const to = strOf(base.arguments[1]);
          if (a0 && to) tableOp('rename-column', a0, to);
          return;
        }
        if (m === 'dropTimestamps') {
          const camel = boolOf(base.arguments[0]) === true;
          for (const c of camel ? ['createdAt', 'updatedAt'] : ['created_at', 'updated_at'])
            tableOp('drop-column', c);
          return;
        }
        if (/^(increments|bigIncrements|bigincrements)$/.test(m))
          fs = [mk(a0 ?? 'id', m, { primaryKey: true, nullable: false })];
        else if (m === 'timestamps') {
          const defaultToNow = boolOf(base.arguments[1]) === true;
          const camel = boolOf(base.arguments[2]) === true;
          fs = (camel ? ['createdAt', 'updatedAt'] : ['created_at', 'updated_at']).map((c) =>
            mk(c, boolOf(base.arguments[0]) ? 'timestamp' : 'datetime', {
              nullable: !defaultToNow,
              implicit: 'Knex timestamps()',
            }),
          );
        } else if (m === 'foreign' && a0) {
          const refs = mods.find((x) => calleeName(x) === 'references');
          const inT = mods.find((x) => calleeName(x) === 'inTable');
          const r = strOf(refs?.arguments[0]);
          const rt = strOf(inT?.arguments[0]) ?? (r?.includes('.') ? r.split('.')[0] : undefined);
          if (rt)
            out.foreignKeys.push({
              framework: 'knex',
              table: name,
              column: a0,
              refTable: rt,
              refColumn: r?.includes('.') ? r.split('.')[1] : r,
              line: sl,
            });
        } else if (
          !/^(primary|unique|index|dropColumn|dropColumns|renameColumn|dropForeign|dropPrimary|dropUnique|dropIndex|engine|charset|collate|comment|inherits|check|setNullable|dropNullable|dropTimestamps)$/.test(
            m,
          ) &&
          a0
        ) {
          const f = mk(a0, m);
          const n1 = numOf(base.arguments[1]);
          const n2 = numOf(base.arguments[2]);
          if (/^(string|varchar|char)$/.test(m)) f.length = n1 ?? 255;
          if (/^(decimal|float|double)$/.test(m)) {
            if (n1 !== undefined) f.precision = n1;
            if (n2 !== undefined) f.scale = n2;
          }
          fs = [f];
        } else if ((m === 'primary' || m === 'unique') && base.arguments[0]) {
          const arr = base.arguments[0];
          const cols = ts.isArrayLiteralExpression(arr)
            ? arr.elements.map((x) => strOf(x)).filter((x): x is string => !!x)
            : [strOf(arr)].filter((x): x is string => !!x);
          for (const c of cols) {
            const f = t.fields.find((x) => x.column === c);
            if (!f) continue;
            if (m === 'primary') {
              f.primaryKey = true;
              f.nullable = false;
            } else if (cols.length === 1) f.unique = true;
          }
        }
        for (const f of fs) {
          for (const x of mods) {
            const xn = calleeName(x);
            if (xn === 'unique') f.unique = true;
            else if (xn === 'primary') {
              f.primaryKey = true;
              f.nullable = false;
            } else if (xn === 'defaultTo' && x.arguments[0]) f.default = x.arguments[0].getText(sf);
            else if (xn === 'nullable') f.nullable = true;
            else if (xn === 'references') {
              const r = strOf(x.arguments[0]);
              const inT = mods.find((y) => calleeName(y) === 'inTable');
              const rt =
                strOf(inT?.arguments[0]) ?? (r?.includes('.') ? r.split('.')[0] : undefined);
              if (rt) f.ref = { table: rt, column: r?.includes('.') ? r.split('.')[1] : r };
            }
          }
        }
        t.fields.push(...fs);
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  if (!alter || t.fields.length) out.tables.push(t);
}

/** True inside `exports.down`, `down(...)` or `async down()`. */
function inDown(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if ((ts.isMethodDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name?.getText() === 'down')
      return true;
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'down') return true;
    if (ts.isBinaryExpression(p) && /(^|\.)down$/.test(p.left.getText())) return true;
  }
  return false;
}

export function readTs(path: string, source: string): OrmFile | null {
  const fws = HINTS.filter(([, re]) => re.test(source)).map(([f]) => f);
  if (!fws.length) return null;
  const kind = /\.tsx$/.test(path)
    ? ts.ScriptKind.TSX
    : /\.jsx$/.test(path)
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const out: OrmFile = {
    path,
    frameworks: fws,
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  if (fws.includes('typeorm')) decoratedEntities(sf, 'typeorm', out);
  if (fws.includes('mikro-orm')) decoratedEntities(sf, 'mikro-orm', out);
  const schemas = new Map<
    string,
    { fields: OrmField[]; collection?: string; timestamps: boolean; line: number }
  >();
  const visit = (n: ts.Node) => {
    if (ts.isClassDeclaration(n) && n.name && fws.includes('sequelize')) {
      // sequelize-typescript: @Table({ tableName }) class X extends Model { @Column(DataType.STRING) x }
      const cd = decorators(n);
      const tdec = deco(cd, 'Table');
      if (tdec) {
        const o = props(tdec.args[0]);
        const fields: OrmField[] = [];
        for (const m of n.members) {
          if (!ts.isPropertyDeclaration(m) || !ts.isIdentifier(m.name)) continue;
          const ds = decorators(m);
          const col = deco(ds, 'Column');
          if (!col) continue;
          const arg = col.args[0];
          const f = sequelizeAttr(
            m.name.text,
            arg ?? ts.factory.createIdentifier(m.type?.getText(sf) ?? 'unknown'),
            sf,
            boolOf(o.get('underscored')) === true,
          );
          f.line = lineOf(sf, m);
          if (deco(ds, 'PrimaryKey')) {
            f.primaryKey = true;
            f.nullable = false;
          }
          if (deco(ds, 'AllowNull')) f.nullable = boolOf(deco(ds, 'AllowNull')!.args[0]) ?? true;
          if (deco(ds, 'Unique')) f.unique = true;
          const fk = deco(ds, 'ForeignKey');
          if (fk) f.ref = { model: targetOf(fk.args[0]) };
          fields.push(f);
        }
        const freeze = boolOf(o.get('freezeTableName')) === true;
        out.models.push({
          framework: 'sequelize',
          model: n.name.text,
          line: lineOf(sf, n),
          table: strOf(o.get('tableName')),
          defaultTable: freeze
            ? n.name.text
            : sequelizePlural(strOf(o.get('modelName')) ?? n.name.text),
          rule: 'Sequelize default: the model name pluralised (inflection)',
          bases: [],
          root: true,
          role: 'entity',
          fields,
          implicitPk: {
            column: 'id',
            field: 'id',
            type: 'INTEGER',
            primaryKey: true,
            nullable: false,
            line: lineOf(sf, n),
            implicit: 'Sequelize adds an id primary key when none is defined',
          },
          implicitColumns:
            boolOf(o.get('timestamps')) === false
              ? []
              : ['createdAt', 'updatedAt'].map((c) => ({
                  column: c,
                  type: 'DATE',
                  nullable: false,
                  line: lineOf(sf, n),
                  implicit: 'Sequelize timestamps',
                })),
        });
      }
    }
    if (ts.isClassDeclaration(n) && n.name && fws.includes('objection')) {
      const ext = n.heritageClauses
        ?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression.getText(sf);
      if (ext && /(^|\.)Model$|BaseModel$/.test(ext))
        for (const m of n.members) {
          const isStatic =
            ts.canHaveModifiers(m) &&
            ts.getModifiers(m)?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
          if (!isStatic || !m.name || m.name.getText(sf) !== 'tableName') continue;
          let v: string | undefined;
          if (ts.isPropertyDeclaration(m)) v = strOf(m.initializer);
          else if (ts.isGetAccessorDeclaration(m) && m.body) {
            const r = m.body.statements.find(ts.isReturnStatement);
            v = strOf(r?.expression);
          }
          if (v)
            out.uses.push({
              framework: 'objection',
              owner: n.name.text,
              line: lineOf(sf, n),
              table: v,
              access: 'maps',
              detail: `${n.name.text} maps to table ${v} (static tableName)`,
            });
        }
    }
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      const recv = ts.isPropertyAccessExpression(n.expression)
        ? n.expression.expression.getText(sf)
        : '';
      if (fws.includes('sequelize') && name === 'define' && n.arguments.length >= 2 && !inDown(n)) {
        const mn = strOf(n.arguments[0]);
        const attrs = n.arguments[1];
        if (mn && attrs && ts.isObjectLiteralExpression(attrs))
          sequelizeModel(mn, attrs, n.arguments[2], sf, n, out);
      } else if (
        fws.includes('sequelize') &&
        name === 'init' &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.arguments[0] &&
        ts.isObjectLiteralExpression(n.arguments[0])
      ) {
        sequelizeModel(n.expression.expression.text, n.arguments[0], n.arguments[1], sf, n, out);
      } else if (fws.includes('sequelize') && /queryInterface$/i.test(recv) && !inDown(n)) {
        if (name === 'createTable') {
          const tn = strOf(n.arguments[0]);
          const attrs = n.arguments[1];
          if (tn && attrs && ts.isObjectLiteralExpression(attrs))
            out.tables.push({
              framework: 'sequelize',
              name: tn,
              line: lineOf(sf, n),
              fields: [...props(attrs)].map(([k, v]) => sequelizeAttr(k, v, sf, false)),
            });
        } else if (/^(dropTable|renameTable|removeColumn|renameColumn)$/.test(name)) {
          const [a, b, c] = [0, 1, 2].map((i) => strOf(n.arguments[i]));
          const ln = lineOf(sf, n);
          const ops = (out.tableOps ??= []);
          if (name === 'dropTable' && a)
            ops.push({ framework: 'sequelize', op: 'drop-table', table: a, line: ln });
          else if (name === 'renameTable' && a && b)
            ops.push({ framework: 'sequelize', op: 'rename-table', table: a, to: b, line: ln });
          else if (name === 'removeColumn' && a && b)
            ops.push({ framework: 'sequelize', op: 'drop-column', table: a, column: b, line: ln });
          else if (name === 'renameColumn' && a && b && c)
            ops.push({
              framework: 'sequelize',
              op: 'rename-column',
              table: a,
              column: b,
              to: c,
              line: ln,
            });
        } else if (name === 'addColumn') {
          const tn = strOf(n.arguments[0]);
          const cn = strOf(n.arguments[1]);
          const def = n.arguments[2];
          if (tn && cn && def)
            out.tables.push({
              framework: 'sequelize',
              name: tn,
              line: lineOf(sf, n),
              fields: [sequelizeAttr(cn, def, sf, false)],
              alter: true,
            });
        }
      } else if (
        fws.includes('knex') &&
        /^(createTable|createTableIfNotExists|alterTable|table)$/.test(name) &&
        ts.isPropertyAccessExpression(n.expression) &&
        /\.schema$|^schema$/.test(recv) &&
        !inDown(n)
      ) {
        const tn = strOf(n.arguments[0]);
        const fn = n.arguments[1];
        if (tn && fn)
          knexTable(tn, fn, sf, name === 'alterTable' || name === 'table', lineOf(sf, n), out);
      } else if (
        fws.includes('knex') &&
        /^(dropTable|dropTableIfExists|renameTable)$/.test(name) &&
        ts.isPropertyAccessExpression(n.expression) &&
        /\.schema$|^schema$/.test(recv) &&
        !inDown(n)
      ) {
        const a = strOf(n.arguments[0]);
        const b = strOf(n.arguments[1]);
        const ln = lineOf(sf, n);
        if (a && name !== 'renameTable')
          (out.tableOps ??= []).push({ framework: 'knex', op: 'drop-table', table: a, line: ln });
        else if (a && b)
          (out.tableOps ??= []).push({
            framework: 'knex',
            op: 'rename-table',
            table: a,
            to: b,
            line: ln,
          });
      } else if (fws.includes('mongoose') && name === 'model' && n.arguments.length >= 2) {
        const mn = strOf(n.arguments[0]);
        const sch = n.arguments[1]!;
        let s = ts.isIdentifier(sch) ? schemas.get(sch.text) : undefined;
        if (!s && ts.isNewExpression(sch)) s = mongooseSchema(sch);
        const coll = strOf(n.arguments[2]) ?? s?.collection;
        if (mn && s) {
          const ln = lineOf(sf, n);
          out.models.push({
            framework: 'mongoose',
            model: mn,
            line: ln,
            table: coll,
            defaultTable: mongooseCollection(mn),
            rule: 'Mongoose default: the model name in lower case, pluralised',
            bases: [],
            root: true,
            role: 'entity',
            kind: 'collection',
            fields: s.fields,
            implicitPk: {
              column: '_id',
              field: '_id',
              type: 'ObjectId',
              primaryKey: true,
              nullable: false,
              line: ln,
              implicit: 'MongoDB documents always have an _id',
            },
            implicitColumns: s.timestamps
              ? ['createdAt', 'updatedAt'].map((c) => ({
                  column: c,
                  type: 'Date',
                  nullable: true,
                  line: s!.line,
                  implicit: 'Mongoose timestamps',
                }))
              : [],
          });
        }
      }
    }
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isNewExpression(n.initializer) &&
      fws.includes('mongoose')
    ) {
      const s = mongooseSchema(n.initializer);
      if (s) schemas.set(n.name.text, s);
    }
    ts.forEachChild(n, visit);
  };
  const mongooseSchema = (ne: ts.NewExpression) => {
    if (!/(^|\.)Schema$/.test(ne.expression.getText(sf))) return undefined;
    const def = ne.arguments?.[0];
    if (!def || !ts.isObjectLiteralExpression(def)) return undefined;
    const fields: OrmField[] = [];
    mongooseFields(def, sf, '', fields);
    const o = props(ne.arguments?.[1]);
    return {
      fields,
      collection: strOf(o.get('collection')),
      timestamps: !!o.get('timestamps') && boolOf(o.get('timestamps')) !== false,
      line: lineOf(sf, ne),
    };
  };
  visit(sf);
  return out;
}
