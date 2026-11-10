import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateBrain, type BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb, type Db } from '../src/index';

/** A repository with Django models, a Rails schema, TypeORM entities and a Spring Data repository. */
const FILES: Record<string, string> = {
  'shop/models.py': [
    'from django.db import models',
    '',
    'class Customer(models.Model):',
    '    email = models.EmailField(max_length=254, unique=True)',
    '',
    'class Order(models.Model):',
    '    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)',
    '    class Meta:',
    '        db_table = "shop_orders"',
    '',
  ].join('\n'),
  'db/schema.rb': [
    'ActiveRecord::Schema[7.1].define(version: 1) do',
    '  create_table "invoices", force: :cascade do |t|',
    '    t.references "account", null: false, foreign_key: true',
    '    t.string "number", null: false',
    '  end',
    '  create_table "accounts" do |t|',
    '    t.string "name"',
    '  end',
    'end',
    '',
  ].join('\n'),
  'app/models/invoice.rb': 'class Invoice < ApplicationRecord\n  belongs_to :account\nend\n',
  'web/src/entities.ts': [
    "import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';",
    '@Entity()',
    'export class AuditEvent {',
    '  @PrimaryGeneratedColumn() id!: number;',
    '  @Column({ length: 80 }) action!: string;',
    '  @ManyToOne(() => Actor) actor!: Actor;',
    '}',
    "@Entity('actors')",
    'export class Actor {',
    '  @PrimaryGeneratedColumn() id!: number;',
    '}',
    '',
  ].join('\n'),
  'api/src/main/java/acme/Product.java': [
    'package acme;',
    'import jakarta.persistence.*;',
    '@Entity',
    '@Table(name = "products")',
    'public class Product {',
    '  @Id private Long id;',
    '  @Column(nullable = false, length = 120) private String title;',
    '}',
    '',
  ].join('\n'),
  'db/owners.sql': 'CREATE TABLE owners (id INT PRIMARY KEY, first_name VARCHAR(30));\n',
  'api/src/main/java/acme/Owner.java': [
    'package acme;',
    'import jakarta.persistence.*;',
    '@Entity',
    '@Table(name = "owners")',
    'public class Owner {',
    '  @Id private Long id;',
    '  private String firstName;',
    '}',
    '',
  ].join('\n'),
  'api/src/main/java/acme/ProductRepository.java': [
    'package acme;',
    'import org.springframework.data.jpa.repository.JpaRepository;',
    'public interface ProductRepository extends JpaRepository<Product, Long> {}',
    '',
  ].join('\n'),
};

let root: string;
let db: Db;
let repoId: number;
let result: ReturnType<typeof indexRepository>;
let brain: BrainModel;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-orm-'));
  for (const [p, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
      {
        stdio: 'ignore',
      },
    );
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  db = openDb(':memory:');
  result = indexRepository(db, root);
  repoId = result.repoId;
  const b = buildBrain(db, repoId);
  if (!b) throw new Error('no brain');
  brain = b;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const table = (key: string) => {
  const r = db
    .prepare(
      "SELECT name, file_path AS path, data FROM nodes WHERE repo_id = ? AND kind = 'table' AND key = ?",
    )
    .get(repoId, `table:${key}`) as { name: string; path: string; data: string } | undefined;
  return r ? { ...r, data: JSON.parse(r.data) as Record<string, unknown> } : undefined;
};
const edge = (kind: string, src: string, dst: string) =>
  db
    .prepare(
      `SELECT e.confidence, e.detail, e.evidence_line AS line FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.kind = ? AND s.key = ? AND d.key = ?`,
    )
    .get(repoId, kind, src, dst) as
    { confidence: string; detail: string; line: number } | undefined;

describe('ORM schemas in the index', () => {
  it('reports what it read', () => {
    expect(result.orm).toMatchObject({ files: 7, tables: 8, unresolved: 0 });
    expect(result.orm.frameworks).toMatchObject({
      django: 1,
      rails: 2,
      typeorm: 1,
      jpa: 2,
      'spring-data': 1,
    });
  });

  it('stores tables with columns, the framework that defines them and how they were named', () => {
    const c = table('shop_customer');
    expect(c?.data.source).toBe('django');
    expect(c?.data.columns).toEqual([
      expect.objectContaining({
        name: 'id',
        primaryKey: true,
        implicit: expect.stringContaining('Django adds'),
      }),
      expect.objectContaining({ name: 'email', length: 254, unique: true, nullable: false }),
    ]);
    expect(c?.data.definedBy).toEqual([
      expect.objectContaining({
        framework: 'django',
        model: 'Customer',
        naming: 'default',
        rule: 'Django default: <app label>_<model name in lower case>',
      }),
    ]);
    expect(table('audit_event')?.data.columns).toContainEqual(
      expect.objectContaining({ name: 'actorId', references: { table: 'actors', column: 'id' } }),
    );
    expect(table('products')?.data.columns).toContainEqual(
      expect.objectContaining({ name: 'title', length: 120, nullable: false }),
    );
  });

  it('writes a default column name the way the SQL schema already spells it', () => {
    const cols = (table('owners')?.data.columns as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(['id', 'first_name']);
    expect(table('owners')?.data.source).toBe('sql');
  });

  it('links foreign keys between tables, observed when both names are written', () => {
    expect(edge('references', 'table:shop_orders', 'table:shop_customer')).toMatchObject({
      confidence: 'inferred',
      line: 7,
    });
    expect(edge('references', 'table:invoices', 'table:accounts')).toMatchObject({
      confidence: 'observed',
      line: 3,
    });
    expect(edge('references', 'table:audit_event', 'table:actors')).toMatchObject({
      confidence: 'observed',
    });
  });

  it('links model classes to their tables, and repositories to the tables they use', () => {
    expect(edge('maps_to', 'shop/models.py#Order', 'table:shop_orders')).toMatchObject({
      confidence: 'observed',
    });
    expect(edge('maps_to', 'shop/models.py#Customer', 'table:shop_customer')).toMatchObject({
      confidence: 'inferred',
    });
    expect(edge('maps_to', 'app/models/invoice.rb#Invoice', 'table:invoices')).toMatchObject({
      confidence: 'inferred',
      detail:
        'Invoice maps to table invoices (Rails default: the class name, underscored and pluralised)',
    });
    const repo = 'api/src/main/java/acme/ProductRepository.java#ProductRepository';
    expect(edge('reads_table', repo, 'table:products')).toMatchObject({ confidence: 'inferred' });
    expect(edge('writes_table', repo, 'table:products')).toMatchObject({ confidence: 'inferred' });
  });

  it('draws the tables and mappings in the brain', () => {
    expect(validateBrain(JSON.parse(JSON.stringify(brain))).ok).toBe(true);
    const t = brain.neurons.find((n) => n.kind === 'table' && n.name === 'shop_customer');
    expect(t).toMatchObject({ region: 'database' });
    expect(t?.details).toContainEqual({
      label: 'Name',
      value: 'Django default: <app label>_<model name in lower case>',
    });
    const cls = brain.neurons.find((n) => n.name === 'Customer' && n.kind === 'class');
    expect(brain.synapses.find((s) => s.source === cls?.id && s.target === t?.id)?.kind).toBe(
      'maps_to',
    );
  });
});
