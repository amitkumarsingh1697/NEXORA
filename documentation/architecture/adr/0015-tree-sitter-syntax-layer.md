# ADR 0015: A tree-sitter syntax layer for every language with a trusted grammar

- Status: accepted
- Date: 2026-11-09
- Resolves the partial deviation recorded in ADR 0014 (tree-sitter deferred). The specification names tree-sitter as the foundation for languages beyond TypeScript and JavaScript.

## Context

After ADR 0014, every language other than TypeScript and JavaScript was read by declaration patterns: status `partial`, no parameters as data, no calls, no inheritance. The founder asked for full analysis of every language, file, method, function and database object, and allowed adding whatever checker gives an accurate result.

A full compiler front end per language (javac, Roslyn, rustc, go/types, mypy…) needs that language's toolchain on the user's machine and would make indexing depend on it. A parser per language does not. tree-sitter is the parser family the specification names, has maintained grammars for most languages, and ships them as WebAssembly, so one runtime parses every language with no native build and no toolchain.

## Decisions

1. **New shared package `packages/syntax` (`@nexora/syntax`)**, used by CodeAtlas (and, in a later sprint, bundled into ArchLens). Products still never import each other.
2. **Runtime:** `web-tree-sitter` 0.27.1 (MIT), pinned (research R26). It is the only new runtime dependency.
3. **Grammars are vendored, not installed.** `scripts/vendor-grammars.mjs` fetches each grammar package at an exact version with `npm pack --ignore-scripts`, copies only its `.wasm` and licence, gzips it into `packages/syntax/grammars/`, and records package, version, npm integrity (sha512), SHA-256 of the WebAssembly, licence and repository in `grammars/MANIFEST.json`. 31 grammars, 5.4 MB in total (research R27). Installing the packages instead would add about 1.1 GB of `node_modules` (native sources and prebuilt binaries the project does not use).
4. **Every grammar is hash-checked before it runs.** `grammar(id)` refuses a file whose SHA-256 differs from the manifest. A test swaps one grammar for another and checks the refusal.
5. **One extractor, one spec per language.** `src/extract.ts` walks the parse tree with a per-language `LangSpec` (`src/specs/*.ts`) and returns declarations (class, interface, struct, enum, trait, module, namespace, object, record, impl, type, function, method, constructor, property, resource) with line ranges, parameters (name, declared type, optional, variadic), declared return types, base types, receivers, imports with the names and aliases they bring in, calls (callee, receiver, line, `new`), typed variables and fields, and every syntax error or missing token with its line.
6. **Status rule.** A file in a syntax language is `full` only when the whole file parses with no error or missing node; otherwise `partial`, with the error count and first error line in the reason. When a grammar cannot be loaded, the file falls back to the declaration patterns and the reason says so. The file record gains `resolution: 'compiler' | 'syntax'` (schema v8) so "full" never hides how references were linked.
7. **Calls and inheritance are linked without inventing certainty** (`src/resolve.ts`). Each link is labelled:
   - `observed`: declared in the same file, in a scope the call can see (a top-level function, a member through `self`/`this`, or an implicit member call in languages that allow it).
   - `inferred`: through an import of the file, the receiver's declared type (parameter, local, field, Go method receiver, `self.x = typed_param`), a constructed value (`new T`, `T{}`, `T::new`, `T.new`, `T(...)` when T is a repository class), a module-qualified call, the same package folder, or a unique name. The detail says which.
   - `unresolved`: no candidate, several candidates, a receiver imported from outside the repository, a receiver typed with a class not in the repository, or a built-in method name on an untyped receiver. Unresolved calls are kept on the caller (`unresolvedCalls`), never drawn.
   - In statically typed languages a name-only match on a member call is never offered: the static type selects the method, and only a type checker knows it (sprint L4: SCIP indexers where a toolchain exists).
8. **Languages in this sprint (31):** Python, Starlark, Go, Java, C#, C, C++, Objective-C, CUDA, Rust, PHP, Ruby, Scala, Kotlin, Gradle Kotlin DSL, Groovy, Gradle, Lua, Elixir, Haskell, Julia, OCaml, F#, Zig, Solidity, Shell, PowerShell, Puppet, Bicep, HCL/Terraform. HTML, CSS, ERB and Svelte grammars are vendored for a later sprint. Other languages keep the declaration patterns (`partial`) until a trusted grammar is vendored (sprint L5 needs the founder's approval to build grammars that have no published WebAssembly).

## Consequences

- Files in the 31 languages move from `partial` to `full` when they parse. Brain neurons for them carry parameters, return types and signatures, and calls, instantiations, `extends` and `implements` between them are drawn as synapses with their confidence and evidence.
- Indexing stays local and needs no toolchain. Measured on four public repositories (research R28): 0.4 s to 1.4 s each, every file parsed without errors.
- Precision of `inferred` links was sampled by hand (R28). Name-only member links misfired on library methods (Java `String.length`, Ruby `Array#length`), which led to the static-language rule and the built-in name list in Decision 7.
- Call targets in dynamic languages remain approximate where the source does not say what a receiver is; those links say so in their detail.
- The grammar files are binary data in the repository. Updating one means re-running the vendor script, which updates the manifest and hashes; the tests fail if a file and the manifest disagree.
