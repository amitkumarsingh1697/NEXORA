/**
 * What the ORM readers return. Every position is a 1-based line in the file named by `path`.
 *
 * A reader reports what the source states. Where the framework derives a name the source does
 * not write (a default table name, a foreign-key column, an implicit primary key), the column or
 * table says so in `implicit` or `rule`, and the rule is the framework's own (see
 * documentation/RESEARCH_AND_ASSUMPTIONS.md R31).
 */

export type OrmFramework =
  | 'django'
  | 'sqlalchemy'
  | 'alembic'
  | 'peewee'
  | 'jpa'
  | 'spring-data'
  | 'exposed'
  | 'ef-core'
  | 'rails'
  | 'laravel'
  | 'eloquent'
  | 'doctrine'
  | 'gorm'
  | 'ecto'
  | 'diesel'
  | 'sea-orm'
  | 'typeorm'
  | 'mikro-orm'
  | 'sequelize'
  | 'mongoose'
  | 'knex'
  | 'objection'
  | 'liquibase';

export const FRAMEWORK_LABEL: Record<OrmFramework, string> = {
  django: 'Django',
  sqlalchemy: 'SQLAlchemy',
  alembic: 'Alembic',
  peewee: 'Peewee',
  jpa: 'JPA/Hibernate',
  'spring-data': 'Spring Data',
  exposed: 'Exposed',
  'ef-core': 'Entity Framework Core',
  rails: 'Rails (Active Record)',
  laravel: 'Laravel',
  eloquent: 'Eloquent',
  doctrine: 'Doctrine',
  gorm: 'GORM',
  ecto: 'Ecto',
  diesel: 'Diesel',
  'sea-orm': 'SeaORM',
  typeorm: 'TypeORM',
  'mikro-orm': 'MikroORM',
  sequelize: 'Sequelize',
  mongoose: 'Mongoose',
  knex: 'Knex',
  objection: 'Objection.js',
  liquibase: 'Liquibase',
};

/** A foreign key target: a table by name, or a model by its class or model name. */
export interface OrmTarget {
  table?: string;
  model?: string;
  column?: string;
}

export interface OrmField {
  /** The attribute in code (`email`), when the column comes from one. */
  field?: string;
  /** The column name. Absent when it is derived from the target (`fkColumn`). */
  column?: string;
  /** The type as written (`models.CharField`, `String(255)`, `varchar`, `int?`). */
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: string;
  length?: number;
  precision?: number;
  scale?: number;
  line: number;
  /** The table or model this column points at. */
  ref?: OrmTarget;
  /** Derives the column name from the target's table and primary key (JPA, Doctrine, TypeORM). */
  fkColumn?: (target: { table: string; model?: string; pk: string }) => string;
  /** A many-to-many relation: a join table the framework creates. */
  joinTable?: {
    target: OrmTarget;
    /** Written table name, or derived from both sides. */
    name?: string;
    derive?: (
      own: { table: string; model: string },
      other: { table: string; model: string },
    ) => string;
    ownColumn?: string | ((own: { table: string; model: string; pk: string }) => string);
    otherColumn?: string | ((other: { table: string; model: string; pk: string }) => string);
  };
  /** An embedded value object whose fields become columns here (JPA @Embedded, GORM embedded). */
  embed?: { model: string; prefix?: string };
  /**
   * The member may be a navigation to another model (Entity Framework Core, GORM): a foreign
   * key when `ref.model` resolves to a model, otherwise a plain column of this name.
   */
  navigation?: boolean;
  /** Why a column the source does not write exists (`Django adds an id primary key`). */
  implicit?: string;
  /**
   * The column name is the framework's default (the attribute name), not written. When the
   * model's table was matched by its snake_case name, the column is matched the same way.
   */
  defaultName?: boolean;
}

/** A class or model that maps to a table. Its table name may depend on other models. */
export interface OrmModel {
  framework: OrmFramework;
  /** The class or model name. */
  model: string;
  line: number;
  endLine?: number;
  /** The table name as written in the source. */
  table?: string;
  /** The default table name and the rule that produced it, when none is written. */
  defaultTable?: string;
  rule?: string;
  /**
   * Physical naming depends on configuration (JPA, Doctrine): when a table of this
   * snake_case name already exists in the repository, the model maps to it.
   */
  trySnake?: boolean;
  /** Base classes as written; fields of abstract bases are inherited. */
  bases: string[];
  /**
   * entity: has a table. abstract: lends its fields to subclasses (Django abstract models,
   * mixins, JPA @MappedSuperclass). embeddable: a value object embedded into other tables.
   * proxy: shares its parent's table. patch: fields a migration adds to a model defined elsewhere.
   */
  role: 'entity' | 'abstract' | 'embeddable' | 'proxy' | 'patch';
  /**
   * The class extends the framework's base directly. When false, the class is a model only if
   * one of its bases is (resolved by name across the repository).
   */
  root: boolean;
  /**
   * How a subclass of another entity is stored: in its parent's table (single, the default for
   * JPA, Entity Framework Core and SQLAlchemy without a table name) or in its own table joined
   * by key (Django, and JPA with InheritanceType.JOINED). Set on the root entity.
   */
  inherit?: 'single' | 'joined';
  /** Added to the root table when a subclass shares it (JPA DTYPE, EF Core Discriminator). */
  discriminator?: OrmField;
  /** Defined by a migration operation rather than a class: no class in code to link. */
  virtual?: boolean;
  /** A concrete parent whose table this one joins by key (Django multi-table inheritance). */
  parentLink?: (parent: { table: string; model: string; pk: string }) => OrmField;
  fields: OrmField[];
  /** Added when, after inheritance, no field is a primary key. */
  implicitPk?: OrmField;
  /** Columns added when, after inheritance, they are not already present (timestamps). */
  implicitColumns?: OrmField[];
  kind?: 'table' | 'collection';
  /** Context a later step needs (Django app label). */
  scope?: string;
  /** The namespace that declares the class (C#), to tell classes of one name apart. */
  namespace?: string;
}

/** A table written directly in a migration or changelog. */
export interface OrmTable {
  framework: OrmFramework;
  name: string;
  line: number;
  fields: OrmField[];
  /** A change to a table defined elsewhere (`add_column`, `Schema::table`). */
  alter?: boolean;
  kind?: 'table' | 'collection';
}

export interface OrmForeignKey {
  framework: OrmFramework;
  table: string;
  column: string;
  refTable: string;
  refColumn?: string;
  line: number;
}

/**
 * Code that uses a model's table without defining it: a Spring Data repository, an Active
 * Record or Eloquent model, an Objection model. `model` names the entity, or `table` the table.
 */
export interface OrmUse {
  framework: OrmFramework;
  /** The class in code that uses the table. */
  owner: string;
  line: number;
  model?: string;
  table?: string;
  /** Default table name candidates when only a class name is known (Rails, Eloquent). */
  candidates?: string[];
  access: 'maps' | 'reads-writes';
  detail: string;
}

/**
 * A model made an entity by code elsewhere: an Entity Framework Core `DbSet<T>` or
 * `Entity<T>()`, a GORM `AutoMigrate(&T{})`. The class itself carries no ORM marker.
 */
export interface OrmRegistration {
  framework: OrmFramework;
  model: string;
  line: number;
  /** Written table name (`ToTable("x")`). */
  table?: string;
  /** Conventional table name (the DbSet property's name). */
  defaultTable?: string;
  rule?: string;
  /** Primary key columns written in the registration (`HasKey`). */
  keys?: string[];
  /** Column names written for members (`Property(x => x.P).HasColumnName("c")`). */
  columns?: { member: string; column: string }[];
}

export interface OrmProblem {
  line: number;
  message: string;
}

/**
 * A migration step that changes models created by earlier migrations (Django `RenameModel`,
 * `DeleteModel`, `AlterModelTable`, `RemoveField`, `RenameField`). Applied in file order within the scope.
 */
export interface OrmMigrationOp {
  framework: OrmFramework;
  op: 'rename' | 'delete' | 'table' | 'remove-field' | 'rename-field';
  model: string;
  /** New model name (rename), table name (table) or field name (remove-field, rename-field). */
  value?: string;
  /** New field name (rename-field). */
  to?: string;
  scope?: string;
  line: number;
}

/**
 * A migration step that drops or renames a table or column created by an earlier migration
 * (`drop_table`, `Schema::dropIfExists`, `op.rename_table`, `DropColumn`, `renameColumn`...).
 * Applied in migration order to the tables earlier migrations wrote.
 */
export interface OrmTableOp {
  framework: OrmFramework;
  op: 'drop-table' | 'rename-table' | 'drop-column' | 'rename-column';
  table: string;
  column?: string;
  /** New table or column name. */
  to?: string;
  line: number;
}

/** One file's reading. */
export interface OrmFile {
  path: string;
  frameworks: OrmFramework[];
  models: OrmModel[];
  tables: OrmTable[];
  foreignKeys: OrmForeignKey[];
  uses: OrmUse[];
  registrations?: OrmRegistration[];
  migrationOps?: OrmMigrationOp[];
  tableOps?: OrmTableOp[];
  /**
   * The file is a dump of the current schema that the framework keeps beside its migrations
   * (Rails `db/schema.rb`, an EF Core model snapshot). It replaces the migrations under its
   * directory up to its version (all of them when it has none), which may create tables later
   * dropped by means no reader sees.
   */
  snapshot?: { version?: string };
  /** Alembic: this revision and the ones it follows, to order migrations whose names are ids. */
  revision?: { id: string; follows: string[] };
  /** The namespaces a C# file can name types from: its own, `using` and `global using`. */
  imports?: { namespace?: string; usings: string[]; global: string[] };
  problems: OrmProblem[];
}

/** A resolved column, in the same shape as CodeAtlas's schema columns. */
export interface ResolvedColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: string;
  length?: number;
  precision?: number;
  scale?: number;
  references?: { table: string; column?: string };
  line: number;
  field?: string;
  implicit?: string;
}

export interface ResolvedTable {
  name: string;
  framework: OrmFramework;
  path: string;
  line: number;
  model?: string;
  /** How the name was found: written, or a framework default. */
  naming: 'explicit' | 'default' | 'matched';
  rule?: string;
  kind: 'table' | 'collection' | 'join-table';
  columns: ResolvedColumn[];
  alter?: boolean;
}

export interface ResolvedForeignKey {
  path: string;
  line: number;
  table: string;
  column: string;
  refTable: string;
  refColumn?: string;
  framework: OrmFramework;
  /** observed when both names are written; inferred when either was derived. */
  confidence: 'observed' | 'inferred';
}

export interface ResolvedMapping {
  path: string;
  line: number;
  /** The class in code. */
  owner: string;
  table: string;
  framework: OrmFramework;
  access: 'maps' | 'reads-writes';
  confidence: 'observed' | 'inferred';
  detail: string;
}

export interface OrmSchema {
  tables: ResolvedTable[];
  foreignKeys: ResolvedForeignKey[];
  mappings: ResolvedMapping[];
  /** References that matched no model or table: kept, never drawn. */
  unresolved: { path: string; line: number; text: string }[];
}
