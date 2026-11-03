# ADR 0001: One pnpm TypeScript monorepo for both products

- Status: accepted
- Date: 2026-11-01

## Context

CVForge and CodeAtlas share AI provider code, logging, validation and tooling. A single founder maintains both.

## Decision

One pnpm workspace with strict TypeScript, ESM, zod at boundaries, vitest, ESLint flat config and Prettier. Shared code lives in `packages/*`; each product has a pure `core` package and thin delivery packages.

## Consequences

One `pnpm check` gate covers everything. Product packages must not import each other; only `packages/*` is shared.
