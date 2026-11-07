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

### Changed

- CodeAtlas runs left `running` by a crash are marked failed at startup. Sprint 3: parsed source files are shared across tsconfig programs, cutting a cold index of this repository from 22 s to 13 s; a doc comment on overloaded methods is no longer lost. Light-theme colours for "observed" and "inferred" darkened to meet contrast. CVForge inline links are underlined and decided suggestions are no longer dimmed.

### Fixed

- CVForge resume extraction (reported 2026-11-06 with a real three-page PDF resume): PDF lines that wrap are rejoined using the page layout, so a wrapped bullet no longer becomes a new job, project or custom item; column gaps (title ↔ dates, company ↔ location) are kept as tabs; an ALL-CAPS name or headline is no longer read as a section, so Personal information fills in; skills are split only outside brackets and inherit their category across wrapped lines; experience, project and education entries are anchored on their date lines with the description paragraph kept as the entry's first bullet; education reads degree, field, grade and Indian school certificates (HSC/SSC, Class XII); "Key Achievement" is recognised; a "Personal Details" block fills Personal information and Languages; hyperlink targets are read from DOCX and PDF links, and a link label without an address is flagged instead of invented; over-long text no longer fails the upload. Word's private-use bullet glyphs are recognised. Bullet boxes in the editor size to their text.

### Security

- CVForge: Word documents are parsed by mammoth in a worker thread with a 20 s timeout and a 256 MB heap cap (research R8, risk K-07). Since Sprint 3, PDFs are parsed by pdf.js in the same kind of worker (research R17).
- CVForge: SMTP requires TLS by default and never logs message bodies or credentials; confirmation and reset tokens are stored only as hashes.

- CVForge extension: `storage.local` and `storage.session` restricted to trusted extension contexts, so content scripts cannot read the refresh token (research R4).
- pdf.js: confirmed the installed 6.5.438 is not affected by GHSA-wgrm-67xf-hhpq; the `isEvalSupported` option no longer exists (research R9 corrected).
