# Architecture decisions

Decisions are recorded as ADRs in [adr/](adr/). Add a new numbered file for each significant decision; never rewrite an accepted ADR, supersede it instead.

| ADR                                                      | Decision                                                                                                                         | Status                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [0001](adr/0001-pnpm-typescript-monorepo.md)             | One pnpm TypeScript monorepo for both products                                                                                   | accepted                                               |
| [0002](adr/0002-cvforge-nextjs-postgres.md)              | CVForge: Next.js route handlers over a backend services package, Postgres + drizzle                                              | accepted                                               |
| [0003](adr/0003-evidence-states.md)                      | Three evidence states; explicit confirmation for work-authorisation claims; fabrication guard                                    | accepted                                               |
| [0004](adr/0004-deterministic-first-ai.md)               | Deterministic first; local model optional; hosted model only with consent                                                        | accepted                                               |
| [0005](adr/0005-extension-token-pairing.md)              | Extension pairing codes, short-lived access tokens, rotating refresh tokens with reuse detection                                 | accepted                                               |
| [0006](adr/0006-codeatlas-local-sqlite.md)               | CodeAtlas as a 127.0.0.1 service with SQLite + FTS5 via node:sqlite                                                              | accepted                                               |
| [0007](adr/0007-typescript-compiler-api-indexer.md)      | TypeScript Compiler API indexer with observed / inferred / unknown labels                                                        | accepted                                               |
| [0008](adr/0008-human-gated-patches.md)                  | Hash-bound patch approval in worktrees                                                                                           | accepted; "never merges" superseded by 0010            |
| [0009](adr/0009-custom-auth-over-authjs.md)              | Custom email/password auth instead of Auth.js (research R10)                                                                     | accepted                                               |
| [0010](adr/0010-change-request-model-and-local-merge.md) | Change-request naming map; human-triggered fast-forward local merge                                                              | accepted (S1-1)                                        |
| [0011](adr/0011-structure-and-ui-kit.md)                 | Brand-named product paths; no shadcn/ui                                                                                          | accepted                                               |
| [0012](adr/0012-architecture-brain-viewer.md)            | 3D architecture brain: shared three.js viewer and single-file HTML for CodeAtlas and ArchLens                                    | accepted                                               |
| [0013](adr/0013-database-tables-and-diagrams.md)         | Database tables, function-to-table links, and in-house SVG ER, schema and class diagrams                                         | accepted                                               |
| [0014](adr/0014-language-and-file-format-registry.md)    | One language and file-format registry (Linguist data), per-file inventory, layered analysis; tree-sitter deferred                | accepted; the tree-sitter deferral is resolved by 0015 |
| [0015](adr/0015-tree-sitter-syntax-layer.md)             | tree-sitter syntax layer: vendored, hash-checked WebAssembly grammars for 31 languages; labelled call and inheritance resolution | accepted                                               |

## Smaller decisions (not ADR-worthy)

- **Exact dependency versions** are pinned in every `package.json` (no ranges) for reproducible installs.
- **PDF export through LibreOffice** rather than a headless browser: the DOCX is the source of truth, so the PDF matches it.
- **Cytoscape for large graphs, React Flow for flows:** cytoscape handles hundreds of nodes with layout; React Flow gives readable left-to-right flow diagrams.
- **Hash router in CodeAtlas web:** the SPA is served by a minimal static handler, so client routes must not need server rewrites.
- **Clock injection (`ctx.now`)** in CVForge services so expiry and retention logic is testable without sleeping.
