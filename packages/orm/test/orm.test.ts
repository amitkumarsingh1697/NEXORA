import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSyntax } from '@nexora/syntax';
import {
  gormDbName,
  gormTableName,
  liquibaseFromYaml,
  mongooseCollection,
  railsTableName,
  readLiquibaseTree,
  readOrm,
  resolveOrm,
  sequelizePlural,
  typeormSnake,
  type LbNode,
  type OrmFile,
  type OrmSchema,
} from '../src/index';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const LANG: Record<string, string> = {
  py: 'Python',
  java: 'Java',
  kt: 'Kotlin',
  cs: 'C#',
  rb: 'Ruby',
  php: 'PHP',
  go: 'Go',
  ex: 'Elixir',
  exs: 'Elixir',
  rs: 'Rust',
  ts: 'TypeScript',
  js: 'JavaScript',
};

function readDir(dir: string): OrmFile[] {
  const out: OrmFile[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const lang = LANG[n.split('.').pop()!];
        const r = lang
          ? readOrm(relative(dir, p), lang, readFileSync(p, 'utf8'), { efCore: true, gorm: true })
          : null;
        if (r) out.push(r);
      }
    }
  };
  walk(join(FIX, dir));
  return out;
}

const table = (s: OrmSchema, name: string, alter = false) =>
  s.tables.find((t) => t.name === name && !!t.alter === alter);
const col = (s: OrmSchema, t: string, c: string, alter = false) =>
  table(s, t, alter)?.columns.find((x) => x.name === c);
const fk = (s: OrmSchema, t: string, c: string) =>
  s.foreignKeys.find((f) => f.table === t && f.column === c);
const mapping = (s: OrmSchema, owner: string) => s.mappings.find((m) => m.owner === owner);

beforeAll(() => initSyntax());

describe('default names, ported from each framework', () => {
  it('matches the frameworks on their own examples', () => {
    expect(typeormSnake('UserAccount')).toBe('user_account');
    expect(typeormSnake('HTMLParser')).toBe('html_parser');
    expect(gormDbName('APIKey')).toBe('api_key');
    expect(gormDbName('UserID')).toBe('user_id');
    expect(gormTableName('Person')).toBe('people');
    expect(gormTableName('CreditCard')).toBe('credit_cards');
    expect(railsTableName('Person')).toBe('people');
    expect(railsTableName('LineItem')).toBe('line_items');
    expect(railsTableName('Category')).toBe('categories');
    expect(mongooseCollection('Person')).toBe('people');
    expect(mongooseCollection('Comment')).toBe('comments');
    expect(sequelizePlural('Customer')).toBe('Customers');
    expect(sequelizePlural('Person')).toBe('People');
  });
});

describe('Python', () => {
  let s: OrmSchema;
  beforeAll(() => {
    s = resolveOrm([
      ...readDir('django'),
      ...readDir('sqlalchemy'),
      ...readDir('alembic'),
      ...readDir('peewee'),
    ]);
  });

  it('reads Django models: default names, abstract and multi-table inheritance, relations', () => {
    expect(table(s, 'shop_customer')).toMatchObject({
      framework: 'django',
      naming: 'default',
      model: 'Customer',
    });
    expect(col(s, 'shop_customer', 'id')).toMatchObject({
      primaryKey: true,
      implicit: expect.stringContaining('Django adds'),
    });
    // Inherited from the abstract Timestamped model.
    expect(col(s, 'shop_customer', 'created')).toBeDefined();
    expect(col(s, 'shop_customer', 'email')).toMatchObject({
      length: 254,
      unique: true,
      nullable: false,
    });
    expect(col(s, 'shop_customer', 'name')).toMatchObject({ nullable: true, length: 100 });
    expect(table(s, 'shop_orders')).toMatchObject({ naming: 'explicit' });
    expect(col(s, 'shop_orders', 'number')).toMatchObject({ primaryKey: true });
    expect(col(s, 'shop_orders', 'customer_id')?.references).toEqual({
      table: 'shop_customer',
      column: 'id',
    });
    expect(col(s, 'shop_orders', 'referrer_id')?.references).toEqual({
      table: 'shop_orders',
      column: 'number',
    });
    expect(col(s, 'shop_tag', 'tag_label')).toBeDefined();
    expect(table(s, 'shop_orders_tags')?.columns.map((c) => c.name)).toEqual([
      'order_id',
      'tag_id',
    ]);
    expect(col(s, 'shop_vipcustomer', 'customer_ptr_id')).toMatchObject({
      primaryKey: true,
      references: { table: 'shop_customer' },
    });
    expect(col(s, 'shop_vipcustomer', 'email')).toBeUndefined();
    expect(mapping(s, 'CustomerProxy')?.table).toBe('shop_customer');
  });

  it('reads Django migrations: CreateModel and AddField', () => {
    expect(col(s, 'shop_note', 'order_id')?.references).toEqual({
      table: 'shop_orders',
      column: 'number',
    });
    expect(table(s, 'shop_customer', true)?.columns.map((c) => c.name)).toEqual(['phone']);
    expect(mapping(s, 'Note')).toBeUndefined();
  });

  it('reads SQLAlchemy declarative, Mapped[] and Table(), and Flask-SQLAlchemy names', () => {
    expect(col(s, 'users', 'email')).toMatchObject({
      type: 'String(255)',
      length: 255,
      unique: true,
      nullable: false,
    });
    expect(col(s, 'users', 'nickname')).toMatchObject({ nullable: true, type: 'str' });
    expect(col(s, 'users', 'posts')).toBeUndefined();
    expect(col(s, 'posts', 'author')).toMatchObject({
      field: 'author_id',
      nullable: false,
      references: { table: 'users', column: 'id' },
    });
    expect(table(s, 'audit_log')).toMatchObject({
      naming: 'default',
      rule: expect.stringContaining('Flask-SQLAlchemy'),
    });
    expect(col(s, 'tags', 'post_id')).toMatchObject({ type: 'type of posts.id' });
  });

  it('reads Alembic upgrade() only', () => {
    expect(col(s, 'orders', 'id')).toMatchObject({ primaryKey: true, nullable: false });
    expect(fk(s, 'orders', 'user_id')).toMatchObject({ refTable: 'users', confidence: 'observed' });
    expect(table(s, 'users', true)?.columns.map((c) => c.name)).toEqual(['age']);
  });

  it('reads Peewee models with their Meta table names', () => {
    expect(table(s, 'author')).toMatchObject({ naming: 'default' });
    expect(col(s, 'books', 'author_id')?.references).toEqual({ table: 'author', column: 'id' });
    expect(table(s, 'basemodel')).toBeUndefined();
  });
});

describe('JVM', () => {
  const s = () => resolveOrm(readDir('jpa'));
  it('reads JPA entities with mapped superclasses, embeddables, relations and join tables', () => {
    const r = s();
    expect(table(r, 'customers')?.columns.map((c) => c.name)).toEqual([
      'id',
      'created_at',
      'email',
      'displayName',
      'street',
      'city',
    ]);
    expect(col(r, 'customers', 'cached')).toBeUndefined();
    expect(table(r, 'PurchaseOrder')).toMatchObject({
      naming: 'default',
      rule: expect.stringContaining('entity name'),
    });
    expect(col(r, 'PurchaseOrder', 'customer_id')).toMatchObject({
      nullable: false,
      references: { table: 'customers', column: 'id' },
    });
    expect(col(r, 'PurchaseOrder', 'referrer_id')?.references).toEqual({
      table: 'customers',
      column: 'id',
    });
    expect(col(r, 'PurchaseOrder', 'total')).toMatchObject({ precision: 10, scale: 2 });
    expect(table(r, 'customer_tags')?.columns.map((c) => [c.name, c.references?.table])).toEqual([
      ['customer_id', 'customers'],
      ['tag_id', 'tags'],
    ]);
    expect(mapping(r, 'CustomerRepository')).toMatchObject({
      table: 'customers',
      access: 'reads-writes',
      framework: 'spring-data',
    });
  });

  it('matches a JPA default name to an existing snake_case table', () => {
    const r = resolveOrm(readDir('jpa'), new Set(['purchase_order']));
    expect(table(r, 'purchase_order')).toMatchObject({ naming: 'matched', model: 'PurchaseOrder' });
    expect(col(r, 'purchase_order', 'created_at')).toBeDefined();
  });

  it('reads Kotlin JPA constructor properties and Exposed tables', () => {
    const r = s();
    expect(col(r, 'tags', 'label')).toMatchObject({ length: 40, nullable: false });
    expect(col(r, 'tags', 'note')).toMatchObject({ nullable: true });
    expect(col(r, 'invoices', 'number')).toMatchObject({ length: 30, unique: true });
    expect(col(r, 'invoices', 'id')).toMatchObject({ primaryKey: true });
    expect(col(r, 'invoices', 'customer_id')).toMatchObject({
      nullable: true,
      references: { table: 'customers', column: 'id' },
    });
  });
});

describe('Entity Framework Core', () => {
  it('reads DbSet names, fluent ToTable over [Table], conventions and migrations', () => {
    const r = resolveOrm(readDir('efcore'));
    expect(table(r, 'Customers')).toMatchObject({
      naming: 'default',
      rule: expect.stringContaining('DbSet'),
    });
    expect(col(r, 'Customers', 'Id')).toMatchObject({
      primaryKey: true,
      implicit: expect.stringContaining('convention'),
    });
    expect(col(r, 'Customers', 'Email')).toMatchObject({ length: 254, nullable: false });
    expect(col(r, 'Customers', 'Nickname')).toMatchObject({ nullable: true });
    expect(col(r, 'Customers', 'Display')).toBeUndefined();
    expect(table(r, 'purchase_orders')).toMatchObject({ naming: 'explicit' });
    expect(col(r, 'purchase_orders', 'CustomerId')?.references).toEqual({
      table: 'Customers',
      column: 'Id',
    });
    expect(col(r, 'purchase_orders', 'total_amount')?.type).toContain('decimal(10,2)');
    expect(col(r, 'Invoices', 'Number')).toMatchObject({
      type: 'nvarchar(30)',
      length: 30,
      nullable: false,
    });
    expect(fk(r, 'Invoices', 'CustomerId')).toMatchObject({
      refTable: 'Customers',
      confidence: 'observed',
    });
    expect(table(r, 'Customers', true)?.columns.map((c) => c.name)).toEqual(['Phone']);
  });
});

describe('Ruby, PHP, Go, Elixir, Rust', () => {
  it('reads Rails schema.rb, migrations and models', () => {
    const r = resolveOrm(readDir('rails'));
    expect(col(r, 'users', 'email')).toMatchObject({ length: 254, nullable: false, unique: true });
    expect(col(r, 'line_items', 'id')).toMatchObject({ type: 'uuid', primaryKey: true });
    expect(fk(r, 'line_items', 'user_id')).toMatchObject({ refTable: 'users' });
    expect(col(r, 'people', 'code')).toMatchObject({ primaryKey: true, type: 'string' });
    expect(col(r, 'people', 'id')).toBeUndefined();
    expect(table(r, 'people_users')?.columns.map((c) => c.name)).toEqual(['user_id', 'person_id']);
    expect(mapping(r, 'LineItem')).toMatchObject({ table: 'line_items', confidence: 'inferred' });
    expect(mapping(r, 'Person')).toMatchObject({ table: 'people', confidence: 'observed' });
  });

  it('reads Laravel migrations (up only), Eloquent models and Doctrine entities', () => {
    const l = resolveOrm(readDir('laravel'));
    expect(col(l, 'posts', 'title')).toMatchObject({ length: 200, unique: true, nullable: false });
    expect(col(l, 'posts', 'body')).toMatchObject({ nullable: true });
    expect(col(l, 'posts', 'user_id')?.references).toEqual({ table: 'users', column: 'id' });
    expect(col(l, 'posts', 'category_id')?.references).toEqual({ table: 'topics', column: 'id' });
    expect(col(l, 'posts', 'commentable_type')).toBeDefined();
    expect(fk(l, 'users', 'team_id')).toMatchObject({ refTable: 'teams' });
    expect(mapping(l, 'Category')).toMatchObject({ table: 'topics', confidence: 'observed' });
    const d = resolveOrm(readDir('doctrine'));
    expect(col(d, 'products', 'unit_price')).toMatchObject({
      precision: 10,
      scale: 2,
      nullable: true,
    });
    expect(col(d, 'products', 'name')).toMatchObject({ nullable: false, length: 120 });
    expect(col(d, 'products', 'category_id')).toMatchObject({
      nullable: false,
      references: { table: 'Category', column: 'id' },
    });
    expect(table(d, 'product_tag')).toBeDefined();
    expect(col(d, 'Category', 'title')).toMatchObject({ length: 50 });
  });

  it('reads GORM structs, tags, TableName() and AutoMigrate', () => {
    const r = resolveOrm(readDir('gorm'));
    expect(table(r, 'users')?.columns.map((c) => c.name)).toEqual([
      'id',
      'created_at',
      'updated_at',
      'deleted_at',
      'email',
      'name',
      'api_key_v2',
      'profile_bio',
      'company_id',
    ]);
    expect(col(r, 'users', 'email')).toMatchObject({ length: 254, unique: true, nullable: false });
    expect(col(r, 'users', 'company_id')?.references).toEqual({ table: 'companies', column: 'id' });
    expect(col(r, 'purchase_orders', 'order_no')).toMatchObject({
      primaryKey: true,
      type: 'varchar(20)',
    });
    expect(col(r, 'purchase_orders', 'user_id')?.references).toEqual({
      table: 'users',
      column: 'id',
    });
    expect(table(r, 'profiles')).toBeUndefined();
  });

  it('reads Ecto schemas and migrations, Diesel and SeaORM', () => {
    const e = resolveOrm(readDir('ecto'));
    expect(col(e, 'users', 'org_id')?.references).toEqual({ table: 'orgs', column: 'id' });
    expect(col(e, 'users', 'password')).toBeUndefined();
    expect(col(e, 'orgs', 'uuid')).toMatchObject({ primaryKey: true });
    expect(col(e, 'posts', 'title')).toMatchObject({ length: 120, nullable: false });
    expect(col(e, 'posts', 'user_id')?.references).toEqual({ table: 'users', column: 'id' });
    const r = resolveOrm(readDir('rust'));
    expect(col(r, 'users', 'email')).toMatchObject({ length: 254, nullable: false });
    expect(col(r, 'users', 'name')).toMatchObject({ nullable: true, type: 'Text' });
    expect(fk(r, 'posts', 'user_id')).toMatchObject({ refTable: 'users' });
    expect(col(r, 'cake', 'cake_name')).toMatchObject({ unique: true });
    expect(col(r, 'cake', 'filling_id')).toMatchObject({ nullable: true });
  });
});

describe('TypeScript and JavaScript', () => {
  it('reads TypeORM, MikroORM, Sequelize, Mongoose, Knex and Objection', () => {
    const r = resolveOrm(readDir('ts'));
    expect(table(r, 'user_account')).toMatchObject({ naming: 'default' });
    expect(col(r, 'user_account', 'display_name')).toMatchObject({ nullable: true });
    expect(col(r, 'photos', 'ownerId')).toMatchObject({
      nullable: false,
      references: { table: 'user_account', column: 'id' },
    });
    expect(col(r, 'photos', 'group_ref')?.references).toEqual({ table: 'groups', column: 'id' });
    expect(table(r, 'user_account_groups_groups')?.columns.map((c) => c.name)).toEqual([
      'userAccountId',
      'groupsId',
    ]);
    expect(col(r, 'book_copy', 'full_title')).toMatchObject({ length: 200 });
    expect(col(r, 'book_copy', 'original_copy_id')?.references).toEqual({
      table: 'book_copy',
      column: 'id',
    });
    expect(table(r, 'comments')).toMatchObject({ kind: 'collection' });
    expect(col(r, 'comments', 'author')?.references).toEqual({ table: 'people_v2', column: '_id' });
    expect(col(r, 'comments', 'meta.favs')).toMatchObject({ default: '0' });
    expect(col(r, 'customers', 'created_at')).toBeDefined();
    expect(col(r, 'customers', 'id')).toMatchObject({ primaryKey: true });
    expect(col(r, 'invoices', 'createdAt')).toBeUndefined();
    expect(col(r, 'items', 'customer_id')?.references).toEqual({
      table: 'customers',
      column: 'id',
    });
    expect(table(r, 'Orders')?.columns.map((c) => c.name)).toEqual([
      'id',
      'customerId',
      'createdAt',
    ]);
    expect(mapping(r, 'Pet')).toMatchObject({ table: 'pets', confidence: 'observed' });
    expect(mapping(r, 'Toy')).toMatchObject({ table: 'toys' });
  });
});

describe('Liquibase', () => {
  it('reads YAML changelogs, outside rollback', () => {
    const y = liquibaseFromYaml(readFileSync(join(FIX, 'liquibase/changelog.yaml'), 'utf8'));
    if (y instanceof Error) throw y;
    const r = resolveOrm([readLiquibaseTree('changelog.yaml', y)]);
    expect(col(r, 'audit', 'id')).toMatchObject({ primaryKey: true, line: 9 });
    expect(fk(r, 'audit', 'account_id')).toMatchObject({
      refTable: 'account',
      refColumn: 'id',
      line: 17,
    });
  });

  it('reads element trees (XML parsed by the caller)', () => {
    const el = (
      name: string,
      attrs: Record<string, string>,
      children: LbNode[] = [],
      line = 1,
    ): LbNode => ({ name, attrs, children, line });
    const root = el('databaseChangeLog', {}, [
      el('changeSet', { id: '1' }, [
        el('createTable', { tableName: 'a' }, [
          el('column', { name: 'id', type: 'INT' }, [el('constraints', { primaryKey: 'true' })], 3),
        ]),
        el('rollback', {}, [el('createTable', { tableName: 'ghost' })]),
      ]),
    ]);
    const r = resolveOrm([readLiquibaseTree('c.xml', root)]);
    expect(col(r, 'a', 'id')).toMatchObject({ primaryKey: true, nullable: false, line: 3 });
    expect(table(r, 'ghost')).toBeUndefined();
  });
});

describe('cross-file resolution', () => {
  const read = (files: Record<string, string>) =>
    Object.entries(files)
      .map(([path, text]) =>
        readOrm(path, LANG[path.split('.').pop()!]!, text, { efCore: true, gorm: true }),
      )
      .filter((x): x is OrmFile => x !== null);

  it('picks the C# class whose namespace the context can see, and reads IEntityTypeConfiguration', () => {
    const r = resolveOrm(
      read({
        'src/Shop.Infrastructure/GlobalUsings.cs':
          '﻿global using Shop.Domain.Orders;\nglobal using Microsoft.EntityFrameworkCore;\n',
        'src/Shop.Infrastructure/ShopContext.cs':
          'namespace Shop.Infrastructure;\npublic class ShopContext : DbContext\n{\n    public DbSet<Order> Orders { get; set; }\n}\n',
        'src/Shop.Infrastructure/Config/OrderConfig.cs':
          'namespace Shop.Infrastructure.Config;\nclass OrderConfig : IEntityTypeConfiguration<Order>\n{\n    public void Configure(EntityTypeBuilder<Order> b)\n    {\n        b.ToTable("orders");\n        b.Property(o => o.Total).HasColumnName("total_amount");\n    }\n}\n',
        'src/Shop.Domain/Orders/Order.cs':
          '﻿namespace Shop.Domain.Orders;\npublic class Order\n{\n    public int Id { get; set; }\n    public decimal Total { get; set; }\n}\n',
        'src/Shop.Api/ViewModels/Order.cs':
          'namespace Shop.Api.ViewModels;\npublic class Order\n{\n    public int Id { get; set; }\n    public string Label { get; set; }\n}\n',
      }),
    );
    expect(r.unresolved).toEqual([]);
    expect(table(r, 'orders')).toMatchObject({
      naming: 'explicit',
      path: 'src/Shop.Domain/Orders/Order.cs',
    });
    expect(table(r, 'orders')?.columns.map((c) => c.name)).toEqual(['Id', 'total_amount']);
    expect(table(r, 'Orders')).toBeUndefined();
  });

  it('leaves a class of a shared name unresolved when no namespace or path decides', () => {
    const r = resolveOrm(
      read({
        'ctx/ShopContext.cs':
          'public class ShopContext : DbContext\n{\n    public DbSet<Order> Orders { get; set; }\n}\n',
        'a/Order.cs': 'namespace A;\npublic class Order { public int Id { get; set; } }\n',
        'b/Order.cs': 'namespace B;\npublic class Order { public int Id { get; set; } }\n',
      }),
    );
    expect(r.tables.some((t) => t.name === 'Orders')).toBe(false);
    expect(r.unresolved.some((u) => u.text.includes('Order is registered'))).toBe(true);
  });

  it('takes the nearest class by path when several share a name', () => {
    const entity = (pkg: string, t: string) =>
      `package ${pkg};\nimport jakarta.persistence.*;\n@Entity\n@Table(name = "${t}")\npublic class Customer {\n  @Id private Long id;\n}\n`;
    const r = resolveOrm(
      read({
        'shop/model/Customer.java': entity('shop.model', 'shop_customers'),
        'crm/model/Customer.java': entity('crm.model', 'crm_customers'),
        'shop/repo/CustomerRepository.java':
          'package shop.repo;\nimport org.springframework.data.jpa.repository.JpaRepository;\npublic interface CustomerRepository extends JpaRepository<Customer, Long> {}\n',
      }),
    );
    expect(mapping(r, 'CustomerRepository')).toMatchObject({ table: 'shop_customers' });
  });

  it('reads a unidirectional JPA @OneToMany @JoinColumn as a key on the target table', () => {
    const r = resolveOrm(
      read({
        'Owner.java':
          'import jakarta.persistence.*;\nimport java.util.List;\n@Entity\n@Table(name = "owners")\npublic class Owner {\n  @Id private Integer id;\n  @OneToMany(cascade = CascadeType.ALL)\n  @JoinColumn(name = "owner_id")\n  private List<Pet> pets;\n  @OneToMany(mappedBy = "owner")\n  private List<Visit> visits;\n}\n',
        'Pet.java':
          'import jakarta.persistence.*;\n@Entity\n@Table(name = "pets")\npublic class Pet {\n  @Id private Integer id;\n}\n',
      }),
    );
    expect(col(r, 'pets', 'owner_id', true)).toMatchObject({
      references: { table: 'owners', column: 'id' },
    });
    expect(fk(r, 'pets', 'owner_id')).toMatchObject({ refTable: 'owners', confidence: 'observed' });
    expect(r.unresolved).toEqual([]);
  });

  it('labels a join table key observed when the source writes every name', () => {
    const r = resolveOrm(
      read({
        'Vet.java':
          'import jakarta.persistence.*;\nimport java.util.Set;\n@Entity\n@Table(name = "vets")\npublic class Vet {\n  @Id private Integer id;\n  @ManyToMany\n  @JoinTable(name = "vet_specialties", joinColumns = @JoinColumn(name = "vet_id"), inverseJoinColumns = @JoinColumn(name = "specialty_id"))\n  private Set<Specialty> specialties;\n}\n',
        'Specialty.java':
          'import jakarta.persistence.*;\n@Entity\n@Table(name = "specialties")\npublic class Specialty {\n  @Id private Integer id;\n}\n',
        'Tag.java':
          'import jakarta.persistence.*;\nimport java.util.Set;\n@Entity\npublic class Tag {\n  @Id private Integer id;\n  @ManyToMany private Set<Vet> vets;\n}\n',
      }),
    );
    expect(fk(r, 'vet_specialties', 'vet_id')).toMatchObject({ confidence: 'observed' });
    expect(fk(r, 'vet_specialties', 'specialty_id')).toMatchObject({ confidence: 'observed' });
    expect(col(r, 'vet_specialties', 'vet_id')?.implicit).toBeUndefined();
    // Tag_vets: every name comes from the JPA default.
    const derived = r.foreignKeys.filter((f) => f.table === 'Tag_vets');
    expect(derived.length).toBe(2);
    expect(derived.every((f) => f.confidence === 'inferred')).toBe(true);
  });

  it('writes default column names in snake_case only where the existing table does', () => {
    const files = read({
      'Owner.java':
        'import jakarta.persistence.*;\n@Entity\n@Table(name = "owners")\npublic class Owner {\n  @Id private Integer id;\n  private String firstName;\n  @Column(name = "lastName") private String lastName;\n  private String telephone;\n}\n',
    });
    const known = new Map([['owners', new Set(['id', 'first_name', 'lastname', 'telephone'])]]);
    const r = resolveOrm(files, new Set(['owners']), known);
    expect(table(r, 'owners')?.columns.map((c) => c.name)).toEqual([
      'id',
      'first_name',
      'lastName',
      'telephone',
    ]);
    // Without a schema to compare against, the name stays as JPA writes it.
    expect(col(resolveOrm(files), 'owners', 'firstName')).toBeDefined();
  });

  it('replays Django RenameModel, DeleteModel, AlterModelTable, RemoveField and RenameField', () => {
    const m = (ops: string) =>
      `from django.db import migrations, models\n\nclass Migration(migrations.Migration):\n    operations = [\n${ops}\n    ]\n`;
    const r = resolveOrm(
      read({
        'base/migrations/0001_initial.py': m(
          "        migrations.CreateModel(name='People', fields=[('id', models.AutoField(primary_key=True)), ('nick', models.CharField(max_length=20)), ('name', models.CharField(max_length=50))]),\n        migrations.CreateModel(name='Old', fields=[('id', models.AutoField(primary_key=True))]),\n        migrations.CreateModel(name='Tag', fields=[('id', models.AutoField(primary_key=True))]),",
        ),
        'blog/migrations/0001_initial.py': m(
          "        migrations.CreateModel(name='Post', fields=[('id', models.AutoField(primary_key=True)), ('author', models.ForeignKey(on_delete=models.CASCADE, to='base.People'))]),",
        ),
        'base/migrations/0002_rename.py': m(
          "        migrations.RenameModel(old_name='People', new_name='Person'),\n        migrations.RemoveField(model_name='person', name='nick'),\n        migrations.RenameField(model_name='person', old_name='name', new_name='full_name'),\n        migrations.DeleteModel(name='Old'),\n        migrations.AlterModelTable(name='tag', table='tags'),",
        ),
      }),
    );
    expect(table(r, 'base_people')).toBeUndefined();
    expect(table(r, 'base_person')?.columns.map((c) => c.name)).toEqual(['id', 'full_name']);
    expect(table(r, 'base_old')).toBeUndefined();
    expect(table(r, 'tags')).toBeDefined();
    expect(table(r, 'base_tag')).toBeUndefined();
    // A reference written before the rename follows it.
    expect(col(r, 'blog_post', 'author_id')?.references).toEqual({
      table: 'base_person',
      column: 'id',
    });
    expect(r.unresolved).toEqual([]);
  });

  it('takes a Django class with a base from another package as a model when a migration creates it', () => {
    const r = resolveOrm(
      read({
        'home/models.py':
          'from django.db import models\nfrom wagtail.models import Page\n\nclass HomePage(Page):\n    hero_text = models.CharField(max_length=255)\n\nclass NotAModel(Page):\n    pass\n',
        'home/migrations/0001_initial.py':
          "from django.db import migrations, models\n\nclass Migration(migrations.Migration):\n    operations = [\n        migrations.CreateModel(\n            name='HomePage',\n            fields=[\n                ('page_ptr', models.OneToOneField(auto_created=True, on_delete=models.CASCADE, parent_link=True, primary_key=True, serialize=False, to='wagtailcore.page')),\n                ('hero_text', models.CharField(max_length=255)),\n            ],\n            bases=('wagtailcore.page',),\n        ),\n    ]\n",
      }),
    );
    expect(mapping(r, 'HomePage')).toMatchObject({ table: 'home_homepage' });
    expect(mapping(r, 'NotAModel')).toBeUndefined();
    // The parent table belongs to Wagtail, outside the repository: kept as unresolved.
    expect(r.unresolved.some((u) => u.text.includes('wagtailcore.page'))).toBe(true);
  });
});

describe('migrations that drop and rename', () => {
  const read = (files: Record<string, string>) =>
    Object.entries(files)
      .map(([path, text]) =>
        path.endsWith('.yaml')
          ? (() => {
              const y = liquibaseFromYaml(text);
              return y instanceof Error ? null : readLiquibaseTree(path, y);
            })()
          : readOrm(path, LANG[path.split('.').pop()!]!, text, { efCore: true, gorm: true }),
      )
      .filter((x): x is OrmFile => x !== null);
  const names = (r: OrmSchema) => [...new Set(r.tables.map((t) => t.name))].sort();

  it('Rails: drop_table, rename_table, remove_column, rename_column, change_table', () => {
    const mig = (body: string) =>
      `class M < ActiveRecord::Migration[7.1]\n  def change\n${body}\n  end\nend\n`;
    const r = resolveOrm(
      read({
        'db/migrate/20240101000000_a.rb': mig(
          '    create_table :posts do |t|\n      t.string :title\n      t.string :slug\n      t.string :body\n      t.references :user, foreign_key: true\n    end\n    create_table :users do |t|\n      t.string :name\n    end\n    create_table :old_logs do |t|\n      t.string :line\n    end',
        ),
        'db/migrate/20240102000000_b.rb': mig(
          '    drop_table :old_logs\n    rename_table :posts, :articles\n    remove_column :articles, :slug, :string\n    rename_column :articles, :title, :headline\n    change_table :articles do |t|\n      t.remove :body\n    end',
        ),
      }),
    );
    expect(names(r)).toEqual(['articles', 'users']);
    expect(table(r, 'articles')?.columns.map((c) => c.name)).toEqual(['id', 'headline', 'user_id']);
    expect(fk(r, 'articles', 'user_id')).toMatchObject({ refTable: 'users' });
  });

  it('Rails: schema.rb replaces the migrations it includes, not newer ones', () => {
    const r = resolveOrm(
      read({
        'db/schema.rb':
          'ActiveRecord::Schema[7.1].define(version: 2024_01_02_000000) do\n  create_table "users" do |t|\n    t.string "name"\n  end\nend\n',
        'db/migrate/20240101000000_a.rb':
          'class A < ActiveRecord::Migration[7.1]\n  def change\n    create_table :gone_by_sql do |t|\n      t.string :x\n    end\n  end\nend\n',
        'db/migrate/20240103000000_b.rb':
          'class B < ActiveRecord::Migration[7.1]\n  def change\n    create_table :newer do |t|\n      t.string :x\n    end\n  end\nend\n',
      }),
    );
    expect(names(r)).toEqual(['newer', 'users']);
  });

  it('Laravel: Schema::dropIfExists, Schema::rename, dropColumn, renameColumn, dropTimestamps', () => {
    const mig = (body: string) =>
      `<?php\nuse Illuminate\\Support\\Facades\\Schema;\nuse Illuminate\\Database\\Schema\\Blueprint;\nreturn new class extends Migration {\n  public function up(): void {\n${body}\n  }\n  public function down(): void { Schema::dropIfExists('flights'); }\n};\n`;
    const r = resolveOrm(
      read({
        'database/migrations/2024_01_01_000000_a.php': mig(
          "    Schema::create('flights', function (Blueprint $table) {\n      $table->id();\n      $table->string('name');\n      $table->string('code');\n      $table->timestamps();\n    });\n    Schema::create('tmp', function (Blueprint $table) { $table->id(); });",
        ),
        'database/migrations/2024_01_02_000000_b.php': mig(
          "    Schema::dropIfExists('tmp');\n    Schema::rename('flights', 'trips');\n    Schema::table('trips', function (Blueprint $table) {\n      $table->dropColumn(['code']);\n      $table->renameColumn('name', 'title');\n      $table->dropTimestamps();\n    });",
        ),
      }),
    );
    expect(names(r)).toEqual(['trips']);
    expect(table(r, 'trips')?.columns.map((c) => c.name)).toEqual(['id', 'title']);
  });

  it('Alembic: follows the revision chain, not file names, and reads batch_alter_table', () => {
    const rev = (id: string, down: string, body: string) =>
      `from alembic import op\nimport sqlalchemy as sa\n\nrevision = '${id}'\ndown_revision = ${down}\n\ndef upgrade():\n${body}\n\ndef downgrade():\n    op.drop_table('accounts')\n`;
    const r = resolveOrm(
      read({
        // "f0" sorts before "a1" in no order but the chain says a1 comes first.
        'migrations/versions/f0_second.py': rev(
          'f0',
          "'a1'",
          "    op.rename_table('accounts', 'members')\n    with op.batch_alter_table('members') as batch_op:\n        batch_op.drop_column('legacy')\n        batch_op.alter_column('nick', new_column_name='handle')\n    op.drop_table('scratch')",
        ),
        'migrations/versions/a1_first.py': rev(
          'a1',
          'None',
          "    op.create_table('accounts', sa.Column('id', sa.Integer, primary_key=True), sa.Column('nick', sa.String(20)), sa.Column('legacy', sa.String(5)))\n    op.create_table('scratch', sa.Column('id', sa.Integer, primary_key=True))",
        ),
      }),
    );
    expect(names(r)).toEqual(['members']);
    expect(table(r, 'members')?.columns.map((c) => c.name)).toEqual(['id', 'handle']);
  });

  it('EF Core: a model snapshot replaces its migrations; owned types share the owner table', () => {
    const r = resolveOrm(
      read({
        'Data/Migrations/20240101000000_Initial.cs':
          'using Microsoft.EntityFrameworkCore.Migrations;\npublic partial class Initial : Migration\n{\n    protected override void Up(MigrationBuilder migrationBuilder)\n    {\n        migrationBuilder.CreateTable(name: "Legacy", columns: table => new { Id = table.Column<int>(nullable: false) });\n        migrationBuilder.DropTable(name: "Legacy");\n    }\n}\n',
        'Data/Migrations/ShopContextModelSnapshot.cs':
          'using Microsoft.EntityFrameworkCore;\npartial class ShopContextModelSnapshot : ModelSnapshot\n{\n    protected override void BuildModel(ModelBuilder modelBuilder)\n    {\n        modelBuilder.Entity("Shop.Customer", b =>\n            {\n                b.Property<int>("Id");\n                b.HasKey("Id");\n                b.ToTable("customers");\n            });\n        modelBuilder.Entity("Shop.Order", b =>\n            {\n                b.Property<int>("Id");\n                b.Property<int>("_customerId").HasColumnName("CustomerId");\n                b.HasKey("Id");\n                b.ToTable("orders");\n            });\n        modelBuilder.Entity("Shop.Order", b =>\n            {\n                b.HasOne("Shop.Customer", null)\n                    .WithMany()\n                    .HasForeignKey("_customerId");\n                b.OwnsOne("Shop.Address", "Address", b1 =>\n                    {\n                        b1.Property<int>("OrderId");\n                        b1.Property<string>("City");\n                        b1.HasKey("OrderId");\n                        b1.ToTable("orders");\n                        b1.WithOwner().HasForeignKey("OrderId");\n                    });\n            });\n    }\n}\n',
      }),
    );
    expect(names(r)).toEqual(['customers', 'orders']);
    expect(table(r, 'orders')?.columns.map((c) => c.name)).toEqual([
      'Id',
      'CustomerId',
      'Address_City',
    ]);
    expect(fk(r, 'orders', 'CustomerId')).toMatchObject({ refTable: 'customers', refColumn: 'Id' });
  });

  it('Knex, Sequelize, Ecto and Liquibase drops and renames', () => {
    const r = resolveOrm(
      read({
        'db/migrations/20240101_a.js':
          "exports.up = (knex) => knex.schema.createTable('pets', (t) => { t.increments('id'); t.string('nm'); t.string('tmp'); }).createTable('junk', (t) => { t.increments('id'); });\n",
        'db/migrations/20240102_b.js':
          "exports.up = async (knex) => {\n  await knex.schema.dropTable('junk');\n  await knex.schema.alterTable('pets', (t) => { t.dropColumn('tmp'); t.renameColumn('nm', 'name'); });\n};\n",
        'seq/20240101-a.js':
          "module.exports = { up: async (queryInterface, Sequelize) => {\n  await queryInterface.createTable('Books', { id: { type: Sequelize.INTEGER, primaryKey: true }, isbn: { type: Sequelize.STRING } });\n  await queryInterface.renameTable('Books', 'Volumes');\n  await queryInterface.removeColumn('Volumes', 'isbn');\n} };\n",
        'priv/repo/migrations/20240101_a.exs':
          'defmodule M1 do\n  use Ecto.Migration\n  def change do\n    create table(:tags) do\n      add :label, :string\n      add :old, :string\n    end\n    create table(:drafts) do\n      add :x, :string\n    end\n  end\nend\n',
        'priv/repo/migrations/20240102_b.exs':
          'defmodule M2 do\n  use Ecto.Migration\n  def change do\n    alter table(:tags) do\n      remove :old\n    end\n    rename table(:tags), :label, to: :name\n    drop table(:drafts)\n  end\nend\n',
        'changelog.yaml':
          'databaseChangeLog:\n  - changeSet:\n      id: 1\n      author: a\n      changes:\n        - createTable:\n            tableName: notes\n            columns:\n              - column:\n                  name: id\n                  type: int\n              - column:\n                  name: txt\n                  type: text\n        - renameColumn:\n            tableName: notes\n            oldColumnName: txt\n            newColumnName: body\n        - createTable:\n            tableName: scratch\n        - dropTable:\n            tableName: scratch\n',
      }),
    );
    expect(names(r)).toEqual(['Volumes', 'notes', 'pets', 'tags']);
    expect(table(r, 'pets')?.columns.map((c) => c.name)).toEqual(['id', 'name']);
    expect(table(r, 'Volumes')?.columns.map((c) => c.name)).toEqual(['id']);
    expect(table(r, 'tags')?.columns.map((c) => c.name)).toEqual(['id', 'name']);
    expect(table(r, 'notes')?.columns.map((c) => c.name)).toEqual(['id', 'body']);
  });
});

describe('robustness', () => {
  it('returns null for files that use no ORM, and survives broken source', () => {
    expect(readOrm('a.py', 'Python', 'print(1)\n')).toBeNull();
    expect(readOrm('a.java', 'Java', 'class A {}')).toBeNull();
    const r = readOrm(
      'm.py',
      'Python',
      'from django.db import models\nclass A(models.Model:\n  x = models.CharField(\n',
    );
    expect(r).not.toBeNull();
    expect(() => resolveOrm([r!])).not.toThrow();
  });

  it('keeps references it cannot resolve, and never invents a target', () => {
    const r = resolveOrm(readDir('ecto'));
    expect(r.unresolved.some((u) => u.text.includes('Role'))).toBe(true);
    expect(r.tables.some((t) => t.name === 'roles')).toBe(false);
  });
});
