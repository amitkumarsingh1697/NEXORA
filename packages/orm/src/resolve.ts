/**
 * Turns every file's models, tables and uses into tables with columns, foreign keys and
 * model-to-table mappings. Runs once per repository, because a model's table can depend on a
 * base class, a relation target or a table defined in another file.
 */
import { snake } from './naming';
import type {
  OrmField,
  OrmFile,
  OrmForeignKey,
  OrmFramework,
  OrmModel,
  OrmTable,
  OrmSchema,
  ResolvedColumn,
  ResolvedTable,
} from './types';

interface Entry {
  m: OrmModel;
  path: string;
}

/** Lower-case bare name, the key CodeAtlas uses for tables. */
export const tableKey = (name: string) =>
  (name.split('.').pop() ?? name).replace(/^["'`[]|["'`\]]$/g, '').toLowerCase();

const bare = (s: string) =>
  s
    .replace(/::class$/, '')
    .split(/[.:\\/]/)
    .pop() ?? s;

/**
 * `known` holds the tables already found in the repository (SQL, Prisma, Drizzle), by key, so
 * that a model whose physical name depends on configuration can be matched to its table.
 */
export function resolveOrm(
  files: OrmFile[],
  known: ReadonlySet<string> = new Set(),
  /** Columns of the tables in `known`, by table key, to match default column names the same way. */
  knownColumns: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): OrmSchema {
  const out: OrmSchema = { tables: [], foreignKeys: [], mappings: [], unresolved: [] };
  // Migrations that drop or rename tables and columns earlier migrations created, in migration
  // order: file paths (timestamped names), or Alembic's revision chain.
  const seq = migrationOrder(files);
  const key = (path: string) => seq.get(path) ?? path;
  const earlier = (a: { path: string; line: number }, b: { path: string; line: number }) => {
    const ka = key(a.path);
    const kb = key(b.path);
    return ka < kb || (ka === kb && a.line < b.line);
  };
  const direct = files.flatMap((f) => f.tables.map((t) => ({ t, path: f.path, line: t.line })));
  const fileFks = files.flatMap((f) =>
    f.foreignKeys.map((k) => ({ k, path: f.path, line: k.line })),
  );
  const droppedTables = new Set<OrmTable>();
  const droppedFks = new Set<OrmForeignKey>();
  const tops = files
    .flatMap((f) => (f.tableOps ?? []).map((o) => ({ o, path: f.path, line: o.line })))
    .sort((a, b) => (earlier(a, b) ? -1 : earlier(b, a) ? 1 : 0));
  for (const op of tops) {
    const { o } = op;
    const same = (n: string) => tableKey(n) === tableKey(o.table);
    for (const d of direct) {
      if (droppedTables.has(d.t) || d.t.framework !== o.framework || !same(d.t.name)) continue;
      if (!earlier(d, op)) continue;
      if (o.op === 'drop-table') droppedTables.add(d.t);
      else if (o.op === 'rename-table' && o.to) d.t.name = o.to;
      else if (o.op === 'drop-column' && o.column) {
        d.t.fields = d.t.fields.filter((fd) => fd.column !== o.column);
        if (d.t.alter && !d.t.fields.length) droppedTables.add(d.t);
      } else if (o.op === 'rename-column' && o.column && o.to)
        for (const fd of d.t.fields) if (fd.column === o.column) fd.column = o.to;
    }
    for (const x of fileFks) {
      if (droppedFks.has(x.k) || x.k.framework !== o.framework || !earlier(x, op)) continue;
      const own = same(x.k.table);
      const ref = same(x.k.refTable);
      if (!own && !ref) continue;
      if (o.op === 'drop-table') droppedFks.add(x.k);
      else if (o.op === 'rename-table' && o.to) {
        if (own) x.k.table = o.to;
        if (ref) x.k.refTable = o.to;
      } else if (o.op === 'drop-column' && own && x.k.column === o.column) droppedFks.add(x.k);
      else if (o.op === 'rename-column' && o.to) {
        if (own && x.k.column === o.column) x.k.column = o.to;
        if (ref && x.k.refColumn === o.column) x.k.refColumn = o.to;
      }
    }
  }

  // A schema dump replaces the migrations of its framework in its directory and below.
  const dumps = files.filter((f) => f.snapshot);
  for (const f of files) {
    if (f.snapshot) continue;
    const stamp = /(?:^|\/)(\d{14})_[^/]*$/.exec(f.path)?.[1];
    const covered = dumps.some(
      (d) =>
        d.frameworks.some((fw) => f.frameworks.includes(fw)) &&
        f.path.startsWith(d.path.slice(0, d.path.lastIndexOf('/') + 1)) &&
        (!d.snapshot!.version || (stamp !== undefined && stamp <= d.snapshot!.version)),
    );
    if (!covered) continue;
    for (const t of f.tables) droppedTables.add(t);
    for (const k of f.foreignKeys) droppedFks.add(k);
  }

  // Tables written in migrations and changelogs count as known too (a JPA entity and the
  // Liquibase changelog that creates its table).
  known = new Set([
    ...known,
    ...files.flatMap((f) =>
      f.tables.filter((t) => !droppedTables.has(t)).map((t) => tableKey(t.name)),
    ),
  ]);
  // Migration steps that change earlier migrations' models, in file order within each app:
  // RenameModel, DeleteModel, AlterModelTable, RemoveField. A model class in the source still
  // wins over what migrations say; these only correct the migration-made models and patches.
  const before = (a: { path: string; line: number }, b: { path: string; line: number }) =>
    a.path < b.path || (a.path === b.path && a.line < b.line);
  const migrated = files.flatMap((f) =>
    f.models.filter((m) => m.virtual).map((m) => ({ m, path: f.path, line: m.line })),
  );
  const dropped = new Set<OrmModel>();
  /** `<app>.<old name>` → new name, so a reference written before a RenameModel still finds it. */
  const renamed = new Map<string, string>();
  const ops = files
    .flatMap((f) => (f.migrationOps ?? []).map((o) => ({ o, path: f.path, line: o.line })))
    .sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
  for (const op of ops) {
    const { o } = op;
    for (const x of migrated) {
      if (
        dropped.has(x.m) ||
        x.m.framework !== o.framework ||
        x.m.scope !== o.scope ||
        x.m.model.toLowerCase() !== o.model.toLowerCase() ||
        !before(x, op)
      )
        continue;
      if (o.op === 'rename' && o.value) {
        if (o.scope !== undefined) renamed.set(`${o.scope}.${o.model}`.toLowerCase(), o.value);
        x.m.model = o.value;
        if (x.m.role !== 'patch' && x.m.defaultTable && o.scope !== undefined)
          x.m.defaultTable = `${o.scope}_${o.value.toLowerCase()}`;
      } else if (o.op === 'delete') dropped.add(x.m);
      else if (o.op === 'table' && x.m.role !== 'patch') {
        if (o.value) x.m.table = o.value;
        else delete x.m.table;
      } else if (o.op === 'rename-field' && o.value && o.to) {
        // Django names the column after the field: rename both (a written db_column stays).
        x.m.fields = x.m.fields.map((fd) => {
          if (fd.field !== o.value) return fd;
          const col =
            fd.column === o.value ? o.to : fd.column === `${o.value}_id` ? `${o.to}_id` : fd.column;
          return { ...fd, field: o.to, column: col };
        });
      } else if (o.op === 'remove-field' && o.value) {
        x.m.fields = x.m.fields.filter((fd) => fd.field !== o.value);
        if (x.m.role === 'patch' && !x.m.fields.length) dropped.add(x.m);
      }
    }
  }

  const byFw = new Map<OrmFramework, Map<string, Entry[]>>();
  const patches: Entry[] = [];
  for (const f of files)
    for (const m of f.models) {
      if (dropped.has(m)) continue;
      if (m.role === 'patch') {
        patches.push({ m, path: f.path });
        continue;
      }
      let idx = byFw.get(m.framework);
      if (!idx) byFw.set(m.framework, (idx = new Map()));
      const k = m.model.toLowerCase();
      idx.set(k, [...(idx.get(k) ?? []), { m, path: f.path }]);
    }

  // C# namespaces each file can see: its own and its parents, its usings, and the global usings
  // of files in its directory or above (a project's GlobalUsings.cs).
  const imports = new Map<string, NonNullable<OrmFile['imports']>>();
  const globals: { dir: string; ns: string }[] = [];
  for (const f of files)
    if (f.imports) {
      imports.set(f.path, f.imports);
      const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '';
      for (const ns of f.imports.global) globals.push({ dir, ns });
    }
  const visible = new Map<string, Set<string>>();
  const visibleFrom = (path: string): Set<string> | undefined => {
    const imp = imports.get(path);
    if (!imp) return undefined;
    let v = visible.get(path);
    if (v) return v;
    v = new Set(imp.usings);
    const parts = (imp.namespace ?? '').split('.').filter(Boolean);
    for (let i = parts.length; i > 0; i--) v.add(parts.slice(0, i).join('.'));
    for (const g of globals) if (path.startsWith(g.dir)) v.add(g.ns);
    visible.set(path, v);
    return v;
  };

  /** A model by the name a base list or relation writes ('Customer', 'shop.Customer', 'self'). */
  const find = (fw: OrmFramework, name: string, from?: Entry, hops = 0): Entry | undefined => {
    if (name === 'self' || name === "'self'") return from;
    const idx = byFw.get(fw);
    if (!idx) return undefined;
    const parts = name.replace(/::class$/, '').split(/[.:\\/]/);
    const n = (parts.pop() ?? name).toLowerCase();
    const scope = parts.length ? parts[parts.length - 1]!.toLowerCase() : undefined;
    const all = (idx.get(n) ?? []).filter((e) => e.m.role !== 'patch');
    if (!all.length) {
      const to = renamed.get(`${scope ?? from?.m.scope ?? ''}.${n}`);
      // Follow renames (a chain, never a cycle: at most 20 steps).
      return to && to.toLowerCase() !== n && hops < 20
        ? find(fw, `${scope ?? from?.m.scope}.${to}`, from, hops + 1)
        : undefined;
    }
    const pick = (es: Entry[]) => es.find((e) => !e.m.virtual) ?? es[0];
    if (scope) {
      const s = all.filter((e) => e.m.scope?.toLowerCase() === scope);
      if (s.length) return pick(s);
    }
    if (from?.m.scope) {
      const s = all.filter((e) => e.m.scope === from.m.scope);
      if (s.length) return pick(s);
    }
    // Several models of this name in different places: the one nearest the reference (the
    // longest shared directory), when exactly one is nearest; otherwise none is taken.
    let real = all.filter((e) => !e.m.virtual);
    if (real.length > 1 && new Set(real.map((e) => e.path)).size > 1) {
      if (!from) return undefined;
      // C#: only the classes whose namespace the referring file can see.
      const v = visibleFrom(from.path);
      if (v) {
        const seen = real.filter((e) => e.m.namespace !== undefined && v.has(e.m.namespace));
        if (seen.length === 1) return seen[0];
        if (seen.length > 1) real = seen;
      }
      const shared = (a: string) => {
        const x = a.split('/');
        const y = from.path.split('/');
        let i = 0;
        while (i < x.length - 1 && i < y.length - 1 && x[i] === y[i]) i++;
        return i;
      };
      const best = Math.max(...real.map((e) => shared(e.path)));
      let near = real.filter((e) => shared(e.path) === best);
      if (best > 0 && near.length > 1) {
        // Still tied: the longest shared prefix of the path text, so that a context in
        // Ordering.Infrastructure takes the class in Ordering.Domain over one in ClientApp.
        const chars = (a: string) => {
          let i = 0;
          while (i < a.length && i < from.path.length && a[i] === from.path[i]) i++;
          return i;
        };
        const top = Math.max(...near.map((e) => chars(e.path)));
        near = near.filter((e) => chars(e.path) === top);
      }
      return best > 0 && near.length === 1 ? near[0] : undefined;
    }
    return pick(all);
  };
  /** A pseudo entry for references made outside a model (registrations, repositories). */
  const at = (path: string, scope?: string): Entry => ({
    path,
    m: {
      framework: 'django',
      model: '',
      line: 0,
      bases: [],
      root: false,
      role: 'patch',
      fields: [],
      scope,
    },
  });

  // Models made entities elsewhere (DbSet<T>, AutoMigrate(&T{})). A written table name wins
  // over a conventional one; the class's own attribute ([Table]) wins over both.
  for (const f of files)
    for (const r of f.registrations ?? []) {
      const e = find(r.framework, r.model, at(f.path));
      if (!e) {
        out.unresolved.push({
          path: f.path,
          line: r.line,
          text: `${r.model} is registered as an entity, but no class of this name was found`,
        });
        continue;
      }
      e.m.root = true;
      if (e.m.role === 'abstract') e.m.role = 'entity';
      // Fluent configuration (ToTable) overrides an attribute ([Table]) in Entity Framework Core.
      if (r.table) e.m.table = r.table;
      if (
        !e.m.table &&
        r.defaultTable &&
        (!e.m.defaultTable || e.m.rule?.startsWith('Entity Framework Core default: the class name'))
      ) {
        e.m.defaultTable = r.defaultTable;
        e.m.rule = r.rule;
      }
      for (const c of r.columns ?? []) {
        const fd = e.m.fields.find((x) => x.field === c.member);
        if (fd) {
          fd.column = c.column;
          delete fd.defaultName;
        }
      }
      for (const k of r.keys ?? []) {
        const fd = e.m.fields.find((x) => x.field === k || x.column === k);
        if (fd) {
          fd.primaryKey = true;
          fd.nullable = false;
        }
      }
    }

  // Which classes are models: those that extend the framework base, or extend such a class.
  const isModel = new Map<OrmModel, boolean>();
  const modelOk = (e: Entry, seen = new Set<OrmModel>()): boolean => {
    const hit = isModel.get(e.m);
    if (hit !== undefined) return hit;
    if (seen.has(e.m)) return false;
    seen.add(e.m);
    // A migration that creates a model of this name in the same app proves the class is one,
    // even when its base class comes from another package (Wagtail's Page, AbstractUser).
    const twin =
      !e.m.virtual &&
      (byFw.get(e.m.framework)?.get(e.m.model.toLowerCase()) ?? []).some(
        (x) => x.m.virtual && x.m.role === 'entity' && x.m.scope === e.m.scope,
      );
    const ok =
      e.m.root ||
      twin ||
      e.m.bases.some((b) => {
        const p = find(e.m.framework, b, e);
        return p !== undefined && p.m !== e.m && modelOk(p, seen);
      });
    isModel.set(e.m, ok);
    return ok;
  };
  const parents = (e: Entry): Entry[] =>
    e.m.bases
      .map((b) => find(e.m.framework, b, e))
      // Abstract bases lend their fields even when nothing else marks them (mixins, EF base classes).
      .filter((p): p is Entry => !!p && p.m !== e.m && (p.m.role === 'abstract' || modelOk(p)));

  /** The nearest concrete (entity) ancestor, through abstract ones. */
  const concreteParent = (e: Entry, depth = 0): Entry | undefined => {
    if (depth > 20) return undefined;
    for (const p of parents(e)) {
      if (p.m.role === 'entity' || p.m.role === 'proxy') return p;
      const up = concreteParent(p, depth + 1);
      if (up) return up;
    }
    return undefined;
  };
  const rootEntity = (e: Entry): Entry => {
    let cur = e;
    for (let i = 0; i < 20; i++) {
      const p = concreteParent(cur);
      if (!p) break;
      cur = p;
    }
    return cur;
  };

  // Table names.
  const tableOf = new Map<
    OrmModel,
    { name: string; naming: ResolvedTable['naming']; rule?: string }
  >();
  const nameOf = (
    e: Entry,
    depth = 0,
  ): { name: string; naming: ResolvedTable['naming']; rule?: string } | undefined => {
    const hit = tableOf.get(e.m);
    if (hit) return hit;
    if (depth > 20 || (e.m.role !== 'entity' && e.m.role !== 'proxy')) return undefined;
    let r: { name: string; naming: ResolvedTable['naming']; rule?: string } | undefined;
    const parent = concreteParent(e);
    const inherit = parent ? (rootEntity(e).m.inherit ?? 'single') : undefined;
    if (e.m.role === 'proxy' && parent) r = nameOf(parent, depth + 1);
    else if (e.m.table) r = { name: e.m.table, naming: 'explicit' };
    else if (parent && inherit === 'single') {
      const p = nameOf(parent, depth + 1);
      if (p)
        r = { ...p, rule: `stored in the table of ${parent.m.model} (single-table inheritance)` };
    }
    if (!r) {
      const s = snake(e.m.model);
      if (e.m.trySnake && known.has(s))
        r = {
          name: s,
          naming: 'matched',
          rule: `${e.m.rule ?? 'default name'}; matched to the table ${s} found in this repository`,
        };
      else if (e.m.defaultTable) r = { name: e.m.defaultTable, naming: 'default', rule: e.m.rule };
      else r = { name: e.m.model, naming: 'default', rule: e.m.rule ?? 'the class name' };
    }
    tableOf.set(e.m, r);
    return r;
  };

  // Columns of a model: its own, plus those of abstract ancestors and embedded objects.
  const fieldsOf = (e: Entry, depth = 0): OrmField[] => {
    if (depth > 20) return [];
    const inherited: OrmField[] = [];
    for (const p of parents(e))
      if (p.m.role === 'abstract') inherited.push(...fieldsOf(p, depth + 1));
    const own: OrmField[] = [];
    for (const f of e.m.fields) {
      if (f.embed) {
        const em = find(e.m.framework, f.embed.model, e);
        if (em)
          for (const x of fieldsOf(em, depth + 1))
            own.push({
              ...x,
              column: x.column && f.embed.prefix ? `${f.embed.prefix}${x.column}` : x.column,
              line: f.line,
            });
        else
          out.unresolved.push({
            path: e.path,
            line: f.line,
            text: `embedded ${f.embed.model}: no class of this name was found`,
          });
        continue;
      }
      own.push(f);
    }
    // A subclass field replaces the inherited field of the same name.
    const names = new Set(own.map((f) => f.column ?? f.field));
    return [...inherited.filter((f) => !names.has(f.column ?? f.field)), ...own];
  };

  const pkMemo = new Map<OrmModel, string>();
  const pkOf = (e: Entry, depth = 0): string => {
    const hit = pkMemo.get(e.m);
    if (hit) return hit;
    let pk: string | undefined;
    const parent = concreteParent(e);
    const joined = parent ? (rootEntity(e).m.inherit ?? 'single') === 'joined' : false;
    if (parent && depth < 20 && !(joined && e.m.parentLink)) pk = pkOf(parent, depth + 1);
    pk ??= fieldsOf(e).find((f) => f.primaryKey)?.column;
    pk ??= e.m.implicitPk?.column;
    if (!pk && parent && joined && e.m.parentLink)
      pk = e.m.parentLink({
        table: nameOf(parent)?.name ?? parent.m.model,
        model: parent.m.model,
        pk: pkOf(parent, depth + 1),
      }).column;
    // Entity Framework Core's key convention is a property named Id; the others use id.
    pk ??= e.m.framework === 'ef-core' ? 'Id' : 'id';
    pkMemo.set(e.m, pk);
    return pk;
  };

  const tables = new Map<string, ResolvedTable>();
  const addTable = (t: ResolvedTable) => {
    const k = `${t.framework}:${tableKey(t.name)}:${t.kind}`;
    const prev = tables.get(k);
    if (!prev) {
      tables.set(k, t);
      return t;
    }
    for (const c of t.columns)
      if (!prev.columns.some((x) => x.name === c.name)) prev.columns.push(c);
    return prev;
  };

  const toColumn = (
    f: OrmField,
    e: Entry | undefined,
    fw: OrmFramework,
    path: string,
    owner: string,
  ): (ResolvedColumn & { explicitTarget?: boolean }) | undefined => {
    let refTable: string | undefined;
    let refColumn: string | undefined;
    let derived = false;
    let column = f.column;
    if (f.ref) {
      if (f.ref.table) {
        refTable = f.ref.table;
        refColumn = f.ref.column;
        derived = false;
      } else if (f.ref.model) {
        const t = find(fw, f.ref.model, e);
        const tn = t && modelOk(t) ? nameOf(t) : undefined;
        if (t && tn) {
          refTable = tn.name;
          refColumn = f.ref.column ?? pkOf(t);
          derived = tn.naming !== 'explicit';
          if (!column && f.fkColumn)
            column = f.fkColumn({ table: tn.name, model: t.m.model, pk: refColumn });
        } else if (f.navigation) {
          // Not a model: an owned type, an enum or another value stored in a column.
          column ??= f.field;
        } else
          out.unresolved.push({
            path,
            line: f.line,
            text: `${owner}.${f.field ?? f.column ?? '?'} → ${f.ref.model}: no model of this name was found`,
          });
      }
    }
    if (!column) return undefined;
    const c: ResolvedColumn & { explicitTarget?: boolean } = {
      name: column,
      type: f.type,
      nullable: f.nullable ?? !f.primaryKey,
      line: f.line,
    };
    if (f.primaryKey) c.primaryKey = true;
    if (f.unique) c.unique = true;
    if (f.default !== undefined) c.default = f.default;
    if (f.length !== undefined) c.length = f.length;
    if (f.precision !== undefined) c.precision = f.precision;
    if (f.scale !== undefined) c.scale = f.scale;
    if (f.field && f.field !== column) c.field = f.field;
    if (f.implicit) c.implicit = f.implicit;
    if (refTable) {
      c.references = { table: refTable, ...(refColumn ? { column: refColumn } : {}) };
      c.explicitTarget = !derived;
    }
    return c;
  };

  const fkFrom = (
    t: ResolvedTable,
    c: ResolvedColumn & { explicitTarget?: boolean },
    path: string,
  ) => {
    const written = c.explicitTarget === true;
    delete c.explicitTarget;
    if (!c.references) return;
    out.foreignKeys.push({
      path,
      line: c.line,
      table: t.name,
      column: c.name,
      refTable: c.references.table,
      refColumn: c.references.column,
      framework: t.framework,
      confidence: written ? 'observed' : 'inferred',
    });
  };

  for (const [, idx] of byFw)
    for (const [, entries] of idx)
      for (const e of entries) {
        if (!modelOk(e) || (e.m.role !== 'entity' && e.m.role !== 'proxy')) continue;
        const tn = nameOf(e);
        if (!tn) continue;
        if (e.m.role !== 'proxy') {
          const parent = concreteParent(e);
          const inherit = parent ? (rootEntity(e).m.inherit ?? 'single') : undefined;
          const fields = [...fieldsOf(e)];
          if (
            parent &&
            inherit === 'joined' &&
            e.m.parentLink &&
            !fields.some((f) => f.primaryKey)
          ) {
            const pt = nameOf(parent);
            if (pt)
              fields.unshift(
                e.m.parentLink({ table: pt.name, model: parent.m.model, pk: pkOf(parent) }),
              );
          } else if (!parent && !fields.some((f) => f.primaryKey) && e.m.implicitPk)
            fields.unshift(e.m.implicitPk);
          for (const ic of e.m.implicitColumns ?? [])
            if (!fields.some((f) => f.column === ic.column)) fields.push(ic);
          const cols: ResolvedColumn[] = [];
          const t: ResolvedTable = {
            name: tn.name,
            framework: e.m.framework,
            path: e.path,
            line: e.m.line,
            model: e.m.model,
            naming: tn.naming,
            ...(tn.rule ? { rule: tn.rule } : {}),
            kind: e.m.kind ?? 'table',
            columns: cols,
          };
          for (const f0 of fields) {
            if (f0.joinTable) continue;
            const cols0 = knownColumns.get(tableKey(tn.name));
            const snaked =
              f0.defaultName && f0.column
                ? tn.naming === 'matched' ||
                  (cols0 !== undefined &&
                    !cols0.has(f0.column.toLowerCase()) &&
                    cols0.has(snake(f0.column)))
                : false;
            const f = snaked ? { ...f0, column: snake(f0.column!) } : f0;
            const c = toColumn(f, e, e.m.framework, e.path, e.m.model);
            if (c && !cols.some((x) => x.name === c.name)) cols.push(c);
          }
          const added = addTable(t);
          if (parent && inherit === 'single') {
            const disc = rootEntity(e).m.discriminator;
            if (disc?.column && !added.columns.some((c) => c.name === disc.column))
              added.columns.push({
                name: disc.column,
                type: disc.type,
                nullable: false,
                line: disc.line,
                implicit: disc.implicit,
              });
          }
          for (const c of cols) fkFrom(added, c, e.path);
          // Many-to-many join tables the framework creates.
          for (const f of fields) {
            const j = f.joinTable;
            if (!j) continue;
            const other = j.target.model ? find(e.m.framework, j.target.model, e) : undefined;
            const ot = other
              ? nameOf(other)
              : j.target.table
                ? { name: j.target.table, naming: 'explicit' as const }
                : undefined;
            if (!ot) {
              out.unresolved.push({
                path: e.path,
                line: f.line,
                text: `${e.m.model}.${f.field ?? '?'} → ${j.target.model ?? j.target.table}: no model of this name was found`,
              });
              continue;
            }
            const own = { table: tn.name, model: e.m.model, pk: pkOf(e) };
            const oth = {
              table: ot.name,
              model: other?.m.model ?? ot.name,
              pk: other ? pkOf(other) : 'id',
            };
            const name = j.name ?? j.derive?.(own, oth);
            if (!name) continue;
            const oc = typeof j.ownColumn === 'function' ? j.ownColumn(own) : j.ownColumn;
            const xc = typeof j.otherColumn === 'function' ? j.otherColumn(oth) : j.otherColumn;
            const jt: ResolvedTable = {
              name,
              framework: e.m.framework,
              path: e.path,
              line: f.line,
              naming: j.name ? 'explicit' : 'default',
              rule: j.name
                ? undefined
                : `join table of ${e.m.model}.${f.field ?? ''}, named by the ${e.m.framework} default`,
              kind: 'join-table',
              columns: [],
            };
            // A key is observed when the source writes the join table, the column and the
            // referenced table's name; otherwise a framework default named some of it.
            const joinCol = (
              col: string,
              written: boolean,
              ref: { table: string; column: string },
              refNaming: string,
            ): ResolvedColumn & { explicitTarget?: boolean } => ({
              name: col,
              type: 'foreign key',
              nullable: false,
              line: f.line,
              references: ref,
              ...(written ? {} : { implicit: 'join table column' }),
              explicitTarget: !!j.name && written && refNaming === 'explicit',
            });
            if (oc)
              jt.columns.push(
                joinCol(
                  oc,
                  typeof j.ownColumn === 'string',
                  { table: own.table, column: own.pk },
                  tn.naming,
                ),
              );
            if (xc)
              jt.columns.push(
                joinCol(
                  xc,
                  typeof j.otherColumn === 'string',
                  { table: oth.table, column: oth.pk },
                  ot.naming,
                ),
              );
            const ja = addTable(jt);
            for (const c of jt.columns) fkFrom(ja, c, e.path);
          }
        }
        if (!e.m.virtual)
          out.mappings.push({
            path: e.path,
            line: e.m.line,
            owner: e.m.model,
            table: tn.name,
            framework: e.m.framework,
            access: 'maps',
            confidence: tn.naming === 'explicit' ? 'observed' : 'inferred',
            detail:
              tn.naming === 'explicit'
                ? `${e.m.model} maps to table ${tn.name} (written in the source)`
                : `${e.m.model} maps to table ${tn.name} (${tn.rule ?? 'framework default'})`,
          });
      }

  // Fields a migration adds to a model defined elsewhere.
  for (const p of patches) {
    let target = find(p.m.framework, p.m.model, p);
    if (target && !modelOk(target))
      target = (byFw.get(p.m.framework)?.get(p.m.model.toLowerCase()) ?? []).find(
        (x) => x.m.role !== 'patch' && x.m.scope === p.m.scope && modelOk(x),
      );
    const ptn = target && modelOk(target) ? nameOf(target) : undefined;
    if (!target || !ptn) {
      out.unresolved.push({
        path: p.path,
        line: p.m.line,
        text: `fields added to ${p.m.model}: no model of this name was found`,
      });
      continue;
    }
    const t: ResolvedTable = {
      name: ptn.name,
      framework: p.m.framework,
      path: p.path,
      line: p.m.line,
      naming: ptn.naming,
      kind: 'table',
      columns: [],
      alter: true,
    };
    for (const f of p.m.fields) {
      const c = toColumn(f, target, p.m.framework, p.path, p.m.model);
      if (c) t.columns.push(c);
    }
    out.tables.push(t);
    for (const c of t.columns) fkFrom(t, c, p.path);
  }

  // Tables written directly (migrations, changelogs, Table(...)).
  for (const f of files)
    for (const t of f.tables) {
      if (droppedTables.has(t)) continue;
      const rt: ResolvedTable = {
        name: t.name,
        framework: t.framework,
        path: f.path,
        line: t.line,
        naming: 'explicit',
        kind: t.kind ?? 'table',
        columns: [],
        ...(t.alter ? { alter: true } : {}),
      };
      for (const fd of t.fields) {
        const c = toColumn(fd, undefined, t.framework, f.path, t.name);
        if (c && !rt.columns.some((x) => x.name === c.name)) rt.columns.push(c);
      }
      out.tables.push(rt);
      for (const c of rt.columns) fkFrom(rt, c, f.path);
    }
  out.tables.unshift(...tables.values());
  for (const f of files)
    for (const k of f.foreignKeys) {
      if (droppedFks.has(k)) continue;
      out.foreignKeys.push({
        path: f.path,
        line: k.line,
        table: k.table,
        column: k.column,
        refTable: k.refTable,
        refColumn: k.refColumn,
        framework: k.framework,
        confidence: 'observed',
      });
    }

  // Code that uses a model's table: repositories, Active Record and Eloquent models.
  const allTables = new Set([...known, ...out.tables.map((t) => tableKey(t.name))]);
  for (const f of files)
    for (const u of f.uses) {
      let table: string | undefined;
      let confidence: 'observed' | 'inferred' = 'inferred';
      if (u.table) {
        table = u.table;
        confidence = 'observed';
      } else if (u.model) {
        const fw = u.framework === 'spring-data' ? 'jpa' : u.framework;
        const t = find(fw, bare(u.model), at(f.path));
        const tn = t && modelOk(t) ? nameOf(t) : undefined;
        if (tn) table = tn.name;
      } else if (u.candidates)
        table = u.candidates.find((c) => allTables.has(tableKey(c))) ?? undefined;
      if (!table) {
        if (u.candidates && !u.model && u.access === 'maps' && u.candidates[0]) {
          // Active Record and Eloquent models name a table by convention even when no schema
          // in the repository creates it.
          table = u.candidates[0];
        } else {
          out.unresolved.push({
            path: f.path,
            line: u.line,
            text: `${u.owner}: ${u.detail}; no table was found`,
          });
          continue;
        }
      }
      out.mappings.push({
        path: f.path,
        line: u.line,
        owner: u.owner,
        table,
        framework: u.framework,
        access: u.access,
        confidence,
        detail: u.detail,
      });
    }
  return out;
}

/**
 * Sort keys for Alembic revisions: a revision sorts after the ones it follows (`down_revision`),
 * so migrations named by ids replay in their real order. Other files keep their path order.
 */
function migrationOrder(files: OrmFile[]): Map<string, string> {
  const out = new Map<string, string>();
  const byId = new Map<string, OrmFile>();
  for (const f of files) if (f.revision) byId.set(f.revision.id, f);
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const hit = depth.get(id);
    if (hit !== undefined) return hit;
    const f = byId.get(id);
    if (!f || seen.has(id)) return 0;
    seen.add(id);
    const d = 1 + Math.max(0, ...f.revision!.follows.map((x) => depthOf(x, seen)));
    seen.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const [id, f] of byId) {
    const dir = f.path.slice(0, f.path.lastIndexOf('/') + 1);
    out.set(
      f.path,
      `${dir}\u0000${String(depthOf(id, new Set())).padStart(6, '0')}\u0000${f.path}`,
    );
  }
  return out;
}
