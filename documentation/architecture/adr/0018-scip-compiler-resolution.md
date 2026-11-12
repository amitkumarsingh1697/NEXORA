# ADR 0018: Compiler-grade references from SCIP indexes

- Status: accepted
- Date: 2026-11-12
- Extends ADR 0015 (tree-sitter syntax layer). The syntax layer still finds every declaration, call and base class; this decision adds a second opinion on what each name refers to, from the language's own compiler or type checker.

## Context

The founder asked for full analysis of every language. After sprint L1, CodeAtlas links calls and base classes in the 31 tree-sitter languages by name: through imports, the enclosing scope, and, when one declaration of that name is reachable, by that alone. Those links are labelled `inferred`, because nothing checked the receiver's type. Name matching cannot tell `order.save()` from `draft.save()` when two classes declare `save`, cannot follow inherited methods, and cannot tell a call into the standard library from a call into the repository. On gin (Go) at `0f09c3a`, 7,479 of 9,453 calls stayed unresolved after syntax linking (research R34).

Only a compiler or type checker can answer these questions. Writing one per language is out of scope. The SCIP format (Sourcegraph's Code Intelligence Protocol) is the common output of existing indexers that wrap the real tools: scip-python (Pyright), scip-typescript (the TypeScript compiler), scip-go (go/packages and go/types), scip-java (javac and the Kotlin and Scala compilers), rust-analyzer, scip-dotnet (Roslyn), scip-clang (Clang) and scip-ruby (Sorbet). Each writes an `index.scip`: every definition and reference with its exact range and a globally unique symbol.

## Decisions

1. **New shared package `packages/scip` (`@nexora/scip`)**, pure and without runtime dependencies. It decodes the protobuf wire format itself (about 110 lines, bounds-checked, every malformed input a `WireError` with the byte offset) instead of adding `protobufjs` or `@bufbuild/protobuf`, because only five messages and a few fields are read. Field numbers come from `scip.proto` at sourcegraph/scip commit `be1d9f769a02` (research R33). The package parses SCIP symbol strings by the grammar in that file, and answers "what does the name at this line refer to" (`ScipResolver.resolve`): a definition in the repository, a symbol outside it, several symbols (not decided), or a symbol of the repository's own package that the index never defines (not decided). ArchLens bundles it in sprint L6.
2. **CodeAtlas reads indexes the user gives it**: `codeatlas index|brain <path> --scip <file>` (repeatable), and `IndexOptions.scip.files`. Paths in the index are joined to the repository through the index's `project_root`.
3. **CodeAtlas runs only the indexers that analyse source without building or running it**, and only when asked (`--run-indexers`, `IndexOptions.scip.run`; off by default; the local web service never turns it on):
   - scip-python, when the repository has `.py` or `.pyi` files. Pyright reads the code; it starts the Python interpreter on PATH only to list its search paths, after removing the working directory from `sys.path`, and runs `pip3 list` for package versions (research R33).
   - scip-go, when the repository has a `go.mod`, with `CGO_ENABLED=0` (no C compiler), `GOTOOLCHAIN=local` (no toolchain download) and `GOFLAGS=-mod=readonly` (`go.mod` and `go.sum` never rewritten). It may download module source through the Go module proxy; it never runs it.
   - Each run has a timeout (10 minutes by default), writes into a temporary directory that is removed afterwards, and is reported with its duration, or with the reason it produced nothing: not installed, the exit code and the last line of its error output, or an unreadable index.
4. **Indexers that build the project are never run by CodeAtlas**: scip-java and scip-kotlin (Gradle or Maven), rust-analyzer (build scripts and procedural macros), scip-dotnet (MSBuild), scip-clang (needs a compilation database from the build) and scip-ruby (Sorbet with the project's gems). Building runs code from the repository and its dependencies. The user runs these in their own build environment and passes the `.scip` file.
5. **How an answer changes a link.** For each call and base class the syntax layer found, in a file the index covers:
   - a definition in the repository whose declaration the syntax layer drew becomes the link's target, labelled `observed`, with the detail "resolved by <tool> to <file>:<line>". When the syntax layer had chosen another declaration, the detail also names it. When the symbol has several declarations (Python `@overload` stubs and the implementation), the one with the longest body is the target;
   - a symbol outside the repository draws no link and is not counted unresolved. An `inferred` syntax link to a repository declaration of that name is removed. An `observed` one (a declaration in the same file, or an import that names it) is kept, because the indexer's answer and the source disagree;
   - no answer, several answers, a repository symbol without a definition, or a definition the syntax layer did not draw (a field or variable): the syntax result stands.
6. **Evidence and coverage.** The file inventory records "references resolved by <tool>" and resolution `compiler` for each covered file. `CoverageReport.scip` lists every index read or run, and `otherAnalysis.scip` counts resolved, agreed, corrected, added, external, removed, undecided and not-drawn links.

## Consequences

- With an index, calls whose receiver needs a type are linked and labelled observed: on gin, unresolved calls fall from 7,479 to 845 and observed links rise from 733 to 3,641; 1,670 calls the syntax layer had left unresolved are linked, and 4,964 library calls are no longer counted unresolved (research R34).
- Java, Kotlin, Scala, Rust, C#, C, C++, Objective-C and Ruby get compiler-grade links only when the user supplies an index from their build. Without one, those languages keep syntax-layer links, as before.
- scip-python honours the project's own Pyright configuration. In requests, `[tool.pyright] include = ["src/requests"]` means the tests are not indexed; those files keep syntax-layer links.
- scip-go uses the Go toolchain on PATH. A module that requires a newer Go than the installed one is reported as not indexed ("go.mod requires go >= …"); CodeAtlas does not download a toolchain.
- Indexers run as separate processes with the user's permissions. They are not sandboxed by CodeAtlas (security threat A20).
