# ADR 0014: One language and file-format registry, a per-file inventory, and layered analysis

- Status: accepted
- Date: 2026-11-09
- Deviation from spec: partial. The specification names tree-sitter as the foundation for languages beyond TypeScript and JavaScript. This ADR defers tree-sitter and uses declaration patterns, labelled `partial`, in the meantime (see Decision 4).

## Context

The founder asked for every language and file type to be recognised, discovered and analysed in both CodeAtlas and ArchLens, with a coverage inventory per run, no silent omissions, a single registry, and a dashboard section built from real counts.

The audit ([LANGUAGE_COVERAGE_AUDIT.md](../../reports/LANGUAGE_COVERAGE_AUDIT.md)) found the following:

- Five separate detection tables.
- Only 26 extensions had a language name.
- No shebang or filename detection.
- Submodules and unreadable files were dropped silently.
- Only TypeScript and JavaScript were analysed.
- Brain summaries made false claims, such as "All 26 TypeScript and JavaScript code files were analysed" for an Elixir repository.

## Decisions

1. **One registry, `packages/languages` (`@nexora/languages`)**, shared by both products. It holds the following:
   - **Identification data** imported from GitHub Linguist v9.7.0 (research R22): extensions, filenames and interpreters.
   - **Nexora overlays:**
     - categories (programming, scripting, database, markup, config, build, infrastructure, API, docs and others)
     - analysers, each with its level, capabilities and limitations
     - about 80 file-type **roles** matched by path, with a bounded content check for generic syntaxes (for example Kubernetes manifests, OpenAPI, Liquibase and Flyway)
   - **The exclusion policy:** ignored folders, secret paths and generated files.
   - **The repository listing:** `git ls-files` or a directory walk.

   CodeAtlas discovery and the ArchLens inventory script import the same code. No detection table remains in the products.

2. **Classification order:**
   1. magic bytes or NUL
   2. Git LFS pointer
   3. filename
   4. extension (longest suffix first; heuristics for ambiguous extensions)
   5. shebang
   6. Vim or Emacs modeline
   7. content signature
   8. otherwise "Unrecognised (.ext)"

   Every result records how it was found and whether it was `observed` or `inferred`. Inferred results also list the alternatives. UTF-16 files with a BOM are decoded.

3. **Seven distinct statuses per file:** `full`, `partial`, `text`, `unsupported`, `failed`, `excluded` and `binary`.
   - Coverage is (full + partial) / readable, where readable means every file except excluded and binary ones.
   - Text-only files never count as analysed.
   - The status counts must add up to the number of listed paths. Indexing fails if they do not, and the brain page drops an inventory that breaks the rule.
   - CodeAtlas stores one row per file in a new `file_inventory` table (schema v7). It serves the rows at `GET /api/repos/:id/inventory`.

4. **Layered analysis**, each layer labelled with its level:
   - **TypeScript and JavaScript: compiler (`full`).** Unchanged.
   - **About 80 other languages: declaration patterns (`partial`).** Classes, functions and methods with their lines, and imports.
     - Imports are resolved by path, module path, declared name, go.mod module or file stem.
     - Resolved import edges are `inferred`.
     - Calls are not extracted.
   - **Structured formats: format parsers.** JSON/JSONC, YAML (`yaml` 2.9.1, R23), TOML (`smol-toml` 1.9.1, R24), XML (an in-house scanner with no DTD or entity expansion), INI, Dockerfile, Makefile, CMake, HCL, IDLs (proto, Thrift, GraphQL), go.mod, pip requirements, lockfile counters and SQL objects.
     - The parser for the file's format reads the whole file. The result is `full` when the reader recognises the document type, and `partial` when it reads only part of the meaning (for example Liquibase table names without columns).
     - Links between files (`builds`, `runs`, `includes`, `references`) are `observed` when the path is written literally, and `inferred` when a default file was found in a named folder.

   **Why not tree-sitter now:** it needs a native or WebAssembly grammar per language (more than 80 packages to vet, pin and ship), and it would make the ArchLens script depend on more than Node.js. Patterns give names, lines and imports now, under an honest `partial` label. Tree-sitter remains the planned route to `full` for other languages. It can replace a pattern rule one language at a time without changing the inventory or the statuses.

5. **Dashboards show only inventory counts.**
   - The brain has a "Languages & files" overlay with: a coverage summary, status meanings, languages, file types by group, folders, reasons, heuristics, unlisted paths and the files not fully analysed.
   - The CodeAtlas Overview has the same section, plus a browser for every file.
   - The ArchLens script writes the same inventory into a hand-built model. Files the model cites count as read (`partial`). Nothing is ever `full` there.

6. **Dependencies added** (exact versions, no transitive dependencies): `yaml` 2.9.1 (ISC) and `smol-toml` 1.9.1 (BSD-3-Clause) in `@nexora/codeatlas-core`. The Linguist data is vendored with its MIT licence.

## Consequences

- Repositories in Java, Go, C#, Elixir, COBOL, Fortran and other languages now show their classes and functions and say "partially analysed". Previously they were reported as text or not mentioned.
- The brain draws pattern-found declarations, with a note that a compiler did not check them. It draws imports between files from each file's first declaration, and build, run and include links between DevOps files.
- Indexing takes longer on repositories with much non-TypeScript code, because those files are now read. The measurements are in [LANGUAGE_COVERAGE_VALIDATION.md](../../reports/LANGUAGE_COVERAGE_VALIDATION.md).
- Pattern extraction can miss declarations written in unusual layouts (multi-line signatures, macros, generated code) and can be fooled by code inside strings. The level label and the per-language method say this.
- Linguist data updates are a maintainer step: rerun `scripts/import-linguist.py` with a new tag, then run the registry tests.
