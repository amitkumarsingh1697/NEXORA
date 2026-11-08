import { describe, expect, it } from 'vitest';
import { parsePrismaSchema, parseSqlSchema, sqlTableUses, tableKey } from '../src/index';

describe('parseSqlSchema', () => {
  const SQL = [
    '-- users of the shop',
    'CREATE TABLE IF NOT EXISTS public."users" (',
    '  id BIGSERIAL PRIMARY KEY,',
    '  email VARCHAR(255) NOT NULL UNIQUE, -- login',
    '  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,',
    '  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),',
    '  nickname text',
    ');',
    '',
    '/* orders */',
    'CREATE TABLE orders (',
    '  id integer NOT NULL,',
    '  user_id integer REFERENCES users(id) ON DELETE CASCADE,',
    '  shop_id integer,',
    '  total decimal(10,2),',
    '  CONSTRAINT orders_pk PRIMARY KEY (id),',
    '  CONSTRAINT orders_shop FOREIGN KEY (shop_id) REFERENCES shops (id),',
    '  CHECK (total >= 0)',
    ');',
    'ALTER TABLE orders ADD COLUMN note varchar(80);',
    'ALTER TABLE ONLY orders ADD CONSTRAINT o_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id);',
  ].join('\n');
  const { tables, foreignKeys } = parseSqlSchema(SQL);
  const users = tables.find((t) => t.name === 'users')!;
  const orders = tables.find((t) => t.name === 'orders')!;

  it('reads tables, columns, types, sizes, keys and defaults as written', () => {
    expect(tables.map((t) => [t.name, t.line])).toEqual([
      ['users', 2],
      ['orders', 11],
    ]);
    expect(users.columns).toEqual([
      { name: 'id', type: 'BIGSERIAL', nullable: false, primaryKey: true, line: 3 },
      { name: 'email', type: 'VARCHAR', length: 255, nullable: false, unique: true, line: 4 },
      {
        name: 'balance',
        type: 'NUMERIC',
        precision: 12,
        scale: 2,
        nullable: false,
        default: '0',
        line: 5,
      },
      {
        name: 'created_at',
        type: 'TIMESTAMP WITH TIME ZONE',
        nullable: true,
        default: 'now()',
        line: 6,
      },
      { name: 'nickname', type: 'text', nullable: true, line: 7 },
    ]);
  });

  it('reads table-level keys, inline and ALTER foreign keys, and added columns', () => {
    expect(orders.columns.find((c) => c.name === 'id')).toMatchObject({
      primaryKey: true,
      nullable: false,
    });
    expect(orders.columns.find((c) => c.name === 'total')).toMatchObject({
      type: 'decimal',
      precision: 10,
      scale: 2,
    });
    expect(orders.columns.find((c) => c.name === 'note')).toMatchObject({
      type: 'varchar',
      length: 80,
    });
    expect(orders.columns.map((c) => c.name)).not.toContain('CHECK');
    expect(foreignKeys.map((f) => [f.column, f.refTable, f.refColumn, f.line])).toEqual([
      ['user_id', 'users', 'id', 13],
      ['shop_id', 'shops', 'id', 17],
      ['coupon_id', 'coupons', 'id', 21],
    ]);
  });

  it('counts lines from a base when the SQL sits inside code', () => {
    const r = parseSqlSchema('\n  CREATE TABLE t (a int);', 40);
    expect(r.tables[0]).toMatchObject({ name: 't', line: 41 });
  });

  it('ignores text that is not a table definition', () => {
    expect(parseSqlSchema('SELECT * FROM users; CREATE INDEX i ON users(email);').tables).toEqual(
      [],
    );
  });
});

describe('parsePrismaSchema', () => {
  const PRISMA = [
    'enum Role {',
    '  USER',
    '  ADMIN',
    '}',
    'model User {',
    '  id      Int      @id @default(autoincrement())',
    '  email   String   @unique @db.VarChar(255)',
    '  balance Decimal  @db.Decimal(12, 2)',
    '  role    Role     @default(USER)',
    '  bio     String? @map("biography")',
    '  posts   Post[]',
    '  @@map("users")',
    '}',
    '',
    'model Post {',
    '  id       Int   @id',
    '  authorId Int',
    '  author   User  @relation(fields: [authorId], references: [id])',
    '}',
  ].join('\n');
  const { tables, foreignKeys } = parsePrismaSchema(PRISMA);

  it('reads models as tables with column types, sizes and keys', () => {
    const user = tables.find((t) => t.model === 'User')!;
    expect(user.name).toBe('users');
    expect(user.columns.map((c) => c.name)).toEqual([
      'id',
      'email',
      'balance',
      'role',
      'biography',
    ]);
    expect(user.columns[0]).toMatchObject({ primaryKey: true, default: 'autoincrement()' });
    expect(user.columns[1]).toMatchObject({ type: 'VarChar', length: 255, unique: true });
    expect(user.columns[2]).toMatchObject({ type: 'Decimal', precision: 12, scale: 2 });
    expect(user.columns[3]).toMatchObject({ type: 'Role', default: 'USER', nullable: false });
    expect(user.columns[4]).toMatchObject({ type: 'String', nullable: true });
  });

  it('turns relation fields into foreign keys, not columns', () => {
    const post = tables.find((t) => t.name === 'Post')!;
    expect(post.columns.map((c) => c.name)).toEqual(['id', 'authorId']);
    expect(post.columns[1]?.references).toEqual({ table: 'User', column: 'id' });
    expect(foreignKeys).toEqual([
      { table: 'Post', column: 'authorId', refTable: 'User', refColumn: 'id', line: 18 },
    ]);
  });
});

describe('sqlTableUses and tableKey', () => {
  it('finds tables a statement reads and writes', () => {
    expect(
      sqlTableUses('SELECT u.id FROM users u JOIN "orders" o ON o.user_id = u.id').sort((a, b) =>
        a.table.localeCompare(b.table),
      ),
    ).toEqual([
      { table: 'orders', write: false },
      { table: 'users', write: false },
    ]);
    expect(sqlTableUses('INSERT INTO audit (a) SELECT a FROM events')).toEqual([
      { table: 'audit', write: true },
      { table: 'events', write: false },
    ]);
    expect(sqlTableUses('UPDATE nodes SET name = ? WHERE id = ?')).toEqual([
      { table: 'nodes', write: true },
    ]);
    expect(sqlTableUses('DELETE FROM edges WHERE repo_id = ?')).toEqual([
      { table: 'edges', write: true },
    ]);
    expect(sqlTableUses('SELECT 1 FROM (SELECT 2) x')).toEqual([]);
  });

  it('matches names across quoting, schemas and case', () => {
    expect(tableKey('public."Users"')).toBe('users');
    expect(tableKey('`orders`')).toBe('orders');
  });
});
