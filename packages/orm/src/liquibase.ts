/**
 * Liquibase changelogs (XML, YAML and JSON): createTable, addColumn, addForeignKeyConstraint,
 * addPrimaryKey, addNotNullConstraint and addUniqueConstraint, outside rollback blocks. SQL in
 * `<sql>` and `sqlFile` changes is not read here.
 *
 * XML is parsed by the caller (CodeAtlas has a bounded, entity-free XML scanner) and passed in as
 * elements; YAML and JSON are parsed here with the `yaml` package.
 */
import { LineCounter, parseDocument, isMap, isSeq, isScalar, type Node as YNode } from 'yaml';
import type { OrmField, OrmFile, OrmTable } from './types';

/** An element: an XML element, or a YAML/JSON mapping key with its scalar fields as attributes. */
export interface LbNode {
  name: string;
  attrs: Record<string, string>;
  children: LbNode[];
  line: number;
  text?: string;
}

const local = (n: string) => n.slice(n.indexOf(':') + 1);
const kids = (n: LbNode | undefined, name: string) =>
  n ? n.children.filter((c) => local(c.name) === name) : [];
const truthy = (v: string | undefined) => v !== undefined && /^true$/i.test(v.trim());
const falsy = (v: string | undefined) => v !== undefined && /^false$/i.test(v.trim());
const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function column(c: LbNode, table: string, out: OrmFile): OrmField | undefined {
  const a = c.attrs;
  if (!a.name) return undefined;
  const f: OrmField = { column: a.name, type: a.type ?? 'unknown', nullable: true, line: c.line };
  const d =
    a.defaultValue ??
    a.defaultValueNumeric ??
    a.defaultValueBoolean ??
    a.defaultValueDate ??
    a.defaultValueComputed;
  if (d !== undefined) f.default = d;
  const len = /\((\d+)\)/.exec(f.type);
  if (len && /char|binary/i.test(f.type)) f.length = Number(len[1]);
  for (const k of kids(c, 'constraints')) {
    const ca = k.attrs;
    if (truthy(ca.primaryKey)) {
      f.primaryKey = true;
      f.nullable = false;
    }
    if (falsy(ca.nullable)) f.nullable = false;
    if (truthy(ca.unique)) f.unique = true;
    const rt =
      ca.referencedTableName ??
      (ca.references ? /^([\w.]+)\s*\(/.exec(ca.references)?.[1] : undefined);
    const rc =
      ca.referencedColumnNames ??
      (ca.references ? /\(([^)]+)\)/.exec(ca.references)?.[1] : undefined);
    if (rt)
      out.foreignKeys.push({
        framework: 'liquibase',
        table,
        column: a.name,
        refTable: rt.split('.').pop()!,
        refColumn: rc?.trim(),
        line: k.line,
      });
  }
  return f;
}

export function readLiquibaseTree(path: string, root: LbNode): OrmFile {
  const out: OrmFile = {
    path,
    frameworks: ['liquibase'],
    models: [],
    tables: [],
    foreignKeys: [],
    uses: [],
    problems: [],
  };
  const sets = kids(root, 'changeSet');
  const changes: LbNode[] = [];
  for (const s of sets)
    for (const c of s.children) {
      const n = local(c.name);
      if (n === 'rollback' || n === 'preConditions' || n === 'comment' || n === 'validCheckSum')
        continue;
      // YAML wraps the changes in a "changes" list.
      if (n === 'changes') changes.push(...c.children);
      else changes.push(c);
    }
  const tables = new Map<string, OrmTable>();
  for (const c of changes) {
    const n = local(c.name);
    const a = c.attrs;
    if ((n === 'createTable' || n === 'addColumn') && a.tableName) {
      const t: OrmTable = {
        framework: 'liquibase',
        name: a.tableName,
        line: c.line,
        fields: [],
        ...(n === 'addColumn' ? { alter: true } : {}),
      };
      const cols = [
        ...kids(c, 'column'),
        ...kids(c, 'columns').flatMap((x) => (local(x.name) === 'columns' ? x.children : [x])),
      ];
      for (const col of cols) {
        const f = column(
          local(col.name) === 'column' ? col : (kids(col, 'column')[0] ?? col),
          a.tableName,
          out,
        );
        if (f) t.fields.push(f);
      }
      out.tables.push(t);
      if (n === 'createTable') tables.set(a.tableName.toLowerCase(), t);
    } else if (n === 'addForeignKeyConstraint' && a.baseTableName && a.referencedTableName) {
      const bc = list(a.baseColumnNames);
      const rc = list(a.referencedColumnNames);
      bc.forEach((col, i) =>
        out.foreignKeys.push({
          framework: 'liquibase',
          table: a.baseTableName!,
          column: col,
          refTable: a.referencedTableName!,
          refColumn: rc[i],
          line: c.line,
        }),
      );
    } else if (
      (n === 'addPrimaryKey' || n === 'addNotNullConstraint' || n === 'addUniqueConstraint') &&
      a.tableName
    ) {
      const cols = list(a.columnNames ?? a.columnName);
      const t = tables.get(a.tableName.toLowerCase());
      for (const col of cols) {
        const f = t?.fields.find((x) => x.column === col);
        const target = f ?? {
          column: col,
          type: a.columnDataType ?? 'unknown',
          nullable: true,
          line: c.line,
        };
        if (n === 'addPrimaryKey') {
          target.primaryKey = true;
          target.nullable = false;
        } else if (n === 'addNotNullConstraint') target.nullable = false;
        else if (cols.length === 1) target.unique = true;
        if (!f)
          out.tables.push({
            framework: 'liquibase',
            name: a.tableName,
            line: c.line,
            fields: [target],
            alter: true,
          });
      }
    }
  }
  return out;
}

/** YAML or JSON changelog text → elements with line numbers. */
export function liquibaseFromYaml(text: string): LbNode | Error {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, uniqueKeys: false });
  if (doc.errors.length) return new Error(doc.errors[0]!.message);
  const lineOf = (n: YNode | null | undefined) => (n?.range ? lc.linePos(n.range[0]).line : 1);
  const toNode = (name: string, v: unknown, ln: number): LbNode => {
    const node: LbNode = { name, attrs: {}, children: [], line: ln };
    if (isMap(v))
      for (const p of v.items) {
        const k = isScalar(p.key) ? String(p.key.value) : String(p.key);
        const val = p.value as YNode | null;
        if (isScalar(val)) node.attrs[k] = String(val.value);
        else if (isSeq(val)) {
          const wrapper: LbNode = { name: k, attrs: {}, children: [], line: lineOf(val) };
          for (const it of val.items) {
            // A list item is a one-key mapping: { column: {...} }.
            if (isMap(it) && it.items.length === 1 && isScalar(it.items[0]!.key))
              wrapper.children.push(
                toNode(
                  String((it.items[0]!.key as { value: unknown }).value),
                  it.items[0]!.value,
                  lineOf(it as YNode),
                ),
              );
          }
          // Lists of changes and columns become children directly under their key.
          if (k === 'columns' || k === 'changes') node.children.push(...wrapper.children);
          else node.children.push(wrapper);
        } else if (isMap(val)) node.children.push(toNode(k, val, lineOf(val)));
      }
    return node;
  };
  const root = doc.contents;
  if (isMap(root)) {
    const top = root.items.find((p) => isScalar(p.key) && p.key.value === 'databaseChangeLog');
    const v = top?.value;
    const rootNode: LbNode = { name: 'databaseChangeLog', attrs: {}, children: [], line: 1 };
    if (isSeq(v))
      for (const it of v.items)
        if (isMap(it) && it.items.length === 1 && isScalar(it.items[0]!.key))
          rootNode.children.push(
            toNode(
              String((it.items[0]!.key as { value: unknown }).value),
              it.items[0]!.value,
              lineOf(it as YNode),
            ),
          );
    return rootNode;
  }
  return new Error('not a Liquibase changelog (no databaseChangeLog key)');
}
