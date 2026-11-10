# ADR 0017: ORM and migration-tool schemas through a shared reader package

- Status: accepted
- Date: 2026-11-10
- Extends ADR 0013 (tables and diagrams) and ADR 0016 (database objects). Replaces the "schema sources in formats this brain does not read" notice for Liquibase changelogs and ORM entity classes. The notice stays for the formats listed under Consequences.

## Context

The founder asked for full analysis of databases and schemas. After sprint L2, CodeAtlas read tables from SQL, Prisma and Drizzle only. Most applications define their schema somewhere else: in ORM model classes (Django, SQLAlchemy, JPA, Entity Framework Core, Active Record, Eloquent, GORM, TypeORM and the rest) or in migration tools (Alembic, Rails migrations, Laravel migrations, EF Core migrations, Liquibase, Knex, Ecto). In those repositories the database lobe of the brain was empty or partial, and a model class had no link to the table it maps to.

An ORM often names a table or column by a default rule instead of writing it, for example Django's `<app>_<model>`, Rails' pluralised class name, or TypeORM's snake_case class name. Showing such a name as if the source wrote it would break the evidence rule. So would guessing a rule.

## Decisions

1. **New shared package `packages/orm` (`@nexora/orm`).** It is pure: no file, network or database access. CodeAtlas uses it now, and ArchLens bundles it in sprint L6. Products still never import each other. It adds no new third-party runtime dependency. It reuses `@nexora/syntax` (tree-sitter, ADR 0015), `typescript` 5.9.3 (already the TypeScript parser) and `yaml` 2.9.1 (already used in the monorepo), at the same pinned versions.
2. **Each language is read by its parser, never by regular expressions over code:**
   - Python, Java, Kotlin, C#, Ruby, PHP, Go and Elixir use tree-sitter through the new `parseTree` export of `@nexora/syntax`.
   - TypeScript and JavaScript use the TypeScript compiler's parser.
   - Liquibase XML uses CodeAtlas's bounded, entity-free XML scanner. YAML and JSON changelogs use `yaml` with line numbers.
   - Rust's `table!` macro and SeaORM attributes are token text inside macros, so they are read as text.
3. **Frameworks read (23):**
   - Python: Django (models and migrations), SQLAlchemy (declarative, `Mapped[]`, `Table()`), Flask-SQLAlchemy, SQLModel, Alembic, Peewee.
   - JVM: JPA and Hibernate annotations (entities, mapped superclasses, embeddables, inheritance, join columns, join tables), Spring Data repositories, Exposed.
   - .NET: Entity Framework Core (DbSet, data annotations, conventions, fluent `ToTable`, `HasKey` and `HasColumnName` in `OnModelCreating` and in `IEntityTypeConfiguration<T>`, migrations, model snapshots).
   - Ruby: Active Record (`schema.rb`, migrations, models).
   - PHP: Laravel (migrations, Eloquent) and Doctrine (attributes and docblock annotations).
   - Go: GORM (structs, tags, `TableName()`, `AutoMigrate`).
   - Elixir: Ecto (schemas and migrations).
   - Rust: Diesel and SeaORM.
   - TypeScript and JavaScript: TypeORM, MikroORM, Sequelize and sequelize-typescript, Mongoose, Knex and Objection.
   - Changelogs: Liquibase.
   - Down migrations, `downgrade()` and rollback blocks are skipped.
4. **Default names come from each framework's own source code, ported and tested on that framework's examples** (research R31). The rule is recorded wherever it is used. A table or column whose name the source writes is observed. A name made by a default rule is shown with the rule, and its mapping is labelled inferred. A foreign key is observed only when the source writes the referenced table's name.
5. **Resolution across the repository (`resolveOrm`):**
   - Inheritance: abstract, single-table, joined and multi-table. Proxy models. Embedded types.
   - Many-to-many join tables, discriminators, and migrations that patch a model defined elsewhere.
   - A JPA default name is matched to an existing snake_case table, because Spring Boot's naming strategy writes names that way. That match is labelled `matched`. A default column name is written in snake_case only when the matched table, or a table already read from SQL, spells it that way.
   - When several classes share a name, the reader picks one in this order: the scope (Django app label), then the C# namespaces the referring file can see (its own namespace, `using`, and `global using` in its directory or above), then the nearest path. If none of these decides, the reference stays unresolved. It is never guessed.
   - A model whose base class comes from outside the repository (for example Wagtail's `Page`) counts as a model only when a migration in the same app creates it.
6. **The CodeAtlas graph:**
   - Tables join the existing table nodes. The `definedBy` list records each framework, file, line, model and naming rule.
   - Foreign keys are `references` edges, each carrying its own label.
   - A new edge and synapse kind, `maps_to`, links a model class to its table.
   - A Spring Data repository gets inferred `reads_table` and `writes_table` edges.
   - References that cannot be resolved are kept with their reason.

## Consequences

- On spring-petclinic, eShop, bakerydemo and mastodon, every table those repositories define in code is drawn, with its model (research R32). The remaining unresolved references point at tables of packages outside the repository (Wagtail's tables in bakerydemo).
- Still not read, so the brain names these in its unread-schema notice:
  - Hibernate `hbm.xml` and JPA `orm.xml` mappings.
  - MyBatis mappers.
  - Doctrine XML and YAML mappings.
  - Flyway Java migrations.
  - Entity Framework 6 `DbMigration`.
- Partly read:
  - JPA property access (annotations on getters).
  - `@ElementCollection`.
  - EF Core fluent configuration other than `ToTable`, `HasKey` and `HasColumnName`.
  - SeaORM relations.
  - Laravel's plural rule, which is approximated with Rails' inflections.
- ArchLens gets the same readers in sprint L6, so both products label the same tables the same way.
