import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isTestPath } from './test-paths';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import type { DiscoveredFile } from './files';
import { IntegrationDetector } from './integrations';
import { SchemaDetector } from './schema';
import { componentKindOf, maskComponent, SVELTE_AMBIENT, VUE_AMBIENT, virtualPathOf } from './sfc';
import { GraphBuilder, type Confidence, type GraphOp, type NodeRef } from './model';
import {
  applyDelta,
  configFingerprint,
  declaresGlobals,
  dirtyFiles,
  fileDependencies,
  sha256,
  statsDelta,
  statsSnapshot,
  type IncrementalInfo,
  type PendingInferred,
  type TsCacheState,
  type TsFileCache,
} from './ts-cache';

/**
 * TypeScript/JavaScript indexer built on the TypeScript Compiler API.
 *
 * Labelling rules (shown to users as-is):
 * - observed: the type checker resolved it (import resolved to a file, call
 *   resolved to a declaration, class heritage resolved).
 * - inferred: a heuristic made the link (framework route conventions, a call
 *   with no type information matched to the only declaration of that name,
 *   tests linked to the files they import).
 * - unknown: seen but not resolvable (dynamic calls, unresolved imports). These
 *   are recorded in `unresolved` and counted in the coverage report.
 */

export interface TsIndexStats {
  programs: number;
  filesParsed: number;
  filesFailed: { path: string; error: string }[];
  imports: { internal: number; external: number; unresolved: number };
  calls: {
    observed: number;
    inferred: number;
    external: number;
    builtin: number;
    dynamic: number;
    unresolved: number;
  };
  symbols: number;
  routes: number;
}

export interface PackageInfo {
  dir: string; // repo-relative, '' for root
  name: string;
  bin: Record<string, string>;
  main?: string;
}

/** Runtime globals (Node, browsers, extensions). Calls to these are builtin, not unresolved. */
const RUNTIME_GLOBALS = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'browser',
  'chrome',
  'customElements',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'alert',
  'confirm',
  'getComputedStyle',
  'matchMedia',
  'Deno',
  'Bun',
]);

const HTTP_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']);
const NEXT_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
export { isTestPath };

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** Nearest ancestor directory (repo-relative) from a set, longest match wins. */
export function nearest(path: string, dirs: string[]): string | undefined {
  let best: string | undefined;
  for (const d of dirs) {
    if (d === '' || path === d || path.startsWith(`${d}/`)) {
      if (best === undefined || d.length > best.length) best = d;
    }
  }
  return best;
}

function packageNameOfSpecifier(spec: string): string {
  if (spec.startsWith('node:')) return spec;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? spec);
}

function packageNameFromNodeModulesPath(p: string): string {
  const idx = p.lastIndexOf('/node_modules/');
  const rest = p.slice(idx + '/node_modules/'.length).split('/');
  return rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : (rest[0] ?? 'unknown');
}

/** Map a Next.js app/pages router file to a URL path. */
export function nextRoutePath(
  filePath: string,
): { kind: 'route' | 'page' | 'pages-api'; path: string } | null {
  const app = /(?:^|\/)(?:src\/)?app\/(.*?)(?:\/)?(route|page)\.[cm]?[jt]sx?$/.exec(filePath);
  if (app) {
    const segs = (app[1] ?? '')
      .split('/')
      .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
    const path = `/${segs.map((s) => s.replace(/^\[\[?\.\.\.(.+?)\]?\]$/, '*$1').replace(/^\[(.+)\]$/, ':$1')).join('/')}`;
    return { kind: app[2] === 'route' ? 'route' : 'page', path };
  }
  const pages = /(?:^|\/)(?:src\/)?pages\/(api\/.*?)\.[cm]?[jt]sx?$/.exec(filePath);
  if (pages) {
    const segs = (pages[1] ?? '')
      .replace(/\/index$/, '')
      .split('/')
      .map((s) => s.replace(/^\[(.+)\]$/, ':$1'));
    return { kind: 'pages-api', path: `/${segs.join('/')}` };
  }
  return null;
}

interface Ctx {
  root: string;
  repoFiles: Set<string>; // repo-relative paths of all discovered files
  graph: GraphBuilder;
  stats: TsIndexStats;
  moduleOf: (path: string) => string;
  /** bare name -> symbol keys (for inferred fallback) */
  byName: Map<string, Set<string>>;
  byNameRecorder: [string, string][] | null;
  integrations: IntegrationDetector;
  schema: SchemaDetector;
  pendingInferred: PendingInferred[];
  /** Virtual module (absolute path) → the Svelte, Vue or Astro component it stands for. */
  virtual: Map<string, string>;
  /** Component path → offsets of component-tag references in its virtual module. */
  componentTags: Map<string, Set<number>>;
}

function rel(ctx: Ctx, abs: string): string | null {
  const r = repoPathOf(ctx, abs);
  return r !== null && ctx.repoFiles.has(r) ? r : null;
}

/** Repository-relative path of any file inside the repository (outside node_modules), discovered or not. */
function repoPathOf(ctx: Ctx, abs: string): string | null {
  const component = ctx.virtual.get(toPosix(abs));
  if (component !== undefined) return component;
  let real = abs;
  try {
    real = realpathSync(abs);
  } catch {
    // keep as-is
  }
  const r = toPosix(relative(ctx.root, real));
  if (r.startsWith('..') || r.includes('/node_modules/') || r.startsWith('node_modules/'))
    return null;
  return r;
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function nameText(name: ts.PropertyName | ts.BindingName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function isTopLevel(node: ts.Node): boolean {
  const p = node.parent;
  return !!p && (ts.isSourceFile(p) || ts.isModuleBlock(p));
}

function isFunctionInit(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  let x: ts.Expression = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x))
    x = x.expression;
  return ts.isArrowFunction(x) || ts.isFunctionExpression(x);
}

function hasExport(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function namespacePrefix(node: ts.Node): string {
  const parts: string[] = [];
  let p: ts.Node | undefined = node.parent;
  while (p && !ts.isSourceFile(p)) {
    if (ts.isModuleDeclaration(p)) parts.unshift(p.name.getText());
    p = p.parent;
  }
  return parts.length ? `${parts.join('.')}.` : '';
}

/** If `node` is a declaration CodeAtlas tracks as a symbol, return its qualified name and kind. */
function describeDecl(
  node: ts.Node,
): { qname: string; kind: string; exported: boolean; nameNode: ts.Node } | null {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && isTopLevel(node)) {
    const n = node.name?.text ?? (hasExport(node) ? 'default' : null);
    if (!n) return null;
    return {
      qname: namespacePrefix(node) + n,
      kind: ts.isClassDeclaration(node) ? 'class' : 'function',
      exported: hasExport(node),
      nameNode: node.name ?? node,
    };
  }
  if (
    (ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    isTopLevel(node)
  ) {
    const kind = ts.isInterfaceDeclaration(node)
      ? 'interface'
      : ts.isTypeAliasDeclaration(node)
        ? 'type'
        : 'enum';
    return {
      qname: namespacePrefix(node) + node.name.text,
      kind,
      exported: hasExport(node),
      nameNode: node.name,
    };
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent) &&
    isTopLevel(node.parent.parent)
  ) {
    const n = nameText(node.name);
    if (!n) return null;
    return {
      qname: namespacePrefix(node.parent.parent) + n,
      kind: isFunctionInit(node.initializer) ? 'function' : 'variable',
      exported: hasExport(node.parent.parent),
      nameNode: node.name,
    };
  }
  if (
    (ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      (ts.isPropertyDeclaration(node) && isFunctionInit(node.initializer))) &&
    ts.isClassLike(node.parent)
  ) {
    const cls = node.parent.name?.text ?? 'default';
    const n = ts.isConstructorDeclaration(node) ? 'constructor' : nameText(node.name);
    if (!n) return null;
    const isPrivate =
      ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Private;
    return {
      qname: `${namespacePrefix(node.parent)}${cls}.${n}`,
      kind: ts.isPropertyDeclaration(node)
        ? 'method'
        : ts.isConstructorDeclaration(node)
          ? 'constructor'
          : ts.isMethodDeclaration(node)
            ? 'method'
            : 'accessor',
      exported: !isPrivate,
      nameNode: node.name ?? node,
    };
  }
  if (ts.isExportAssignment(node) && !node.isExportEquals && isTopLevel(node)) {
    return {
      qname: 'default',
      kind: isFunctionInit(node.expression) ? 'function' : 'variable',
      exported: true,
      nameNode: node,
    };
  }
  return null;
}

/** Nearest tracked declaration enclosing (or equal to) `node`. */
function trackedAncestor(node: ts.Node | undefined): { node: ts.Node; qname: string } | null {
  let n: ts.Node | undefined = node;
  while (n && !ts.isSourceFile(n)) {
    const d = describeDecl(n);
    if (d) return { node: n, qname: d.qname };
    n = n.parent;
  }
  return null;
}

const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

function sharedSourceHost(
  host: ts.CompilerHost,
  options: ts.CompilerOptions,
  cache: Map<string, ts.SourceFile>,
): ts.CompilerHost {
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, langOrOptions, onError, shouldCreateNew) => {
    const o = typeof langOrOptions === 'object' ? langOrOptions : undefined;
    const key = [
      fileName,
      o ? o.languageVersion : langOrOptions,
      o?.impliedNodeFormat ?? '',
      o?.jsDocParsingMode ?? '',
      options.moduleDetection ?? '',
      options.jsx ?? '',
    ].join('|');
    if (!shouldCreateNew) {
      const hit = cache.get(key);
      if (hit) return hit;
    }
    const sf = getSourceFile(fileName, langOrOptions, onError, shouldCreateNew);
    if (sf) cache.set(key, sf);
    return sf;
  };
  return host;
}

function loadCompilerOptions(root: string, tsconfigRel: string | undefined): ts.CompilerOptions {
  let base: ts.CompilerOptions = {};
  if (tsconfigRel !== undefined) {
    const file = join(root, tsconfigRel, 'tsconfig.json');
    const read = ts.readConfigFile(file, ts.sys.readFile);
    if (!read.error) {
      const parsed = ts.parseJsonConfigFileContent(
        read.config,
        ts.sys,
        dirname(file),
        undefined,
        file,
      );
      base = parsed.options;
    }
  }
  // SvelteKit's `$lib` alias lives in a generated .svelte-kit/tsconfig.json that a clone does
  // not have; its documented default is src/lib (kit.files.lib).
  const dir = join(root, tsconfigRel ?? '');
  if (!base.paths?.['$lib'] && existsSync(join(dir, 'src/lib'))) {
    let pkg: string;
    try {
      pkg = readFileSync(join(dir, 'package.json'), 'utf8');
    } catch {
      pkg = ''; // no package.json: not a SvelteKit package
    }
    if (pkg.includes('"@sveltejs/kit"'))
      base = {
        ...base,
        paths: {
          ...base.paths,
          $lib: [join(dir, 'src/lib')],
          '$lib/*': [join(dir, 'src/lib/*')],
        },
      };
  }
  return {
    ...base,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    maxNodeModuleJsDepth: 0,
    incremental: false,
    composite: false,
    declaration: false,
    sourceMap: false,
    plugins: [],
    jsx: base.jsx ?? ts.JsxEmit.Preserve,
    moduleResolution: base.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
    module: base.module ?? ts.ModuleKind.ESNext,
    target: base.target ?? ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
  };
}

export function indexTypeScript(
  root: string,
  files: DiscoveredFile[],
  allPaths: Set<string>,
  graph: GraphBuilder,
  moduleOf: (p: string) => string,
  cache?: { previous: TsCacheState | null },
): TsIndexStats & { cache: TsCacheState; incremental: IncrementalInfo } {
  const stats: TsIndexStats = {
    programs: 0,
    filesParsed: 0,
    filesFailed: [],
    imports: { internal: 0, external: 0, unresolved: 0 },
    calls: { observed: 0, inferred: 0, external: 0, builtin: 0, dynamic: 0, unresolved: 0 },
    symbols: 0,
    routes: 0,
  };
  const schema = new SchemaDetector(graph);
  const ctx: Ctx = {
    root: realpathSync(root),
    repoFiles: allPaths,
    graph,
    stats,
    moduleOf,
    byName: new Map(),
    byNameRecorder: null,
    integrations: new IntegrationDetector({
      graph,
      repoFiles: allPaths,
      onDbCall: (node, pkg, sf, path, owner) => {
        if (pkg === '@prisma/client' && ts.isCallExpression(node))
          schema.prismaCall(node, sf, path, owner);
      },
    }),
    schema,
    pendingInferred: [],
    virtual: new Map(),
    componentTags: new Map(),
  };
  const code = files.filter((f) => f.lang === 'typescript' || f.lang === 'javascript');
  // Svelte, Vue and Astro components: each is compiled as a virtual TypeScript module.
  const virtualText = new Map<string, string>();
  const ambient = new Map<string, string>();
  const componentKinds = new Set<string>();
  // Scripts without an extension (found by their `#!` line) are compiled under a virtual name too.
  const virtualOf = new Map<string, string>();
  for (const f of code) {
    const kind = componentKindOf(f.path);
    const bare = !kind && !/\.[^/]*$/.test(f.path.slice(f.path.lastIndexOf('/') + 1));
    if (!kind && !bare) continue;
    const vpath = kind
      ? virtualPathOf(f.path)
      : `${f.path}${f.lang === 'typescript' ? '.ts' : '.js'}`;
    if (allPaths.has(vpath)) {
      stats.filesFailed.push({
        path: f.path,
        error: `the file ${vpath} exists, so this file cannot be compiled under that name`,
      });
      continue;
    }
    let text: string;
    try {
      text = readFileSync(join(ctx.root, f.path), 'utf8');
    } catch (e) {
      stats.filesFailed.push({ path: f.path, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const masked = kind ? maskComponent(f.path, text) : null;
    const abs = toPosix(join(ctx.root, vpath));
    virtualText.set(abs, masked ? masked.code : text);
    ctx.virtual.set(abs, f.path);
    virtualOf.set(f.path, vpath);
    if (masked) {
      ctx.componentTags.set(f.path, new Set(masked.tags));
      componentKinds.add(masked.kind);
    }
  }
  // The runes and macros are declared as files of their packages, so calls to them are external.
  if (componentKinds.has('svelte'))
    ambient.set(
      toPosix(join(ctx.root, 'node_modules/svelte/__codeatlas_runes.d.ts')),
      SVELTE_AMBIENT,
    );
  if (componentKinds.has('vue'))
    ambient.set(toPosix(join(ctx.root, 'node_modules/vue/__codeatlas_macros.d.ts')), VUE_AMBIENT);
  const served = new Map([...virtualText, ...ambient]);
  const withComponents = (host: ts.CompilerHost): ts.CompilerHost => {
    if (!served.size) return host;
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.fileExists = (f) => served.has(toPosix(f)) || fileExists(f);
    host.readFile = (f) => served.get(toPosix(f)) ?? readFile(f);
    host.getSourceFile = (fileName, lang, onError, shouldCreateNew) => {
      const text = served.get(toPosix(fileName));
      if (text === undefined) return getSourceFile(fileName, lang, onError, shouldCreateNew);
      return ts.createSourceFile(
        fileName,
        text,
        lang,
        false,
        fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
    };
    return host;
  };
  const sourcePath = (p: string) => join(ctx.root, virtualOf.get(p) ?? p);
  const tsconfigDirs = [...allPaths]
    .filter((p) => p === 'tsconfig.json' || p.endsWith('/tsconfig.json'))
    .map((p) => (p === 'tsconfig.json' ? '' : p.slice(0, -'/tsconfig.json'.length)));

  // Group files by nearest tsconfig so path aliases resolve per package.
  const groups = new Map<string, DiscoveredFile[]>();
  for (const f of code) {
    const g = nearest(f.path, tsconfigDirs) ?? '\0none';
    const list = groups.get(g) ?? [];
    list.push(f);
    groups.set(g, list);
  }

  // Incremental indexing (S3-4): decide which files to analyse, replay the rest.
  const readRepo = (p: string): string | null => {
    try {
      return readFileSync(join(ctx.root, p), 'utf8');
    } catch {
      return null;
    }
  };
  const shas = new Map<string, string>();
  const globals = new Set<string>();
  for (const f of code) {
    const text = readRepo(f.path) ?? '';
    shas.set(f.path, sha256(text));
    if (declaresGlobals(f.path, text)) globals.add(f.path);
  }
  const configHash = configFingerprint(allPaths, readRepo);
  const previous = cache?.previous ?? null;
  const extraGlobals = new Set<string>();
  let dirty: Set<string> | null = null;
  let reason: string;
  if (!cache) reason = 'incremental indexing not requested';
  else if (!previous) reason = 'no previous index to reuse';
  else if (previous.configHash !== configHash)
    reason = 'project configuration, dependencies or the set of files changed';
  else {
    const extraNow: Record<string, string> = {};
    for (const p of Object.keys(previous.extra ?? {})) {
      const text = readRepo(p);
      extraNow[p] = text === null ? '<missing>' : sha256(text);
      if (text !== null && declaresGlobals(p, text)) extraGlobals.add(p);
    }
    dirty = dirtyFiles(previous, shas, globals, extraNow);
    // A changed declaration file that declares globals affects every file.
    for (const p of extraGlobals) if (extraNow[p] !== previous.extra?.[p]) dirty = null;
    reason = dirty
      ? `${dirty.size} changed or dependent files re-analysed`
      : 'a global declaration changed, or every file was affected';
  }
  const analyse = (path: string) => !dirty || dirty.has(path);
  const out: TsCacheState = { configHash, files: {} };
  const entryFor = (path: string): TsFileCache => {
    let e = out.files[path];
    if (!e) {
      e = {
        sha: shas.get(path) ?? '',
        deps: [],
        p1: [],
        p2: [],
        byName: [],
        pending: [],
        s1: { counts: {}, failed: [] },
        s2: { counts: {}, failed: [] },
      };
      out.files[path] = e;
    }
    return e;
  };
  /** Run one file's work for a pass, recording its graph changes and counters. */
  const recorded = (path: string, pass: 1 | 2, fn: () => void): void => {
    const e = entryFor(path);
    const before = statsSnapshot(stats);
    const failedBefore = stats.filesFailed.length;
    const pendingBefore = ctx.pendingInferred.length;
    const ops: GraphOp[] = [];
    graph.recorder = ops;
    ctx.byNameRecorder = pass === 1 ? e.byName : null;
    try {
      fn();
    } finally {
      graph.recorder = null;
      ctx.byNameRecorder = null;
    }
    const delta = statsDelta(before, statsSnapshot(stats), failedBefore, stats.filesFailed);
    if (pass === 1) {
      e.p1 = ops;
      e.s1 = delta;
    } else {
      e.p2 = ops;
      e.s2 = delta;
      e.pending = ctx.pendingInferred.slice(pendingBefore).map((x) => structuredClone(x));
    }
  };
  const replay = (path: string, pass: 1 | 2): void => {
    const e = previous?.files[path];
    if (!e) throw new Error(`Incremental index cache has no entry for ${path}.`);
    out.files[path] = e;
    for (const op of pass === 1 ? e.p1 : e.p2) graph.replay(op);
    if (pass === 1) {
      for (const [bare, key] of e.byName) addByName(ctx, bare, key);
      applyDelta(stats, e.s1);
    } else {
      ctx.pendingInferred.push(...e.pending.map((x) => structuredClone(x)));
      applyDelta(stats, e.s2);
    }
  };

  const programs: {
    program: ts.Program;
    checker: ts.TypeChecker;
    options: ts.CompilerOptions;
    host: ts.CompilerHost;
  }[] = [];
  const programOf = new Map<string, (typeof programs)[number]>();
  // Parsed source files are shared between the per-tsconfig programs, the way the
  // TypeScript language service shares them between projects (DocumentRegistry).
  // Without this, every program re-parses the same lib and node_modules .d.ts files.
  const sourceCache = new Map<string, ts.SourceFile>();
  for (const [group, list] of groups) {
    const todo = list.filter((f) => analyse(f.path));
    if (!todo.length) continue;
    const options = loadCompilerOptions(ctx.root, group === '\0none' ? undefined : group);
    const host = sharedSourceHost(
      withComponents(ts.createCompilerHost(options, true)),
      options,
      sourceCache,
    );
    // Global-declaring files are compiled too, so re-analysed files see the same types:
    // analysed ones in this group, and declaration files any file in this group references.
    const roots = dirty
      ? list.filter((f) => dirty.has(f.path) || globals.has(f.path)).map((f) => f.path)
      : list.map((f) => f.path);
    if (dirty)
      for (const g of extraGlobals)
        if (list.some((f) => previous?.files[f.path]?.deps.includes(g))) roots.push(g);
    const program = ts.createProgram({
      rootNames: [...roots.map(sourcePath), ...ambient.keys()],
      options,
      host,
    });
    const entry = { program, checker: program.getTypeChecker(), options, host };
    programs.push(entry);
    for (const f of todo) programOf.set(f.path, entry);
    stats.programs++;
  }
  const ordered = [...groups.values()].flat();

  // Pass 1: declarations, imports, routes.
  for (const f of ordered) {
    const p = programOf.get(f.path);
    if (!p) {
      replay(f.path, 1);
      continue;
    }
    recorded(f.path, 1, () => {
      const sf = p.program.getSourceFile(sourcePath(f.path));
      if (!sf) {
        stats.filesFailed.push({ path: f.path, error: 'not loaded by compiler' });
        return;
      }
      try {
        collectDeclarations(ctx, sf, f.path, p.checker);
        collectImports(ctx, sf, f.path, p.options, p.host);
        collectNextRoutes(ctx, sf, f.path);
        stats.filesParsed++;
      } catch (e) {
        stats.filesFailed.push({ path: f.path, error: e instanceof Error ? e.message : String(e) });
      }
      entryFor(f.path).deps = fileDependencies(sf, p.options, p.host, (abs) =>
        repoPathOf(ctx, abs),
      );
    });
  }

  // Module-level database and HTTP clients in every repository file each program loaded,
  // so later passes recognise them across files.
  for (const p of programs)
    for (const sf of p.program.getSourceFiles())
      if (!sf.isDeclarationFile && rel(ctx, sf.fileName))
        ctx.integrations.collectClients(sf, p.checker);

  // Pass 2: calls, heritage, JSX, express-style routes, complexity, integrations.
  for (const f of ordered) {
    const p = programOf.get(f.path);
    if (!p) {
      replay(f.path, 2);
      continue;
    }
    recorded(f.path, 2, () => {
      const sf = p.program.getSourceFile(sourcePath(f.path));
      if (!sf) return;
      try {
        collectReferences(ctx, sf, f.path, p.checker);
      } catch (e) {
        stats.filesFailed.push({
          path: f.path,
          error: `reference pass: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    });
  }
  // Remember the content of in-repo dependencies that are not analysed themselves.
  out.extra = {};
  for (const e of Object.values(out.files))
    for (const d of e.deps)
      if (!shas.has(d) && !(d in out.extra)) {
        const text = readRepo(d);
        out.extra[d] = text === null ? '<missing>' : sha256(text);
      }
  const incremental: IncrementalInfo = {
    mode: dirty ? 'incremental' : 'full',
    reason,
    reanalysed: programOf.size,
    reused: ordered.length - programOf.size,
  };

  // Inferred fallback: untyped call matched to the only declaration with that name.
  for (const c of ctx.pendingInferred) {
    const keys = ctx.byName.get(c.name);
    if (keys && keys.size === 1) {
      const [key] = keys as Set<string> & { size: 1 };
      graph.addEdge({
        kind: c.kind,
        src: c.owner,
        dst: { kind: 'symbol', key: key as string },
        confidence: 'inferred',
        evidencePath: c.path,
        evidenceLine: c.line,
        detail: 'matched by unique name (no type information)',
      });
      stats.calls.inferred++;
    } else {
      stats.calls.unresolved++;
      graph.addUnresolved({
        filePath: c.path,
        line: c.line,
        kind: 'call',
        text: c.text,
        reason: keys
          ? `ambiguous: ${keys.size} declarations named ${c.name}`
          : 'no declaration found',
      });
    }
  }

  // Tests -> files they import (inferred).
  for (const e of graph.edges) {
    if (
      e.kind === 'imports' &&
      e.dst.kind === 'file' &&
      isTestPath(e.src.key) &&
      !isTestPath(e.dst.key)
    ) {
      graph.addEdge({
        kind: 'tests',
        src: e.src,
        dst: e.dst,
        confidence: 'inferred',
        evidencePath: e.evidencePath,
        evidenceLine: e.evidenceLine,
        detail: 'test file imports this file',
      });
    }
  }
  return { ...stats, cache: out, incremental };
}

function addByName(ctx: Ctx, bare: string, key: string): void {
  const set = ctx.byName.get(bare) ?? new Set<string>();
  set.add(key);
  ctx.byName.set(bare, set);
  ctx.byNameRecorder?.push([bare, key]);
}

function symbolKey(path: string, qname: string): string {
  return `${path}#${qname}`;
}

function collectDeclarations(
  ctx: Ctx,
  sf: ts.SourceFile,
  path: string,
  checker: ts.TypeChecker,
): void {
  const fileRef: NodeRef = { kind: 'file', key: path };
  const visit = (node: ts.Node): void => {
    const d = describeDecl(node);
    if (d) {
      const key = symbolKey(path, d.qname);
      const parent = trackedAncestor(node.parent);
      const jsDoc = ts
        .getJSDocCommentsAndTags(node)
        .map((j) => (ts.isJSDoc(j) && typeof j.comment === 'string' ? j.comment : ''))
        .filter(Boolean)
        .join(' ')
        .slice(0, 500);
      const startLine = lineOf(sf, node.getStart(sf));
      const endLine = lineOf(sf, node.getEnd());
      ctx.graph.addNode({
        kind: 'symbol',
        key,
        name: d.qname,
        filePath: path,
        module: ctx.moduleOf(path),
        symbolKind: d.kind,
        exported: d.exported,
        startLine,
        endLine,
        data: {
          signature: signatureOf(node, sf),
          ...functionShape(node, checker),
          doc: jsDoc || undefined,
          loc: endLine - startLine + 1,
        },
      });
      ctx.graph.addEdge({
        kind: 'contains',
        src: parent ? { kind: 'symbol', key: symbolKey(path, parent.qname) } : fileRef,
        dst: { kind: 'symbol', key },
        confidence: 'observed',
        evidencePath: path,
        evidenceLine: startLine,
      });
      if (
        d.kind === 'function' ||
        d.kind === 'method' ||
        d.kind === 'class' ||
        d.kind === 'constructor'
      ) {
        addByName(ctx, d.qname.split('.').pop() as string, key);
      }
      ctx.stats.symbols++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const TYPE_TEXT_MAX = 160;
const typeText = (checker: ts.TypeChecker, t: ts.Type, at: ts.Node): string => {
  const s = checker.typeToString(t, at, ts.TypeFormatFlags.NoTruncation);
  return s.length > TYPE_TEXT_MAX ? `${s.slice(0, TYPE_TEXT_MAX - 1)}…` : s;
};

/** The function a declaration stands for, if it is one (including `const f = () => …`). */
function functionLike(node: ts.Node): ts.SignatureDeclaration | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
    return node;
  const init =
    ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)
      ? node.initializer
      : ts.isExportAssignment(node)
        ? node.expression
        : undefined;
  let e = init;
  while (
    e &&
    (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))
  )
    e = e.expression;
  if (e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e))) return e;
  return null;
}

/**
 * Inputs and output of a function, as the type checker sees them. `declared` says whether
 * the source wrote the type or TypeScript worked it out; both come from the compiler.
 */
function functionShape(
  node: ts.Node,
  checker: ts.TypeChecker,
): {
  params?: { name: string; type: string; optional: boolean }[];
  returns?: string;
  returnsDeclared?: boolean;
} {
  const fn = functionLike(node);
  if (!fn) return {};
  const params = fn.parameters.map((p) => ({
    name: p.name.getText().slice(0, 80),
    type: typeText(checker, checker.getTypeAtLocation(p), p),
    optional: !!p.questionToken || !!p.initializer || !!p.dotDotDotToken,
  }));
  if (ts.isConstructorDeclaration(fn) || ts.isSetAccessorDeclaration(fn)) return { params };
  const sig = checker.getSignatureFromDeclaration(fn);
  const returns = sig ? typeText(checker, checker.getReturnTypeOfSignature(sig), fn) : undefined;
  return { params, returns, returnsDeclared: !!fn.type };
}

function signatureOf(node: ts.Node, sf: ts.SourceFile): string {
  const text = node.getText(sf);
  // Up to the body: first "{" or "=>" at depth 0, capped.
  let depth = 0;
  for (let i = 0; i < Math.min(text.length, 400); i++) {
    const ch = text[i];
    if (ch === '(' || ch === '<' || ch === '[') depth++;
    else if (ch === ')' || ch === '>' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === '{' || (ch === '=' && text[i + 1] === '>')))
      return text.slice(0, i).replace(/\s+/g, ' ').trim();
  }
  return text.slice(0, 200).split('\n')[0]?.trim() ?? '';
}

function collectImports(
  ctx: Ctx,
  sf: ts.SourceFile,
  path: string,
  options: ts.CompilerOptions,
  host: ts.CompilerHost,
): void {
  const fileRef: NodeRef = { kind: 'file', key: path };
  const record = (spec: string, pos: number, detail: string, typeOnly: boolean) => {
    const line = lineOf(sf, pos);
    const res = ts.resolveModuleName(spec, sf.fileName, options, host).resolvedModule;
    if (res) {
      // Workspace packages resolve through node_modules symlinks; their real path is inside the repo, so they are internal.
      const target = rel(ctx, res.resolvedFileName);
      if (target) {
        ctx.graph.addEdge({
          kind: 'imports',
          src: fileRef,
          dst: { kind: 'file', key: target },
          confidence: 'observed',
          evidencePath: path,
          evidenceLine: line,
          detail: typeOnly ? `type-only: ${detail}` : detail,
        });
        ctx.stats.imports.internal++;
        return;
      }
      const pkg = res.resolvedFileName.includes('/node_modules/')
        ? packageNameFromNodeModulesPath(toPosix(res.resolvedFileName))
        : packageNameOfSpecifier(spec);
      const ext = ctx.graph.addNode({
        kind: 'external',
        key: pkg,
        name: pkg,
        data: { installed: true },
      });
      ctx.graph.addEdge({
        kind: 'imports',
        src: fileRef,
        dst: ext,
        confidence: 'observed',
        evidencePath: path,
        evidenceLine: line,
        detail,
      });
      ctx.stats.imports.external++;
      return;
    }
    // Not resolvable by the compiler.
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const candidate = toPosix(join(dirname(path), spec));
      if (ctx.repoFiles.has(candidate)) {
        // Non-code asset (css, svg, json...) that exists on disk.
        ctx.graph.addEdge({
          kind: 'imports',
          src: fileRef,
          dst: { kind: 'file', key: candidate },
          confidence: 'observed',
          evidencePath: path,
          evidenceLine: line,
          detail: 'asset',
        });
        ctx.stats.imports.internal++;
        return;
      }
      ctx.stats.imports.unresolved++;
      ctx.graph.addUnresolved({
        filePath: path,
        line,
        kind: 'import',
        text: spec,
        reason: 'relative import not found',
      });
      return;
    }
    if (spec.startsWith('node:') || isBuiltinModule(spec)) {
      const name = spec.startsWith('node:') ? spec : `node:${spec}`;
      ctx.graph.addEdge({
        kind: 'imports',
        src: fileRef,
        dst: ctx.graph.addNode({ kind: 'external', key: name, name, data: { builtin: true } }),
        confidence: 'observed',
        evidencePath: path,
        evidenceLine: line,
        detail,
      });
      ctx.stats.imports.external++;
      return;
    }
    // Bare specifier with no types/installation: treat as external package, inferred.
    const pkg = packageNameOfSpecifier(spec);
    if (/^[@a-z0-9]/i.test(pkg) && !pkg.startsWith('@/') && !pkg.startsWith('~')) {
      ctx.graph.addEdge({
        kind: 'imports',
        src: fileRef,
        dst: ctx.graph.addNode({
          kind: 'external',
          key: pkg,
          name: pkg,
          data: { installed: false },
        }),
        confidence: 'inferred',
        evidencePath: path,
        evidenceLine: line,
        detail: `${detail} (package not resolvable locally)`,
      });
      ctx.stats.imports.external++;
    } else {
      ctx.stats.imports.unresolved++;
      ctx.graph.addUnresolved({
        filePath: path,
        line,
        kind: 'import',
        text: spec,
        reason: 'path alias or module not resolvable',
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let names: string;
      let typeOnly: boolean;
      if (ts.isImportDeclaration(node)) {
        typeOnly = !!node.importClause?.isTypeOnly;
        const nb = node.importClause?.namedBindings;
        const parts: string[] = [];
        if (node.importClause?.name) parts.push(`default as ${node.importClause.name.text}`);
        if (nb && ts.isNamedImports(nb)) parts.push(...nb.elements.map((e) => e.name.text));
        if (nb && ts.isNamespaceImport(nb)) parts.push(`* as ${nb.name.text}`);
        names = parts.join(', ');
      } else {
        typeOnly = node.isTypeOnly;
        names =
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? `re-export ${node.exportClause.elements.map((e) => e.name.text).join(', ')}`
            : 're-export *';
      }
      record(node.moduleSpecifier.text, node.getStart(sf), names, typeOnly);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node.moduleReference.expression.text, node.getStart(sf), node.name.text, false);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
        record(
          arg.text,
          node.getStart(sf),
          node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic import' : 'require',
          false,
        );
      else if (arg) {
        ctx.stats.imports.unresolved++;
        ctx.graph.addUnresolved({
          filePath: path,
          line: lineOf(sf, node.getStart(sf)),
          kind: 'import',
          text: node.getText(sf),
          reason: 'computed module specifier',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const BUILTINS = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'http',
  'https',
  'url',
  'util',
  'events',
  'stream',
  'child_process',
  'buffer',
  'zlib',
  'net',
  'tls',
  'dns',
  'assert',
  'readline',
  'worker_threads',
  'perf_hooks',
  'timers',
  'querystring',
  'module',
  'process',
  'vm',
  'cluster',
  'v8',
  'fs/promises',
  'stream/promises',
  'timers/promises',
]);
function isBuiltinModule(spec: string): boolean {
  return BUILTINS.has(spec);
}

function collectNextRoutes(ctx: Ctx, sf: ts.SourceFile, path: string): void {
  const r = nextRoutePath(path);
  if (!r) return;
  const handlers: { name: string; line: number }[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && hasExport(st) && st.name)
      handlers.push({ name: st.name.text, line: lineOf(sf, st.getStart(sf)) });
    if (ts.isVariableStatement(st) && hasExport(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name))
          handlers.push({ name: d.name.text, line: lineOf(sf, d.getStart(sf)) });
    if (ts.isFunctionDeclaration(st) && hasExport(st) && !st.name)
      handlers.push({ name: 'default', line: lineOf(sf, st.getStart(sf)) });
    if (ts.isExportAssignment(st) && !st.isExportEquals)
      handlers.push({ name: 'default', line: lineOf(sf, st.getStart(sf)) });
  }
  const add = (method: string, handler: string, line: number) => {
    const key = `${method} ${r.path}`;
    const route = ctx.graph.addNode({
      kind: 'route',
      key,
      name: key,
      filePath: path,
      module: ctx.moduleOf(path),
      startLine: line,
      data: { method, path: r.path, framework: r.kind === 'pages-api' ? 'next-pages' : 'next-app' },
    });
    ctx.graph.addEdge({
      kind: 'handled_by',
      src: route,
      dst: { kind: 'symbol', key: symbolKey(path, handler) },
      confidence: 'inferred',
      evidencePath: path,
      evidenceLine: line,
      detail: 'Next.js file-system routing convention',
    });
    ctx.stats.routes++;
  };
  if (r.kind === 'route')
    for (const h of handlers) if (NEXT_VERBS.has(h.name)) add(h.name, h.name, h.line);
  if (r.kind === 'page')
    for (const h of handlers) if (h.name === 'default') add('PAGE', 'default', h.line);
  if (r.kind === 'pages-api')
    for (const h of handlers) if (h.name === 'default') add('ANY', 'default', h.line);
}

function collectReferences(
  ctx: Ctx,
  sf: ts.SourceFile,
  path: string,
  checker: ts.TypeChecker,
): void {
  const fileRef: NodeRef = { kind: 'file', key: path };
  const complexity = new Map<string, number>();
  let resolvedCalls = 0;
  let unresolvedCalls = 0;

  const ownerOf = (node: ts.Node): NodeRef => {
    const t = trackedAncestor(node);
    return t ? { kind: 'symbol', key: symbolKey(path, t.qname) } : fileRef;
  };

  type Target =
    | { type: 'symbol'; key: string; via?: string }
    | { type: 'external'; pkg: string }
    | { type: 'builtin' }
    | { type: 'local' }
    | { type: 'none' };
  const resolve = (expr: ts.Node): Target => {
    let sym = checker.getSymbolAtLocation(expr);
    if (!sym) return { type: 'none' };
    if (sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        return { type: 'none' };
      }
    }
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    if (!decl) return { type: 'none' };
    const dsf = decl.getSourceFile();
    const fileName = toPosix(dsf.fileName);
    if (fileName.includes('/node_modules/')) {
      if (/\/node_modules\/(typescript|@types\/node)\//.test(fileName)) return { type: 'builtin' };
      return { type: 'external', pkg: packageNameFromNodeModulesPath(fileName) };
    }
    if (dsf.hasNoDefaultLib || /\/lib\.[\w.]*\.d\.ts$/.test(fileName)) return { type: 'builtin' };
    const target = rel(ctx, dsf.fileName);
    if (!target) return { type: 'external', pkg: 'unknown' };
    const t = trackedAncestor(decl);
    if (!t) return { type: 'local' };
    // Parameters and locals inside a function body: the real target is only known at runtime.
    if (
      t.node !== decl &&
      (ts.isParameter(decl) ||
        ts.isVariableDeclaration(decl) ||
        ts.isBindingElement(decl) ||
        ts.isFunctionDeclaration(decl))
    )
      return { type: 'local' };
    // Interface members and object-literal members link to their owning symbol.
    const via =
      t.node !== decl && !describeDecl(decl)
        ? (ts.getNameOfDeclaration(decl as ts.Declaration)?.getText(dsf) ?? undefined)
        : undefined;
    return { type: 'symbol', key: symbolKey(target, t.qname), via };
  };

  const calleeName = (e: ts.Expression): ts.Node | null => {
    if (ts.isIdentifier(e)) return e;
    if (ts.isPropertyAccessExpression(e)) return e.name;
    if (ts.isElementAccessExpression(e)) return null;
    if (ts.isParenthesizedExpression(e)) return calleeName(e.expression);
    if (ts.isNonNullExpression(e)) return calleeName(e.expression);
    return null;
  };

  const linkCall = (node: ts.CallExpression | ts.NewExpression, kind: 'calls' | 'instantiates') => {
    const owner = ownerOf(node);
    const line = lineOf(sf, node.getStart(sf));
    const nameNode = calleeName(node.expression);
    if (!nameNode) {
      ctx.stats.calls.dynamic++;
      unresolvedCalls++;
      return;
    }
    const t = resolve(nameNode);
    if (t.type === 'symbol') {
      ctx.graph.addEdge({
        kind,
        src: owner,
        dst: { kind: 'symbol', key: t.key },
        confidence: 'observed',
        evidencePath: path,
        evidenceLine: line,
        detail: t.via ? `via member ${t.via}` : undefined,
      });
      ctx.stats.calls.observed++;
      resolvedCalls++;
    } else if (t.type === 'external') {
      ctx.stats.calls.external++;
      resolvedCalls++;
    } else if (t.type === 'builtin') {
      ctx.stats.calls.builtin++;
      resolvedCalls++;
    } else if (t.type === 'local') {
      ctx.stats.calls.dynamic++;
      unresolvedCalls++;
    } else if (RUNTIME_GLOBALS.has(rootIdentifier(node.expression))) {
      ctx.stats.calls.builtin++;
      resolvedCalls++;
    } else {
      const name = nameNode.getText(sf);
      ctx.pendingInferred.push({
        owner,
        name,
        path,
        line,
        text: node.expression.getText(sf).slice(0, 120),
        kind,
      });
      unresolvedCalls++;
    }
  };

  // Component tags in a Svelte, Vue or Astro template: `<Button>` renders what `Button` names.
  const tags = new Set(ctx.componentTags.get(path) ?? []);
  const renderTag = (node: ts.Identifier | ts.PropertyAccessExpression) => {
    let dst: NodeRef | null = null;
    const t = resolve(ts.isPropertyAccessExpression(node) ? node.name : node);
    if (t.type === 'symbol') dst = { kind: 'symbol', key: t.key };
    else if (ts.isIdentifier(node)) {
      // A default import of a component module: the target is that component's file.
      const decl = checker.getSymbolAtLocation(node)?.declarations?.[0];
      let imp: ts.Node | undefined = decl;
      while (imp && !ts.isImportDeclaration(imp)) imp = imp.parent;
      if (imp && ts.isImportDeclaration(imp)) {
        const mod = checker.getSymbolAtLocation(imp.moduleSpecifier);
        const msf = mod?.valueDeclaration;
        const target = msf && ts.isSourceFile(msf) ? rel(ctx, msf.fileName) : null;
        if (target) dst = { kind: 'file', key: target };
      }
    }
    if (!dst) return;
    ctx.graph.addEdge({
      kind: 'renders',
      src: ownerOf(node),
      dst,
      confidence: 'observed',
      evidencePath: path,
      evidenceLine: lineOf(sf, node.getStart(sf)),
    });
  };

  const visit = (node: ts.Node): void => {
    if (tags.size && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node))) {
      const at = node.getStart(sf);
      if (tags.delete(at)) renderTag(node);
    }
    ctx.integrations.visit(node, sf, path, checker, () => ownerOf(node));
    ctx.schema.visit(node, sf, path, checker, () => ownerOf(node));
    if (
      BRANCH_KINDS.has(node.kind) ||
      (ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind))
    ) {
      const o = ownerOf(node);
      if (o.kind === 'symbol') complexity.set(o.key, (complexity.get(o.key) ?? 1) + 1);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind !== ts.SyntaxKind.ImportKeyword &&
      !(ts.isIdentifier(node.expression) && node.expression.text === 'require')
    ) {
      linkCall(node, 'calls');
      detectExpressRoute(ctx, sf, path, node, ownerOf, resolve);
    } else if (ts.isNewExpression(node)) linkCall(node, 'instantiates');
    else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (!(ts.isIdentifier(tag) && /^[a-z]/.test(tag.text))) {
        const t = resolve(ts.isPropertyAccessExpression(tag) ? tag.name : tag);
        if (t.type === 'symbol')
          ctx.graph.addEdge({
            kind: 'renders',
            src: ownerOf(node),
            dst: { kind: 'symbol', key: t.key },
            confidence: 'observed',
            evidencePath: path,
            evidenceLine: lineOf(sf, node.getStart(sf)),
          });
      }
    } else if (ts.isHeritageClause(node)) {
      const cls = node.parent;
      const d = describeDecl(cls);
      if (d) {
        for (const t of node.types) {
          const target = resolve(
            ts.isPropertyAccessExpression(t.expression) ? t.expression.name : t.expression,
          );
          const kind = node.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
          const src: NodeRef = { kind: 'symbol', key: symbolKey(path, d.qname) };
          if (target.type === 'symbol')
            ctx.graph.addEdge({
              kind,
              src,
              dst: { kind: 'symbol', key: target.key },
              confidence: 'observed',
              evidencePath: path,
              evidenceLine: lineOf(sf, t.getStart(sf)),
            });
          else if (target.type === 'external')
            ctx.graph.addEdge({
              kind,
              src,
              dst: ctx.graph.addNode({ kind: 'external', key: target.pkg, name: target.pkg }),
              confidence: 'observed',
              evidencePath: path,
              evidenceLine: lineOf(sf, t.getStart(sf)),
              detail: t.expression.getText(sf),
            });
          else if (target.type !== 'builtin')
            ctx.graph.addUnresolved({
              filePath: path,
              line: lineOf(sf, t.getStart(sf)),
              kind: 'heritage',
              text: t.getText(sf),
              reason: 'base type not resolved',
            });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  for (const [key, c] of complexity)
    ctx.graph.mergeData({ kind: 'symbol', key }, { complexity: c });
  ctx.graph.mergeData(fileRef, {
    resolvedCalls,
    unresolvedCalls,
    complexity: [...complexity.values()].reduce((a, b) => a + b, 0),
  });
}

function detectExpressRoute(
  ctx: Ctx,
  sf: ts.SourceFile,
  path: string,
  node: ts.CallExpression,
  ownerOf: (n: ts.Node) => NodeRef,
  resolve: (n: ts.Node) => { type: string; key?: string },
): void {
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  const verb = node.expression.name.text.toLowerCase();
  if (!HTTP_VERBS.has(verb)) return;
  const objText = node.expression.expression.getText(sf);
  if (!/(app|router|server|api|route|fastify|hono)$/i.test(objText)) return;
  const first = node.arguments[0];
  if (
    !first ||
    !(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ||
    !first.text.startsWith('/')
  )
    return;
  const method = verb === 'all' ? 'ANY' : verb.toUpperCase();
  const key = `${method} ${first.text}`;
  const line = lineOf(sf, node.getStart(sf));
  const route = ctx.graph.addNode({
    kind: 'route',
    key,
    name: key,
    filePath: path,
    module: ctx.moduleOf(path),
    startLine: line,
    data: { method, path: first.text, framework: 'express-style' },
  });
  ctx.stats.routes++;
  const handler = node.arguments[node.arguments.length - 1];
  if (handler && handler !== first) {
    const t = isFunctionInitLike(handler)
      ? null
      : resolve(ts.isPropertyAccessExpression(handler) ? handler.name : handler);
    if (t && t.type === 'symbol' && t.key)
      ctx.graph.addEdge({
        kind: 'handled_by',
        src: route,
        dst: { kind: 'symbol', key: t.key },
        confidence: 'inferred',
        evidencePath: path,
        evidenceLine: line,
        detail: `${objText}.${verb}() registration`,
      });
    else if (!t) {
      const owner = ownerOf(node);
      ctx.graph.addEdge({
        kind: 'handled_by',
        src: route,
        dst: owner,
        confidence: 'inferred',
        evidencePath: path,
        evidenceLine: line,
        detail: 'inline handler registered here',
      });
    } else
      ctx.graph.addUnresolved({
        filePath: path,
        line,
        kind: 'route_handler',
        text: handler.getText(sf).slice(0, 120),
        reason: 'handler not resolved',
      });
  }
}

function rootIdentifier(e: ts.Expression): string {
  let x: ts.Expression = e;
  while (
    ts.isPropertyAccessExpression(x) ||
    ts.isElementAccessExpression(x) ||
    ts.isCallExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isParenthesizedExpression(x)
  )
    x = x.expression;
  return ts.isIdentifier(x) ? x.text : '';
}

function isFunctionInitLike(e: ts.Expression): boolean {
  return ts.isArrowFunction(e) || ts.isFunctionExpression(e);
}

export function confidenceLabel(c: Confidence): string {
  return c;
}

export function fileExists(root: string, p: string): boolean {
  return existsSync(join(root, p));
}
