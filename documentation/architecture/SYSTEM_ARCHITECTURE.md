# System architecture

## Monorepo

pnpm workspaces, TypeScript 5.9 strict, ESM everywhere, zod 4 for every boundary, vitest for tests, ESLint 10 flat config, Prettier.

```
packages/ai          ModelProvider interface; OllamaProvider, OpenAICompatibleProvider (refuses without consent), DisabledProvider; JSON-schema-validated generation
packages/logging     pino-style structured logger with redaction of secret-looking keys
packages/validation  shared zod helpers and AppError codes
packages/languages   language and file-type registry (GitHub Linguist 9.7.0 data plus overlays), file inventory and analyser descriptions
packages/syntax      web-tree-sitter 0.27.1 with 71 grammars built from pinned commits, and per-language extraction rules
packages/sql         PostgreSQL parser (libpg-query 18.2.2) and a statement reader for MySQL, SQL Server, Oracle, Db2 and SQLite
packages/orm         ORM models and migrations of 23 frameworks into one schema model
packages/scip        SCIP index reader for compiler-checked references
packages/brain       3D architecture brain (three.js 0.186.1): model, layout, viewer and the single-file HTML template
```

## CVForge

```
 Browser ──► Next.js 16 app (products/cvforge/web)
               ├─ React pages (App Router, client components)
               └─ /api/* route handlers ──► @nexora/cvforge-backend services ──► Postgres 16 (drizzle)
                                                    │                         └► file storage (local dir)
                                                    └─► @nexora/cvforge-core (pure domain logic)
 Extension (WXT, MV3) ── bearer ext1.* token ──► /api/extension/*
```

- **cvforge-core** is pure and deterministic: resume extraction (mammoth for DOCX, pdfjs-dist for PDF, layout-risk detection), section parsing with confidence, job parsing, skill taxonomy, evidence engine, clarification generator, career-stage detection, three scorers, suggestion generator + fabrication guard, versioning/diff, DOCX rendering (`docx`), PDF conversion via LibreOffice, export verification.
- **cvforge-backend** owns persistence and policy: auth (scrypt hashes, hashed session tokens, rate limits), resumes, workspaces, analysis runs, suggestions, versions, exports, extension pairing/tokens, privacy (export/delete), maintenance. Services take a `Ctx` (db, config, storage, mailer, AI provider, logger, clock) so tests run against real Postgres with a controllable clock.
- **cvforge-web** is a thin HTTP layer: route handlers validate the session cookie (or extension bearer token), call a service, and map `AppError` codes to HTTP statuses. Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production; state-changing requests check `Origin`.
- **extension**: popup UI (pair → extract → review → saved), an unlisted extractor script injected with `activeTab` + `scripting` only on click (JSON-LD JobPosting first, then site-specific selectors, then readable text), API client with access token in `storage.session` and refresh token in `storage.local`.

### Analysis pipeline

1. Resume version content + job requirements →
2. evidence engine classifies each requirement (demonstrated / user_confirmed / missing) with cited locations →
3. clarification questions for gaps →
4. scorers (job match, ATS, evidence quality) with factor breakdowns →
5. suggestions (deterministic; optional AI phrasing validated by schema and fabrication guard) →
6. accepted suggestions become a new version with a change log.

## CodeAtlas

```
 Browser (127.0.0.1 only) ──► service (node:http, products/codeatlas/service)
                                 ├─ static SPA (Vite build of products/codeatlas/web)
                                 ├─ /api/* JSON routes ──► codeatlas-core queries ──► SQLite (node:sqlite, FTS5)
                                 ├─ JobRunner ── fork ──► index child process (TypeScript Compiler API, tree-sitter,
                                 │                         PostgreSQL parser, ORM, format readers)
                                 ├─ chat ──► retrieval + ModelProvider (Ollama / fallback)
                                 └─ investigations ──► git worktrees + allowlisted commands
```

- **Store:** one SQLite database, `$CODEATLAS_HOME/codeatlas.db`, shared by all registered repositories (every row is scoped by `repo_id`). Tables: `repos`, `index_runs`, `nodes`, `edges`, `unresolved`, `chunks` + `chunks_fts`, and the investigation tables.
- **Indexer:** discovers files (git ls-files or walk, skipping secrets/generated/oversized) and gives every file a language, a file type and one of seven statuses.
  - TypeScript and JavaScript (and Svelte, Vue and Astro components as virtual modules) are grouped by nearest `tsconfig.json`, one `ts.Program` per group, and the AST is walked twice (declarations/imports/routes, then calls/renders/heritage/complexity).
  - 71 more languages are parsed with tree-sitter; declarations, parameters, imports and calls are extracted by per-language rules and calls are linked by scope, imports and package folders. SCIP indexes, when given, add compiler-checked references.
  - SQL files are read by PostgreSQL's parser or the dialect statement reader (tables, views, routines, triggers and the tables their bodies touch); ORM models and migrations are replayed into the same schema.
  - JSON, YAML, TOML and XML are read to every key and element; manifests give dependencies, plugins and tasks, with module and class links (ADR 0022). Markdown and other documentation give nested sections and links.
  - Adds git history and searchable chunks. A full re-index replaces the previous run in one transaction; an unchanged project configuration allows an incremental run.
- **Queries:** graph lookups, BM25 search with a relevance floor, and the view builders.
- **Chat:** entity extraction → definitions + graph facts + route handlers + search hits (≤60 lines per source, secrets redacted) → prompt that treats sources as data → schema-validated answer → citation grounding.
- **Investigations:** state machine: investigation `open → patch_proposed → approved → committed` (or `discarded`); each patch `proposed → approved | rejected | superseded → committed`. Git runs with hooks disabled and signing off; commands run via `execFile` without a shell, with a scrubbed environment and a timeout.
- **Brain:** `buildBrain` turns the index into a brain model (parts, connections, regions, coverage); `packages/brain` lays it out in six lobes and renders it with three.js, in the Brain tab and as one offline HTML file (`cli brain`).
- **Web UI:** React 19 + Tailwind 4, cytoscape for module/dependency graphs, React Flow for flows, hash router; token captured from `#token=` and kept in `sessionStorage`.

## ArchLens

A Claude skill (`skills/archlens/`): instructions, references and scripts. `scripts/brain/brain.mjs` is the CodeAtlas indexer bundled with esbuild (ADR 0020). It runs with Node alone: it unpacks `runtime.pack.gz` (grammars, TypeScript library files, the PostgreSQL parser) to a private temporary folder (ADR 0023), indexes the repository into a temporary SQLite file, and writes the brain HTML and model JSON. Both temporary folders are removed when it exits.

## Cross-cutting

- **AI:** see [AI_MODEL_STRATEGY](AI_MODEL_STRATEGY.md).
- **Security:** see [SECURITY](../security/SECURITY.md) and [THREAT_MODEL](../security/THREAT_MODEL.md).
- **Decisions:** see [ARCHITECTURE_DECISIONS](ARCHITECTURE_DECISIONS.md).
