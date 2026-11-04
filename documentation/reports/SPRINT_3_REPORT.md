# Sprint 3 report: CodeAtlas depth and CVForge hardening

Dates: 2026-11-03 to 2026-11-04. Branch `claude/sprint-3`.

## What was built

| Item                                    | Requirements         | Summary                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S3-1 Language adapters                  | AB-5.3-06            | `LanguageAdapter` interface; the TypeScript/JavaScript indexer is the one adapter. The coverage report lists adapters and the languages found but not supported. No new language is claimed.                                                                                               |
| S3-2 Structure tree and language filter | AB-5.5-03, AB-5.5-04 | Structure tab: module → file → symbol → member, loaded one level at a time (`/tree`). Language filter on Structure, Dependencies and Search.                                                                                                                                               |
| S3-3 Service and database links         | AB-5.6-05            | `fetch` and axios-style clients become `calls_service` edges to `http:<host>`; pg, drizzle, prisma and similar clients become `accesses_db` edges. All inferred, with evidence lines. Integrations tab.                                                                                    |
| S3-4 Incremental indexing               | AB-5.7-03, PERF-12   | Per-file cache (schema v5, `index_cache`). Re-analyses changed files, their dependants and, when needed, everything. Falls back to full when configuration, lockfiles or the file set change. Every test scenario is compared with a fresh full index.                                     |
| S3-5 Module documentation               | AB-5.8-05            | Deterministic page per module with citations, Markdown download, optional grounded model overview.                                                                                                                                                                                         |
| S3-6 Benchmarks                         | PERF-12-03           | `documentation/testing/BENCHMARKS.md`: this repository and hono, cold, no-op, changed-file and full runs, peak memory.                                                                                                                                                                     |
| S3-7 Configuration references           | AB-5.3-05            | `process.env` reads and writes, computed names (unresolved), config-file reads and `dotenv/config`.                                                                                                                                                                                        |
| CVForge PDF isolation                   | risk K-07, SEC-7-03  | pdf.js runs in the same worker as mammoth: 20 s timeout, 256 MB heap cap.                                                                                                                                                                                                                  |
| CVForge SMTP (optional)                 | SEC-7-01             | `SmtpMailer` (nodemailer 10.1.7, MIT-0). TLS required by default. No message bodies or credentials logged. The outbox remains the default, so no paid service is needed.                                                                                                                   |
| CVForge email confirmation              | risk S-03, SEC-7-01  | Link sent at signup (24 h, single use, hashed). Resend from Settings (5 per hour). `/verify-email` needs a click, so link scanners cannot confirm. `REQUIRE_EMAIL_VERIFICATION=true` blocks uploads and AI suggestions until confirmed. Expired tokens are removed by the retention sweep. |
| Licence                                 | —                    | Apache-2.0, SECURITY.md, CONTRIBUTING.md; dependency licences reviewed (research R15).                                                                                                                                                                                                     |

## Files changed (main ones)

- **CodeAtlas core:**
  - `indexer/adapters.ts`, `indexer/integrations.ts`, `indexer/ts-cache.ts`, `indexer/ts-indexer.ts`, `indexer/model.ts`, `indexer/index.ts`
  - `store/db.ts` (v5)
  - `query/tree.ts`, `query/moduledoc.ts`, `query/views.ts`, `query/search.ts`
  - `chat/moduleprose.ts`
  - `scripts/benchmark.ts`
- **CodeAtlas service:** `server.ts`, `routes/chat.ts`.
- **CodeAtlas web:**
  - new pages `Structure.tsx`, `Integrations.tsx`, `ModuleDocs.tsx`
  - changes to `Overview`, `Views`, `Ask`, `tabs.tsx`
- **CVForge core:** `resume/isolate.ts`, `resume/extract.ts`.
- **CVForge backend:**
  - `lib/mail.ts`, `config.ts`, `factory.ts`, `db/schema.ts`
  - migration `0001_email_verification.sql`
  - services `auth.ts`, `resumes.ts`, `suggestions.ts`, `maintenance.ts`, `audit.ts`
- **CVForge web:**
  - `api/auth/verify`, `api/auth/verify/resend`
  - `(auth)/verify-email`
  - Settings banner
  - `next.config.ts`
- **Tests:**
  - new: `incremental.test.ts`, `moduledoc.test.ts`, `email-verification.test.ts`, `smtp-mailer.test.ts`, `e2e/verify-email.spec.ts`
  - extended: `indexer.test.ts`, `migration.test.ts`, the service tests, `isolate.test.ts`, `auth.test.ts`, `maintenance.test.ts`, both E2E journeys
- **Docs:**
  - the governance set
  - API reference, database schema, user guide, known limitations, local development
  - BENCHMARKS, TEST_REPORT, CHANGELOG

## Tests actually executed (2026-11-04)

| Command                                              | Result                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (typecheck, lint, all vitest suites)    | pass, 303 tests (codeatlas-core 138, codeatlas-service 29, cvforge-core 62, cvforge-backend 42, cvforge-extension 16, ai 11, validation 4, logging 1) |
| `pnpm format:check`                                  | clean                                                                                                                                                 |
| `pnpm --filter @nexora/cvforge-web e2e`              | 4 passed (journey, unauthenticated access, extension, email confirmation), axe scans of 13 screens                                                    |
| `pnpm --filter @nexora/codeatlas-web build && … e2e` | 1 passed, axe scans of 12 screens                                                                                                                     |
| `pnpm audit --prod`                                  | no known vulnerabilities                                                                                                                              |
| `node skills/archlens/scripts/check.mjs`             | pass                                                                                                                                                  |
| `node scripts/test-report.mjs`                       | TEST_REPORT.md regenerated: 303 tests, 0 failed                                                                                                       |
| Benchmark script on this repo and hono               | graphs of incremental and full runs identical (BENCHMARKS.md)                                                                                         |

## Defects found and fixed during the sprint

- **Overload doc comments:** the doc comment of an overloaded method was overwritten with `undefined` in full runs but kept by cached replays, so the two modes differed on hono. Merges now ignore undefined values. Regression test added.
- **Declaration-file changes:** a changed `.d.ts` file was not noticed, because discovery skips declaration files. Hashes of such dependencies are now stored and compared.
- **Accessibility:**
  - The ARIA tree pattern produced label mismatches; replaced with a disclosure list.
  - The primary-button hover lowered contrast; it now uses a brightness change.
- **PDF heap-cap test:** a 2 MB cap crashed the test runner itself, so the test uses 8 MB (production uses 256 MB).

## Known gaps, unverified items and security concerns

- **No real model run.** Ollama was unavailable, so CVForge phrasing, CodeAtlas chat, model patches and module overviews are tested with fake providers only.
- **No live job sites.** LinkedIn and Naukri extraction is fixture-tested; the live checklist is in RELEASE_READINESS.
- **SMTP:** tested against a local SMTP server in the test, not a real provider. Bot protection (CAPTCHA) is still missing, and users cannot change their email address yet.
- **Incremental indexing:**
  - A change to a widely imported file re-analyses most of the repository.
  - Project references and path plugins are untested.
- **Integration links are heuristics:** dynamic URLs are grouped, and clients created inside functions are missed.
- **Legal:** the licence review (R15) is not legal advice, and the privacy notice still needs legal review.

## Remaining work and recommended next step

All planned sprint items are done. What stands between the code and a public release is outside this build environment:

1. Real-model evaluation with Ollama.
2. Manual checks of the extension on live sites in Chrome and Edge.
3. Legal review of the privacy notice.
4. For a hosted CVForge: choose hosting, Postgres and an SMTP provider (each a cost decision for the founder).
5. Optionally, a tagged 0.1.0 release with release notes once those checks pass.
