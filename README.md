# NEXORA

**Intelligence that moves you forward.**

NEXORA is a TypeScript monorepo with two products and one Claude Code skill:

| Product                            | Tagline                                                | In one sentence                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **CVForge** (Nexora Career)        | Your experience. Your evidence. Your next opportunity. | Shows how your resume's evidence lines up with a job, asks about the gaps, and produces tailored versions without inventing claims. |
| **CodeAtlas** (Nexora Engineering) | Understand every layer. See how everything connects.   | Indexes a repository in any language on your machine and explains its structure, flows and risks with citations.                    |
| **ArchLens**                       | Evidence-labelled architecture work                    | A Claude Code skill that answers architecture questions with every claim tagged observed, inferred or unknown.                      |

All screenshots below come from the real applications, captured by automated scripts against a fresh database with made-up sample people and companies. See [Regenerating the screenshots](#regenerating-the-screenshots).

## Contents

- [CVForge](#cvforge)
  - [Features](#cvforge-features)
  - [Screenshots](#cvforge-screenshots)
  - [Browser extension](#browser-extension)
- [CodeAtlas](#codeatlas)
  - [Languages and file types](#languages-and-file-types)
  - [Using CodeAtlas](#using-codeatlas)
- [ArchLens](#archlens)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Quality gates](#quality-gates)
- [Documentation](#documentation)
- [Ground rules](#ground-rules)
- [Licence](#licence)

---

## CVForge

CVForge is a web app (Next.js), a PostgreSQL backend and a Chrome/Edge extension for technology professionals. It reads your resume, compares it with a job description, and tells you, requirement by requirement, what your resume demonstrates, what you have confirmed, and what is missing. Scores are deterministic and explained. Suggestions are backed by your own text or answers, and nothing changes until you accept it.

<a id="cvforge-features"></a>

### Features

- **Resume upload and extraction.** DOCX and PDF (text-based, not scanned). PDF parsing runs pdf.js in an isolated worker with time and memory limits. Wrapped lines are rejoined from the page layout, bracketed skill groups stay whole, and job, project and education entries are anchored on their dates. Anything the parser cannot place is shown for review instead of being dropped.
- **Review before use.** Every extracted field (personal details, skills with categories, experience, projects, education, certifications, custom sections) is editable. You confirm a version before it is analysed.
- **Job workspaces.** Paste a job description, or send one from the browser extension. Requirements are extracted and each one is classified as **demonstrated**, **confirmed by you** or **missing**, with the exact resume lines as evidence.
- **Clarification questions.** For requirements with no evidence, CVForge asks instead of guessing. Unanswered questions never count against you, and the score shows a range until they are answered.
- **Three explained scores.** Job Match, ATS Compatibility and Evidence Quality, each broken down into factors. They are guidance, not an employer's ATS result or a hiring prediction.
- **Career-stage aware.** Seniority is computed from your dated roles, so an architect with 18 years is not scored against a graduate checklist.
- **Evidence-backed suggestions.** New bullets, skills and reordering, each citing the resume text or answer it relies on. A fabrication guard rejects wording that claims more than the evidence.
- **Versions and comparison.** Accepting suggestions creates a new version. Versions are compared field by field with a decision record.
- **Export.** DOCX directly, and PDF through LibreOffice. Each export is read back and checked against the version it came from.
- **Job comparison.** Compare two jobs to see shared skills, with a warning when they were analysed against different resume versions.
- **Account and privacy.** Email confirmation, session management, a data export, account deletion and a retention sweep.
- **Optional AI.** Phrasing help through a local Ollama model or an OpenAI-compatible endpoint, only when configured. Model output is validated and never decides scores or evidence.

<a id="cvforge-screenshots"></a>

### Screenshots

**Landing page**

![CVForge landing page](documentation/assets/screenshots/cvforge-home.png)

**Upload a resume, then review what was extracted**

| Upload                                                         | Review and edit                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ![Upload](documentation/assets/screenshots/cvforge-upload.png) | ![Resume review](documentation/assets/screenshots/cvforge-resume-review.png) |

A two-column PDF resume with wrapped lines and bracketed skill groups, extracted into the right sections:

![PDF extraction](documentation/assets/screenshots/cvforge-pdf-extraction.png)

**Create a job workspace and see the analysis**

| New workspace                                                                | Analysis                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ![New workspace](documentation/assets/screenshots/cvforge-new-workspace.png) | ![Analysis](documentation/assets/screenshots/cvforge-analysis.png) |

**Requirement and evidence matrix**

![Requirement matrix](documentation/assets/screenshots/cvforge-requirements.png)

**Clarification questions and explained scores**

| Clarify                                                          | Scores                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| ![Clarify](documentation/assets/screenshots/cvforge-clarify.png) | ![Scores](documentation/assets/screenshots/cvforge-scores.png) |

**Suggestions, then compare the new version**

| Suggestions                                                              | Version comparison                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| ![Suggestions](documentation/assets/screenshots/cvforge-suggestions.png) | ![Compare](documentation/assets/screenshots/cvforge-compare.png) |

**Export, job comparison and dashboard**

| Export center                                                    | Job comparison                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Exports](documentation/assets/screenshots/cvforge-exports.png) | ![Job comparison](documentation/assets/screenshots/cvforge-job-comparison.png) |

| Dashboard                                                            | Sign up                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| ![Dashboard](documentation/assets/screenshots/cvforge-dashboard.png) | ![Sign up](documentation/assets/screenshots/cvforge-signup.png) |

### Browser extension

The extension (Manifest V3, Chrome and Edge) sends a job posting you are viewing to CVForge. It reads the page **only when you click Extract**, uses `activeTab` and `scripting` instead of content scripts on every site, and its host permission is limited to your CVForge server. It never reads job-site cookies or credentials.

It recognises schema.org `JobPosting` data, LinkedIn and Naukri job pages, and falls back to a generic reader for other career pages. You review and edit every field before saving.

| 1. Pair with a code from Settings                            | 2. Ready on a job page                                         | 3. Review what was extracted                                     | 4. Saved to a workspace                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| ![Pair](documentation/assets/screenshots/extension-pair.png) | ![Ready](documentation/assets/screenshots/extension-ready.png) | ![Review](documentation/assets/screenshots/extension-review.png) | ![Saved](documentation/assets/screenshots/extension-saved.png) |

The pairing code comes from **Browser extension** in the CVForge app:

![Extension pairing in the app](documentation/assets/screenshots/cvforge-extension-pairing.png)

#### Install the extension

Ready-built packages are in [`products/cvforge/extension/releases/`](products/cvforge/extension/releases):

| File                                                                                                           | Browser |
| -------------------------------------------------------------------------------------------------------------- | ------- |
| [`cvforge-extension-0.1.0-chrome.zip`](products/cvforge/extension/releases/cvforge-extension-0.1.0-chrome.zip) | Chrome  |
| [`cvforge-extension-0.1.0-edge.zip`](products/cvforge/extension/releases/cvforge-extension-0.1.0-edge.zip)     | Edge    |

These packages talk to a CVForge server at `http://localhost:3000`, the default for local use. To install one:

1. Start CVForge (see [Getting started](#getting-started)).
2. Unzip the package into a folder.
3. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and choose that folder.
4. In CVForge, open **Browser extension**, click **Generate pairing code**, and enter the code in the extension popup.
5. On a job posting, click the CVForge toolbar icon, then **Extract job from this tab**.

To point the extension at another server, build it yourself:

```bash
WXT_CVFORGE_URL=https://cvforge.example.com pnpm --filter @nexora/cvforge-extension zip            # Chrome
WXT_CVFORGE_URL=https://cvforge.example.com pnpm --filter @nexora/cvforge-extension exec wxt zip -b edge
# packages are written to products/cvforge/extension/.output/
```

The extension source is in [`products/cvforge/extension/`](products/cvforge/extension): the popup in `entrypoints/popup/`, the on-click page reader in `entrypoints/extractor.ts`, site readers in `src/extract/` and the API client in `src/api/`. It is not yet published to the Chrome Web Store or Edge Add-ons.

---

## CodeAtlas

CodeAtlas runs entirely on your machine (`127.0.0.1`, protected by a token). It indexes a repository into SQLite and labels every relationship **observed**, **inferred** or **unknown**, so you always know how a fact was found. TypeScript and JavaScript are read by the TypeScript Compiler API; about 80 other languages and the common configuration, build, container, CI, infrastructure, API and documentation formats are read by declaration patterns and format readers (see [Languages and file types](#languages-and-file-types)).

- **Architecture brain:** the whole repository as a 3D brain. Lobes for Frontend, Backend, Database, DevOps and Core & shared; click a lobe to fly inside it, click a class or method to see its inputs and output, where its input comes from and where it sends work, each link labelled with its evidence. Search recalls any part. `pnpm --filter @nexora/codeatlas-service cli brain <path> --out brain.html` writes the same brain as one offline HTML file.
- **Database tables and diagrams:** tables from SQL, Prisma and Drizzle schemas, with every column's type, length, precision, scale, nullability, keys and default, and the functions that read and write each table. The **Diagrams** button in the brain draws ER, schema and class diagrams that you can scope, zoom, download as SVG, and click to find a part in the brain.
- **Languages & files:** every file in the repository with its language, file type and one of seven statuses (fully analysed, partially analysed, text only, recognised but not readable, failed, excluded, binary) and the reason. Totals by language, file type, folder and status, and a browser for every file. The same section is in the brain.
- **Coverage report:** what was read, what was skipped and why, manifests and declared frameworks.
- **Structure, modules and dependencies:** a module → file → symbol tree and dependency graphs, with cycle detection.
- **Flows:** pick a route or entry point and trace what it calls.
- **Integrations:** environment variables, configuration files, HTTP services and database clients.
- **Risk, ownership and knowledge:** churn, sensitive configuration, git ownership, and Markdown/ADR knowledge with module documentation.
- **Search and Ask:** full-text search, and questions answered with numbered source citations. Without a model it returns the relevant evidence instead of an explanation.
- **Investigate:** take a bug report through a patch in an isolated git worktree, allowlisted test commands, and a human approval bound to the exact patch hash before a fast-forward merge.

The screenshots show CodeAtlas exploring this repository.

![Architecture brain](documentation/assets/screenshots/codeatlas-brain.png)

| Inside the Backend lobe                                                       | A function: inputs, output and links                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![Backend lobe](documentation/assets/screenshots/codeatlas-brain-backend.png) | ![Function details](documentation/assets/screenshots/codeatlas-brain-method.png) |

| A table: columns, types and who reads it                                     | ER diagram                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ![Table details](documentation/assets/screenshots/codeatlas-brain-table.png) | ![ER diagram](documentation/assets/screenshots/codeatlas-diagram-er.png) |

| Schema diagram                                                                   | Class diagram                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Schema diagram](documentation/assets/screenshots/codeatlas-diagram-schema.png) | ![Class diagram](documentation/assets/screenshots/codeatlas-diagram-class.png) |

| Languages & files on the Overview                                              | Languages & files inside the brain                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| ![Languages & files](documentation/assets/screenshots/codeatlas-languages.png) | ![Brain languages](documentation/assets/screenshots/codeatlas-brain-languages.png) |

| Welcome                                                            | Overview and coverage                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ![Welcome](documentation/assets/screenshots/codeatlas-welcome.png) | ![Overview](documentation/assets/screenshots/codeatlas-overview.png) |

| Structure                                                              | Dependencies                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ![Structure](documentation/assets/screenshots/codeatlas-structure.png) | ![Dependencies](documentation/assets/screenshots/codeatlas-dependencies.png) |

| Flows                                                          | Integrations                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ![Flows](documentation/assets/screenshots/codeatlas-flows.png) | ![Integrations](documentation/assets/screenshots/codeatlas-integrations.png) |

| Risk                                                         | Knowledge                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| ![Risk](documentation/assets/screenshots/codeatlas-risk.png) | ![Knowledge](documentation/assets/screenshots/codeatlas-knowledge.png) |

| Ask (with citations)                                       | Investigate                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| ![Ask](documentation/assets/screenshots/codeatlas-ask.png) | ![Investigate](documentation/assets/screenshots/codeatlas-investigate.png) |

| Repositories                                                                 | Modules                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ![Repositories](documentation/assets/screenshots/codeatlas-repositories.png) | ![Modules](documentation/assets/screenshots/codeatlas-modules.png) |

### Languages and file types

One registry, [`packages/languages`](packages/languages), decides what every file is, for CodeAtlas and ArchLens alike. It uses GitHub Linguist 9.7.0 data (833 languages) plus Nexora's own rules for file types such as Kubernetes manifests, OpenAPI files, CI pipelines and lockfiles. A file is identified by its content (binary signatures, Git LFS pointers), path, file name, extension, shebang, editor modeline or content shape, in that order, and the result records how it was found.

Each file is then read at the deepest level available, and the level is shown:

| Level              | What is read                                                              | Examples                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fully analysed     | A complete parser read the file and understood its type                   | TypeScript and JavaScript (compiler), package.json, tsconfig, Docker Compose, Kubernetes, GitHub Actions, OpenAPI, go.mod, requirements.txt, .sln, CSV, gettext catalogs                                                                                                           |
| Partially analysed | Structure read by patterns or a generic parser; not checked by a compiler | Classes, functions and imports in Java, Go, C#, Python, Ruby, PHP, Kotlin, Swift, Rust, C and C++, COBOL, Fortran and about 70 more; SQL objects; Terraform/HCL; Protobuf, Thrift and GraphQL; Dockerfiles, Makefiles, CMake; Helm and Jinja templates with placeholders; Graphviz |
| Text only          | Identified and searchable, no structure                                   | Licences, ignore files, plain lists, recorded HTTP bodies                                                                                                                                                                                                                          |
| Excluded           | Not read on purpose, with the reason                                      | Vendored and build folders, files that may hold credentials, generated files, symlinks, submodules, files over the size or count limits                                                                                                                                            |

Coverage is (fully + partially analysed) ÷ readable files, where readable means every file except excluded and binary ones. Text-only files never count as analysed. The full list is in the generated [support matrix](documentation/reports/LANGUAGE_SUPPORT_MATRIX.md), and the results on 23 public repositories, from Kubernetes to a COBOL course, are in the [validation report](documentation/reports/LANGUAGE_COVERAGE_VALIDATION.md).

### Using CodeAtlas

1. **Build and start it** (see [Getting started](#getting-started) for Node.js and pnpm):

   ```bash
   pnpm --filter @nexora/codeatlas-web build
   pnpm --filter @nexora/codeatlas-service start   # prints http://127.0.0.1:4317/#token=…
   ```

2. **Open the printed address** and choose **Add your first repository**. Enter the absolute path of a local clone and choose **Add and index**. Indexing a large repository takes from a few seconds to under a minute (Kubernetes, 31,746 files: about 40 s).
3. **Overview** shows the coverage summary and the **Languages & files** section: start there to see what was and was not analysed, and why.
4. **Brain** draws the architecture in 3D. Click a lobe to go inside, click a class, method or table for its details, use **Diagrams** for ER, schema and class diagrams, and **Languages & files** for the inventory.
5. **Structure, Modules, Dependencies, Flows, Integrations, Risk, Ownership and Knowledge** explore the code; **Search** and **Ask** answer questions with numbered citations; **Investigate** takes a bug report to a reviewed patch in a separate git worktree.

Everything also works from the command line:

```bash
pnpm --filter @nexora/codeatlas-service cli index /abs/path/to/repo
pnpm --filter @nexora/codeatlas-service cli brain /abs/path/to/repo --out brain.html   # one offline HTML file
pnpm --filter @nexora/codeatlas-service cli search <repoId> "query"
```

`cli brain` prints the coverage sentence and a table of languages, and the HTML file opens in any browser with no server. Use absolute paths: `pnpm --filter` runs the command from the package folder. Ollama is optional; without a model, **Ask** returns the relevant evidence instead of a written answer.

---

## ArchLens

ArchLens is a Claude Code skill in [`skills/archlens/`](skills/archlens/README.md). It does the same evidence work as CodeAtlas, in conversation: every architectural claim is tagged `[observed]`, `[inferred]` or `[unknown]` and cited to `path:line`.

- **Install:** copy `skills/archlens/` to `~/.claude/skills/archlens/` (every project) or `<project>/.claude/skills/archlens/` (one project). On claude.ai, upload the release zip under Settings → Capabilities → Skills.
- **Use:** run `/archlens <question>` or just ask about a repository's architecture, for example "trace what happens when a user logs in" or "what breaks if I change the orders table?".
- **Architecture brain:** ask for "an architecture brain of https://github.com/owner/repo". ArchLens returns one HTML file with the same 3D brain, database tables and ER, schema and class diagrams as CodeAtlas. It builds the brain through CodeAtlas when a Nexora checkout is available, and otherwise from the code it reads.
- **Coverage:** ArchLens counts every file with the same registry (`node scripts/inventory.mjs <repo> --model brain-model.json`) and puts the counts in the brain's **Languages & files** section, so the brain says what it does not cover. Files ArchLens read by hand are "partially analysed"; nothing it reports is "fully analysed".

The full guide, with every step and command, is in the [ArchLens README](skills/archlens/README.md). The brain format is in [`references/brain-model.md`](skills/archlens/references/brain-model.md).

---

## Getting started

### Requirements

- Node.js 22.13 or later and pnpm 10
- PostgreSQL 16, through Docker or installed natively (CVForge only)
- LibreOffice (`soffice`) with `fonts-crosextra-carlito` and `fonts-liberation` for PDF export (CVForge only)
- Ollama, optional, for AI phrasing and answers

### Install

```bash
git clone https://github.com/amitkumarsingh1697/NEXORA.git nexora
cd nexora
pnpm install
```

### Run CVForge

```bash
# 1. Database (choose one)
docker compose -f infrastructure/local-development/docker-compose.yml up -d
# or: infrastructure/scripts/setup-postgres-native.sh

# 2. Schema
pnpm --filter @nexora/cvforge-backend db:migrate

# 3. Settings: copy, then set APP_SECRET to a long random value
cp products/cvforge/web/.env.example products/cvforge/web/.env.local

# 4. Start the app on http://localhost:3000
pnpm --filter @nexora/cvforge-web dev

# Optional: retention sweep (schedule hourly in production)
pnpm --filter @nexora/cvforge-backend maintain
```

Then open http://localhost:3000, create an account, upload a resume and create a job workspace. Install the browser extension as described in [Install the extension](#install-the-extension).

### Run CodeAtlas

```bash
pnpm --filter @nexora/codeatlas-web build
pnpm --filter @nexora/codeatlas-service start              # prints http://127.0.0.1:4317/#token=…
pnpm --filter @nexora/codeatlas-service cli index /abs/path/to/repo   # or add the repository in the UI
```

Open the printed address. The token in the address is how the browser proves it is you; the page removes it from the address bar after reading it. The walkthrough is in [Using CodeAtlas](#using-codeatlas).

## Configuration

CVForge reads `products/cvforge/web/.env.local`. The full list with comments is in [`.env.example`](products/cvforge/web/.env.example). The main settings:

| Variable                          | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                    | PostgreSQL connection string                                            |
| `APP_SECRET`                      | Secret for signing tokens; use a long random value                      |
| `APP_ORIGIN`                      | Public address of the app, used for links and origin checks             |
| `AI_PROVIDER`                     | `disabled`, `ollama` or `openai-compatible`                             |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local model for phrasing help                                           |
| `REQUIRE_EMAIL_VERIFICATION`      | `true` to require email confirmation before use                         |
| `AI_REMOTE_CONSENT`               | Must be set before resume text is sent to a non-local model endpoint    |
| `MAIL_TRANSPORT`, `SMTP_*`        | Optional email delivery; by default mail is written to an outbox folder |

CodeAtlas uses `CODEATLAS_HOME` (data folder), `CODEATLAS_PORT` (default 4317) and `AI_PROVIDER`.

## Architecture

```
packages/                shared libraries: ai (model providers), logging, validation,
                         languages (language and file-type registry, file inventory),
                         brain (3D architecture brain viewer used by CodeAtlas and ArchLens)
products/cvforge/
  core/                  pure domain engine: extraction, parsing, evidence, scoring, suggestions, export
  backend/               PostgreSQL schema, migrations and services (auth, resumes, workspaces, exports…)
  web/                   Next.js app and API routes (thin layer over backend)
  extension/             WXT Manifest V3 extension for Chrome and Edge, plus built packages in releases/
products/codeatlas/
  core/                  indexer, SQLite store, queries, chat, investigations
  service/               local HTTP API and CLI
  web/                   Vite + React UI
infrastructure/          docker compose for Postgres/Ollama, database init SQL, native setup script
skills/archlens/         ArchLens skill
documentation/           product, architecture, API, security, operations, deployment and testing docs
```

Rules the code follows: products never import each other (shared code lives in `packages/`); domain logic is pure and lives in each product's `core`; persistence and policy live in services; UI and route handlers stay thin. Significant decisions are recorded as ADRs in [`documentation/architecture/`](documentation/architecture/ARCHITECTURE_DECISIONS.md).

## Quality gates

```bash
pnpm check                                  # typecheck + lint + unit and integration tests
pnpm format:check
pnpm --filter @nexora/cvforge-web e2e       # Playwright: full journey, extension, PDF extraction, email
pnpm --filter @nexora/codeatlas-web build && pnpm --filter @nexora/codeatlas-web e2e
pnpm audit --prod
```

The end-to-end suites include automated axe accessibility scans. CI runs all of the above on every pull request and on `main`.

### Regenerating the screenshots

```bash
pnpm --filter @nexora/cvforge-web screenshots     # needs PostgreSQL running; uses a throwaway e2e database
pnpm --filter @nexora/codeatlas-web screenshots   # indexes a fresh clone of this repository
```

Both write to [`documentation/assets/screenshots/`](documentation/assets/screenshots). The scripts are in `products/*/web/screenshots/`.

## Documentation

- [Documentation index](documentation/README.md)
- [User guide](documentation/product/USER_GUIDE.md)
- [Known limitations](documentation/product/KNOWN_LIMITATIONS.md)
- [Implementation status](documentation/IMPLEMENTATION_STATUS.md)
- [Security threat model](documentation/SECURITY_THREAT_MODEL.md)
- [Changelog](CHANGELOG.md)

## Ground rules

- Private data (resumes, source code) stays local by default. Hosted models are used only when configured **and** the user consents.
- No secrets, tokens or resume contents in logs.
- CodeAtlas never approves or merges on its own: a fast-forward merge happens only after a human approves the exact patch hash and types it back. It runs only allowlisted commands in isolated worktrees.
- The extension reads a page only after the user clicks Extract, and never touches job-site cookies or credentials.

## Licence

[Apache License 2.0](LICENSE). Security reports: see [SECURITY.md](SECURITY.md). Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md).
