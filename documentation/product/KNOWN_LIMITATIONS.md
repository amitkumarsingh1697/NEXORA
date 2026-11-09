# Known limitations

Honest list of what does not work, or was not verified, in the current build.

## Verification gaps

- **No real model was exercised.** Ollama was not installed in the build environment. AI paths (CVForge phrasing, CodeAtlas chat, model patches) are tested with fake providers only; quality with real models is unmeasured.
- **Accessibility is checked automatically only.** axe scans cover the screens the E2E journeys reach; there has been no manual keyboard or screen-reader audit, and the extension popup is not scanned.
- **Extension toolbar click is simulated in E2E.** Playwright opens the popup page directly and stubs the active tab; manual testing in Chrome/Edge is still needed, especially on live LinkedIn/Naukri pages (extraction selectors were written against public page structures and a fixture, not verified on live logged-in pages).
- **The ArchLens architecture brain has not been produced in a live Claude Code session.** The renderer, template and model format are tested; the skill's instructions for building a model from a repository link are not.
- **Docker compose file validated (`docker compose config`) but not started**: no Docker daemon in the build environment. Postgres was run natively.

## CVForge

- English resumes and job descriptions only; skill taxonomy is a curated list, not exhaustive.
- Scanned (image-only) PDFs are not supported (no OCR).
- Complex layouts (multiple columns, tables, text boxes) reduce parse confidence; the user must review the confirm screen.
- Two export templates only. The template is the only stored formatting choice besides section order; fonts, margins and spacing are fixed per template.
- Job comparison matches requirements by skill-taxonomy concept. Responsibilities without a recognised skill are not compared across jobs.
- Word and PDF documents that take longer than 20 seconds or more than 256 MB of memory to parse are refused as too complex.
- Single-instance deployment: in-memory rate limiter and local-disk storage.
- Email is written to an outbox folder unless SMTP is configured. SMTP delivery is tested against a local test server only, not a real provider. Email confirmation is enforced only when `REQUIRE_EMAIL_VERIFICATION=true`. There is no CAPTCHA or other bot protection, and no way to change the account's email address yet.
- No organisations/teams yet beyond the personal org created at signup.
- Scores are heuristic and explainable, not predictions of ATS outcomes or hiring decisions.
- PDF export needs fonts metric-compatible with the templates' Calibri and Arial (`fonts-crosextra-carlito`, `fonts-liberation` on Debian/Ubuntu). Without them LibreOffice substitutes other fonts, lines wrap differently, and re-parsing the exported PDF can split one job into two entries (reproduced 2026-11-03 with only DejaVu fonts). Making the parser robust to wrapping is a follow-up.

## CodeAtlas

- Full analysis (types, resolved calls) exists for TypeScript and JavaScript only. About 80 other languages get classes, functions, methods and imports from declaration patterns, labelled partial: multi-line signatures, macros and declarations built by code generation can be missed, code inside strings can be misread, and calls between their functions are not extracted. Every other language is identified (GitHub Linguist v9.7.0 data) and searchable as text only. See [LANGUAGE_SUPPORT_MATRIX.md](../reports/LANGUAGE_SUPPORT_MATRIX.md).
- Ambiguous extensions (for example `.h`, `.m`, `.pl`, `.v`, `.inc`) are resolved by small content heuristics and a default; such files are marked as identified by a heuristic, with the alternatives, in the inventory.
- Helm templates are recorded as text (they are not YAML until rendered). Liquibase changelogs give table names and includes, not columns. Lockfiles are counted, not resolved.
- Git submodules, symbolic links and folders ignored by `.gitignore` are listed as not indexed, with the reason; their content is not read.
- Re-indexing is incremental only while the tsconfig files, package manifests, lockfiles and the set of files stay the same; otherwise it runs in full. A change to a widely imported file re-analyses most of the repository (221 of 451 files for one hono change). Project references and path plugins are untested. Large repos are capped at 20,000 files and 512 KB per file.
- Service, database and configuration links are heuristics, labelled inferred. Clients created inside functions, and URLs built at run time, are grouped or missed. Configuration values are never read.
- The structure tree goes module → file → symbol; modules are directories, with no separate package level.
- Module overviews written by a model have not been evaluated with a real model.
- Dynamic patterns (dependency injection containers, string-based dispatch, reflection) show up as unresolved or inferred edges, not observed ones.
- Route detection covers Next.js app router and Express-style `app.get(...)` / `router.post(...)` calls; other frameworks are not recognised.
- Ownership and churn need git history; a repository without commits (such as this monorepo today) has no ownership data.
- Secret detection is pattern-based.
- `node:sqlite` is experimental in Node 22.
- Running an untrusted repository's own `test`/`build` scripts executes that repository's code; the allowlist limits _which_ scripts, not what they do.
- Model patches and dependency install need network access (to the model and the registry respectively).
- Single user, single machine by design.
- Local analytics record counts on this machine only; there is no opt-in organisational analytics yet. "Delete all local data" clears the database but leaves the investigation worktrees and public clones folders on disk for you to delete (their paths are shown in Settings).
- Cancelling indexing stops the indexer process; a cancel during the final database commit can still complete that commit.
- Local merge is fast-forward only. If your branch moved after the investigation started, the merge is refused and you start a new investigation from the current commit. Approver identity is the OS user name.
- Public clone: https only, no private repositories, no size cap (10-minute timeout), and the clone request waits for the download before indexing starts. Host checks happen before git resolves the name again, so DNS rebinding is a residual risk (threat A16).
- Frameworks are detected from package.json declarations only; declaration does not prove use. Manifests from non-JavaScript ecosystems are not classified.
- Cycle detection covers resolved file imports; imports CodeAtlas could not resolve cannot form part of a reported cycle.
- Architecture brain: lobe placement (frontend, backend, database, DevOps, core) is inferred from file paths, imports and node kinds, and can be wrong for unconventional layouts. Parameter and return types are checked only for TypeScript and JavaScript; for other languages they are shown as written in the declaration. The brain keeps the 6,000 most connected parts of a large repository. The 3D view needs WebGL and has been checked only with software rendering in headless Chromium.
- Database tables: read from SQL `CREATE TABLE`/`ALTER TABLE`, Prisma models and Drizzle table builders only. Views, stored procedures, triggers, SQL built at run time and the Drizzle relational query API (`db.query.x`) are not read. Table use found in SQL strings and Prisma calls is inferred; a SQL string that names a table no schema defines is not linked. Prisma support follows the documentation and was not run on a real Prisma project; a relation over a column renamed with `@map` is not matched. Tables are matched by name across the whole repository, so two products with a table of the same name share one table in the brain. Tables that tests create for themselves (in test files and test, fixtures or mocks folders) are ignored. Temporary tables created by migration code (for example `nodes_next`) appear as tables with no readers.
- Diagrams: ER, schema and class diagrams only; no Venn diagram. The class diagram lists methods but not properties. Very large schemas are drawn one schema file at a time and capped, with a note saying how many boxes were left out.

## Repository

- Public repository: github.com/amitkumarsingh1697/NEXORA. Changes reach `main` only through reviewed pull requests.
