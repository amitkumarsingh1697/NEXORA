# Implementation status

This is the single tracker required by spec §19.

- **Per-requirement detail:** [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md), which is authoritative for every requirement ID.
- **Status words:** defined in CLAUDE.md §4. "Tested" means the tests ran and passed in the run recorded below. "Verified" (real environments) is tracked in [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Last evidence run

**Date:** 2026-11-09, in the build container, for the universal language and file-type work (LANG-01 to LANG-08).

**Environment:**

- Node 22.23.4, pnpm 10.28.0, PostgreSQL 16
- No Ollama; no Docker daemon

| Command                                    | Result                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                        | clean (2026-11-09)                                                                                |
| `pnpm check` (typecheck, lint, tests)      | pass: 507 tests (2026-11-09)                                                                      |
| `node skills/archlens/scripts/check.mjs`   | pass (2026-11-09)                                                                                 |
| `pnpm --filter @nexora/codeatlas-web e2e`  | 1 passed, including axe scans and the Languages & files sections (2026-11-09)                     |
| `pnpm --filter @nexora/cvforge-web e2e`    | 4 passed (2026-11-04, end of Sprint 3; CVForge unchanged since)                                   |
| `pnpm audit --prod`                        | no known vulnerabilities (2026-11-04)                                                             |
| Validation harness, 23 public repositories | every inventory equals `git ls-files`; see `reports/LANGUAGE_COVERAGE_VALIDATION.md` (2026-11-09) |

Test counts by package:

| Package           | Tests |
| ----------------- | ----- |
| validation        | 4     |
| logging           | 1     |
| ai                | 11    |
| brain             | 45    |
| languages         | 106   |
| cvforge-core      | 72    |
| cvforge-extension | 16    |
| cvforge-backend   | 42    |
| codeatlas-core    | 179   |
| codeatlas-service | 31    |

## Requirement status summary

Counts are taken from REQUIREMENTS_TRACEABILITY.md.

| Area                                                   | Tested | Implemented (no test) | In progress | Not started | Blocked |
| ------------------------------------------------------ | -----: | --------------------: | ----------: | ----------: | ------: |
| CVForge (RI-*)                                         |     44 |                     2 |           1 |           0 |       0 |
| CodeAtlas (AB-*)                                       |     47 |                     0 |           0 |           0 |       0 |
| Languages and file types (LANG-*)                      |      7 |                     0 |           1 |           0 |       0 |
| Cross-cutting (AI, SEC, UX, DATA, COST, PERF, DOC, SK) |     14 |                     4 |           0 |           1 |       0 |

**Verification blocked by environment**, so these items are not counted as "verified":

- real Ollama model quality
- live LinkedIn and Naukri pages

## Sprint status

| Sprint                                            | Status              | Evidence                                                                                                                                           |
| ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline (spec phases 0–11, built 2026-11-02)     | Built               | Phase reports in the project thread; tests above                                                                                                   |
| Sprint 0: governance and research                 | **Done** 2026-11-03 | The 10 governance files exist; 12 sourced research entries; every spec requirement has an ID and status; ArchLens check passes; `pnpm check` green |
| Sprint 1: spec compliance and security findings   | **Done** 2026-11-03 | All 8 items; evidence below and in REQUIREMENTS_TRACEABILITY                                                                                       |
| Sprint 2: product surface and robustness          | **Done** 2026-11-03 | All 7 items; evidence below, in REQUIREMENTS_TRACEABILITY and in `reports/SPRINT_2_REPORT.md`                                                      |
| Sprint 3: CodeAtlas depth, plus CVForge hardening | **Done** 2026-11-04 | All 7 items plus PDF isolation, optional SMTP and email confirmation; evidence below and in `reports/SPRINT_3_REPORT.md`                           |

## Sprint 1 items

| Item                                    | Status                   | Evidence                                                                                                                                                          |
| --------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 Approval records and local merge   | tested                   | `investigate.test.ts` (approval records, failed-validation gate, 6 refusal cases, merge success), `migration.test.ts`, `investigations.test.ts`, CodeAtlas E2E    |
| S1-2 Branch, revision, manifests        | tested                   | `indexer.test.ts`, `chat.test.ts` revision tests, E2E                                                                                                             |
| S1-3 Public clone                       | tested                   | `core/test/clone.test.ts`, `service/test/clone.test.ts`, E2E refusal; one real GitHub clone run manually (R13)                                                    |
| S1-4 Cycles and sensitive configuration | tested                   | `indexer.test.ts` "circular dependencies (S1-4)", E2E                                                                                                             |
| S1-5 Extension storage access level     | tested                   | `storage-access.test.ts`, extension E2E (negative run confirmed the test detects the gap)                                                                         |
| S1-6 pdf.js hardening                   | resolved, no code change | The planned `isEvalSupported:false` option does not exist in pdf.js 6.5.438 (typecheck failed). The package has no eval font path; R9 corrected. Parse tests pass |
| S1-7 Restart survival test              | tested                   | `service/test/restart.test.ts`                                                                                                                                    |
| S1-8 Prompt-injection test              | tested                   | `chat.test.ts` "prompt injection in repository content (S1-8)"                                                                                                    |

## Sprint 2 items

| Item                                        | Status | Evidence                                                                                                                                       |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 Analytics, feedback, settings, welcome | tested | `ca/core/test/analytics.test.ts`, `ca/service/test/analytics.test.ts`, `investigations.test.ts` analytics assertions, CodeAtlas E2E            |
| S2-2 Job comparison                         | tested | `cv/core/__tests__/compare.test.ts`, `cv/be/__tests__/compare.test.ts`, CVForge E2E comparison step                                            |
| S2-3 Formatting diffs                       | tested | `versioning.test.ts` formatting cases, `cv/be/__tests__/formatting.test.ts`                                                                    |
| S2-4 Word parser isolation                  | tested | `isolate.test.ts` (normal, timeout with event-loop probe, heap cap, corrupt); CVForge E2E uploads a DOCX through the production Next.js server |
| S2-5 Accessibility scans                    | tested | `e2e/a11y.ts` in both suites; 5 serious issues found and fixed (contrast in both palettes, link styling, logo label)                           |
| S2-6 Cancellation and failure safety        | tested | `ca/service/test/jobs.test.ts`, `indexer.test.ts` "failure safety (S2-6)"                                                                      |
| S2-7 User guide and test report             | done   | `product/USER_GUIDE.md`, `testing/TEST_REPORT.md`                                                                                              |

## Sprint 3 items

| Item                                                                                                                                                                                   | Status      | Evidence                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 `LanguageAdapter` interface                                                                                                                                                       | tested      | `adapters.ts`; `indexer.test.ts`; Overview lists adapters and unsupported languages (E2E)                                                                                                                                                                                               |
| S3-2 Tree and language filter                                                                                                                                                          | tested      | `query/tree.ts`, `Structure.tsx`; `indexer.test.ts` tree section; service tests; E2E expand/collapse and filter with axe scans                                                                                                                                                          |
| S3-3 Service calls and database access                                                                                                                                                 | tested      | `integrations.ts`; `indexer.test.ts` "integrations"; E2E Integrations tab                                                                                                                                                                                                               |
| S3-4 Incremental indexing                                                                                                                                                              | tested      | `ts-cache.ts`; `incremental.test.ts` (each scenario compared with a fresh full index); `migration.test.ts` v4→v5; equality on this repo and hono                                                                                                                                        |
| S3-5 Module documentation                                                                                                                                                              | tested      | `moduledoc.ts`, `moduleprose.ts`; `moduledoc.test.ts`; 2 service tests; E2E                                                                                                                                                                                                             |
| S3-6 Benchmarks                                                                                                                                                                        | done        | `testing/BENCHMARKS.md` (measured 2026-11-04)                                                                                                                                                                                                                                           |
| S3-7 Configuration references                                                                                                                                                          | tested      | `integrations.ts`; `indexer.test.ts` "integrations"                                                                                                                                                                                                                                     |
| CVForge: PDF parsing isolation (risk K-07)                                                                                                                                             | tested      | `isolate.ts` `runPdfIsolated`; `isolate.test.ts` (4 PDF cases: text, timeout, heap cap, corrupt); CVForge E2E                                                                                                                                                                           |
| CVForge: resume extraction fixes (layout-aware PDF line joining, entry segmentation, bracket-aware skills, personal details, education fields)                                         | tested      | `parse-layouts.test.ts` (9 cases incl. a layout replica of the reported resume, a DOCX and its PDF export, pdftotext output); E2E `resume-extraction.spec.ts`; `pnpm check` and CVForge E2E passed 2026-11-07. Verified manually by uploading the reported resume to a production build |
| CVForge: optional SMTP mail                                                                                                                                                            | tested      | `lib/mail.ts` `SmtpMailer`, `factory.ts` `createMailer`; `smtp-mailer.test.ts` against a local SMTP server (auth, delivery, TLS required, config validation)                                                                                                                            |
| Architecture brain: shared package and 3D viewer (BRAIN-01..03)                                                                                                                        | tested      | `packages/brain`; `brain.test.ts` (30 cases); CodeAtlas E2E (2026-11-08)                                                                                                                                                                                                                |
| Architecture brain in CodeAtlas: Brain tab, API, CLI, method inputs and outputs (BRAIN-02, BRAIN-04)                                                                                   | tested      | `query/brain.ts`, `Brain.tsx`; `core/test/brain.test.ts`, `service.test.ts`, E2E (2026-11-08)                                                                                                                                                                                           |
| Architecture brain from ArchLens (BRAIN-05)                                                                                                                                            | implemented | `skills/archlens` §6; renderer tested; not run in a live Claude Code session                                                                                                                                                                                                            |
| Database tables, columns and table links in the brain (BRAIN-06, BRAIN-07)                                                                                                             | tested      | `indexer/schema.ts`; `schema.test.ts`, `schema-index.test.ts`, E2E (2026-11-08)                                                                                                                                                                                                         |
| ER, schema and class diagrams (BRAIN-08)                                                                                                                                               | tested      | `packages/brain` `diagrams.ts`, `diagram-panel.ts`; `brain.test.ts`, E2E (2026-11-08)                                                                                                                                                                                                   |
| Brain coverage disclosure, UI-package lobe placement, renderer guardrails (BRAIN-09)                                                                                                   | tested      | `brain-coverage.test.ts`, `brain.test.ts`; `pnpm check` and CodeAtlas E2E green 2026-11-08; regression on Keycloak `d4d5554` and Kubernetes `896c5b4`                                                                                                                                   |
| Universal language and file-type support: shared registry, per-file inventory, seven statuses, declaration patterns, format parsers, Languages & files dashboards (LANG-01 to LANG-07) | tested      | `packages/languages`; `languages.test.ts` (106 in the package), `language-coverage.test.ts`, `declarations.test.ts`, `brain.test.ts`, `service.test.ts`, E2E; validation on 23 repositories (2026-11-09)                                                                                |
| No performance regression (LANG-08)                                                                                                                                                    | in progress | Index time +21% on Keycloak and +54% on Kubernetes against `2228a64` on the same machine; smaller repositories add tens to a few hundred milliseconds. See `reports/LANGUAGE_COVERAGE_VALIDATION.md`                                                                                    |
| CVForge: email confirmation (risk S-03)                                                                                                                                                | tested      | `services/auth.ts` `verifyEmail`/`resendVerification`/`assertEmailVerified`, migration `0001_email_verification.sql`; `email-verification.test.ts` (5); E2E `verify-email.spec.ts`                                                                                                      |
| Licence                                                                                                                                                                                | done        | Apache-2.0 (`LICENSE`), `license` field in every package                                                                                                                                                                                                                                |

## Repository

| Item                       | Status                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Git commits and push       | Sprints 0–2 merged to `main` via PRs #1 and #2; Sprint 3 on branch `claude/sprint-3` (2026-11-04) |
| Remote repository location | github.com/amitkumarsingh1697/NEXORA (public)                                                     |
