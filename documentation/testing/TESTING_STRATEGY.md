# Testing strategy

## Layers

| Layer                    | Tool                                      | Scope                                                                                                                                                                                                                                                                                                          | Location                                                                                                      |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit                     | vitest                                    | Pure logic: parsers, evidence engine, scorers, guard, diff, export verification, AI structured output, logging redaction, validation                                                                                                                                                                           | `packages/*/src/__tests__`, `products/cvforge/core/src/__tests__`, `products/cvforge/extension/src/__tests__` |
| Integration (DB)         | vitest + real Postgres                    | CVForge services end to end with a fresh schema per file and an injected clock                                                                                                                                                                                                                                 | `products/cvforge/backend/src/__tests__`                                                                      |
| Integration (git/SQLite) | vitest + temp git repos                   | CodeAtlas indexer on a generated fixture repo with two git authors, chat retrieval/grounding with fake providers, the full investigation workflow with real git worktrees                                                                                                                                      | `products/codeatlas/core/test`                                                                                |
| HTTP                     | vitest + real server on an ephemeral port | CodeAtlas token/Host/Origin checks, routes, chat and investigation endpoints                                                                                                                                                                                                                                   | `products/codeatlas/service/test`                                                                             |
| E2E                      | Playwright (Chromium)                     | CVForge: signup → upload → confirm → workspace → questions → suggestions → version → export, auth redirects; extension pairing, extraction from a fixture page, save, token storage, reuse refusal, disconnect. CodeAtlas: register fixture → index → every view → search → ask → investigation through commit | `products/*/web/e2e`                                                                                          |

## Principles

- **Real dependencies where cheap:** real Postgres, real git, real SQLite, real LibreOffice for PDF. No mocking of the database.
- **Fakes only at the model boundary:** AI providers are faked to test validation, repair, guard and fallback paths deterministically.
- **Time is injected** (`ctx.now`) so expiry and retention are tested without waiting.
- **Security behaviour is tested as behaviour:** CSRF refusal, IDOR 404s, token reuse revocation, Host/Origin refusal, path traversal refusal, command allowlist refusal, hash mismatch refusal.
- **No claim without a run:** results in IMPLEMENTATION_STATUS come from executed commands.

## Running

```bash
pnpm check                                  # all unit + integration
pnpm --filter @nexora/cvforge-backend test  # needs Postgres (TEST_DATABASE_URL)
pnpm --filter @nexora/cvforge-web e2e       # resets cvforge_e2e, builds and starts Next, builds the extension
pnpm --filter @nexora/codeatlas-web e2e     # builds a fixture repo, starts the service on port 4410
```

## Gaps

- No tests against a real Ollama model (not installed in the build environment).
- Playwright cannot click the browser toolbar icon; the extension E2E opens the popup page directly and simulates the active tab.
- No load or soak tests; no fuzzing of the document parsers yet.
- No visual regression or automated accessibility (axe) checks yet.
- CI workflow exists but has not run on GitHub.
