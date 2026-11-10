# Language and file-format support matrix

Generated from `packages/languages` by `node --import tsx packages/languages/scripts/support-matrix.ts`. Do not edit by hand. Identification data: GitHub Linguist v9.7.0 (MIT), 843 languages and formats. Decisions: [ADR 0014](../architecture/adr/0014-language-and-file-format-registry.md). Validation: [LANGUAGE_COVERAGE_VALIDATION.md](LANGUAGE_COVERAGE_VALIDATION.md).

Every listed file gets exactly one status: full, partial, text, unsupported, failed, excluded or binary. A language with no analyser below is still identified, counted and searchable as text; it is never reported as analysed.

## Analysers

| Analyser | Level | Capabilities | Limitations | Languages and formats |
| --- | --- | --- | --- | --- |
| TypeScript compiler API | full | modules, classes, interfaces, functions, methods with parameter and return types; imports resolved to files and packages; calls resolved by the type checker; HTTP routes, configuration reads, outbound HTTP and database access | calls through callbacks and computed members are recorded as dynamic; types from uninstalled dependencies are not resolved | JavaScript, TSX, TypeScript |
| JSON parser (comments and trailing commas allowed for JSON with Comments) | full when the document type is recognised, otherwise partial | syntax check of the whole file; top-level keys; package.json, tsconfig, composer.json, OpenAPI, JSON Schema, Jupyter notebooks, appsettings: document-specific facts | values of configuration keys are never stored; templates ({{ }}, {% %}, ${…}) are read with placeholders and labelled partial; several JSON documents in one file are read as a sequence, labelled partial | JSON, JSON with Comments, Jupyter Notebook, OASv2-json, OASv3-json |
| YAML 1.2 parser (yaml package) | full when the document type is recognised, otherwise partial | syntax check of every document in the file; Docker Compose services, images, build contexts and depends_on; Kubernetes objects (kind, name, images, referenced ConfigMaps and Secrets by name); GitHub Actions and GitLab CI jobs, needs, used actions and repository scripts they run; OpenAPI paths and operations, Helm charts, Kustomize resources, Ansible plays | Helm, Go and Jinja templates are not rendered: template tags are replaced by placeholders and the result is read as partial; a file that is still not valid YAML stays text only; values of configuration keys are never stored | OASv2-yaml, OASv3-yaml, YAML |
| TOML 1.0 parser (smol-toml package) | full when the document type is recognised, otherwise partial | syntax check; tables and keys; Cargo.toml, pyproject.toml, Pipfile, Julia Project.toml, netlify.toml dependencies and members | values of configuration keys are never stored | TOML |
| XML element scanner (well-formedness check, no DTD or entity expansion) | full when the document type is recognised, otherwise partial | element structure and well-formedness; Maven POM coordinates, modules, parent and dependencies; .NET project files (package and project references), Android manifests, Liquibase changelogs, Ant targets | DTDs, entities and XInclude are not processed; no schema validation | Ant Build System, Maven POM, SVG, XML, XML Property List, XSLT |
| Line parser for INI, properties, .env templates and similar key/value formats | full | sections and key names | values are never stored | Dotenv, EditorConfig, Git Config, INI, Java Properties |
| Dockerfile instruction parser | full | stages and base images; COPY/ADD sources and copies between stages; exposed ports, entry points, ARG/ENV names | shell commands inside RUN are not interpreted | Dockerfile |
| Makefile target extractor (patterns) | partial | targets, prerequisites, included makefiles, repository scripts run by recipes | variables and functions are not expanded | Makefile |
| CMake command extractor (patterns) | partial | project, targets (add_executable, add_library), target links, add_subdirectory, find_package | variables and generator expressions are not evaluated | CMake |
| HCL block extractor (patterns) | partial | resource, data, module, variable, output, provider and locals blocks; module sources resolved to local directories | expressions and references between resources are not evaluated |  |
| SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | full when PostgreSQL’s own parser accepts every statement; otherwise partial, with the dialect and the first problem line recorded | CREATE/ALTER TABLE with column types, sizes, keys and foreign keys; views and materialized views with their columns; functions and procedures with parameters (mode, type, default) and return types; triggers with timing, events and the routine they run; indexes with their columns; sequences, types, domains, packages and package members, policies, rules, events, synonyms, schemas and extensions; bodies: the tables each object reads and writes and the routines it calls, by line (PL/pgSQL through its compiler front end); dialects: PostgreSQL by its parser; MySQL/MariaDB, SQL Server, Oracle, Db2 and SQLite by a statement reader that follows each client’s delimiters (GO, DELIMITER, /, --#SET TERMINATOR) | SQL built at run time (EXECUTE, EXECUTE IMMEDIATE, sp_executesql, PREPARE) is recorded by line but not analysed; names are matched to the repository schema by name, not through the server’s search path; no complete grammar is bundled for dialects other than PostgreSQL: their statements are read from tokens, and those files are partial | PLSQL, PLpgSQL, SQL, SQLPL, TSQL |
| Prisma schema reader | partial | models, fields, types, relations | attributes other than keys and relations are not modelled | Prisma |
| Markdown section and link reader | partial | headings, links to repository files, mentions of exported code symbols | not a CommonMark parser; embedded HTML is text | MDX, Markdown |
| Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | partial | section headings | links and directives are not resolved | AsciiDoc, Org, Pod, Pod 6, TeX, reStructuredText |
| Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | partial | packages, imports, messages, structs, enums, services and their methods, GraphQL types and operations | field-level types are not resolved across files | Avro IDL, Cap'n Proto, GraphQL, Protocol Buffer, Smithy, Thrift, WebIDL |
| tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | full when the whole file parses without syntax errors, otherwise partial | a complete parse of every line of the file; classes, interfaces, structs, enums, traits, modules, namespaces, functions, methods, constructors and properties with their line ranges; parameters with their declared types, defaults and variadics; declared return types; base classes and implemented interfaces; imports with the names and aliases they bring in, resolved to repository files where the language has a path rule; calls and instantiations, linked to the declaration they name through scope, imports, the package folder or a unique name; each link is labelled observed, inferred or unresolved | no type checker: a call through a variable whose type is not written is linked only when one declaration has that name, and is labelled inferred; code generated by macros, preprocessors or at build time is not seen; a file with syntax errors is partial, with the first error line recorded; the rest of the file is still read | Bicep, C, C#, C++, Cuda, Elixir, F#, Go, Gradle, Gradle Kotlin DSL, Groovy, HCL, Haskell, Java, Julia, Kotlin, Lua, OCaml, Objective-C, PHP, PowerShell, Puppet, Python, Ruby, Rust, Scala, Shell, Solidity, Starlark, Zig |
| Declaration and import extractor (per-language patterns) | partial | classes, interfaces, structs, modules, functions and methods with their line and declaration text; imports and includes; resolved to repository files where the language has a deterministic path rule | not a parser: declarations generated by macros, inside strings or written unusually can be missed; calls between functions are not extracted; parameter types are as written, not checked | ABAP, ActionScript, Ada, Apex, Assembly, Awk, Batchfile, COBOL, Clojure, Common Lisp, Crystal, Cython, D, Dart, Elm, Emacs Lisp, Erlang, Fortran, Fortran Free Form, GDScript, Gleam, Hack, Haxe, JCL, Jsonnet, Luau, MATLAB, Mojo, Motorola 68K Assembly, Nim, Nix, Objective-C++, Odin, Pascal, Perl, Prolog, PureScript, R, RPGLE, Racket, Raku, Scheme, Smalltalk, Swift, SystemVerilog, Tcl, Unix Assembly, V, VBA, VBScript, VHDL, Vala, Verilog, Vim script, Visual Basic .NET, Visual Basic 6.0, fish |
| CSV/TSV reader | full | row and column counts; whether every row has the same number of columns | cell values and header names are never kept (data files can hold credentials); partial when rows have different column counts | CSV, TSV |
| Graphviz reader | partial | graph name, direction, nodes with their line, edge count | pattern based: attributes, subgraph scoping and ports are not modelled | Graphviz (DOT) |
| gettext catalog reader | full | message and plural-form counts; catalog language | message texts are not kept | Gettext Catalog |
| Lockfile package counter | partial | number of locked packages | dependency graph inside the lockfile is not modelled |  |
| Generic text indexer | text | full-text search; line counts | no structure is extracted | every other language (705) |

Declaration patterns cover 86 languages. Their level is always partial: names, kinds, lines, parameters as written and imports; no calls; not checked by a compiler.

## File types

A file type (role) says what a file does, independent of its syntax. It is matched by path, and for generic syntaxes also by a bounded check of the first 8 KiB.

| Group | File type | Path pattern | Content check |
| --- | --- | --- | --- |
| API specifications and interface definitions | AsyncAPI | `\.(ya?ml\|json)$` | `^\s*"?asyncapi"?\s*:\s*["']?\d` |
| API specifications and interface definitions | GraphQL schema/operations | `\.(graphqls?\|gql)$` |  |
| API specifications and interface definitions | OpenAPI / Swagger | `\.(ya?ml\|json)$` | `^\s*"?(openapi\|swagger)"?\s*:\s*["']?\d` |
| API specifications and interface definitions | Other interface definition | `\.(capnp\|avdl\|smithy\|webidl\|idl\|wsdl\|raml\|apib\|fbs\|asn1?\|wit\|aidl)$` |  |
| API specifications and interface definitions | Protocol Buffers | `\.proto$` |  |
| API specifications and interface definitions | Thrift | `\.thrift$` |  |
| Application configuration | Application configuration | `(^\|\/)(application\|bootstrap)(-[\w-]+)?\.(ya?ml\|properties)$\|(^\|\/)appsettings[^/]*\.json$\|(^\|\/)(config\|conf\|settings\|etc)\/[^/]+\.(ya?ml\|json\|toml\|ini\|conf\|cfg\|properties\|xml\|hocon\|php\|exs)$\|\.(conf\|cfg\|ini\|properties\|hocon\|toml)$\|(^\|\/)(web\|app)\.config$\|(^\|\/)nginx[^/]*\.conf$\|(^\|\/)Procfile$\|(^\|\/)(app\|fly\|render\|vercel\|netlify\|now\|firebase\|wrangler)\.(ya?ml\|json\|toml)$` |  |
| Build systems | Bazel / Buck / Pants | `(^\|\/)(BUILD\|BUILD\.bazel\|WORKSPACE\|WORKSPACE\.bazel\|MODULE\.bazel\|[^/]+\.bzl\|\.bazelrc\|\.bazelversion\|BUCK\|TARGETS\|pants\.toml\|BUILD\.pants)$` |  |
| Build systems | CMake | `(^\|\/)CMakeLists\.txt$\|\.cmake(\.in)?$\|(^\|\/)CMakePresets\.json$` |  |
| Build systems | Gradle build | `\.gradle(\.kts)?$\|(^\|\/)gradle\.properties$\|(^\|\/)gradle\/libs\.versions\.toml$` |  |
| Build systems | JavaScript build/test tool config | `(^\|\/)(vite\|vitest\|webpack\|rollup\|next\|nuxt\|svelte\|astro\|tsup\|esbuild\|playwright\|jest\|wxt\|drizzle\|babel\|postcss\|tailwind\|metro\|karma\|cypress\|remix\|turbo\|nx\|lerna\|rspack\|rsbuild\|quasar\|angular\|ember-cli-build\|vue)\.?(config)?\.[cm]?[jt]s(on)?$\|(^\|\/)(turbo\|nx\|lerna\|angular\|pnpm-workspace)\.(json\|ya?ml)$` |  |
| Build systems | Makefile | `(^\|\/)(GNUmakefile\|[Mm]akefile(\.[\w.]+)?\|BSDmakefile\|[^/]+\.(mk\|mak\|make))$` |  |
| Build systems | Other build file | `(^\|\/)(meson\.build\|meson_options\.txt\|build\.ninja\|SConstruct\|SConscript\|Rakefile\|[^/]+\.rake\|justfile\|Justfile\|Taskfile\.ya?ml\|build\.xml\|configure\.ac\|configure\.in\|Makefile\.am\|Makefile\.in\|Earthfile\|Gruntfile\.[jt]s\|gulpfile\.[jt]s\|Brewfile\|Snakefile\|[^/]+\.pro\|[^/]+\.pri\|Kbuild\|Kconfig\|build\.sh\|build\.ps1\|build\.cmd\|build\.bat\|mvnw\|gradlew\|[^/]+\.spec)$` |  |
| Build systems | sbt build | `\.sbt$\|(^\|\/)project\/[^/]+\.scala$` |  |
| CI/CD pipelines | Azure Pipelines | `(^\|\/)(azure-pipelines[^/]*\.ya?ml\|\.azure-pipelines\/.+\.ya?ml)$` |  |
| CI/CD pipelines | Bitbucket Pipelines | `(^\|\/)bitbucket-pipelines\.ya?ml$` |  |
| CI/CD pipelines | CircleCI | `(^\|\/)\.circleci\/[^/]+\.ya?ml$` |  |
| CI/CD pipelines | GitHub Action definition | `(^\|\/)action\.ya?ml$` | `^\s*runs:\s*$` |
| CI/CD pipelines | GitHub Actions workflow | `(^\|\/)\.github\/workflows\/[^/]+\.ya?ml$` |  |
| CI/CD pipelines | GitLab CI | `(^\|\/)\.gitlab-ci\.ya?ml$\|(^\|\/)\.gitlab\/ci\/.+\.ya?ml$` |  |
| CI/CD pipelines | Jenkinsfile | `(^\|\/)Jenkinsfile[^/]*$` |  |
| CI/CD pipelines | Other CI (Drone, Buildkite, Woodpecker, AppVeyor, Cirrus, Tekton, Argo) | `(^\|\/)(\.drone\.ya?ml\|\.buildkite\/.+\|\.woodpecker(\.ya?ml\|\/.+)\|appveyor\.ya?ml\|\.cirrus\.ya?ml\|\.tekton\/.+\.ya?ml\|cloudbuild\.ya?ml\|buildspec\.ya?ml\|codemagic\.ya?ml\|\.pre-commit-config\.yaml)$` |  |
| CI/CD pipelines | Travis CI | `(^\|\/)\.travis\.ya?ml$` |  |
| Compiler and tool configuration | Compiler and linter configuration | `(^\|\/)((ts\|js)config[^/]*\.json\|\.babelrc(\.\w+)?\|\.swcrc\|\.eslintrc(\.\w+)?\|eslint\.config\.[cm]?[jt]s\|\.prettierrc(\.\w+)?\|prettier\.config\.[cm]?[jt]s\|\.stylelintrc(\.\w+)?\|\.editorconfig\|\.clang-format\|\.clang-tidy\|\.rustfmt\.toml\|rustfmt\.toml\|clippy\.toml\|\.golangci\.ya?ml\|\.rubocop\.ya?ml\|\.flake8\|\.pylintrc\|mypy\.ini\|ruff\.toml\|\.scalafmt\.conf\|detekt\.ya?ml\|\.swiftlint\.ya?ml\|analysis_options\.yaml\|checkstyle\.xml\|\.credo\.exs\|\.formatter\.exs\|biome\.jsonc?\|deno\.jsonc?\|\.browserslistrc\|rust-toolchain(\.toml)?\|\.nvmrc\|\.node-version\|\.tool-versions\|\.python-version\|\.java-version\|\.sdkmanrc\|\.hlint\.yaml\|\.stylish-haskell\.yaml\|\.jshintrc\|\.markdownlint[^/]*\|\.yamllint[^/]*\|\.shellcheckrc\|\.luacheckrc\|\.luarc\.json\|stylua\.toml\|\.clangd)$` |  |
| Containers | .dockerignore | `(^\|\/)\.dockerignore$` |  |
| Containers | Dev container | `(^\|\/)\.devcontainer(\/\|\.json$)` |  |
| Containers | Docker Compose | `(^\|\/)(docker-compose\|compose)[^/]*\.ya?ml$` |  |
| Containers | Dockerfile / Containerfile | `(^\|\/)((Docker\|Container)file[^/]*\|[^/]+\.(dockerfile\|containerfile))$` |  |
| Database schemas, migrations and procedures | Database migration | `(^\|\/)(migrations?\|migrate\|db\/migrate\|alembic\/versions\|schema_migrations\|changelogs?\|evolutions\|sql\/updates?\|upgrades?)\/.+\.(sql\|py\|rb\|exs\|js\|ts\|go\|php\|java\|kt\|cs\|xml\|ya?ml)$` |  |
| Database schemas, migrations and procedures | dbt project | `(^\|\/)(dbt_project\|profiles\|packages\|dependencies)\.ya?ml$` | `^\s*(models\|profile\|packages\|config-version\|seeds)\s*:` |
| Database schemas, migrations and procedures | Flyway migration | `(^\|\/)[VUR]\d+(_\d+)*__[^/]+\.sql$` |  |
| Database schemas, migrations and procedures | Liquibase changelog | `\.(xml\|ya?ml\|json\|sql)$` | `databaseChangeLog\|<changeSet\b\|--\s*liquibase formatted sql` |
| Database schemas, migrations and procedures | ORM schema | `\.prisma$\|(^\|\/)db\/(schema\|structure)\.(rb\|sql)$\|(^\|\/)schema\.(rb\|graphql\|sql)$` |  |
| Database schemas, migrations and procedures | SQL schema and scripts | `\.(sql\|ddl\|dml\|mysql\|pgsql\|psql\|tsql\|db2\|hql\|cql\|cypher)$` |  |
| Database schemas, migrations and procedures | Stored procedures, functions and packages | `\.(sql\|pls\|plb\|pks\|pkb\|pck\|prc\|fnc\|trg\|tps\|tpb\|spc\|bdy\|plsql\|psql\|pgsql\|tsql)$` | `\bcreate\s+(or\s+replace\s+\|or\s+alter\s+)?(procedure\|proc\|function\|trigger\|package)\b` |
| Dependency manifests | .NET project or solution | `\.(csproj\|fsproj\|vbproj\|vcxproj\|sln\|slnx\|props\|targets)$\|(^\|\/)(packages\.config\|nuget\.config\|global\.json\|Directory\.Packages\.props)$` |  |
| Dependency manifests | Cargo manifest | `(^\|\/)Cargo\.toml$` |  |
| Dependency manifests | Clojure/Leiningen project | `(^\|\/)(project\.clj\|deps\.edn\|build\.boot\|shadow-cljs\.edn)$` |  |
| Dependency manifests | Composer | `(^\|\/)composer\.json$` |  |
| Dependency manifests | Dart/Flutter pubspec | `(^\|\/)pubspec\.ya?ml$` |  |
| Dependency manifests | Elixir/Erlang project | `(^\|\/)(mix\.exs\|rebar\.config\|[^/]+\.app\.src\|erlang\.mk)$` |  |
| Dependency manifests | Go module | `(^\|\/)go\.(mod\|work)$` |  |
| Dependency manifests | Haskell project | `\.cabal$\|(^\|\/)(stack\.yaml\|cabal\.project\|package\.yaml)$` |  |
| Dependency manifests | Maven POM | `(^\|\/)pom\.xml$` |  |
| Dependency manifests | npm package.json | `(^\|\/)package\.json$` |  |
| Dependency manifests | Other dependency manifest | `(^\|\/)(DESCRIPTION\|NAMESPACE\|Project\.toml\|cpanfile\|Makefile\.PL\|Build\.PL\|dist\.ini\|[^/]+\.rockspec\|[^/]+\.nimble\|build\.zig(\.zon)?\|dune-project\|dune\|[^/]+\.opam\|shard\.yml\|vcpkg\.json\|conanfile\.(txt\|py)\|deno\.jsonc?\|bower\.json\|v\.mod\|gleam\.toml\|elm\.json\|spago\.(dhall\|ya?ml)\|bsconfig\.json\|rescript\.json\|esy\.json\|[^/]+\.csproj\.user\|jsr\.json\|requirements\.R)$` |  |
| Dependency manifests | Python packaging | `(^\|\/)(pyproject\.toml\|setup\.py\|setup\.cfg\|Pipfile\|requirements[^/]*\.(txt\|in)\|environment\.ya?ml\|conda\.ya?ml\|tox\.ini\|MANIFEST\.in)$` |  |
| Dependency manifests | Ruby gems | `(^\|\/)(Gemfile\|[^/]+\.gemspec\|\.ruby-version)$` |  |
| Dependency manifests | Swift/CocoaPods/Carthage | `(^\|\/)(Package\.swift\|Podfile\|Cartfile\|[^/]+\.podspec)$` |  |
| Documentation and specifications | Architecture decision record | `(^\|\/)(adr\|adrs\|decisions\|architecture\/decisions)\/[^/]+\.(md\|rst\|adoc\|txt)$` |  |
| Documentation and specifications | Documentation | `\.(md\|markdown\|mdx\|rst\|adoc\|asciidoc\|org\|txt\|textile\|pod\|rdoc\|tex\|wiki\|creole)$\|(^\|\/)(README\|CHANGELOG\|CHANGES\|HISTORY\|NEWS\|CONTRIBUTING\|AUTHORS\|LICEN[CS]E\|COPYING\|NOTICE\|SECURITY\|CODE_OF_CONDUCT\|INSTALL\|UPGRADING\|MAINTAINERS)([._-][^/]*)?$` |  |
| Environment templates | Environment template | `(^\|\/)(\.env\.(example\|sample\|template\|dist\|defaults)\|[^/]*\.env\.(example\|sample\|template)\|env\.(example\|sample\|template))$` |  |
| Infrastructure as code | Ansible | `(^\|\/)(playbooks?\/.+\|roles\/[^/]+\/(tasks\|handlers\|defaults\|vars\|meta)\/[^/]+\|site\|playbook)\.ya?ml$\|(^\|\/)ansible\.cfg$\|(^\|\/)(inventory\|hosts)(\.ini\|\.ya?ml)?$` |  |
| Infrastructure as code | Ansible | `\.ya?ml$` | `^-\s+(hosts\|import_playbook):` |
| Infrastructure as code | AWS CloudFormation / SAM | `\.(ya?ml\|json\|template)$` | `AWSTemplateFormatVersion\|Transform:\s*AWS::Serverless\|"AWSTemplateFormatVersion"` |
| Infrastructure as code | Bicep | `\.bicep(param)?$` |  |
| Infrastructure as code | Nix | `\.nix$\|(^\|\/)flake\.lock$` |  |
| Infrastructure as code | Nomad job | `\.nomad(\.hcl)?$` |  |
| Infrastructure as code | Packer | `\.pkr\.(hcl\|json)$` |  |
| Infrastructure as code | Pulumi | `(^\|\/)Pulumi(\.[\w-]+)?\.ya?ml$` |  |
| Infrastructure as code | Puppet | `\.pp$` |  |
| Infrastructure as code | Serverless Framework | `(^\|\/)serverless\.ya?ml$` |  |
| Infrastructure as code | Terraform / OpenTofu | `\.(tf\|tofu\|tf\.json)$` |  |
| Infrastructure as code | Terraform variables | `\.tfvars(\.json)?$` |  |
| Infrastructure as code | Terragrunt | `(^\|\/)terragrunt\.hcl$` |  |
| Infrastructure as code | Vagrantfile | `(^\|\/)Vagrantfile$` |  |
| Lockfiles | Lockfile | `(^\|\/)(package-lock\.json\|npm-shrinkwrap\.json\|yarn\.lock\|pnpm-lock\.yaml\|bun\.lockb?\|deno\.lock\|Cargo\.lock\|go\.sum\|go\.work\.sum\|Gemfile\.lock\|poetry\.lock\|Pipfile\.lock\|uv\.lock\|pdm\.lock\|composer\.lock\|mix\.lock\|packages\.lock\.json\|gradle\.lockfile\|Podfile\.lock\|Package\.resolved\|pubspec\.lock\|flake\.lock\|conan\.lock\|vcpkg-lock\.json\|Manifest\.toml\|rebar\.lock\|stack\.yaml\.lock\|cabal\.project\.freeze\|pixi\.lock\|renv\.lock\|shard\.lock\|.terraform\.lock\.hcl)$` |  |
| Orchestration (Kubernetes, Helm, Kustomize) | Helm chart | `(^\|\/)Chart\.ya?ml$` |  |
| Orchestration (Kubernetes, Helm, Kustomize) | Helm template | `(^\|\/)templates\/[^/]+\.(ya?ml\|tpl)$` | `\{\{[-\s]*(\.Values\|\.Release\|include\|template\|define)\b` |
| Orchestration (Kubernetes, Helm, Kustomize) | Kubernetes manifest | `\.(ya?ml\|json)$` | `^\s*"?apiVersion"?\s*:\s*"?[\w./-]+"?\s*,?\s*$[\s\S]*^\s*"?kind"?\s*:\|^\s*"?kind"?\s*:\s*"?\w+"?\s*,?\s*$[\s\S]*^\s*"?apiVersion"?\s*:` |
| Orchestration (Kubernetes, Helm, Kustomize) | Kustomize | `(^\|\/)kustomization\.ya?ml$` |  |
| Orchestration (Kubernetes, Helm, Kustomize) | Skaffold | `(^\|\/)skaffold[^/]*\.ya?ml$` |  |
| Repository metadata | Repository metadata | `(^\|\/)(\.gitignore\|\.gitattributes\|\.gitmodules\|\.mailmap\|CODEOWNERS\|OWNERS(_ALIASES)?\|\.github\/[^/]+\.(md\|ya?ml)\|\.github\/ISSUE_TEMPLATE\/.+\|\.github\/PULL_REQUEST_TEMPLATE.*\|\.github\/dependabot\.ya?ml\|renovate\.json5?\|\.renovaterc(\.json)?\|\.git-blame-ignore-revs\|FUNDING\.ya?ml\|\.vscode\/.+\|\.idea\/.+\|\.fleet\/.+)$` |  |
| Schema and data definitions | Avro schema | `\.avsc$` |  |
| Schema and data definitions | JSON Schema | `\.json$` | `"\$schema"\s*:\s*"https?:\/\/json-schema\.org` |
| Schema and data definitions | XML Schema / DTD | `\.(xsd\|dtd\|rng\|rnc)$` |  |

## Languages with an analyser

Languages not listed here are identified from Linguist data and indexed as text.

| Language | Category | Analyser | Extensions | Filenames | Interpreters | Validated on real repositories |
| --- | --- | --- | --- | --- | --- | --- |
| ABAP | Programming language | Declaration and import extractor (per-language patterns) | .abap |  |  | hello-world |
| ActionScript | Programming language | Declaration and import extractor (per-language patterns) | .as |  |  | hello-world |
| Ada | Programming language | Declaration and import extractor (per-language patterns) | .adb .ada .ads |  |  | hello-world |
| Ant Build System | Build system | XML element scanner (well-formedness check, no DTD or entity expansion) |  | ant.xml build.xml |  | keycloak |
| Apex | Programming language | Declaration and import extractor (per-language patterns) | .cls .apex .trigger |  |  | hello-world |
| AsciiDoc | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .asciidoc .adoc .asc |  |  | home-manager, keycloak |
| Assembly | Programming language | Declaration and import extractor (per-language patterns) | .asm .a51 .i .inc .nas .nasm .s |  |  | hello-world |
| Avro IDL | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .avdl |  |  | unit tests only |
| Awk | Scripting and automation | Declaration and import extractor (per-language patterns) | .awk .auk .gawk .mawk .nawk |  | awk gawk mawk nawk | hello-world |
| Batchfile | Scripting and automation | Declaration and import extractor (per-language patterns) | .bat .cmd | gradlew.bat mvnw.cmd |  | hello-world, microservices-demo, neovim, nowinandroid, llama2.c, play-samples, keycloak |
| Bicep | Infrastructure as code | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .bicep .bicepparam |  |  | hello-world |
| C | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .c .cats .h .h.in .idc |  | tcc | hello-world, neovim, llama2.c, fortran-stdlib, keycloak |
| C# | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .cs .cake .cs.pp .csx .linq |  |  | hello-world, microservices-demo, eShop |
| C++ | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .cpp .c++ .cc .cp .cppm .cxx .h .h++ … |  |  | hello-world, fortran-stdlib |
| Cap'n Proto | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .capnp |  |  | unit tests only |
| Clojure | Programming language | Declaration and import extractor (per-language patterns) | .clj .bb .boot .cl2 .cljc .cljs .cljs.hl .cljscm … | riemann.config | bb | hello-world |
| CMake | Build system | CMake command extractor (patterns) | .cmake .cmake.in | CMakeLists.txt |  | hello-world, neovim, fortran-stdlib |
| COBOL | Programming language | Declaration and import extractor (per-language patterns) | .cob .cbl .ccp .cobol .cpy |  |  | hello-world, cobol-course |
| Common Lisp | Programming language | Declaration and import extractor (per-language patterns) | .lisp .asd .cl .l .lsp .ny .podsl .sexp |  | lisp sbcl ccl clisp ecl | hello-world, home-manager |
| Crystal | Programming language | Declaration and import extractor (per-language patterns) | .cr |  | crystal | hello-world |
| CSV | Data and serialization | CSV/TSV reader | .csv |  |  | jaffle-shop, cobol-course, fortran-stdlib, db-sample-schemas, home-manager, kubernetes |
| Cuda | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .cu .cuh |  |  | hello-world |
| Cython | Programming language | Declaration and import extractor (per-language patterns) | .pyx .pxd .pxi |  |  | unit tests only |
| D | Programming language | Declaration and import extractor (per-language patterns) | .d .di |  |  | hello-world |
| Dart | Programming language | Declaration and import extractor (per-language patterns) | .dart |  | dart | hello-world |
| Dockerfile | Infrastructure as code | Dockerfile instruction parser | .dockerfile .containerfile | Containerfile Dockerfile |  | microservices-demo, phoenix, shellcheck, rubygems.org, keycloak, kubernetes |
| Dotenv | Configuration | Line parser for INI, properties, .env templates and similar key/value formats | .env | .env .env.ci .env.dev .env.development .env.development.local … |  | laravel |
| EditorConfig | Configuration | Line parser for INI, properties, .env templates and similar key/value formats | .editorconfig | .editorconfig |  | hello-world, microservices-demo, neovim, terraform-aws-eks, nowinandroid, fortran-stdlib, eShop, home-manager, posh-git, laravel, keycloak |
| Elixir | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .ex .exs | mix.lock | elixir | hello-world, phoenix |
| Elm | Programming language | Declaration and import extractor (per-language patterns) | .elm |  |  | hello-world |
| Emacs Lisp | Programming language | Declaration and import extractor (per-language patterns) | .el .emacs .emacs.desktop | .abbrev_defs .emacs .emacs.desktop .gnus .spacemacs … |  | hello-world |
| Erlang | Programming language | Declaration and import extractor (per-language patterns) | .erl .app .app.src .es .escript .hrl .xrl .yrl | Emakefile rebar.config rebar.config.lock rebar.lock | escript | hello-world |
| F# | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .fs .fsi .fsx |  |  | hello-world |
| fish | Scripting and automation | Declaration and import extractor (per-language patterns) | .fish |  | fish | hello-world, home-manager |
| Fortran | Programming language | Declaration and import extractor (per-language patterns) | .f .f77 .for .fpp |  |  | hello-world |
| Fortran Free Form | Programming language | Declaration and import extractor (per-language patterns) | .f90 .f03 .f08 .f95 |  |  | hello-world, fortran-stdlib |
| GDScript | Programming language | Declaration and import extractor (per-language patterns) | .gd |  |  | hello-world |
| Gettext Catalog | Documentation | gettext catalog reader | .po .pot |  |  | neovim, home-manager, kubernetes |
| Git Config | Configuration | Line parser for INI, properties, .env templates and similar key/value formats | .gitconfig | .gitconfig .gitmodules .tgitconfig config.worktree |  | dotfiles, rubygems.org |
| Gleam | Programming language | Declaration and import extractor (per-language patterns) | .gleam |  |  | hello-world |
| Go | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .go |  |  | hello-world, microservices-demo, home-manager, kubernetes |
| Gradle | Build system | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .gradle |  |  | microservices-demo, home-manager |
| Gradle Kotlin DSL | Build system | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .gradle.kts |  |  | nowinandroid, play-samples |
| GraphQL | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .graphql .gql .graphqls |  |  | hello-world |
| Graphviz (DOT) | Data and serialization | Graphviz reader | .dot .gv |  |  | kubernetes |
| Groovy | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .groovy .grt .gtpl .gvy | Jenkinsfile | groovy | hello-world, keycloak |
| Hack | Programming language | Declaration and import extractor (per-language patterns) | .hack .hh .hhi .php |  |  | unit tests only |
| Haskell | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .hs .hs-boot .hsc |  | runghc runhaskell runhugs | hello-world, shellcheck |
| Haxe | Programming language | Declaration and import extractor (per-language patterns) | .hx .hxsl |  |  | hello-world |
| HCL | Infrastructure as code | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .hcl .nomad .tf .tfvars .tofu .workflow |  |  | hello-world, microservices-demo, terraform-aws-eks |
| INI | Configuration | Line parser for INI, properties, .env templates and similar key/value formats | .ini .cfg .cnf .container .dof .frm .lektorproject .mount … | .buckconfig .coveragerc .flake8 .gitreview .pylintrc … |  | neovim, nowinandroid, jaffle-shop, ansible-examples, home-manager, play-samples, keycloak, kubernetes |
| Java | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .java .jav .jsh |  |  | hello-world, microservices-demo, play-samples, keycloak |
| Java Properties | Configuration | Line parser for INI, properties, .env templates and similar key/value formats | .properties |  |  | microservices-demo, nowinandroid, play-samples, keycloak |
| JavaScript | Programming language | TypeScript compiler API | .js ._js .bones .cjs .es .es6 .frag .gs … | Jakefile | bun chakra d8 deno gjs | hello-world, microservices-demo, neovim, phoenix, eShop, home-manager, rubygems.org, laravel, IceCubesApp, play-samples, keycloak |
| JCL | Programming language | Declaration and import extractor (per-language patterns) | .jcl |  |  | cobol-course |
| JSON | Data and serialization | JSON parser (comments and trailing commas allowed for JSON with Comments) | .json .4DForm .4DProject .avsc .geojson .gltf .har .ice … | .all-contributorsrc .arcconfig .auto-changelog .c8rc .htmlhintrc … |  | hello-world, microservices-demo, neovim, terraform-aws-eks, nowinandroid, cobol-course, db-sample-schemas, phoenix, shellcheck, eShop, ansible-examples, home-manager, posh-git, rubygems.org, laravel, IceCubesApp, keycloak, kubernetes |
| JSON with Comments | Configuration | JSON parser (comments and trailing commas allowed for JSON with Comments) | .jsonc .code-snippets .code-workspace .hujson .sublime-build .sublime-color-scheme .sublime-commands .sublime-completions … | .babelrc .devcontainer.json .eslintrc .eslintrc.json .jscsrc … |  | home-manager, rubygems.org, keycloak |
| Jsonnet | Infrastructure as code | Declaration and import extractor (per-language patterns) | .jsonnet .libsonnet |  |  | unit tests only |
| Julia | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .jl |  | julia | hello-world |
| Jupyter Notebook | Notebook | JSON parser (comments and trailing commas allowed for JSON with Comments) | .ipynb | Notebook |  | llama2.c |
| Kotlin | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .kt .ktm .kts |  |  | hello-world, nowinandroid |
| Lua | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .lua .fcgi .nse .p8 .pd_lua .rbxs .rockspec .wlua | .luacheckrc | lua luajit | hello-world, neovim, home-manager |
| Luau | Programming language | Declaration and import extractor (per-language patterns) | .luau |  | luau | hello-world |
| Makefile | Build system | Makefile target extractor (patterns) | .mak .d .make .makefile .mk .mkfile | BSDmakefile GNUmakefile Kbuild Makefile Makefile.am … | make | hello-world, neovim, llama2.c, fortran-stdlib, ansible-examples, home-manager, keycloak, kubernetes |
| Markdown | Documentation | Markdown section and link reader | .md .livemd .markdown .mdown .mdwn .mkd .mkdn .mkdown … | contents.lr |  | hello-world, microservices-demo, neovim, dotfiles, terraform-aws-eks, nowinandroid, jaffle-shop, llama2.c, cobol-course, fortran-stdlib, db-sample-schemas, phoenix, shellcheck, eShop, ansible-examples, home-manager, posh-git, rubygems.org, laravel, IceCubesApp, play-samples, keycloak, kubernetes |
| MATLAB | Programming language | Declaration and import extractor (per-language patterns) | .matlab .m |  |  | unit tests only |
| Maven POM | Build system | XML element scanner (well-formedness check, no DTD or entity expansion) |  | pom.xml |  | keycloak |
| MDX | Markup | Markdown section and link reader | .mdx |  |  | unit tests only |
| Mojo | Programming language | Declaration and import extractor (per-language patterns) | .mojo |  |  | unit tests only |
| Motorola 68K Assembly | Programming language | Declaration and import extractor (per-language patterns) | .asm .i .inc .s .x68 |  |  | unit tests only |
| Nim | Programming language | Declaration and import extractor (per-language patterns) | .nim .nim.cfg .nimble .nimrod .nims | nim.cfg |  | hello-world |
| Nix | Build system | Declaration and import extractor (per-language patterns) | .nix |  |  | home-manager |
| OASv2-json | API and interface definition | JSON parser (comments and trailing commas allowed for JSON with Comments) | .json |  |  | unit tests only |
| OASv2-yaml | API and interface definition | YAML 1.2 parser (yaml package) | .yaml .yml |  |  | unit tests only |
| OASv3-json | API and interface definition | JSON parser (comments and trailing commas allowed for JSON with Comments) | .json |  |  | unit tests only |
| OASv3-yaml | API and interface definition | YAML 1.2 parser (yaml package) | .yaml .yml |  |  | unit tests only |
| Objective-C | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .m .h |  |  | hello-world |
| Objective-C++ | Programming language | Declaration and import extractor (per-language patterns) | .mm |  |  | unit tests only |
| OCaml | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .ml .eliom .eliomi .ml4 .mli .mll .mly |  | ocaml ocamlrun ocamlscript | hello-world |
| Odin | Programming language | Declaration and import extractor (per-language patterns) | .odin |  |  | unit tests only |
| Org | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .org |  |  | hello-world |
| Pascal | Programming language | Declaration and import extractor (per-language patterns) | .pas .dfm .dpr .inc .lpr .pascal .pp |  | instantfpc | hello-world |
| Perl | Programming language | Declaration and import extractor (per-language patterns) | .pl .al .cgi .fcgi .perl .ph .plx .pm … | .latexmkrc Makefile.PL Rexfile ack cpanfile … | cperl perl | hello-world, home-manager |
| PHP | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .php .aw .ctp .fcgi .inc .php3 .php4 .php5 … | .php .php_cs .php_cs.dist Phakefile | php | hello-world, ansible-examples, laravel |
| PLpgSQL | Database language | SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | .pgsql .sql |  |  | unit tests only |
| PLSQL | Database language | SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | .pls .bdy .ddl .fnc .pck .pkb .pks .plb … |  |  | hello-world, db-sample-schemas |
| Pod | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .pod |  | perl | unit tests only |
| Pod 6 | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .pod .pod6 |  | perl6 | unit tests only |
| PowerShell | Scripting and automation | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .ps1 .psd1 .psm1 |  | pwsh | hello-world, neovim, terraform-aws-eks, ansible-examples, posh-git, kubernetes |
| Prisma | Database language | Prisma schema reader | .prisma |  |  | unit tests only |
| Prolog | Programming language | Declaration and import extractor (per-language patterns) | .pl .plt .pro .prolog .yap |  | swipl yap | hello-world |
| Protocol Buffer | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .proto |  |  | microservices-demo, nowinandroid, eShop, play-samples, kubernetes |
| Puppet | Infrastructure as code | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .pp | Modulefile |  | hello-world |
| PureScript | Programming language | Declaration and import extractor (per-language patterns) | .purs |  |  | hello-world |
| Python | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .py .cgi .fcgi .gyp .gypi .lmi .py3 .pyde … | .gclient DEPS SConscript SConstruct wscript | python python2 python3 py pypy | hello-world, microservices-demo, neovim, jaffle-shop, llama2.c, fortran-stdlib, ansible-examples, home-manager, keycloak, kubernetes |
| R | Programming language | Declaration and import extractor (per-language patterns) | .r .rd .rhistory .rsx | .Rapp.history .Rhistory .Rprofile expr-dist | Rscript | hello-world |
| Racket | Programming language | Declaration and import extractor (per-language patterns) | .rkt .rktd .rktl .scrbl |  | racket | hello-world |
| Raku | Programming language | Declaration and import extractor (per-language patterns) | .6pl .6pm .nqp .p6 .p6l .p6m .pl .pl6 … |  | perl6 raku rakudo | hello-world |
| reStructuredText | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .rst .rest .rest.txt .rst.txt |  |  | hello-world, fortran-stdlib |
| RPGLE | Programming language | Declaration and import extractor (per-language patterns) | .rpgle .sqlrpgle |  |  | hello-world |
| Ruby | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .rb .builder .eye .fcgi .gemspec .god .jbuilder .mspec … | .irbrc .pryrc .simplecov Appraisals Berksfile … | ruby macruby rake jruby rbx | hello-world, neovim, rubygems.org |
| Rust | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .rs .rs.in |  | rust-script | hello-world, ansible-examples |
| Scala | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .scala .kojo .sbt .sc |  | scala | hello-world, play-samples |
| Scheme | Programming language | Declaration and import extractor (per-language patterns) | .scm .sch .sld .sls .sps .ss |  | scheme guile bigloo chicken csi | hello-world, neovim |
| Shell | Scripting and automation | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .sh .bash .bats .cgi .command .fcgi .ksh .pacscript … | .bash_aliases .bash_functions .bash_history .bash_logout .bash_profile … | ash bash dash ksh mksh | hello-world, microservices-demo, neovim, dotfiles, terraform-aws-eks, nowinandroid, fortran-stdlib, phoenix, shellcheck, ansible-examples, home-manager, rubygems.org, IceCubesApp, play-samples, keycloak, kubernetes |
| Smalltalk | Programming language | Declaration and import extractor (per-language patterns) | .st .cs |  |  | hello-world |
| Smithy | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .smithy |  |  | unit tests only |
| Solidity | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .sol |  |  | hello-world |
| SQL | Database language | SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | .sql .ddl .inc .mysql .prc .tab .udf .viw |  |  | hello-world, jaffle-shop, db-sample-schemas, play-samples, keycloak |
| SQLPL | Database language | SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | .sql .db2 |  |  | unit tests only |
| Starlark | Build system | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .bzl .star | BUCK BUILD BUILD.bazel MODULE.bazel Tiltfile … |  | shellcheck |
| SVG | Markup | XML element scanner (well-formedness check, no DTD or entity expansion) | .svg |  |  | hello-world, microservices-demo, neovim, terraform-aws-eks, shellcheck, eShop, rubygems.org, IceCubesApp, play-samples, keycloak, kubernetes |
| Swift | Programming language | Declaration and import extractor (per-language patterns) | .swift |  |  | hello-world, IceCubesApp |
| SystemVerilog | Programming language | Declaration and import extractor (per-language patterns) | .sv .svh .vh |  |  | unit tests only |
| Tcl | Scripting and automation | Declaration and import extractor (per-language patterns) | .tcl .adp .sdc .tcl.in .tm .xdc | owh starfield | tclsh wish | hello-world |
| TeX | Documentation | Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX) | .tex .aux .bbx .cbx .cls .dtx .ins .lbx … |  |  | hello-world, cobol-course |
| Thrift | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .thrift |  |  | unit tests only |
| TOML | Configuration | TOML 1.0 parser (smol-toml package) | .toml .toml.example | Cargo.lock Cargo.toml.orig Gopkg.lock Pipfile mise.local.lock … |  | hello-world, neovim, terraform-aws-eks, nowinandroid, fortran-stdlib, ansible-examples, home-manager, rubygems.org, play-samples, keycloak |
| TSQL | Database language | SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql) | .sql |  |  | keycloak |
| TSV | Data and serialization | CSV/TSV reader | .tsv .vcf |  |  | unit tests only |
| TSX | Programming language | TypeScript compiler API | .tsx |  |  | keycloak |
| TypeScript | Programming language | TypeScript compiler API | .ts .cts .mts |  | bun deno ts-node tsx node | hello-world, eShop, home-manager, keycloak |
| Unix Assembly | Programming language | Declaration and import extractor (per-language patterns) | .s .ms |  |  | hello-world |
| V | Programming language | Declaration and import extractor (per-language patterns) | .v |  |  | hello-world |
| Vala | Programming language | Declaration and import extractor (per-language patterns) | .vala .vapi |  |  | hello-world |
| VBA | Programming language | Declaration and import extractor (per-language patterns) | .bas .cls .frm .vba |  |  | hello-world |
| VBScript | Programming language | Declaration and import extractor (per-language patterns) | .vbs |  |  | hello-world |
| Verilog | Programming language | Declaration and import extractor (per-language patterns) | .v .veo |  |  | hello-world |
| VHDL | Programming language | Declaration and import extractor (per-language patterns) | .vhdl .vhd .vhf .vhi .vho .vhs .vht .vhw |  |  | hello-world |
| Vim script | Scripting and automation | Declaration and import extractor (per-language patterns) | .vim .vba .vimrc .vmb | .exrc .gvimrc .nvimrc .vimrc _vimrc … |  | hello-world, neovim, dotfiles |
| Visual Basic .NET | Programming language | Declaration and import extractor (per-language patterns) | .vb .vbhtml |  |  | hello-world |
| Visual Basic 6.0 | Programming language | Declaration and import extractor (per-language patterns) | .bas .cls .ctl .Dsr .frm |  |  | db-sample-schemas |
| WebIDL | API and interface definition | Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL) | .webidl |  |  | unit tests only |
| XML | Markup | XML element scanner (well-formedness check, no DTD or entity expansion) | .xml .adml .admx .ant .axaml .axml .builds .ccproj … | .classpath .cproject .project App.config NuGet.config … |  | hello-world, microservices-demo, neovim, nowinandroid, db-sample-schemas, eShop, ansible-examples, home-manager, posh-git, rubygems.org, laravel, IceCubesApp, play-samples, keycloak |
| XML Property List | Configuration | XML element scanner (well-formedness check, no DTD or entity expansion) | .plist .stTheme .tmCommand .tmLanguage .tmPreferences .tmSnippet .tmTheme |  |  | eShop, home-manager, IceCubesApp |
| XSLT | Markup | XML element scanner (well-formedness check, no DTD or entity expansion) | .xslt .xsl |  |  | hello-world, db-sample-schemas, keycloak |
| YAML | Configuration | YAML 1.2 parser (yaml package) | .yml .mir .reek .rviz .sublime-syntax .syntax .yaml .yaml-tmlanguage … | .clang-format .clang-tidy .clangd .eslintrc .gemrc … |  | hello-world, microservices-demo, neovim, dotfiles, terraform-aws-eks, nowinandroid, jaffle-shop, llama2.c, cobol-course, fortran-stdlib, phoenix, shellcheck, eShop, ansible-examples, home-manager, posh-git, rubygems.org, laravel, IceCubesApp, play-samples, keycloak, kubernetes |
| Zig | Programming language | tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax) | .zig .zig.zon |  |  | hello-world, neovim |

## Validation runs (2026-11-09)

Files each analyser processed, per repository (failed in brackets).

| Method | hello-world | microservices-demo | neovim | dotfiles | terraform-aws-eks | nowinandroid | jaffle-shop | llama2.c | cobol-course | fortran-stdlib | db-sample-schemas | phoenix | shellcheck | eShop | ansible-examples | home-manager | posh-git | rubygems.org | laravel | IceCubesApp | play-samples | keycloak | kubernetes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CMake command extractor | 1 |  | 43 |  |  |  |  |  |  | 94 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| CSV reader (row and column counts; cell values are not kept) |  |  |  |  |  |  | 4 |  | 1 | 1 | 2 |  |  |  |  | 1 |  |  |  |  |  |  | 1 |
| Declaration and import extractor (patterns) | 195 | 74 | 3493 | 47 | 11 | 357 | 1 | 14 | 76 | 644 | 5 | 213 | 54 | 547 | 8 | 4001 | 34 | 1495 | 27 | 434 | 330 | 8685 | 12150 |
| Dockerfile instruction parser |  | 13 |  |  |  |  |  |  |  |  |  | 2 | 8 |  |  |  |  | 2 |  |  |  | 4 | 6 |
| Documentation heading extractor | 5 |  |  |  |  |  |  |  | 4 | 36 |  |  |  |  |  | 1 |  |  |  |  |  | 680 |  |
| Empty file (nothing to analyse) |  |  | 3 |  | 21 |  |  |  |  |  |  |  |  |  |  | 1 |  | 1 |  |  | 2 | 19 | 1 |
| Graphviz reader (graph, nodes and edges by pattern) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 |
| HCL block extractor | 1 | 9 |  |  | 75 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Interface definition extractor (GraphQL) | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Interface definition extractor (Protocol Buffer) |  | 8 |  |  |  | 3 |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  | 2 |  | 99 |
| JSON Lines parser |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2 |
| JSON parser (2 concatenated documents) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 3 |
| JSON parser (6 concatenated documents) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |
| JSON parser (8 concatenated documents) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |
| JSON parser (JSON Schema) |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  | 5 |  |  |  |  |  |  |  |
| JSON parser (Jupyter notebook) |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| JSON parser (OpenAPI) |  |  |  |  |  |  |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  |  | 3 | 37 |
| JSON parser (application settings: key names only) |  | 1 |  |  |  |  |  |  |  |  |  |  |  | 19 |  |  |  |  |  |  |  | 4 |  |
| JSON parser (cloudformation) |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |
| JSON parser (composer.json) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |
| JSON parser (kubernetes) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1083 |
| JSON parser (package.json) |  | 2 |  |  |  |  |  |  |  |  |  | 2 |  | 1 |  |  |  |  | 1 |  |  | 8 |  |
| JSON parser (syntax and top-level keys only) | 2 | 2 | 4 |  | 1 | 17 |  |  | 1 |  | 1 | 5 | 1 | 25 |  | 202 | 4 | 4 |  | 96 |  | 155 | 190 |
| JSON parser (syntax and top-level keys only); template placeholders not rendered |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 | 6 |
| JSON parser (tool configuration: key names) |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |  | 2 |  |  |  |  |  |
| JSON parser (tsconfig) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 11 |  |
| JSON parser |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 0 (1) |  |
| Key/value line parser (names only) | 1 | 2 | 2 | 1 | 1 | 11 | 1 |  |  | 1 |  |  |  | 1 | 17 | 339 | 1 |  | 2 |  | 89 | 371 | 3 |
| Lockfile package counter |  | 6 |  |  |  |  |  |  |  |  |  | 1 | 1 | 1 | 1 |  |  | 1 |  | 1 |  | 1 | 38 |
| Makefile target extractor | 1 |  | 6 |  |  |  |  | 1 |  | 3 |  |  |  |  | 1 | 1 |  |  |  |  |  | 1 | 4 |
| Markdown section and link reader | 6 | 43 | 12 | 4 | 34 | 43 | 1 | 3 | 44 | 61 | 7 | 60 | 7 | 50 | 22 | 132 | 3 | 13 | 4 | 18 | 49 | 84 | 258 |
| SQL schema parser and object extractor | 8 |  |  |  |  |  | 15 |  |  |  | 88 |  |  |  |  |  |  |  |  |  | 9 | 8 |  |
| TOML parser (Cargo manifest) |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |
| TOML parser (libs.versions.toml) |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |
| TOML parser (syntax and tables only) | 1 |  | 3 |  | 5 |  |  |  |  | 1 |  |  |  |  |  | 136 |  | 1 |  |  |  | 4 |  |
| TOML parser |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 0 (1) |  |  |  |  |  |  |  |
| TypeScript and JavaScript (TypeScript Compiler API) | 16 | 6 | 7 |  |  |  |  |  |  |  |  | 26 |  | 19 |  | 16 |  | 29 | 2 | 1 | 25 | 1100 |  |
| Visual Studio solution reader |  | 1 |  |  |  |  |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  |  |  |  |
| XML element scanner (.NET project) |  | 2 |  |  |  |  |  |  |  |  |  |  |  | 33 |  |  |  |  |  |  |  |  |  |
| XML element scanner (Android manifest) |  |  |  |  |  | 26 |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  |  |  |  |
| XML element scanner (Ant build) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2 |  |
| XML element scanner (Liquibase changelog) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 84 |  |
| XML element scanner (Maven POM) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 188 |  |
| XML element scanner (configuration) |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  | 30 | 1 |  |
| XML element scanner (module) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 11 |  |
| XML element scanner (persistence) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 2 | 3 |  |
| XML element scanner (plist) | 1 |  |  |  |  |  |  |  |  |  |  |  |  | 9 |  | 41 |  |  |  | 12 |  |  |  |
| XML element scanner (resources) |  |  |  |  |  | 20 |  |  |  |  |  |  |  | 2 |  |  |  |  |  |  |  |  |  |
| XML element scanner (structure only) | 6 | 1 | 5 |  |  | 22 |  |  |  |  | 137 |  |  | 32 | 3 | 8 | 1 | 1 | 1 | 23 | 1 | 261 |  |
| XML element scanner (svg) | 1 | 21 | 1 |  | 2 |  |  |  |  |  |  |  | 1 | 53 |  |  |  | 16 |  | 15 | 2 | 143 | 4 |
| XML element scanner (web-app) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 11 |  |
| XML element scanner | 0 (1) |  |  |  |  | 0 (1) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 0 (1) |  |
| YAML parser (Ansible) |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 63 |  |  |  |  |  |  | 6 |  |
| YAML parser (Ansible); template placeholders not rendered |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 61 |  |  |  |  |  |  | 5 |  |
| YAML parser (Docker Compose) |  |  |  |  |  |  |  |  |  |  |  | 2 |  |  |  |  |  | 2 |  |  |  |  |  |
| YAML parser (GitHub Actions) | 1 | 9 | 24 | 2 | 6 | 3 | 3 | 1 |  | 12 |  | 5 | 2 | 4 | 1 | 8 | 2 | 6 | 5 | 1 | 2 | 16 |  |
| YAML parser (GitLab CI) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |
| YAML parser (Helm chart) |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| YAML parser (Kubernetes manifest) |  | 50 |  |  | 3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 8 | 25 | 5213 |
| YAML parser (Kubernetes manifest); template placeholders not rendered |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 11 |
| YAML parser (Kustomize) |  | 21 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 6 | 1 | 2 |
| YAML parser (app-config: key names) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 6 |  |  |  |  |  |
| YAML parser (compiler-config: key names) |  |  | 3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |
| YAML parser (dbt: key names) |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| YAML parser (dbt: key names); template placeholders not rendered |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| YAML parser (haskell-deps: key names) |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  |  |
| YAML parser (js-build: key names) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 1 |  |
| YAML parser (other-ci) |  | 1 |  |  | 1 |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| YAML parser (repo-meta: key names) |  | 3 | 7 |  |  | 3 |  |  | 3 | 3 |  | 2 | 1 | 1 |  | 5 | 1 | 3 | 1 | 2 | 2 | 9 | 448 |
| YAML parser (skaffold: key names) |  | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| YAML parser (syntax and top-level keys only) | 3 | 3 | 3 |  | 2 | 1 | 14 |  |  |  |  |  | 1 | 8 | 21 | 79 |  | 26 | 1 |  |  | 44 | 160 |
| YAML parser (syntax and top-level keys only); template placeholders not rendered |  | 13 |  |  |  |  | 2 |  |  |  |  |  |  |  | 10 | 3 |  |  |  |  |  | 1 | 2 |
| YAML parser |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 0 (1) |  |  |  |  | 0 (2) |
| gettext catalog reader (message count) |  |  | 32 |  |  |  |  |  |  |  |  |  |  |  |  | 86 |  |  |  |  |  |  | 13 |
| go.mod directive reader |  | 4 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 43 |
| pip requirements reader |  | 8 |  |  |  |  | 2 | 1 |  | 2 |  |  |  |  |  |  |  |  |  |  |  |  |  |

