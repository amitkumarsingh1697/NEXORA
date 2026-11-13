# ADR 0020: The ArchLens skill ships the CodeAtlas indexer as one bundled script

- Status: accepted
- Date: 2026-11-12
- Deviates from CLAUDE.md §8 ("Products never import each other") for one generated artefact, for the reason below.

## Context

ArchLens is a Claude Code skill: a folder of instructions and scripts that runs wherever Claude Code runs, usually without a Nexora checkout. Before this decision, an architecture brain from ArchLens came either from CodeAtlas (only with a Nexora checkout) or from a model Claude wrote by hand after reading the code. The hand-written route covers what Claude reads, a few hundred parts at best, so on a large repository most of the code was missing. The founder asked for full analysis of every language and file with nothing missed. The only analyser that does that is the CodeAtlas indexer (TypeScript compiler, 71 tree-sitter grammars, the PostgreSQL parser, the ORM, build and CI readers).

Two options were weighed:

1. Move the analysers into a new shared package and have both products depend on it. Correct by the rule, but the indexer, its SQLite store and its brain builder are most of `codeatlas/core`; the result would be the same code under a new name, and a second copy of the brain builder would drift.
2. Bundle the CodeAtlas brain command into the skill as a generated file, the way `assets/brain-template.html` (from `packages/brain`) and `scripts/inventory.mjs` (from `packages/languages`) already are.

## Decision

Option 2.

1. `products/codeatlas/service/src/brain-command.ts` holds the `brain` command (index, build the brain, write the page and model, print coverage). The CodeAtlas CLI and the skill entry point `src/skill-brain.ts` both call it, so they give the same result.
2. `products/codeatlas/service/scripts/make-skill-brain.mjs` bundles `skill-brain.ts` with esbuild 0.28.2 (exact pin) into `skills/archlens/scripts/brain/brain.mjs`, and copies beside it what the code loads at run time: the grammar `.wasm.gz` files with their manifest and licences, `web-tree-sitter.wasm`, `libpg-query.wasm`, and TypeScript's `lib.*.d.ts` files with TypeScript's licence. Total 23.0 MiB. (ADR 0023 later packed these into one file.)
3. The skill runs it with Node alone: `node scripts/brain/brain.mjs <repo> --out <name>-brain.html --json brain-model.json`. It needs Node 22.5 or later (`node:sqlite`). The index lives in a temporary folder that is removed afterwards; nothing is written outside the two output files.
4. `skill-bundle.test.ts` keeps the bundle honest: the committed `brain.mjs` must equal a fresh build (so it is never stale), and the bundle's brain of a mixed TypeScript, Python, COBOL and SQL fixture must have exactly the same parts and connections as the in-process indexer.
5. CodeAtlas itself still never imports ArchLens, and ArchLens source never imports CodeAtlas: the dependency is one generated folder, rebuilt by a command, like the template and the inventory.

## Consequences

- An ArchLens brain now covers the whole repository with the same analysis as CodeAtlas. Proof runs on Immich and Twenty are recorded in research R39.
- The skill folder grows by 23.0 MiB (14 MiB of it grammars). The ArchLens packaging must include `scripts/brain/`.
- The skill's `allowed-tools` stays `Read Grep Glob`: running `node` asks the user, as before.
- Licences shipped in the bundle: Nexora's own code, TypeScript (Apache-2.0, `TYPESCRIPT-LICENSE.txt`), web-tree-sitter (MIT), libpg-query (BSD-3-Clause, PostgreSQL licence for the parser), and the grammars per ADR 0019. esbuild keeps third-party licence comments at the end of `brain.mjs`.
- Large repositories need more memory than Node's default heap: the brain and index commands re-run themselves once with a larger limit (`src/heap.ts`; three quarters of the machine's memory, at most 16 GiB). Twenty peaked at 8.1 GB resident.
