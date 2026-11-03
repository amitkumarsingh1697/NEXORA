# System architecture

## Monorepo

pnpm workspaces, TypeScript 5.9 strict, ESM everywhere, zod 4 for every boundary, vitest for tests, ESLint 10 flat config, Prettier.

```
packages/ai          ModelProvider interface; OllamaProvider, OpenAICompatibleProvider (refuses without consent), DisabledProvider; JSON-schema-validated generation
packages/logging     pino-style structured logger with redaction of secret-looking keys
packages/validation  shared zod helpers and AppError codes
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
                                 ├─ JobRunner ── fork ──► index child process (TypeScript Compiler API)
                                 ├─ chat ──► retrieval + ModelProvider (Ollama / fallback)
                                 └─ investigations ──► git worktrees + allowlisted commands
```

- **Store:** one SQLite database, `$CODEATLAS_HOME/codeatlas.db`, shared by all registered repositories (every row is scoped by `repo_id`). Tables: `repos`, `index_runs`, `nodes`, `edges`, `unresolved`, `chunks` + `chunks_fts`, and the investigation tables.
- **Indexer:** discovers files (git ls-files or walk, skipping secrets/generated/oversized), groups them by nearest `tsconfig.json`, builds one `ts.Program` per group, and walks the AST twice (declarations/imports/routes, then calls/renders/heritage/complexity). Adds git history, Markdown docs, and searchable chunks. A full re-index replaces the previous run in one transaction.
- **Queries:** graph lookups, BM25 search with a relevance floor, and the view builders.
- **Chat:** entity extraction → definitions + graph facts + route handlers + search hits (≤60 lines per source, secrets redacted) → prompt that treats sources as data → schema-validated answer → citation grounding.
- **Investigations:** state machine: investigation `open → patch_proposed → approved → committed` (or `discarded`); each patch `proposed → approved | rejected | superseded → committed`. Git runs with hooks disabled and signing off; commands run via `execFile` without a shell, with a scrubbed environment and a timeout.
- **Web UI:** React 19 + Tailwind 4, cytoscape for module/dependency graphs, React Flow for flows, hash router; token captured from `#token=` and kept in `sessionStorage`.

## Cross-cutting

- **AI:** see [AI_MODEL_STRATEGY](AI_MODEL_STRATEGY.md).
- **Security:** see [SECURITY](../security/SECURITY.md) and [THREAT_MODEL](../security/THREAT_MODEL.md).
- **Decisions:** see [ARCHITECTURE_DECISIONS](ARCHITECTURE_DECISIONS.md).
