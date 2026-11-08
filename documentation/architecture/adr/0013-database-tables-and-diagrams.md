# ADR 0013: Database tables, table links and diagrams in the architecture brain

- Status: accepted
- Date: 2026-11-08
- Deviation from spec: none. Extends ADR 0012.

## Context

The founder asked whether the brain shows each database table with its columns, data types, precision and scale, which functions use each table, and where to see ER, schema and class diagrams. Before this change CodeAtlas recorded database clients as integrations but no tables, and the brain had no diagrams.

## Decisions

1. **A `table` node kind** in the CodeAtlas index (schema v6, with a migration that rebuilds the kind check). Its data holds the columns: name, type, length, precision, scale, nullable, primary key, unique, default, reference and line.
2. **Three schema sources, read deterministically.**
   - SQL `CREATE TABLE` and `ALTER TABLE` in `.sql` files and in TypeScript string literals.
   - Prisma `model` blocks in `.prisma` files (research R21).
   - Drizzle table builders (`pgTable`, `mysqlTable`, `sqliteTable` and others) read with the TypeScript AST (research R20).

   When several sources define the same table, the first wins and later ones fill in missing fields.

3. **Function-to-table links**, `reads_table` and `writes_table`.
   - Drizzle calls whose argument resolves to a table declaration are **observed**.
   - Prisma client calls (`prisma.<model>.<method>`) and table names found in SQL strings are **inferred**.

   A link is kept only if some schema defines the table. Foreign keys become `references` links between tables.

4. **Diagrams are drawn in-house as SVG** in `packages/brain/src/diagrams.ts`: an ER diagram (keys and links), a schema diagram (every column with its type and constraints) and a class diagram (classes and interfaces with methods, inheritance and implementation). A diagrams panel in the viewer offers scope, zoom, a download as SVG, and a click on a box to find it in the brain. No diagram library was added: Mermaid or a graph layout library would add hundreds of kilobytes to the single-file brain and an extra parser for the escaping to trust. A layered layout is enough for these diagrams.
5. **ArchLens** can write table neurons with columns by hand into the same model, so the diagrams work in its brain file too.

## Consequences

- Old indexes are migrated; the TypeScript cache format moves to 3 so cached files are re-analysed for table use.
- Views, stored procedures, dynamic SQL built at run time and the Drizzle relational query API (`db.query.x`) are not read.
- Large schemas are drawn one schema file at a time by default; the diagram notes say how many boxes were left out.
- A Venn diagram is not included: what it should compare has not been specified.
