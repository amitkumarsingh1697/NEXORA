# ADR 0019: Tree-sitter grammars built from pinned source commits

- Status: accepted
- Date: 2026-11-12
- Extends ADR 0015 (tree-sitter syntax layer). ADR 0015 vendored only grammars that publish a WebAssembly build on npm. This decision adds grammars that publish none, built here from source.

## Context

The founder asked for full analysis of every programming and scripting language. After sprint L1 the syntax layer parsed 31 languages. Dart, Swift, Perl, R, Erlang, the Lisp family, Fortran, COBOL, Ada, Pascal, the hardware languages and others had only declaration patterns: names, never calls or types (status `partial`). Their tree-sitter grammars exist but publish no `.wasm`. The founder approved building them ("Yes, compile them", then "Yes, build all 44").

## Decisions

1. **A pinned source list**, `packages/syntax/scripts/grammar-sources.json`: for each grammar, its repository, the exact commit, an optional subdirectory, and any source patch with its reason. The builder is pinned too: `tree-sitter-cli@0.27.1`, the same version as the `web-tree-sitter` runtime, so every `.wasm` has ABI 15.
2. **One build script**, `scripts/build-grammars.mjs`. It fetches each commit with git, applies its patches, and runs `tree-sitter build --wasm` (wasi-sdk and binaryen, downloaded by the CLI into its cache). It uses the committed `src/parser.c`; only a repository that commits none is generated first with `tree-sitter generate`, which evaluates that repository's `grammar.js` (security threat A21). It writes `grammars/<id>.wasm.gz`, the grammar's licence text as `grammars/<id>.LICENSE`, and a manifest entry with the commit (`integrity: git:<commit>`), the SHA-256 and size of the `.wasm`, the licence, the builder and any patch.
3. **The runtime check does not change.** Every grammar, built or downloaded, loads only when its bytes match the SHA-256 in `MANIFEST.json`.
4. **44 grammars**, listed with commit and licence below. One is patched: Swift's external scanner calls `fprintf(stderr, …)` and `exit` on an internal error, which the WebAssembly C library does not provide; the patch replaces both with `__builtin_trap()`, so the same error stops the parse instead of the process. Swift is built from the repository's `with-generated-files` commit, because `tree-sitter generate` at its main branch fails.
5. **Licences.** 39 grammars are MIT or Apache-2.0; Clojure is CC0-1.0 and fish is the Unlicense (both public-domain dedications). Two are weak copyleft and were accepted by name: Nim (MPL-2.0, file-level copyleft) and Vala (LGPL-2.1-only). Both are shipped unmodified, as separate files loaded at run time, with their licence text beside them and their source commit in the manifest, which is what both licences ask of a distributor of an unmodified work. The licence test admits exactly these two by id; any other copyleft grammar fails it.
6. **Extraction rules** for 41 languages in `src/specs/l5.ts`, each checked by a fixture in `test/fixtures` and a reviewed snapshot in `test/expected`. GLSL reuses the C rules, HLSL the C++ rules, Apex the Java rules, Luau the Lua rules with typed parameters; the rest have their own. Verilog and SystemVerilog have separate grammars and rules: SystemVerilog's grammar names its fields, the Verilog grammar parses plain Verilog code whose identifiers clash with SystemVerilog keywords.
7. **Five grammars are built but not wired**: Vue, SQL, Make, CMake and Dockerfile. Those file types keep their dedicated analysers (`ts-compiler` for Vue scripts, `@nexora/sql` for SQL, the `make`, `cmake` and `dockerfile` extractors), which already read what CodeAtlas uses from them. The grammars are kept so a later sprint can replace an extractor with a parse; until then they cost 13.7 MB of the 127 MB of built `.wasm` (1.0 MB of the 8.2 MB shipped gzipped).
8. **Language-specific choices**, each because the language has no other way to say it:
   - Paragraphs (COBOL) and labels (assembly) are flat in the tree; their statements are attached through `DeclRule.trailing`, which now skips unnamed tokens such as newlines. A COBOL program is a callable (`CALL 'PROG'`), `PERFORM` and `GO TO` are calls to paragraphs, `COPY` is an include, and level 01 and 77 items are the program's records.
   - Instances in Verilog, SystemVerilog and VHDL are recorded as constructions (`isNew`) of the module or entity, which is the hardware hierarchy; a VHDL architecture is an `impl` of its entity.
   - Fortran argument types, and MATLAB, Fortran and VHDL `f(x)` (a call or an array element; the grammar cannot tell) are recorded as call candidates; only a matching declaration turns one into a link.
   - In Dart, Swift, D, Vala, Haxe, ActionScript, Apex, Pascal, Crystal and GDScript a bare call inside a class body may name a member of that class, as in Java.
   - A declaration's last line no longer counts a trailing newline the grammar includes (Fortran, MATLAB).

## Consequences

- 71 languages are parsed in full by tree-sitter (41 added); `@nexora/languages` sends them all to the `syntax` analyser, and a CodeAtlas test keeps the two lists equal. COBOL and Fortran files are now `full` instead of `partial`.
- Grammar limitations stay visible as parse problems on the file: HLSL `cbuffer … : register(b0)`, Haxe `abstract` types and WGSL `alias` declarations are not parsed by the pinned commits (KNOWN_LIMITATIONS).
- Languages with no tree-sitter grammar at all keep declaration patterns and are never called `full`: Smalltalk, Raku, VBA, VB6, VBScript, VB.NET, RPGLE, JCL, Motorola 68K assembly, Prolog, Mojo, Cython, ABAP and Objective-C++.
- Rebuilding needs git, npx and network access to GitHub and the wasi-sdk download. The built files are committed, so installing and running Nexora needs none of that.

## Grammars

| id            | Repository                                  | Commit         | Licence       | `.wasm` bytes |
| ------------- | ------------------------------------------- | -------------- | ------------- | ------------- |
| dart          | UserNobody14/tree-sitter-dart               | `0038280b774b` | MIT           | 1200037       |
| swift         | alex-pinkus/tree-sitter-swift               | `82bb3a533e08` | MIT           | 4161780       |
| clojure       | sogaiu/tree-sitter-clojure                  | `e43eff80d17c` | CC0-1.0       | 97832         |
| commonlisp    | tree-sitter-grammars/tree-sitter-commonlisp | `32323509b3d9` | MIT           | 775184        |
| crystal       | crystal-lang-tools/tree-sitter-crystal      | `50ca9e6fcfb1` | MIT           | 6082576       |
| d             | gdamore/tree-sitter-d                       | `64f27931b4e6` | MIT           | 3743299       |
| elm           | elm-tooling/tree-sitter-elm                 | `e1e8fea161a1` | MIT           | 182551        |
| erlang        | WhatsApp/tree-sitter-erlang                 | `62c82e67b73e` | Apache-2.0    | 434069        |
| fortran       | stadelmanma/tree-sitter-fortran             | `72f8759dea28` | MIT           | 6709405       |
| gdscript      | PrestonKnopp/tree-sitter-gdscript           | `872e2e969058` | MIT           | 334181        |
| gleam         | gleam-lang/tree-sitter-gleam                | `fa6d0d94804f` | Apache-2.0    | 421705        |
| hack          | slackhq/tree-sitter-hack                    | `1a7ded902881` | MIT           | 1833373       |
| haxe          | vantreeseba/tree-sitter-haxe                | `a25faf5efa84` | MIT           | 4718449       |
| luau          | tree-sitter-grammars/tree-sitter-luau       | `a8914d6c1fc5` | MIT           | 94546         |
| matlab        | acristoffers/tree-sitter-matlab             | `ff2f83da49bb` | MIT           | 451716        |
| nim           | alaviss/tree-sitter-nim                     | `ac72ba30d16e` | MPL-2.0       | 5797683       |
| odin          | tree-sitter-grammars/tree-sitter-odin       | `d2ca8efb4487` | MIT           | 2224336       |
| pascal        | Isopod/tree-sitter-pascal                   | `042119eca2e1` | MIT           | 715677        |
| perl          | tree-sitter-perl/tree-sitter-perl           | `4a40da6d7e5e` | MIT           | 4708765       |
| purescript    | postsolar/tree-sitter-purescript            | `f541f95ffd68` | MIT           | 1278957       |
| r             | r-lib/tree-sitter-r                         | `58a22794466c` | MIT           | 485005        |
| racket        | 6cdh/tree-sitter-racket                     | `b3cbbde75ce2` | MIT           | 105438        |
| scheme        | 6cdh/tree-sitter-scheme                     | `45c72463ac42` | MIT           | 97261         |
| verilog       | tree-sitter/tree-sitter-verilog             | `227d277b6a1a` | MIT           | 18135047      |
| systemverilog | gmlarumbe/tree-sitter-systemverilog         | `08c5e379b9b6` | MIT           | 22988266      |
| v             | vlang/v-analyzer                            | `7801a67d0583` | MIT           | 2118706       |
| vhdl          | jpt13653903/tree-sitter-vhdl                | `0d5d60b269c7` | MIT           | 1563388       |
| vala          | vala-lang/tree-sitter-vala                  | `97e6db3c8c73` | LGPL-2.1-only | 578241        |
| cobol         | yutaro-sakamoto/tree-sitter-cobol           | `550020ddf42e` | MIT           | 13664239      |
| ada           | briot/tree-sitter-ada                       | `b1d2035a83c4` | MIT           | 329748        |
| actionscript  | Rileran/tree-sitter-actionscript            | `24919034fc78` | MIT           | 344593        |
| apex          | aheber/tree-sitter-sfapex                   | `1a4baf203f0b` | MIT           | 1606767       |
| asm           | RubixDev/tree-sitter-asm                    | `839741fef4da` | MIT           | 27639         |
| elisp         | Wilfred/tree-sitter-elisp                   | `0cbf0906d9ee` | MIT           | 54385         |
| glsl          | tree-sitter-grammars/tree-sitter-glsl       | `24a6c8ef698e` | MIT           | 860924        |
| hlsl          | tree-sitter-grammars/tree-sitter-hlsl       | `bab9111922d5` | MIT           | 4224940       |
| wgsl          | szebniok/tree-sitter-wgsl                   | `40259f3c77ea` | MIT           | 66652         |
| nix           | nix-community/tree-sitter-nix               | `21daff7ec37b` | MIT           | 81641         |
| vue           | tree-sitter-grammars/tree-sitter-vue        | `ce8011a414fd` | MIT           | 28727         |
| sql           | DerekStride/tree-sitter-sql                 | `4cd7224bfcf1` | MIT           | 13368264      |
| make          | tree-sitter-grammars/tree-sitter-make       | `70613f3d812c` | MIT           | 145448        |
| cmake         | uyha/tree-sitter-cmake                      | `a3ec2b2144da` | MIT           | 75610         |
| dockerfile    | camdencheek/tree-sitter-dockerfile          | `971acdd90856` | MIT           | 49588         |
| fish          | ram02z/tree-sitter-fish                     | `b7f1d682941e` | Unlicense     | 80569         |
