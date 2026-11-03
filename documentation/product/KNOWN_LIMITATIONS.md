# Known limitations

Honest list of what does not work, or was not verified, in the current build.

## Verification gaps

- **No real model was exercised.** Ollama was not installed in the build environment. AI paths (CVForge phrasing, CodeAtlas chat, model patches) are tested with fake providers only; quality with real models is unmeasured.
- **CI has not run.** `.github/workflows/ci.yml` is written but the repository has not been pushed.
- **Extension toolbar click is simulated in E2E.** Playwright opens the popup page directly and stubs the active tab; manual testing in Chrome/Edge is still needed, especially on live LinkedIn/Naukri pages (extraction selectors were written against public page structures and a fixture, not verified on live logged-in pages).
- **Docker compose file validated (`docker compose config`) but not started**: no Docker daemon in the build environment. Postgres was run natively.

## CVForge

- English resumes and job descriptions only; skill taxonomy is a curated list, not exhaustive.
- Scanned (image-only) PDFs are not supported (no OCR).
- Complex layouts (multiple columns, tables, text boxes) reduce parse confidence; the user must review the confirm screen.
- Two export templates only.
- Single-instance deployment: in-memory rate limiter, local-disk storage, outbox-directory mailer (no email is actually sent; no email verification).
- No organisations/teams yet beyond the personal org created at signup.
- Scores are heuristic and explainable, not predictions of ATS outcomes or hiring decisions.

## CodeAtlas

- TypeScript and JavaScript only. Other languages appear as files without symbols.
- Full re-index on every run (no incremental indexing); large repos are capped at 20,000 files and 512 KB per file.
- Dynamic patterns (dependency injection containers, string-based dispatch, reflection) show up as unresolved or inferred edges, not observed ones.
- Route detection covers Next.js app router and Express-style `app.get(...)` / `router.post(...)` calls; other frameworks are not recognised.
- Ownership and churn need git history; a repository without commits (such as this monorepo today) has no ownership data.
- Secret detection is pattern-based.
- `node:sqlite` is experimental in Node 22.
- Running an untrusted repository's own `test`/`build` scripts executes that repository's code; the allowlist limits _which_ scripts, not what they do.
- Model patches and dependency install need network access (to the model and the registry respectively).
- Single user, single machine by design.
- Local merge is fast-forward only. If your branch moved after the investigation started, the merge is refused and you start a new investigation from the current commit. Approver identity is the OS user name.
- Public clone: https only, no private repositories, no size cap (10-minute timeout), and the clone request waits for the download before indexing starts. Host checks happen before git resolves the name again, so DNS rebinding is a residual risk (threat A16).
- Frameworks are detected from package.json declarations only; declaration does not prove use. Manifests from non-JavaScript ecosystems are not classified.
- Cycle detection covers resolved file imports; imports CodeAtlas could not resolve cannot form part of a reported cycle.

## Repository

- No git commits yet (by instruction, nothing has been committed or pushed). The target remote repository has not been chosen.
