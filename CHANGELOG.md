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
- Infrastructure: docker compose (Postgres, optional Ollama), DB init SQL, native Postgres setup script, `.env.example` files, CI workflow (not yet run).
- Documentation set, ADRs 0001–0008, ArchLens skill draft.
- Governance (Sprint 0): CLAUDE.md, master specification extract, research log, sprint plan, requirements traceability, definition of done, AI engineering rules, security threat model, risk register, release readiness, implementation status; ADRs 0009–0011. ArchLens packaged as a separate skill with references and a checker.
- CodeAtlas (Sprint 1): approval and rejection records with identity and validation state; structured bug report; human-triggered fast-forward local merge with re-verification and typed hash confirmation (ADR 0010); schema v3 with migration; branch, dirty flag, manifest and declared-framework inventory; index revision on every chat citation; file- and module-level cycle detection (Tarjan); potentially-sensitive-configuration findings; public https clone with host and DNS checks; restart and prompt-injection tests.

### Security

- CVForge extension: `storage.local` and `storage.session` restricted to trusted extension contexts, so content scripts cannot read the refresh token (research R4).
- pdf.js: confirmed the installed 6.5.438 is not affected by GHSA-wgrm-67xf-hhpq; the `isEvalSupported` option no longer exists (research R9 corrected).
