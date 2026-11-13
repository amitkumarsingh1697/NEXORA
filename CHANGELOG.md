# Changelog

All notable changes to this repository. Format: [Keep a Changelog](https://keepachangelog.com/); versions follow SemVer.

## [Unreleased] — 0.1.0

### Added

- Monorepo foundation: pnpm workspace, strict TypeScript, ESLint, Prettier, vitest; shared `ai`, `logging`, `validation` packages.
- CVForge core: DOCX/PDF extraction with layout-risk detection, resume section parsing with confidence, job description parsing, skill taxonomy, evidence engine (demonstrated / user_confirmed / missing), clarification questions, career-stage detection, job match / ATS / evidence-quality scores with factor breakdowns, suggestions with fabrication guard, versioning and diffs, DOCX rendering, PDF via LibreOffice, export verification.
- CVForge backend: Postgres schema and migrations, auth (scrypt, hashed sessions, rate limits, password reset), resumes, workspaces, analyses, suggestions, versions, exports, extension pairing and rotating tokens, privacy export and deletion, audit events, retention sweep (`maintain`).
- CVForge web: Next.js app with dashboard, resume upload and confirmation, version history and compare, workspaces with requirements, questions, scores and suggestions, exports, settings (sessions, extension, privacy).
- CVForge extension (Chrome/Edge MV3): pairing, on-click extraction (JSON-LD, LinkedIn, Naukri, generic), review and save.
- CodeAtlas core: TypeScript Compiler API indexer with observed/inferred/unknown edges, git history, Markdown/ADR knowledge, coverage report, FTS5 search, views (modules, dependencies, flows, risk, ownership, knowledge, impact), grounded chat with retrieval-only fallback, bug investigation workflow with worktrees, allowlisted commands and hash-bound approval.
- CodeAtlas service and web UI on 127.0.0.1 with token, Host and Origin protection.
- Infrastructure: docker compose (Postgres, optional Ollama), DB init SQL, native Postgres setup script, `.env.example` files, CI workflow.
- Documentation set, ADRs 0001–0008, ArchLens skill draft.
- Governance (Sprint 0): CLAUDE.md, master specification extract, research log, sprint plan, requirements traceability, definition of done, AI engineering rules, security threat model, risk register, release readiness, implementation status; ADRs 0009–0011. ArchLens packaged as a separate skill with references and a checker.
- CodeAtlas (Sprint 1): approval and rejection records with identity and validation state; structured bug report; human-triggered fast-forward local merge with re-verification and typed hash confirmation (ADR 0010); schema v3 with migration; branch, dirty flag, manifest and declared-framework inventory; index revision on every chat citation; file- and module-level cycle detection (Tarjan); potentially-sensitive-configuration findings; public https clone with host and DNS checks; restart and prompt-injection tests.

- Sprint 2: CodeAtlas local analytics for every spec §5.11 metric (schema v4, never transmitted), 👍/👎 answer feedback with a note, Settings screen (AI status, data location, analytics, delete all local data with typed confirmation), first-run welcome screen, indexing cancellation (`DELETE /api/jobs/:id` and Cancel buttons) and a clear error when SQLite lacks FTS5. CVForge job comparison with shared-skill overlap and a resume-version warning; preferred template stored on each version, with template and section order diffed as formatting changes. Automated axe accessibility scans in both E2E suites. User guide and test report.

- Sprint 3: CodeAtlas `LanguageAdapter` interface (TypeScript/JavaScript is the one adapter; other languages are listed as unsupported). Integrations: environment variables, configuration files, HTTP service calls and database clients as inferred edges with evidence, plus an Integrations tab. Incremental indexing that re-analyses only changed files and their dependants and is checked against full indexing node by node (schema v5, `index_cache`). Structure tree (module → file → symbol) loaded one level at a time, and a language filter on Structure, Dependencies and Search. Module documentation with citations, Markdown download and an optional grounded model overview. Benchmarks for this repository and hono (`documentation/testing/BENCHMARKS.md`). CVForge email confirmation (single-use 24-hour links, resend from Settings, optional enforcement with `REQUIRE_EMAIL_VERIFICATION`) and optional SMTP delivery through nodemailer; the outbox remains the default.
- Licence: Apache-2.0, with SECURITY.md and CONTRIBUTING.md.

- README rewritten with features, setup, configuration and architecture, and screenshots of CVForge, the browser extension and CodeAtlas taken from the running apps with made-up data (`pnpm --filter @nexora/cvforge-web screenshots`, `pnpm --filter @nexora/codeatlas-web screenshots`). Built CVForge extension packages for Chrome and Edge in `products/cvforge/extension/releases/`.

- Architecture brain (ADR 0012): a 3D, clickable brain of a repository in `packages/brain` (three.js). Lobes for Frontend, Backend, Database, DevOps and Core & shared; click a lobe to go inside; click a class or method to see its inputs and output, where its input comes from and where it sends work, each link with its confidence and `file:line`; search to recall any part. CodeAtlas gains a Brain tab, `GET /api/repos/:id/brain` and `codeatlas brain <path> --out file.html`, and now records parameter and return types for functions and methods. ArchLens can produce the brain as one offline HTML file from a repository link (`skills/archlens/scripts/render-brain.mjs`).

- Database tables and diagrams (ADR 0013): CodeAtlas reads tables from SQL, Prisma and Drizzle schemas with every column's type, length, precision, scale, nullability, keys and default (index schema v6), and links each function to the tables it reads and writes and each table to the tables it references. The brain shows tables in the Database lobe with a columns table, and a new Diagrams view draws ER, schema and class diagrams that can be scoped, zoomed, downloaded as SVG and clicked to find a part in the brain. ArchLens can add tables to its brain model by hand.

- Coverage that says what it does not cover (ADR 0014 onward): one language and file-type registry built on GitHub Linguist 9.7.0 data identifies every file, gives it one of seven statuses with the reason, and feeds the **Languages & files** section of CodeAtlas and the brain. Format readers for configuration, build, container, CI, infrastructure, API, template, CSV, Graphviz and gettext files. Generated support matrix and a validation report on 23 public repositories.
- Full analysis beyond TypeScript (sprints L1 to L5): 71 languages parsed with tree-sitter grammars built from pinned commits, with classes, methods, parameters, return types, imports and calls linked by scope, imports and package folders; database objects with their bodies (PostgreSQL by its own parser, other dialects by a statement reader); ORM models and migrations of 23 frameworks replayed into the database schema; compiler-checked references from SCIP indexes.
- ArchLens bundles the CodeAtlas indexer (ADR 0020, sprint L6): `skills/archlens/scripts/brain/brain.mjs` builds the brain with Node alone, with exactly the CLI's result. Svelte, Vue and Astro components are read by the TypeScript compiler (ADR 0021). Whole-repository brains were run on Immich, Twenty and Keycloak.
- Build, configuration and documentation files in the brain (ADR 0022, sprint L7): every JSON, YAML and TOML key and XML element; Maven, Gradle and manifest dependencies, plugins and tasks, linked to the modules the repository builds; Spring beans and other XML class names linked to their classes; Liquibase changelogs judged by the changes the schema reader applies; Markdown, AsciiDoc and reStructuredText sections in a new Documentation lobe.

### Changed

- The ArchLens skill's run-time files (grammars, TypeScript library files, PostgreSQL parser) ship packed in one file, so the skill zip has 20 files and the Claude app accepts it (it refuses more than 200; ADR 0023).

- CodeAtlas runs left `running` by a crash are marked failed at startup. Sprint 3: parsed source files are shared across tsconfig programs, cutting a cold index of this repository from 22 s to 13 s; a doc comment on overloaded methods is no longer lost. Light-theme colours for "observed" and "inferred" darkened to meet contrast. CVForge inline links are underlined and decided suggestions are no longer dimmed.

### Fixed

- CVForge resume extraction: a resume exported by CVForge ("Title, Company" over "Dates | City") is read back with the right title, company and location. A "Title, Company" line was being taken for a "City, Country" location.
- CVForge suggestions: "Undo decision" now mounts as its own button instead of reusing the Accept button's element, which briefly faded from green through unreadable colours after a decision (caught by the accessibility scan in the journey e2e test, which failed intermittently in CI on main).
- CVForge resume extraction (reported 2026-11-06 with a real three-page PDF resume): PDF lines that wrap are rejoined using the page layout, so a wrapped bullet no longer becomes a new job, project or custom item; column gaps (title ↔ dates, company ↔ location) are kept as tabs; an ALL-CAPS name or headline is no longer read as a section, so Personal information fills in; skills are split only outside brackets and inherit their category across wrapped lines; experience, project and education entries are anchored on their date lines with the description paragraph kept as the entry's first bullet; education reads degree, field, grade and Indian school certificates (HSC/SSC, Class XII); "Key Achievement" is recognised; a "Personal Details" block fills Personal information and Languages; hyperlink targets are read from DOCX and PDF links, and a link label without an address is flagged instead of invented; over-long text no longer fails the upload. Word's private-use bullet glyphs are recognised. Bullet boxes in the editor size to their text.

### Security

- CVForge: Word documents are parsed by mammoth in a worker thread with a 20 s timeout and a 256 MB heap cap (research R8, risk K-07). Since Sprint 3, PDFs are parsed by pdf.js in the same kind of worker (research R17).
- CVForge: SMTP requires TLS by default and never logs message bodies or credentials; confirmation and reset tokens are stored only as hashes.

- CVForge extension: `storage.local` and `storage.session` restricted to trusted extension contexts, so content scripts cannot read the refresh token (research R4).
- pdf.js: confirmed the installed 6.5.438 is not affected by GHSA-wgrm-67xf-hhpq; the `isEvalSupported` option no longer exists (research R9 corrected).
