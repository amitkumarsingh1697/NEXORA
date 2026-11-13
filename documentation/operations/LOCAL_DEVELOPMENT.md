# Local development

## Prerequisites

| Tool                            | Version                                                              | Needed for                                                  |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Node.js                         | 22.13 or newer (built-in `node:sqlite`)                              | everything                                                  |
| pnpm                            | 10.28 (`corepack enable`)                                            | workspace                                                   |
| PostgreSQL                      | 16 (Docker or native)                                                | CVForge                                                     |
| LibreOffice (`soffice` on PATH) | any recent                                                           | CVForge PDF export (DOCX works without it)                  |
| git                             | 2.38+                                                                | CodeAtlas history and investigations                        |
| Ollama                          | optional                                                             | AI phrasing and CodeAtlas chat; everything works without it |
| Chromium for Playwright         | `pnpm --filter @nexora/cvforge-web exec playwright install chromium` | E2E tests                                                   |

## First run

```bash
pnpm install

# Postgres: Docker…
docker compose -f infrastructure/local-development/docker-compose.yml up -d
# …or a native install (creates role nexora and databases cvforge, cvforge_test, cvforge_e2e)
infrastructure/scripts/setup-postgres-native.sh

pnpm --filter @nexora/cvforge-backend db:migrate
```

Optional local model:

```bash
docker compose -f infrastructure/local-development/docker-compose.yml --profile ai up -d
docker compose -f infrastructure/local-development/docker-compose.yml exec ollama ollama pull qwen2.5:7b-instruct
```

## CVForge

```bash
cp products/cvforge/web/.env.example products/cvforge/web/.env.local
pnpm --filter @nexora/cvforge-web dev        # http://localhost:3000
```

Password-reset and email-confirmation messages are written to `MAIL_OUTBOX_DIR` (default `products/cvforge/web/.data/outbox`) instead of being sent. To deliver real mail, set `MAIL_TRANSPORT=smtp` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` (see `.env.example`). SMTP is optional, and the provider you pick may charge for it. `SMTP_REQUIRE_TLS=true` (the default) refuses to send over an unencrypted connection. Set `REQUIRE_EMAIL_VERIFICATION=true` to block uploads and AI suggestions until the address is confirmed; in production this needs SMTP.

**Extension**

```bash
WXT_CVFORGE_URL=http://localhost:3000 pnpm --filter @nexora/cvforge-extension build
# Chrome: chrome://extensions → Developer mode → Load unpacked → products/cvforge/extension/.output/chrome-mv3
# Edge:   pnpm --filter @nexora/cvforge-extension build:edge → edge://extensions → Load unpacked
```

Then in CVForge open Settings → Browser extension → Generate pairing code and enter it in the extension popup.

**Migrations**

```bash
# after editing products/cvforge/backend/src/db/schema.ts
pnpm --filter @nexora/cvforge-backend db:generate
pnpm --filter @nexora/cvforge-backend db:migrate
```

**Retention sweep:** `pnpm --filter @nexora/cvforge-backend maintain`

## CodeAtlas

```bash
pnpm --filter @nexora/codeatlas-web build
pnpm --filter @nexora/codeatlas-service start
# open the printed URL: http://127.0.0.1:4317/#token=…
```

CLI:

```bash
pnpm --filter @nexora/codeatlas-service cli index /abs/path/to/repo
pnpm --filter @nexora/codeatlas-service cli search 1 "session refresh"    # 1 = repo id printed by index
pnpm --filter @nexora/codeatlas-service cli brain /abs/path/to/repo --out brain.html --json brain-model.json
```

## ArchLens

The skill is `skills/archlens/`. Its generated files are rebuilt from the packages and checked by tests:

```bash
pnpm --filter @nexora/brain build                 # assets/brain-template.html and scripts/render-brain.mjs
pnpm --filter @nexora/languages build             # scripts/inventory.mjs
pnpm --filter @nexora/codeatlas-service skill     # scripts/brain/ (bundled indexer and runtime.pack.gz)
node skills/archlens/scripts/check.mjs            # structure check
(cd skills && zip -r ../archlens-skill.zip archlens)   # zip for the Claude app (must stay under 200 files)
```

UI development with hot reload: run the service, then `pnpm --filter @nexora/codeatlas-web dev` and open the Vite URL with the same `#token=` fragment (the dev server proxies `/api` to port 4317).

## Everyday commands

```bash
pnpm check              # typecheck + lint + all unit/integration tests
pnpm format             # prettier --write
pnpm --filter @nexora/cvforge-web e2e
pnpm --filter @nexora/codeatlas-web e2e
bash scripts/snapshot.sh /some/dir   # copy the source tree without build output
```

## Environment variables

See the `.env.example` files in `products/cvforge/web`, `products/cvforge/backend`, `products/cvforge/extension` and `products/codeatlas/service`. The CodeAtlas service reads its environment directly; export variables in your shell.
