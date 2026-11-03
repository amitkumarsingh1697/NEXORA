# NEXORA

**Intelligence that moves you forward.**

NEXORA is a TypeScript monorepo with two products:

| Product                            | Tagline                                                | What it is                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CVForge** (Nexora Career)        | Your experience. Your evidence. Your next opportunity. | Resume intelligence: parse a resume and a job description, classify every requirement as demonstrated, user-confirmed or missing, score with explanations, suggest evidence-backed edits, keep versions, export DOCX/PDF. Web app + Postgres backend + Chrome/Edge extension.                                                                               |
| **CodeAtlas** (Nexora Engineering) | Understand every layer. See how everything connects.   | Architecture brain that runs locally: indexes a TypeScript/JavaScript repository with the TypeScript Compiler API into SQLite, labels every fact observed / inferred / unknown, shows module, dependency, flow, risk, ownership and knowledge views, answers questions with source citations, and runs a human-approved bug-investigation → patch workflow. |

## Repository layout

```
packages/            shared libraries: ai (model providers), logging, validation
products/cvforge/    core (domain engine), backend (Postgres services), web (Next.js app + API), extension (WXT MV3)
products/codeatlas/  core (indexer, store, queries, chat, investigations), service (local HTTP API + CLI), web (Vite React UI)
infrastructure/      docker compose for Postgres/Ollama, DB init SQL, native setup script
skills/archlens/     ArchLens skill draft (SKILL.md)
documentation/       product, architecture, API, security, operations, deployment, testing docs
scripts/             repo utilities
```

## Quick start

Requirements: Node 22.13+, pnpm 10, PostgreSQL 16 (Docker or native), LibreOffice (`soffice`) for PDF export. Ollama is optional.

```bash
pnpm install
docker compose -f infrastructure/local-development/docker-compose.yml up -d   # or: infrastructure/scripts/setup-postgres-native.sh
pnpm --filter @nexora/cvforge-backend db:migrate
```

**CVForge**

```bash
cp products/cvforge/web/.env.example products/cvforge/web/.env.local   # set APP_SECRET
pnpm --filter @nexora/cvforge-web dev                                   # http://localhost:3000
pnpm --filter @nexora/cvforge-extension build                           # load products/cvforge/extension/.output/chrome-mv3 unpacked
pnpm --filter @nexora/cvforge-backend maintain                          # retention sweep (schedule hourly)
```

**CodeAtlas**

```bash
pnpm --filter @nexora/codeatlas-web build
pnpm --filter @nexora/codeatlas-service start        # prints http://127.0.0.1:4317/#token=…
pnpm --filter @nexora/codeatlas-service cli index /path/to/repo
```

**Quality gates**

```bash
pnpm check            # typecheck + lint + unit/integration tests
pnpm format:check
pnpm --filter @nexora/cvforge-web e2e
pnpm --filter @nexora/codeatlas-web e2e
```

## Documentation

Start at [documentation/README.md](documentation/README.md). Current status of every feature is in [documentation/IMPLEMENTATION_STATUS.md](documentation/IMPLEMENTATION_STATUS.md).

## Ground rules

- Private data (resumes, source code) stays local by default. Hosted models are used only when configured **and** the user consents.
- No secrets, tokens or resume contents in logs.
- CodeAtlas never merges, never auto-approves, and runs only allowlisted commands in isolated worktrees.
- The extension reads a page only after the user clicks Extract, and never touches job-site cookies or credentials.
