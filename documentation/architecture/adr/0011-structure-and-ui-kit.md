# ADR 0011: Product naming in paths, package layout, and no shadcn/ui

- Status: accepted
- Date: 2026-11-03
- Deviation from spec: §3.1 suggested folders; §3.2 suggests shadcn/ui

## Decisions

1. **Paths use product brand names:**
   - `products/cvforge/{core,backend,web,extension}` (spec: `resume-intelligence/`)
   - `products/codeatlas/{core,service,web}` (spec: `architecture-brain/{web,local-service,indexing-engine}`)

   The indexing engine lives in `codeatlas/core`, because the indexer, store, queries and workflow share one SQLite schema and test fixture. Splitting them would add package boundaries without independent consumers.

2. **Shared packages:** `packages/{ai,logging,validation}`. The spec's `shared-types`, `testing` and `utilities` were not created because nothing needed them (CLAUDE.md §8: no abstraction for its own sake). Types live next to their zod schemas.

3. **UI kit:** each web app has a small local component set (`components/ui.tsx`) built on Tailwind 4 instead of shadcn/ui. shadcn/ui is a code generator that copies Radix-based components into the repo. The components needed (button, card, badge, alert, input, spinner, dialog-style confirm) are few, and keeping them local avoids a Radix dependency tree. This can be revisited if the component count grows.

## Consequences

Docs refer to products by brand name, and the mapping to spec names is in CLAUDE.md. Adding shadcn/ui later is possible without touching business logic.
