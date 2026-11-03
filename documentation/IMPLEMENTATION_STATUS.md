# Implementation status

This is the single tracker required by spec §19.

- **Per-requirement detail:** [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md), which is authoritative for every requirement ID.
- **Status words:** defined in CLAUDE.md §4. "Tested" means the tests ran and passed in the run recorded below. "Verified" (real environments) is tracked in [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Last evidence run

**Date:** 2026-11-03, in the build container, at the end of Sprint 2.

**Environment:**

- Node 22.23.4, pnpm 10.28.0, PostgreSQL 16, LibreOffice 24.2.7.2
- No Ollama; no Docker daemon

| Command                                   | Result                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm format:check`                       | clean                                                                     |
| `pnpm check` (typecheck, lint, tests)     | pass: 258 tests                                                           |
| `node skills/archlens/scripts/check.mjs`  | pass                                                                      |
| `pnpm --filter @nexora/cvforge-web e2e`   | 3 passed, including axe scans of 11 screens (2026-11-03, end of Sprint 2) |
| `pnpm --filter @nexora/codeatlas-web e2e` | 1 passed, including axe scans of 9 screens (2026-11-03, end of Sprint 2)  |
| `pnpm audit --prod`                       | no known vulnerabilities (2026-11-03)                                     |
| GitHub Actions CI on `main`               | green after PR #1 (2026-11-03)                                            |

Test counts by package:

| Package           | Tests |
| ----------------- | ----- |
| validation        | 4     |
| logging           | 1     |
| ai                | 11    |
| cvforge-core      | 58    |
| cvforge-extension | 16    |
| cvforge-backend   | 34    |
| codeatlas-core    | 108   |
| codeatlas-service | 26    |

## Requirement status summary

Counts are taken from REQUIREMENTS_TRACEABILITY.md.

| Area                                                   | Tested | Implemented (no test) | In progress | Not started | Blocked |
| ------------------------------------------------------ | -----: | --------------------: | ----------: | ----------: | ------: |
| CVForge (RI-*)                                         |     44 |                     2 |           1 |           0 |       0 |
| CodeAtlas (AB-*)                                       |     40 |                     0 |           2 |           5 |       0 |
| Cross-cutting (AI, SEC, UX, DATA, COST, PERF, DOC, SK) |     13 |                     5 |           0 |           2 |       0 |

**Verification blocked by environment**, so these items are not counted as "verified":

- real Ollama model quality
- live LinkedIn and Naukri pages

## Sprint status

| Sprint                                          | Status              | Evidence                                                                                                                                           |
| ----------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline (spec phases 0–11, built 2026-11-02)   | Built               | Phase reports in the project thread; tests above                                                                                                   |
| Sprint 0: governance and research               | **Done** 2026-11-03 | The 10 governance files exist; 12 sourced research entries; every spec requirement has an ID and status; ArchLens check passes; `pnpm check` green |
| Sprint 1: spec compliance and security findings | **Done** 2026-11-03 | All 8 items; evidence below and in REQUIREMENTS_TRACEABILITY                                                                                       |
| Sprint 2: product surface and robustness        | **Done** 2026-11-03 | All 7 items; evidence below, in REQUIREMENTS_TRACEABILITY and in `reports/SPRINT_2_REPORT.md`                                                      |
| Sprint 3: CodeAtlas depth                       | Not started         |                                                                                                                                                    |

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

## Repository

| Item                       | Status                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Git commits and push       | Sprints 0–1 merged to `main` via PR #1; Sprint 2 on branch `claude/sprint-2` (2026-11-03) |
| Remote repository location | github.com/amitkumarsingh1697/NEXORA (public)                                             |
