# ADR 0023: The ArchLens bundle's run-time files packed into one file

- Status: accepted
- Date: 2026-11-12

## Context

The Claude app refused the ArchLens skill zip with "Zip contains too many files (maximum 200)". The skill held 273 files: 101 TypeScript `lib.*.d.ts` files and 149 grammar files (ADR 0020) made up most of them.

## Decision

1. `make-skill-brain.mjs` packs TypeScript's `lib.*.d.ts` files, the grammar `.wasm.gz` files with their manifest, and `libpg-query.wasm` into one file, `scripts/brain/runtime.pack.gz`: a 4-byte length, a JSON list of names and sizes, then the bytes, gzipped. The order is sorted, so a rebuild gives the same bytes.
2. The bundle's banner unpacks it on each run into a new private folder (`mkdtemp` in the system temporary folder), removed when the process exits. `__filename` and `__dirname` point into that folder, so TypeScript and libpg-query find their files there, and the grammar folder is read from it.
3. `web-tree-sitter.wasm` stays beside `brain.mjs`, because web-tree-sitter finds it from the module's own URL.
4. Licences stay readable outside the pack: `GRAMMARS.json` (the grammar manifest), `GRAMMAR-LICENSES.txt` (every grammar licence, each under its id) and `TYPESCRIPT-LICENSE.txt`.

## Consequences

- The skill holds 20 files (19 MiB). A test fails if it reaches 200.
- On Keycloak (commit 1f4a80f5) the packed bundle gives exactly the same parts and connections as before (83,635 and 110,600).
- Each run writes about 18 MiB to the temporary folder first. A run killed by a signal that Node does not turn into an exit (for example `SIGKILL`) leaves that folder behind.
