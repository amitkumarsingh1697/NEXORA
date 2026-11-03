# Release readiness

This file maps spec §17 (final acceptance criteria) and §11 (testing) to evidence. Each criterion is marked:

- **met (tested):** an automated test passed in the last full run.
- **met (verified):** checked manually in a real environment.
- **not met:** with the gap or sprint item that closes it.

**Current verdict: not release-ready.** Neither product may be labelled production-ready (spec §13 Phase 11). Open items are listed below.

Last evidence run: see the table at the top of [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## CVForge (Resume Intelligence) v1 criteria

| Criterion (spec §17)                                       | Evidence                                                              | Result                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Create an account                                          | `auth.test.ts`, `journey.spec.ts`                                     | met (tested)                                                        |
| Upload and review a resume                                 | `journey.test.ts`, `journey.spec.ts`                                  | met (tested)                                                        |
| Original content preserved                                 | `journey.test.ts` (sha256 unchanged)                                  | met (tested)                                                        |
| Job description analysed; requirements extracted           | `analysis.test.ts`, `journey.test.ts`                                 | met (tested)                                                        |
| Evidence classified correctly                              | `analysis.test.ts` (state rules); DB check constraints                | met (tested) on fixtures; accuracy on real resumes unmeasured       |
| Clarification questions work                               | `journey.test.ts`, E2E                                                | met (tested)                                                        |
| Career-stage-aware scores are explainable                  | `analysis.test.ts`                                                    | met (tested)                                                        |
| Suggestions individually accepted or rejected              | `journey.test.ts`, E2E                                                | met (tested)                                                        |
| New immutable versions created                             | `versioning.test.ts`, `journey.test.ts`                               | met (tested)                                                        |
| Version comparisons work                                   | `journey.test.ts`, E2E                                                | met (tested)                                                        |
| DOCX and PDF exports work                                  | `export.test.ts`, `journey.test.ts`, E2E                              | met (tested)                                                        |
| Extension pairing works                                    | `extension-privacy.test.ts`, `extension.spec.ts`                      | met (tested)                                                        |
| LinkedIn and Naukri extraction have tested supported paths | `extract.test.ts` (fixtures)                                          | **not met:** fixture-tested only; live verification checklist below |
| Manual paste remains available                             | `journey.spec.ts` (paste path)                                        | met (tested)                                                        |
| Data protected; deletion works                             | `journey.test.ts` (isolation), `extension-privacy.test.ts` (deletion) | met (tested)                                                        |
| Automated tests pass                                       | `pnpm check`, CVForge E2E                                             | met (tested)                                                        |

## CodeAtlas (Architecture Brain) v1 criteria

| Criterion (spec §17)                                          | Evidence                                                                                                                | Result                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Select a local repository                                     | `service.test.ts`, E2E                                                                                                  | met (tested)                                                        |
| Repository indexed; TS/JS symbols and relationships extracted | `indexer.test.ts`                                                                                                       | met (tested)                                                        |
| Coverage and parser limitations visible                       | `indexer.test.ts`, E2E                                                                                                  | met (tested)                                                        |
| Architecture navigation and dependency exploration            | E2E                                                                                                                     | met (tested)                                                        |
| Search works                                                  | `indexer.test.ts`, E2E                                                                                                  | met (tested)                                                        |
| Chat answers cite source evidence                             | `chat.test.ts` (fake model), E2E                                                                                        | met (tested) with a fake model; **real model unverified** (blocked) |
| Observed / inferred / unknown visible                         | `indexer.test.ts`, E2E                                                                                                  | met (tested)                                                        |
| Potential bugs investigated                                   | `investigate.test.ts`, E2E                                                                                              | met (tested)                                                        |
| Patches created in isolation                                  | `investigate.test.ts`                                                                                                   | met (tested)                                                        |
| Tests and validation run                                      | `investigate.test.ts`, E2E                                                                                              | met (tested)                                                        |
| Diffs reviewable; approval required; patch hash verified      | `investigate.test.ts`, E2E                                                                                              | met (tested)                                                        |
| Only approved changes can be merged locally                   | `investigate.test.ts` merge refusal and success tests; `investigations.test.ts`; CodeAtlas E2E (reject, approve, merge) | **met** (tested 2026-11-03; ADR 0010)                               |
| Repository content stays local by default                     | Consent gate `ai.test.ts`; no telemetry code                                                                            | met (tested)                                                        |
| Automated tests pass                                          | `pnpm check`, CodeAtlas E2E                                                                                             | met (tested)                                                        |

## Release quality checklist (spec §17)

| Item                                        | Status                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Full test suite, lint and type checks       | met (see IMPLEMENTATION_STATUS)                                                                   |
| Build all applications                      | CodeAtlas web build and CVForge Next build run inside the E2E suites; the extension builds in E2E |
| All critical journeys verified              | Automated journeys pass; live-site and real-model checks outstanding                              |
| Authorisation boundaries reviewed           | SECURITY_THREAT_MODEL C3, C4, A1–A4                                                               |
| Data handling reviewed                      | PRIVACY_AND_DATA_HANDLING; legal review outstanding (P-02)                                        |
| Dependency vulnerabilities checked          | `pnpm audit --prod`: no known vulnerabilities (last run in IMPLEMENTATION_STATUS)                 |
| No secrets committed                        | Nothing committed yet; `.env*` git-ignored                                                        |
| No dead-end controls; no fake functionality | Reviewed against CLAUDE.md §5; fakes exist only in tests                                          |
| Known limitations documented                | product/KNOWN_LIMITATIONS.md                                                                      |

## Manual verification checklists (owner: founder)

**Extension on live sites** (Chrome and Edge):

1. Pair from Settings → Browser extension.
2. On a LinkedIn job page, a Naukri job page and two company career pages:
   - click Extract
   - confirm title, company, location and description
   - save
3. On a login wall or non-job page: confirm the error and that paste works.
4. Revoke the device and confirm the extension shows "Not paired".

**Real model:**

1. Install Ollama and pull `qwen2.5:7b-instruct`.
2. Run 10 CVForge suggestion generations and 20 CodeAtlas questions on this repo.
3. Record citation accuracy and fabrication rejections in `documentation/testing/MODEL_EVALUATION.md`.

## Future operating costs (spec §10; nothing purchased)

| Item                         | Needed for                       | Notes                                                                          |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Domain                       | Public CVForge                   | Annual fee                                                                     |
| Hosting (Node service)       | Public CVForge                   | Single instance initially (S-02)                                               |
| Managed PostgreSQL + backups | Public CVForge                   | Encryption at rest expected from the provider                                  |
| Object storage               | Multi-instance CVForge           | Implement `ObjectStorage` for S3-compatible storage                            |
| Bandwidth                    | Public CVForge                   | Small (documents only)                                                         |
| Hosted inference             | Optional only                    | Consent-gated; never mandatory                                                 |
| Email delivery               | Password reset, verification     | Implement `Mailer`                                                             |
| Monitoring                   | Production                       | Health endpoint exists                                                         |
| CI/CD                        | Repository                       | Workflow written; runner minutes may cost on private repos                     |
| Browser extension publishing | Store listings                   | Chrome Web Store one-time developer fee; confirm current pricing before paying |
| Desktop code signing         | Future CodeAtlas desktop (Tauri) | Not in v1                                                                      |
| Legal and security review    | Launch                           | P-02, S-01                                                                     |
