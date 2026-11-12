# ADR 0016: Database objects through PostgreSQL's parser and a dialect-aware statement reader

- Status: accepted
- Date: 2026-11-10
- Extends ADR 0013 (tables and diagrams). Replaces the name-only `sqlObjects` pattern, which found views, procedures, functions, triggers, packages, sequences, indexes and types by name and analysed no bodies.

## Context

The founder asked for full analysis of databases: schemas, procedures, views, functions and everything else a SQL file defines. Before this decision CodeAtlas read tables, columns and foreign keys, and recorded every other object by name only. Procedure bodies, view queries, trigger targets and parameters were not read, so the brain could not show which code reads or writes a table.

SQL has no single grammar. PostgreSQL publishes its parser as a C library (libpg_query), which the `libpg-query` package compiles to WebAssembly (research R29). No comparable parser exists in npm for MySQL, SQL Server, Oracle or Db2: `node-sql-parser` rejects their procedure syntax (R29). Tree-sitter grammars for those dialects have no published WebAssembly, and building them from source needs the founder's approval (sprint L5).

## Decisions

1. **New shared package `packages/sql` (`@nexora/sql`)**, used by CodeAtlas and, in sprint L6, bundled into ArchLens. Products still never import each other.
2. **PostgreSQL through its own parser.** `libpg-query` 18.2.2 (MIT), pinned. It is the only new runtime dependency. A file is first parsed whole; if that fails, statement by statement, so one error does not hide the rest. Function bodies are read from the tree: `LANGUAGE sql` bodies and `BEGIN ATOMIC` bodies by the SQL parser, PL/pgSQL bodies by PostgreSQL's PL/pgSQL compiler front end (`parsePlPgSQLSync`), whose statements carry their own line numbers. Bodies in other languages (C, Python, JavaScript) are not read, and the object says so by its `routineLanguage`.
3. **Other dialects through a statement reader.** A tokenizer that knows each dialect's quoting and comments, a splitter that follows each client's delimiters (`GO`, `DELIMITER`, Oracle's `/`, Db2's `--#SET TERMINATOR`, and `BEGIN … END` nesting), and a header reader for every `CREATE` form. Bodies are read from tokens: relations after `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`; calls after `CALL`, `EXEC`, `PERFORM` and `name(`. Common table expressions, temporary tables, `EXTRACT(… FROM …)` and `IS DISTINCT FROM` are excluded; SQL Server's `UPDATE alias … FROM table alias` writes the aliased table.
4. **Dialect.** The language detector's choice (PL/pgSQL, T-SQL, PL/SQL, SQL PL) is a hint; syntax only one client accepts (`GO`, `DELIMITER`, `AUTO_INCREMENT`, `--#SET TERMINATOR`, `AUTOINCREMENT`, `PRAGMA`) outweighs it. A plain SQL file that PostgreSQL's parser accepts is parsed by it, whatever its dialect.
5. **Status rule.** A SQL file is `full` only when PostgreSQL's parser accepted every statement and every PL/pgSQL and SQL body; otherwise `partial`, with the dialect and the first problem line in the reason. A statement the reader cannot recognise is reported with its line, never guessed. psql meta-commands and `COPY … FROM stdin` data are blanked before parsing, keeping line numbers.
6. **Objects:** tables, views, materialized views, functions, procedures (with parameter modes, types and defaults, and return types), triggers (timing, events, row or statement, the routine they run), indexes (columns, unique, method), sequences (options, owner), types and domains (enum values, attributes, base type), Oracle packages and package bodies with their members, policies, rules, events, synonyms, schemas, extensions and `COMMENT ON` text.
7. **Links are labelled** (`products/codeatlas/core/src/indexer/extract/sql.ts`): a relation or routine named in a body is matched to the repository by name. From PostgreSQL's parser the role of the name is certain (observed); from the statement reader it is read from the keywords around it (inferred). A call matched in another file is inferred; one with several candidates is not drawn. Names that match nothing stay on the object as `unresolvedReads` and `unresolvedCalls` (explicit calls only; unmatched `name(` calls are built-in functions). SQL built at run time is recorded by line and not analysed.
8. **Brain.** New neuron kinds (`view`, `procedure`, `trigger`, `index`, `sequence`, `datatype`, `package`, `policy`, `rule`, `event`, `synonym`, `schema`, `extension`), placed in the database lobe; new synapse kinds `fires_on` and `indexes`; parameters carry `mode` and `default`; a `details` list shows each object's definition. A fourth diagram, "Database objects", draws views, routines and triggers with the tables they read and write.

## Consequences

- PostgreSQL schemas and migrations are fully parsed, with bodies; on Pagila every one of 388 statements parsed in 33 ms (R30).
- MySQL, SQL Server, Oracle, Db2 and SQLite files stay `partial` even when every statement is recognised, because no complete grammar checked them. The reason says so.
- Name matching ignores the server's search path: two schemas with tables of the same name are matched to the one CodeAtlas keys by bare name (as foreign keys already were, ADR 0013).
- Overloaded functions with the same name in one file share a node, which records how many definitions it has.
