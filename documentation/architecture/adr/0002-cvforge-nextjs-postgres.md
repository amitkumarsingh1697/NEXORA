# ADR 0002: CVForge uses Next.js route handlers over a separate backend package, with Postgres + drizzle

- Status: accepted
- Date: 2026-11-01

## Context

CVForge needs auth, relational data (resumes → versions → changes, workspaces → requirements → evidence) and a web UI, deployable as one service.

## Decision

Next.js 16 App Router serves pages and `/api/*`. All logic sits in `@nexora/cvforge-backend` services that take an explicit `Ctx`; route handlers only authenticate, call a service and map errors. Postgres 16 with drizzle ORM and SQL migrations.

## Consequences

Services are tested against real Postgres without HTTP. The web package can be replaced without touching business rules. Requires Postgres for development (docker compose or native).
