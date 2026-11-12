/**
 * The language and file-format support registry: the one place that says what a file is
 * and what CodeAtlas does with it. ArchLens ships a bundled copy (skills/archlens/scripts/
 * inventory.mjs), checked to be identical to this build.
 *
 * Identification data (names, extensions, filenames, interpreters) comes from GitHub
 * Linguist v9.7.0 (MIT, data/LINGUIST-LICENSE), so recognition is not limited to popular
 * languages. Categories and analysers are this project's own overlay.
 */
import linguist from '../data/linguist.json';
import type { Category } from './types';

interface LinguistEntry {
  name: string;
  type: 'programming' | 'data' | 'markup' | 'prose';
  group?: string;
  extensions?: string[];
  filenames?: string[];
  interpreters?: string[];
  aliases?: string[];
}

export const LINGUIST_VERSION: string = (linguist as { version: string }).version;

/** Analysers CodeAtlas runs. A language without one is indexed as searchable text. */
export const ANALYSERS = {
  'ts-compiler': {
    name: 'TypeScript compiler API',
    level: 'full',
    capabilities: [
      'modules, classes, interfaces, functions, methods with parameter and return types',
      'imports resolved to files and packages',
      'calls resolved by the type checker',
      'HTTP routes, configuration reads, outbound HTTP and database access',
    ],
    limitations: [
      'calls through callbacks and computed members are recorded as dynamic',
      'types from uninstalled dependencies are not resolved',
    ],
  },
  json: {
    name: 'JSON parser (comments and trailing commas allowed for JSON with Comments)',
    level: 'full when the document type is recognised, otherwise partial',
    capabilities: [
      'syntax check of the whole file',
      'top-level keys',
      'package.json, tsconfig, composer.json, OpenAPI, JSON Schema, Jupyter notebooks, appsettings: document-specific facts',
    ],
    limitations: [
      'values of configuration keys are never stored',
      'templates ({{ }}, {% %}, ${…}) are read with placeholders and labelled partial',
      'several JSON documents in one file are read as a sequence, labelled partial',
    ],
  },
  yaml: {
    name: 'YAML 1.2 parser (yaml package)',
    level: 'full when the document type is recognised, otherwise partial',
    capabilities: [
      'syntax check of every document in the file',
      'Docker Compose services, images, build contexts and depends_on',
      'Kubernetes objects (kind, name, images, referenced ConfigMaps and Secrets by name)',
      'GitHub Actions and GitLab CI jobs, needs, used actions and repository scripts they run',
      'OpenAPI paths and operations, Helm charts, Kustomize resources, Ansible plays',
    ],
    limitations: [
      'Helm, Go and Jinja templates are not rendered: template tags are replaced by placeholders and the result is read as partial; a file that is still not valid YAML stays text only',
      'values of configuration keys are never stored',
    ],
  },
  toml: {
    name: 'TOML 1.0 parser (smol-toml package)',
    level: 'full when the document type is recognised, otherwise partial',
    capabilities: [
      'syntax check',
      'tables and keys',
      'Cargo.toml, pyproject.toml, Pipfile, Julia Project.toml, netlify.toml dependencies and members',
    ],
    limitations: ['values of configuration keys are never stored'],
  },
  xml: {
    name: 'XML element scanner (well-formedness check, no DTD or entity expansion)',
    level: 'full when the document type is recognised, otherwise partial',
    capabilities: [
      'element structure and well-formedness',
      'Maven POM coordinates, modules, parent and dependencies',
      '.NET project files (package and project references), Android manifests, Liquibase changelogs, Ant targets',
    ],
    limitations: ['DTDs, entities and XInclude are not processed', 'no schema validation'],
  },
  ini: {
    name: 'Line parser for INI, properties, .env templates and similar key/value formats',
    level: 'full',
    capabilities: ['sections and key names'],
    limitations: ['values are never stored'],
  },
  dockerfile: {
    name: 'Dockerfile instruction parser',
    level: 'full',
    capabilities: [
      'stages and base images',
      'COPY/ADD sources and copies between stages',
      'exposed ports, entry points, ARG/ENV names',
    ],
    limitations: ['shell commands inside RUN are not interpreted'],
  },
  make: {
    name: 'Makefile target extractor (patterns)',
    level: 'partial',
    capabilities: ['targets, prerequisites, included makefiles, repository scripts run by recipes'],
    limitations: ['variables and functions are not expanded'],
  },
  cmake: {
    name: 'CMake command extractor (patterns)',
    level: 'partial',
    capabilities: [
      'project, targets (add_executable, add_library), target links, add_subdirectory, find_package',
    ],
    limitations: ['variables and generator expressions are not evaluated'],
  },
  hcl: {
    name: 'HCL block extractor (patterns)',
    level: 'partial',
    capabilities: [
      'resource, data, module, variable, output, provider and locals blocks',
      'module sources resolved to local directories',
    ],
    limitations: ['expressions and references between resources are not evaluated'],
  },
  sql: {
    name: 'SQL: PostgreSQL parser (libpg-query) and statement reader (@nexora/sql)',
    level:
      'full when PostgreSQL’s own parser accepts every statement; otherwise partial, with the dialect and the first problem line recorded',
    capabilities: [
      'CREATE/ALTER TABLE with column types, sizes, keys and foreign keys',
      'views and materialized views with their columns; functions and procedures with parameters (mode, type, default) and return types; triggers with timing, events and the routine they run; indexes with their columns; sequences, types, domains, packages and package members, policies, rules, events, synonyms, schemas and extensions',
      'bodies: the tables each object reads and writes and the routines it calls, by line (PL/pgSQL through its compiler front end)',
      'dialects: PostgreSQL by its parser; MySQL/MariaDB, SQL Server, Oracle, Db2 and SQLite by a statement reader that follows each client’s delimiters (GO, DELIMITER, /, --#SET TERMINATOR)',
    ],
    limitations: [
      'SQL built at run time (EXECUTE, EXECUTE IMMEDIATE, sp_executesql, PREPARE) is recorded by line but not analysed',
      'names are matched to the repository schema by name, not through the server’s search path',
      'no complete grammar is bundled for dialects other than PostgreSQL: their statements are read from tokens, and those files are partial',
    ],
  },
  prisma: {
    name: 'Prisma schema reader',
    level: 'partial',
    capabilities: ['models, fields, types, relations'],
    limitations: ['attributes other than keys and relations are not modelled'],
  },
  markdown: {
    name: 'Markdown section and link reader',
    level: 'partial',
    capabilities: ['headings, links to repository files, mentions of exported code symbols'],
    limitations: ['not a CommonMark parser; embedded HTML is text'],
  },
  'doc-headings': {
    name: 'Documentation heading extractor (reStructuredText, AsciiDoc, Org, POD, TeX)',
    level: 'partial',
    capabilities: ['section headings'],
    limitations: ['links and directives are not resolved'],
  },
  idl: {
    name: 'Interface definition extractor (Protocol Buffers, Thrift, GraphQL, Cap’n Proto, Avro IDL, Smithy, WebIDL)',
    level: 'partial',
    capabilities: [
      'packages, imports, messages, structs, enums, services and their methods, GraphQL types and operations',
    ],
    limitations: ['field-level types are not resolved across files'],
  },
  syntax: {
    name: 'tree-sitter parser (a WebAssembly grammar per language, @nexora/syntax)',
    level: 'full when the whole file parses without syntax errors, otherwise partial',
    capabilities: [
      'a complete parse of every line of the file',
      'classes, interfaces, structs, enums, traits, modules, namespaces, functions, methods, constructors and properties with their line ranges',
      'parameters with their declared types, defaults and variadics; declared return types; base classes and implemented interfaces',
      'imports with the names and aliases they bring in, resolved to repository files where the language has a path rule',
      'calls and instantiations, linked to the declaration they name through scope, imports, the package folder or a unique name; each link is labelled observed, inferred or unresolved',
    ],
    limitations: [
      'no type checker: a call through a variable whose type is not written is linked only when one declaration has that name, and is labelled inferred',
      'code generated by macros, preprocessors or at build time is not seen',
      'a file with syntax errors is partial, with the first error line recorded; the rest of the file is still read',
    ],
  },
  declarations: {
    name: 'Declaration and import extractor (per-language patterns)',
    level: 'partial',
    capabilities: [
      'classes, interfaces, structs, modules, functions and methods with their line and declaration text',
      'imports and includes; resolved to repository files where the language has a deterministic path rule',
    ],
    limitations: [
      'not a parser: declarations generated by macros, inside strings or written unusually can be missed',
      'calls between functions are not extracted',
      'parameter types are as written, not checked',
    ],
  },
  delimited: {
    name: 'CSV/TSV reader',
    level: 'full',
    capabilities: ['row and column counts', 'whether every row has the same number of columns'],
    limitations: [
      'cell values and header names are never kept (data files can hold credentials)',
      'partial when rows have different column counts',
    ],
  },
  dot: {
    name: 'Graphviz reader',
    level: 'partial',
    capabilities: ['graph name, direction, nodes with their line, edge count'],
    limitations: ['pattern based: attributes, subgraph scoping and ports are not modelled'],
  },
  gettext: {
    name: 'gettext catalog reader',
    level: 'full',
    capabilities: ['message and plural-form counts', 'catalog language'],
    limitations: ['message texts are not kept'],
  },
  lockfile: {
    name: 'Lockfile package counter',
    level: 'partial',
    capabilities: ['number of locked packages'],
    limitations: ['dependency graph inside the lockfile is not modelled'],
  },
  text: {
    name: 'Generic text indexer',
    level: 'text',
    capabilities: ['full-text search', 'line counts'],
    limitations: ['no structure is extracted'],
  },
} as const;
export type AnalyserId = keyof typeof ANALYSERS;

/** Category for languages whose Linguist type does not say enough. Names are Linguist's. */
const CATEGORY_OVERRIDES: Record<string, Category> = {};
const put = (c: Category, names: string[]) => {
  for (const n of names) CATEGORY_OVERRIDES[n] = c;
};
put('scripting', [
  'Shell',
  'PowerShell',
  'Batchfile',
  'fish',
  'Tcsh',
  'AppleScript',
  'AutoHotkey',
  'AutoIt',
  'Awk',
  'sed',
  'Tcl',
  'Vim script',
  'Nushell',
  'Xonsh',
  'Elvish',
  'ShellSession',
]);
put('database', [
  'SQL',
  'PLSQL',
  'PLpgSQL',
  'TSQL',
  'SQLPL',
  'Cypher',
  'SPARQL',
  'PigLatin',
  'HiveQL',
  'EdgeQL',
  'Prisma',
  'OverpassQL',
  'JSONiq',
  'Kusto',
]);
put('stylesheet', ['CSS', 'SCSS', 'Sass', 'Less', 'Stylus', 'PostCSS']);
put('template', [
  'Jinja',
  'HTML+ERB',
  'JavaScript+ERB',
  'Handlebars',
  'Mustache',
  'Liquid',
  'Blade',
  'HTML+EEX',
  'Twig',
  'Smarty',
  'Pug',
  'Haml',
  'Slim',
  'Go Template',
  'Velocity Template Language',
  'FreeMarker',
  'Nunjucks',
  'HTML+Razor',
  'Java Template Engine',
  'StringTemplate',
  'Closure Templates',
  'Terraform Template',
  'HTML+PHP',
]);
put('config', [
  'YAML',
  'TOML',
  'INI',
  'Java Properties',
  'EditorConfig',
  'Git Config',
  'Git Attributes',
  'Ignore List',
  'Nginx',
  'ApacheConf',
  'SSH Config',
  'Dotenv',
  'HOCON',
  'XML Property List',
  'Option List',
  'JSON with Comments',
  'JSON5',
  'Browserslist',
  'Caddyfile',
  'Readline Config',
  'Windows Registry Entries',
  'SELinux Policy',
  'Robots Exclusion Rules',
  'Procfile',
]);
put('build', [
  'Makefile',
  'CMake',
  'Gradle',
  'Gradle Kotlin DSL',
  'Maven POM',
  'Meson',
  'Starlark',
  'Ninja',
  'Ant Build System',
  'QMake',
  'Just',
  'M4Sugar',
  'Earthly',
  'Nix',
  'Go Module',
  'Go Workspace',
  'Go Checksums',
  'Gemfile.lock',
  'Pip Requirements',
  'Module Management System',
  'Inno Setup',
  'NSIS',
  'Linux Kernel Module',
]);
put('infrastructure', [
  'HCL',
  'Bicep',
  'Puppet',
  'Jsonnet',
  'CUE',
  'Dhall',
  'Pkl',
  'Nickel',
  'Dockerfile',
  'Open Policy Agent',
  'Cloud Firestore Security Rules',
]);
put('api', [
  'Protocol Buffer',
  'Thrift',
  'GraphQL',
  "Cap'n Proto",
  'RAML',
  'API Blueprint',
  'WebIDL',
  'Smithy',
  'OASv2-json',
  'OASv3-json',
  'OASv2-yaml',
  'OASv3-yaml',
  'Avro IDL',
  'ASN.1',
  'WebAssembly Interface Type',
  'Protocol Buffer Text Format',
]);
put('markup', ['XML', 'XSLT', 'SVG', 'HTML']);
put('notebook', ['Jupyter Notebook']);
put('docs', ['TeX', 'Roff', 'Roff Manpage', 'Texinfo']);

const TYPE_CATEGORY: Record<LinguistEntry['type'], Category> = {
  programming: 'programming',
  markup: 'markup',
  data: 'data',
  prose: 'docs',
};

/** Languages the declaration extractor has rules for (see products/codeatlas/core/src/indexer/extract/declarations.ts). */
export const DECLARATION_LANGUAGES = [
  'Python',
  'Cython',
  'Starlark',
  'Mojo',
  'Go',
  'Java',
  'Kotlin',
  'Scala',
  'Groovy',
  'Gradle',
  'Gradle Kotlin DSL',
  'Apex',
  'C#',
  'Visual Basic .NET',
  'VBA',
  'VBScript',
  'Visual Basic 6.0',
  'F#',
  'OCaml',
  'Rust',
  'C',
  'C++',
  'Objective-C',
  'Objective-C++',
  'Cuda',
  'Swift',
  'Dart',
  'Ruby',
  'Crystal',
  'PHP',
  'Hack',
  'Perl',
  'Raku',
  'Lua',
  'Luau',
  'Elixir',
  'Erlang',
  'Haskell',
  'Elm',
  'PureScript',
  'Clojure',
  'Common Lisp',
  'Emacs Lisp',
  'Scheme',
  'Racket',
  'R',
  'Julia',
  'Fortran',
  'Fortran Free Form',
  'COBOL',
  'Assembly',
  'Unix Assembly',
  'Motorola 68K Assembly',
  'PowerShell',
  'Shell',
  'fish',
  'Tcl',
  'Vim script',
  'Pascal',
  'Ada',
  'Zig',
  'Nim',
  'D',
  'Solidity',
  'Haxe',
  'ActionScript',
  'Prolog',
  'ABAP',
  'Gleam',
  'V',
  'Odin',
  'Vala',
  'GDScript',
  'Awk',
  'Batchfile',
  'JCL',
  'RPGLE',
  'Smalltalk',
  'Verilog',
  'SystemVerilog',
  'VHDL',
  'MATLAB',
  'Nix',
  'Puppet',
  'Bicep',
  'Jsonnet',
] as const;

/**
 * Languages the tree-sitter syntax layer parses (packages/syntax/src/languages.ts; a CodeAtlas
 * test checks the two lists are the same).
 */
export const SYNTAX_LANGUAGES = [
  'Python',
  'Starlark',
  'Go',
  'Java',
  'C#',
  'C',
  'C++',
  'Objective-C',
  'Cuda',
  'Rust',
  'PHP',
  'Ruby',
  'Scala',
  'Kotlin',
  'Gradle Kotlin DSL',
  'Groovy',
  'Gradle',
  'Lua',
  'Elixir',
  'Haskell',
  'Julia',
  'OCaml',
  'F#',
  'Zig',
  'Solidity',
  'Shell',
  'PowerShell',
  'Puppet',
  'Bicep',
  'HCL',
  // Sprint L5: grammars built from pinned source commits (packages/syntax/scripts/grammar-sources.json).
  'Dart',
  'Swift',
  'Perl',
  'R',
  'Erlang',
  'Clojure',
  'Scheme',
  'Racket',
  'Common Lisp',
  'Emacs Lisp',
  'Luau',
  'Crystal',
  'GLSL',
  'HLSL',
  'Apex',
  'GDScript',
  'Hack',
  'V',
  'Odin',
  'D',
  'Vala',
  'Haxe',
  'ActionScript',
  'Nim',
  'Elm',
  'Gleam',
  'PureScript',
  'MATLAB',
  'Pascal',
  'Fortran',
  'Fortran Free Form',
  'Ada',
  'COBOL',
  'SystemVerilog',
  'Verilog',
  'VHDL',
  'Assembly',
  'Unix Assembly',
  'WGSL',
  'Nix',
  'fish',
] as const;

const ANALYSER_BY_LANGUAGE: Record<string, AnalyserId> = {
  TypeScript: 'ts-compiler',
  TSX: 'ts-compiler',
  JavaScript: 'ts-compiler',
  JSON: 'json',
  'JSON with Comments': 'json',
  'Jupyter Notebook': 'json',
  'OASv2-json': 'json',
  'OASv3-json': 'json',
  YAML: 'yaml',
  'OASv2-yaml': 'yaml',
  'OASv3-yaml': 'yaml',
  TOML: 'toml',
  XML: 'xml',
  'Maven POM': 'xml',
  'Ant Build System': 'xml',
  'XML Property List': 'xml',
  XSLT: 'xml',
  SVG: 'xml',
  INI: 'ini',
  'Java Properties': 'ini',
  EditorConfig: 'ini',
  'Git Config': 'ini',
  Dotenv: 'ini',
  Dockerfile: 'dockerfile',
  Makefile: 'make',
  CMake: 'cmake',
  HCL: 'hcl',
  SQL: 'sql',
  PLSQL: 'sql',
  PLpgSQL: 'sql',
  TSQL: 'sql',
  SQLPL: 'sql',
  Prisma: 'prisma',
  Markdown: 'markdown',
  MDX: 'markdown',
  reStructuredText: 'doc-headings',
  AsciiDoc: 'doc-headings',
  Org: 'doc-headings',
  Pod: 'doc-headings',
  'Pod 6': 'doc-headings',
  TeX: 'doc-headings',
  'Protocol Buffer': 'idl',
  Thrift: 'idl',
  GraphQL: 'idl',
  "Cap'n Proto": 'idl',
  'Avro IDL': 'idl',
  Smithy: 'idl',
  WebIDL: 'idl',
  CSV: 'delimited',
  TSV: 'delimited',
  'Graphviz (DOT)': 'dot',
  'Gettext Catalog': 'gettext',
};
// The syntax layer replaces the patterns (and the HCL block extractor, whose links are kept).
for (const l of SYNTAX_LANGUAGES) ANALYSER_BY_LANGUAGE[l] = 'syntax';
for (const l of DECLARATION_LANGUAGES) ANALYSER_BY_LANGUAGE[l] ??= 'declarations';

export interface LanguageInfo {
  name: string;
  linguistType: LinguistEntry['type'] | 'nexora';
  category: Category;
  group?: string;
  extensions: string[];
  filenames: string[];
  interpreters: string[];
  aliases: string[];
  analyser: AnalyserId;
}

/** Formats Linguist does not list that repositories commonly contain. */
const EXTRA: LinguistEntry[] = (
  [
    { name: 'Liquibase changelog', type: 'data' },
    { name: 'Git LFS pointer', type: 'data' },
    // Added after the validation runs (LANGUAGE_COVERAGE_VALIDATION.md) found them unrecognised.
    {
      name: 'PEM certificate or key',
      type: 'data',
      extensions: ['.pem', '.crt', '.cer', '.csr', '.key'],
    },
    {
      name: 'Keystore',
      type: 'data',
      extensions: ['.jks', '.p12', '.pfx', '.keystore', '.truststore'],
    },
    { name: 'EEx', type: 'markup', extensions: ['.eex'] },
    { name: 'Apple strings', type: 'data', extensions: ['.strings', '.stringsdict'] },
    { name: 'Xcode configuration', type: 'data', extensions: ['.xcconfig'] },
    { name: 'Xcode project', type: 'data', extensions: ['.pbxproj'] },
    { name: 'Java service provider list', type: 'data' },
    { name: 'Play routes', type: 'data' },
  ] as LinguistEntry[]
)
  // A Linguist name always wins: an overlay is only for formats Linguist does not list.
  .filter(
    (e) => !(linguist as { languages: LinguistEntry[] }).languages.some((l) => l.name === e.name),
  );

const ALL: LanguageInfo[] = [
  ...(linguist as { languages: LinguistEntry[] }).languages,
  ...EXTRA,
].map((l) => ({
  name: l.name,
  linguistType: EXTRA.includes(l) ? 'nexora' : l.type,
  category: CATEGORY_OVERRIDES[l.name] ?? TYPE_CATEGORY[l.type],
  group: l.group,
  extensions: l.extensions ?? [],
  filenames: l.filenames ?? [],
  interpreters: l.interpreters ?? [],
  aliases: l.aliases ?? [],
  analyser: ANALYSER_BY_LANGUAGE[l.name] ?? 'text',
}));

export const LANGUAGES: readonly LanguageInfo[] = ALL;
const BY_NAME = new Map(ALL.map((l) => [l.name, l]));

export function languageInfo(name: string): LanguageInfo | undefined {
  return BY_NAME.get(name);
}

/** Names used in overrides that must exist (checked by tests, so a typo cannot hide a language). */
export function overrideNames(): string[] {
  return [
    ...Object.keys(CATEGORY_OVERRIDES),
    ...Object.keys(ANALYSER_BY_LANGUAGE),
    ...DECLARATION_LANGUAGES,
    ...SYNTAX_LANGUAGES,
  ];
}

export function categoryOf(language: string): Category {
  return BY_NAME.get(language)?.category ?? 'unknown';
}

export function analyserOf(language: string): AnalyserId {
  return BY_NAME.get(language)?.analyser ?? 'text';
}
