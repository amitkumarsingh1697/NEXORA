# Sprint 1 report: spec compliance and security findings

**Date:** 2026-11-03. **Status:** done. Nothing was committed or pushed, by instruction.

## What was built

| Item                                    | Requirement IDs                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 Approval records and local merge   | AB-5.9-02, AB-5.9-07, AB-5.10-01, AB-5.10-02 | Each approve or reject is recorded with who decided (the OS user name), the patch hash, the base commit, the validation state and the run IDs. If the latest checks failed, approval needs an explicit acknowledgement. There is a structured bug report covering evidence, inferred root cause, validation, risks, rollback and limitations. A human-triggered, fast-forward-only merge re-checks the approval, branch tip, single commit on the base, the committed diff hash, HEAD and a clean tree, and the user must type the hash prefix (ADR 0010). Schema v3 adds `inv_approvals` and `inv_merges`, with a migration. |
| S1-2 Branch, revision, manifests        | AB-5.3-02, AB-5.3-03, AB-5.4-02, AB-5.8-02   | Coverage records the branch, HEAD and how many files have uncommitted changes. It also lists manifests (package, tsconfig, lockfile, container, CI, build config) and frameworks declared in package.json, labelled observed. Every chat citation carries the commit it was indexed at, with a warning when the index came from a dirty tree or a folder without git.                                                                                                                                                                                                                                                         |
| S1-3 Public clone                       | AB-5.2-03, SEC-7-04                          | `POST /api/repos/clone` and a form on the Repos page. Only https is allowed. Host names and every resolved address are checked against loopback, private, link-local, CGNAT and metadata ranges. Global and system git config is ignored, so no credential helper or URL rewrites apply. Other rules: no prompts, a protocol allowlist, redirects off, hooks off, no submodules, a 10-minute timeout, and clones go under `$CODEATLAS_HOME/clones`.                                                                                                                                                                           |
| S1-4 Cycles and sensitive configuration | AB-5.6-02, AB-5.6-07                         | Iterative Tarjan strongly-connected components at file and module level. Each cycle shows its import statements, and cycles made only of type-only imports are marked. Files that look like credentials appear as "potentially sensitive configuration" by path only. Both show on the Modules and Risk pages.                                                                                                                                                                                                                                                                                                                |
| S1-5 Extension storage                  | RI-4.11-05                                   | `storage.local` and `storage.session` are restricted to trusted extension contexts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S1-6 pdf.js hardening                   | research R9                                  | No code change needed. The planned `isEvalSupported:false` option does not exist in the installed pdf.js 6.5.438: typecheck rejected it, and the package has no eval font path. R9 is corrected and the sprint criterion revised.                                                                                                                                                                                                                                                                                                                                                                                             |
| S1-7 Restart survival                   | DATA-9-01                                    | A service test indexes a repo, stops the service and starts a new one on the same home. Repos, views, search and the investigation come back identical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S1-8 Prompt injection                   | AB-5.8-04                                    | A repository file tells the model to cite S9 and call the code safe. The test confirms that the text stays inside the Sources section, the fabricated citation is stripped and the answer is downgraded to low confidence.                                                                                                                                                                                                                                                                                                                                                                                                    |

## Files changed (main ones)

| Area                 | Files                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CodeAtlas core       | `investigate/workflow.ts`, `store/db.ts`, `indexer/git.ts`, `indexer/index.ts`, new `indexer/manifests.ts`, `chat/retrieve.ts`, `chat/answer.ts`, new `query/cycles.ts`, `query/views.ts`, new `clone/clone.ts`, `index.ts`                                      |
| CodeAtlas core tests | `investigate.test.ts`, `indexer.test.ts`, `chat.test.ts`, `fixture.ts`, new `migration.test.ts`, new `clone.test.ts`                                                                                                                                             |
| CodeAtlas service    | `routes/investigations.ts` (merge route, 409 codes, detail fields), `server.ts` (clone route), tests `investigations.test.ts`, new `restart.test.ts`, new `clone.test.ts`, `helpers.ts`                                                                          |
| CodeAtlas web        | `Investigate.tsx` (decisions, failed-validation acknowledgement, merge card), `Overview.tsx`, `Ask.tsx`, `Views.tsx`, `Repos.tsx`, `types.ts`, `e2e/codeatlas.spec.ts`, `package.json` (E2E now builds the UI first)                                             |
| CVForge              | `core/src/resume/extract.ts`, `extension/src/storage-access.ts`, `extension/entrypoints/background.ts`, popup `App.tsx`, `web/e2e/extension.spec.ts`                                                                                                             |
| Docs                 | Traceability, implementation status, release readiness, risk register (S-04 mitigated, S-08 added), threat model (A6, A11–A14 updated, A16 added), research (R9 corrected, R13 added), sprint plan, API reference, database schema, known limitations, changelog |

## Tests actually executed (2026-11-03)

| Command                                                                  | Result                                                                                                                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (typecheck, lint, all unit and integration tests)           | exit 0, **234 tests** passed. By package: validation 4, logging 1, ai 11, cvforge-core 49, cvforge-extension 16, cvforge-backend 29, codeatlas-core 103, codeatlas-service 21      |
| `pnpm format:check`                                                      | clean                                                                                                                                                                              |
| `pnpm --filter @nexora/cvforge-web e2e`                                  | 3 passed                                                                                                                                                                           |
| `pnpm --filter @nexora/codeatlas-web e2e`                                | 1 passed: clone refusal, branch and manifests, cycle finding, revision in Ask, a rejected patch, an approved patch, commit, merge with typed prefix, file changed in the main tree |
| `pnpm audit --prod`                                                      | no known vulnerabilities                                                                                                                                                           |
| `node skills/archlens/scripts/check.mjs`                                 | pass                                                                                                                                                                               |
| Manual: real clone of `https://github.com/sindresorhus/is-plain-obj.git` | succeeded in 0.8 s through the container proxy                                                                                                                                     |

## Defects found and fixed during the sprint

- An IPv6-mapped loopback address (`::ffff:127.0.0.1`) passed the clone host check, because URL parsing rewrites it to `::ffff:7f00:1`. A unit test caught it, and the check is fixed.
- The CodeAtlas E2E was silently testing a stale UI build. Its script now builds first.
- The pdf.js option scheduled in research did not exist in the installed version.
- The extension E2E typed `chrome.scripting` loosely, so typecheck failed.

## Known gaps, unverified items and security concerns

- **DNS rebinding (threat A16, risk S-08).** Addresses are checked before git resolves the host again. This is accepted for a local single-user tool.
- **No clone size cap.** Only a timeout. The clone request also waits for the download to finish.
- **`http.followRedirects=false`** has not been exercised against a redirecting host.
- **Merges are fast-forward only.** If the user's branch moved since the investigation started, they must start a new investigation.
- **Still not verified in real environments:** live LinkedIn and Naukri pages, real Ollama output quality, and the CI run.
- **Verdict is still not release-ready.** Local merge is now met. Live job-board verification is still unmet.

## Remaining work and recommended next sprint

Sprint 2 covers product surface and robustness:

- S2-1 analytics, feedback, onboarding and settings screens
- S2-2 job comparison test
- S2-3 formatting diffs
- S2-4 mammoth parser in a worker with a timeout (research R8)
- S2-5 axe accessibility checks
- S2-6 indexing cancellation and failure safety
- S2-7 user guide and test report

I recommend starting with S2-4 and S2-6, because both close known denial-of-service paths.
