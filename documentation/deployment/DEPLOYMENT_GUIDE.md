# Deployment guide

> Nothing has been deployed. Deploying publicly, buying domains or creating paid resources requires the founder's explicit authorisation. This guide describes what a deployment needs so the decision can be made.

## CVForge

### Topology

One Node service (Next.js `next start`) + PostgreSQL 16 + persistent file storage + a scheduler for the retention job. LibreOffice must be present in the runtime image for PDF export.

### Steps

1. **Build:** `pnpm install --frozen-lockfile && pnpm --filter @nexora/cvforge-web build`.
2. **Configure** (see `products/cvforge/web/.env.example`): `NODE_ENV=production`, `DATABASE_URL`, `APP_SECRET` (≥ 32 random chars), `APP_ORIGIN` (the public https origin), `STORAGE_DIR` on a persistent volume, AI settings (`AI_PROVIDER=disabled` is a valid launch choice).
3. **Migrate:** `pnpm --filter @nexora/cvforge-backend db:migrate` before starting the new version.
4. **Run:** `pnpm --filter @nexora/cvforge-web start` behind a TLS-terminating reverse proxy. Forward the real client IP for rate limiting.
5. **Schedule** `pnpm --filter @nexora/cvforge-backend maintain` hourly.
6. **Health check:** `GET /api/health`.
7. **Extension:** build with `WXT_CVFORGE_URL=https://<origin>`, then `pnpm --filter @nexora/cvforge-extension zip` and submit to the Chrome Web Store / Edge Add-ons (developer accounts: Chrome has a one-time registration fee; Edge is free at the time of writing; confirm before paying).

### Required before a public launch

- Single-instance only today: the rate limiter is in memory. For more than one instance, move it to Postgres or Redis.
- File storage is a local directory. For multiple instances or managed hosting, implement the `ObjectStorage` interface for S3-compatible storage.
- Real email provider for password reset (implement the `Mailer` interface; currently an outbox directory).
- Backups for Postgres and storage, encrypted at rest.
- Privacy notice and terms reviewed.

### Cost notes

All software used is open source. Hosting, managed Postgres, object storage, email delivery and a hosted model API would each be paid services; none is required to run locally, and none has been purchased.

## CodeAtlas

CodeAtlas is designed to run on the developer's machine, not on a server. Distribution options (future): an npm package exposing the `codeatlas` CLI, or a single-file bundle. It must keep binding to `127.0.0.1`.
