import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildBrain,
  edgesTo,
  indexRepository,
  nodeByKey,
  openDb,
  type ColumnDef,
  type Db,
} from '../src/index';

/** A small app that touches the database three ways: Drizzle, Prisma and raw SQL. */
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'shop',
    dependencies: { 'drizzle-orm': '0.44.0', '@prisma/client': '6.0.0', pg: '8.0.0' },
  }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
  'src/db/schema.ts': [
    "import { pgTable, serial, varchar, numeric, integer, primaryKey, timestamp } from 'drizzle-orm/pg-core';",
    '',
    "export const users = pgTable('users', {",
    "  id: serial('id').primaryKey(),",
    "  email: varchar('email', { length: 255 }).notNull().unique(),",
    "  balance: numeric('balance', { precision: 12, scale: 2 }).default('0'),",
    '});',
    '',
    "export const orders = pgTable('orders', {",
    "  id: serial('id').primaryKey(),",
    "  userId: integer('user_id').notNull().references(() => users.id),",
    '});',
    '',
    "const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();",
    '',
    "export const tags = pgTable('order_tags', {",
    "  orderId: integer('order_id').notNull(),",
    "  tag: varchar('tag', { length: 40 }).notNull(),",
    '  createdAt: createdAt(),',
    '}, (t) => [primaryKey({ columns: [t.orderId, t.tag] })]);',
    '',
  ].join('\n'),
  'src/services/orders.ts': [
    "import { users, orders } from '../db/schema';",
    '',
    'declare const db: any;',
    '',
    'export async function listOrders(userId: number) {',
    '  return db.select().from(orders).innerJoin(users, true);',
    '}',
    '',
    'export async function placeOrder(userId: number) {',
    '  await db.insert(orders).values({ userId });',
    '}',
    '',
  ].join('\n'),
  'prisma/schema.prisma': [
    'model Coupon {',
    '  id    Int     @id',
    '  code  String  @unique @db.VarChar(20)',
    '}',
    '',
  ].join('\n'),
  'src/services/coupons.ts': [
    "import { PrismaClient } from '@prisma/client';",
    'const prisma = new PrismaClient();',
    '',
    'export function findCoupon(code: string) {',
    '  return prisma.coupon.findUnique({ where: { code } });',
    '}',
    '',
  ].join('\n'),
  // A test that builds its own tiny users table must not replace the real one.
  'test/fixtures.ts': "export const SQL = 'CREATE TABLE users (legacy_id int)';\n",
  'test/fixtures/old.sql': 'CREATE TABLE orders (legacy text);\n',
  'migrations/0001_audit.sql': [
    'CREATE TABLE audit_log (',
    '  id bigserial PRIMARY KEY,',
    '  user_id integer REFERENCES users(id),',
    '  action varchar(40) NOT NULL',
    ');',
    '',
  ].join('\n'),
  'src/services/audit.ts': [
    'declare const sql: { prepare(q: string): { run(...a: unknown[]): void; all(): unknown[] } };',
    '',
    'export function record(userId: number, action: string) {',
    "  sql.prepare('INSERT INTO audit_log (user_id, action) VALUES (?, ?)').run(userId, action);",
    '}',
    '',
    'export function recent() {',
    "  return sql.prepare('SELECT * FROM audit_log ORDER BY id DESC').all();",
    '}',
    '',
    'export function mentionsOnly() {',
    "  return 'Read the docs FROM somewhere else';",
    '}',
    '',
  ].join('\n'),
};

let root: string;
let db: Db;
let repoId: number;

const table = (name: string) => nodeByKey(db, repoId, 'table', `table:${name}`);
const cols = (name: string) => (table(name)?.data.columns ?? []) as ColumnDef[];
const users = (name: string) =>
  edgesTo(db, repoId, table(name)!.id).map((e) => ({
    kind: e.kind,
    confidence: e.confidence,
    from: nodeById(e.src),
    line: e.evidenceLine,
  }));
const nodeById = (id: number) =>
  (db.prepare('SELECT key FROM nodes WHERE id = ?').get(id) as { key: string }).key;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-schema-'));
  for (const [p, c] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  db = openDb(':memory:');
  repoId = indexRepository(db, root).repoId;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('indexing database schemas', () => {
  it('reads Drizzle tables with column types, sizes, keys and defaults', () => {
    expect(table('users')).toMatchObject({ filePath: 'src/db/schema.ts', startLine: 3 });
    expect(cols('users')).toEqual([
      { name: 'id', type: 'serial', nullable: false, primaryKey: true, line: 4 },
      { name: 'email', type: 'varchar', length: 255, nullable: false, unique: true, line: 5 },
      {
        name: 'balance',
        type: 'numeric',
        precision: 12,
        scale: 2,
        nullable: true,
        default: "'0'",
        line: 6,
      },
    ]);
    expect(cols('orders')[1]).toMatchObject({
      name: 'user_id',
      references: { table: 'users', column: 'id' },
    });
    // Composite primary key from the table extras; a column built by a local helper.
    expect(cols('order_tags').map((c) => c.primaryKey)).toEqual([true, true, undefined]);
    expect(cols('order_tags')[2]).toMatchObject({
      name: 'created_at',
      type: 'timestamp',
      nullable: false,
      default: 'now()',
    });
  });

  it('reads Prisma models and SQL migrations', () => {
    expect(cols('coupon')[1]).toMatchObject({ name: 'code', type: 'VarChar', length: 20 });
    expect(table('audit_log')).toMatchObject({
      filePath: 'migrations/0001_audit.sql',
      startLine: 1,
    });
    expect(cols('audit_log').map((c) => c.name)).toEqual(['id', 'user_id', 'action']);
  });

  it('links foreign keys between tables, across files', () => {
    const refs = users('users').filter((e) => e.kind === 'references');
    expect(refs.map((r) => [r.from, r.confidence])).toEqual(
      expect.arrayContaining([
        ['table:orders', 'observed'],
        ['table:audit_log', 'observed'],
      ]),
    );
  });

  it('links functions to the tables they read and write, with confidence and line', () => {
    expect(users('orders').filter((e) => e.kind !== 'references')).toEqual(
      expect.arrayContaining([
        {
          kind: 'reads_table',
          confidence: 'observed',
          from: 'src/services/orders.ts#listOrders',
          line: 6,
        },
        {
          kind: 'writes_table',
          confidence: 'observed',
          from: 'src/services/orders.ts#placeOrder',
          line: 10,
        },
      ]),
    );
    expect(users('users')).toContainEqual({
      kind: 'reads_table',
      confidence: 'observed',
      from: 'src/services/orders.ts#listOrders',
      line: 6,
    });
    expect(users('coupon')).toContainEqual({
      kind: 'reads_table',
      confidence: 'inferred',
      from: 'src/services/coupons.ts#findCoupon',
      line: 5,
    });
    const audit = users('audit_log').filter((e) => e.kind !== 'references');
    expect(audit).toEqual(
      expect.arrayContaining([
        {
          kind: 'writes_table',
          confidence: 'inferred',
          from: 'src/services/audit.ts#record',
          line: 4,
        },
        {
          kind: 'reads_table',
          confidence: 'inferred',
          from: 'src/services/audit.ts#recent',
          line: 8,
        },
      ]),
    );
    expect(audit.map((e) => e.from)).not.toContain('src/services/audit.ts#mentionsOnly');
  });

  it('drops links to tables that no schema defines', () => {
    const all = db
      .prepare(
        "SELECT COUNT(*) AS n FROM edges e JOIN nodes d ON d.id = e.dst WHERE e.kind IN ('reads_table','writes_table') AND d.kind != 'table'",
      )
      .get() as { n: number };
    expect(all.n).toBe(0);
  });

  it('draws tables in the Database lobe of the brain, with columns and links', () => {
    const brain = buildBrain(db, repoId)!;
    const t = brain.neurons.find((n) => n.kind === 'table' && n.name === 'users')!;
    expect(t).toMatchObject({ region: 'database', file: 'src/db/schema.ts', line: 3 });
    expect(t.columns?.[1]).toMatchObject({ name: 'email', type: 'varchar', length: 255 });
    const list = brain.neurons.find((n) => n.name === 'listOrders')!;
    expect(
      brain.synapses
        .filter((s) => s.source === list.id)
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['reads_table', 'reads_table']);
    const orders = brain.neurons.find((n) => n.kind === 'table' && n.name === 'orders')!;
    expect(brain.synapses).toContainEqual(
      expect.objectContaining({ source: orders.id, target: t.id, kind: 'references' }),
    );
  });
});
