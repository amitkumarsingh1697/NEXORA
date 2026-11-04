# Contributing

Thanks for your interest in NEXORA.

## Before you start

- Read [CLAUDE.md](CLAUDE.md) for the engineering rules (no fake implementations, tests first, research before using an unfamiliar library) and the [master specification](documentation/product/MASTER_SPECIFICATION.md) for what each product must do.
- For anything larger than a small fix, open an issue first so the approach can be agreed.

## Development

```bash
pnpm install
sudo service postgresql start     # or docker compose -f infrastructure/local-development/docker-compose.yml up -d
pnpm --filter @nexora/cvforge-backend db:migrate
pnpm check                        # typecheck, lint, unit and integration tests
pnpm format:check
pnpm --filter @nexora/cvforge-web e2e
pnpm --filter @nexora/codeatlas-web e2e
```

## Pull requests

- Keep each change focused and add or extend tests for it.
- `pnpm check`, `pnpm format:check` and the relevant E2E suite must pass. CI runs all of them.
- Update [documentation/REQUIREMENTS_TRACEABILITY.md](documentation/REQUIREMENTS_TRACEABILITY.md) and other docs your change affects.
- Never commit secrets, real resumes or private source code. Test data must be synthetic.

## Licence

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the licence of this repository.
