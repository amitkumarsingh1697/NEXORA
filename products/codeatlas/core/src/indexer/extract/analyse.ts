/**
 * Runs the non-TypeScript analysers over discovered files, adds what they find to the graph,
 * and records each file's real outcome in the inventory (full / partial / failed, or text with
 * a reason). The analyser for a file comes from the registry (@nexora/languages).
 */
import { analyserOf, DECLARATION_LANGUAGES, type FileRecord } from '@nexora/languages';
import {
  CONTAINER_KINDS,
  resolveBases,
  resolveCalls,
  type DeclRef,
  type ResolveFile,
  type SyntaxResult,
} from '@nexora/syntax';
import type { ScipResolver } from '@nexora/scip';
import { posix } from 'node:path';
import type { DiscoveredFile } from '../files';
import type { GraphBuilder, NodeRef } from '../model';
import {
  extractDeclarations,
  type Declaration,
  type Extraction,
  type ImportRef,
} from './declarations';
import {
  readCmake,
  readDocHeadings,
  readDockerfile,
  readGoMod,
  readHcl,
  readIdl,
  readIni,
  readJson,
  readDelimited,
  readDot,
  readGettext,
  readMakefile,
  readRequirements,
  readSln,
  readTextLockfile,
  readToml,
  readXml,
  readYaml,
  type Link,
  type StructuredResult,
  type StructSymbol,
} from './structured';
import { analyseSyntax, grammarLabel, importRefOf, syntaxUnavailable } from './syntax';

export interface AnalyseStats {
  filesAnalysed: number;
  declarations: number;
  imports: { internal: number; external: number; unresolved: number };
  links: { resolved: number; unresolved: number };
  byAnalyser: Record<string, number>;
  /** Files parsed by tree-sitter and the links found between their declarations. */
  syntax: {
    files: number;
    withErrors: number;
    fallbacks: number;
    calls: { observed: number; inferred: number; unresolved: number };
    bases: { observed: number; inferred: number; unresolved: number };
    receivers: number;
  };
  /** What SCIP indexes decided (ADR 0018). */
  scip: ScipLinkStats;
}

export interface ScipLinkStats {
  /** Files an index covers. */
  files: number;
  /** Calls and bases linked by the compiler's answer (observed). */
  resolved: number;
  /** ...of which the syntax layer had linked to the same target. */
  agreed: number;
  /** ...of which the syntax layer had linked to a different declaration. */
  corrected: number;
  /** ...of which the syntax layer had left unresolved. */
  added: number;
  /** Names the compiler resolved outside the repository: no link drawn, not counted unresolved. */
  external: number;
  /** Inferred syntax links the compiler said point outside the repository: removed. */
  removed: number;
  /** No answer, or several: the syntax result stands. */
  undecided: number;
  /**
   * The compiler's target is in the repository but is not a declaration the syntax layer drew
   * (a field, variable or parameter, for example): the syntax result stands.
   */
  notDrawn: number;
}

/** Brain-compatible symbol kinds for declarations (others are stored and searchable, not drawn). */
const BRAIN_KIND: Record<string, string> = {
  class: 'class',
  struct: 'class',
  enum: 'class',
  module: 'class',
  type: 'class',
  interface: 'interface',
  trait: 'interface',
  function: 'function',
  procedure: 'function',
  paragraph: 'function',
  method: 'method',
  constructor: 'constructor',
  object: 'class',
  record: 'class',
  'proto-message': 'class',
  'proto-enum': 'class',
  'proto-service': 'interface',
  'proto-rpc': 'method',
  'thrift-struct': 'class',
  'thrift-exception': 'class',
  'thrift-union': 'class',
  'thrift-enum': 'class',
  'thrift-service': 'interface',
  'thrift-method': 'method',
  'graphql-type': 'class',
  'graphql-interface': 'interface',
  'graphql-input': 'class',
  'graphql-enum': 'class',
};

const LINK_BASE_ROOT = new Set([
  'github-actions',
  'gitlab-ci',
  'circleci',
  'azure-pipelines',
  'bitbucket',
  'travis',
  'other-ci',
  'jenkins',
]);

/** Analyses one structured (non-source) file. Returns null when no structured reader applies. */
export function readStructured(f: DiscoveredFile, text: string): StructuredResult | null {
  const a = analyserOf(f.language);
  const role = f.role;
  if (role === 'lockfile' && !/\.(json|ya?ml|toml)$/.test(f.path))
    return readTextLockfile(f.path, text);
  if (role === 'go-module') return readGoMod(text);
  if (role === 'python-deps' && /requirements[^/]*\.(txt|in)$/.test(f.path))
    return readRequirements(text);
  switch (a) {
    case 'json':
      return readJson(f.path, text, role, f.language);
    case 'yaml':
      return readYaml(f.path, text, role);
    case 'toml':
      return readToml(f.path, text);
    case 'xml':
      return readXml(f.path, text, role);
    case 'ini':
      return readIni(text);
    case 'dockerfile':
      return readDockerfile(text);
    case 'make':
      return readMakefile(text);
    case 'cmake':
      return readCmake(text);
    case 'hcl':
      return readHcl(text);
    case 'idl':
      return readIdl(f.language, text);
    case 'doc-headings':
      return readDocHeadings(f.language, text);
    case 'delimited':
      return readDelimited(f.path, text);
    case 'dot':
      return readDot(text);
    case 'gettext':
      return readGettext(text);
    default:
      if (/\.sln$/i.test(f.path)) return readSln(text);
      if (role === 'dotnet-project' || role === 'maven') return readXml(f.path, text, role);
      return null;
  }
}

export interface AnalyseContext {
  graph: GraphBuilder;
  records: Map<string, FileRecord>;
  allPaths: Set<string>;
  moduleOf: (p: string) => string;
  /** Compiler-grade answers from SCIP indexes (ADR 0018), when any were given or produced. */
  scip?: ScipResolver;
}

function setStatus(
  rec: FileRecord | undefined,
  status: FileRecord['status'],
  method: string,
  reason?: string,
) {
  if (!rec) return;
  rec.status = status;
  rec.method = method;
  if (reason) rec.reason = reason;
  else delete rec.reason;
}

/** Index of repository files for import resolution. */
class PathIndex {
  private bySuffix = new Map<string, string[]>();
  private byStem = new Map<string, string[]>();
  private byDir = new Map<string, string[]>();
  constructor(paths: Iterable<string>) {
    for (const p of paths) {
      const d = posix.dirname(p);
      const inDir = this.byDir.get(d);
      if (inDir) inDir.push(p);
      else this.byDir.set(d, [p]);
      const segs = p.split('/');
      for (let i = 0; i < segs.length; i++) {
        const s = segs.slice(i).join('/');
        const list = this.bySuffix.get(s);
        if (list) {
          if (list.length < 8) list.push(p);
        } else this.bySuffix.set(s, [p]);
      }
      const base = segs[segs.length - 1] as string;
      const stem = base.replace(/\.[^.]*$/, '').toUpperCase();
      const l = this.byStem.get(stem);
      if (l) {
        if (l.length < 8) l.push(p);
      } else this.byStem.set(stem, [p]);
    }
  }
  suffix(s: string): string[] {
    return this.bySuffix.get(s) ?? [];
  }
  stem(s: string): string[] {
    return this.byStem.get(s.toUpperCase()) ?? [];
  }
  inDir(d: string): string[] {
    return this.byDir.get(d === '' ? '.' : d) ?? [];
  }
}

/** Common source extensions a path-style import may leave out, per language family. */
const IMPLICIT_EXT: Record<string, string[]> = {
  Python: ['.py', '/__init__.py', '.pyi'],
  Ruby: ['.rb'],
  Crystal: ['.cr'],
  Lua: ['.lua', '/init.lua'],
  Luau: ['.luau', '.lua', '/init.luau'],
  Rust: ['.rs', '/mod.rs'],
  Dart: [''],
  Zig: [''],
  Nim: ['.nim'],
  'Visual Basic .NET': [''],
  PowerShell: ['', '.ps1', '.psm1', '.psd1'],
  Shell: ['', '.sh', '.bash'],
  Erlang: [''],
  Julia: [''],
  R: [''],
};

/** Go modules declared in the repository: module path → folder holding its go.mod. */
export type GoModules = { module: string; dir: string }[];

export function goModulesOf(texts: Map<string, string>): GoModules {
  const out: GoModules = [];
  for (const [path, text] of texts) {
    if (!/(^|\/)go\.mod$/.test(path)) continue;
    const m = /^\s*module\s+"?([^\s"]+)"?/m.exec(text);
    if (m?.[1]) out.push({ module: m[1], dir: posix.dirname(path) });
  }
  // Longest module path first, so nested modules win.
  return out.sort((a, b) => b.module.length - a.module.length);
}

/** A Go import names a package folder; the edge goes to that folder's first non-test .go file. */
function resolveGoImport(spec: string, mods: GoModules, idx: PathIndex): string | undefined {
  for (const { module, dir } of mods) {
    if (spec !== module && !spec.startsWith(`${module}/`)) continue;
    const sub = spec.slice(module.length).replace(/^\//, '');
    const folder = posix.normalize(posix.join(dir, sub)).replace(/^\.\/?/, '');
    const files = idx.inDir(folder).filter((p) => p.endsWith('.go') && !p.endsWith('_test.go'));
    return files.sort()[0];
  }
  return undefined;
}

function resolveImport(
  imp: ImportRef,
  fromPath: string,
  language: string,
  idx: PathIndex,
  all: Set<string>,
  declaredNames: Map<string, string[]>,
  goModules: GoModules = [],
): string | undefined {
  if (imp.resolve === 'gomod') return resolveGoImport(imp.spec, goModules, idx);
  const dir = posix.dirname(fromPath);
  const exts = IMPLICIT_EXT[language] ?? [''];
  const tryPaths = (cands: string[]) => cands.find((c) => all.has(c));
  const unique = (list: string[]) => (list.length === 1 ? list[0] : undefined);
  if (imp.resolve === 'path') {
    const spec = imp.spec.replace(/^\.\//, '');
    const rel = posix.normalize(posix.join(dir, spec));
    const hit =
      tryPaths(exts.map((e) => rel + e)) ?? tryPaths(exts.map((e) => posix.normalize(spec) + e));
    if (hit) return hit;
    for (const e of exts) {
      const u = unique(idx.suffix(posix.normalize(spec).replace(/^(\.\.\/)+/, '') + e));
      if (u) return u;
    }
    return undefined;
  }
  if (imp.resolve === 'dotted') {
    // Python: leading dots are relative to the package; a.b.c is a/b/c.py or a/b/c/__init__.py.
    const m = /^(\.*)(.*)$/.exec(imp.spec);
    const dots = m?.[1]?.length ?? 0;
    const rest = (m?.[2] ?? '').replace(/\./g, '/');
    if (dots) {
      let base = dir;
      for (let i = 1; i < dots; i++) base = posix.dirname(base);
      const rel = rest ? posix.join(base, rest) : base;
      return tryPaths(exts.map((e) => rel + e)) ?? tryPaths([posix.join(rel, '__init__.py')]);
    }
    for (const e of exts) {
      const u = unique(idx.suffix(rest + e));
      if (u) return u;
    }
    return undefined;
  }
  if (imp.resolve === 'qualified') {
    const spec = imp.spec.replace(/\\/g, '.').replace(/::/g, '.').replace(/\.\*$/, '');
    const direct = declaredNames.get(spec);
    if (direct?.length === 1) return direct[0];
    // Java import a.b.C or a.b.C.member: the file declaring type C in package a.b.
    const parts = spec.split('.');
    for (let n = parts.length; n >= 2; n--) {
      const q = parts.slice(0, n).join('.');
      const hit = declaredNames.get(q);
      if (hit?.length === 1) return hit[0];
    }
    return undefined;
  }
  if (imp.resolve === 'stem') {
    const named = declaredNames.get(imp.spec.toUpperCase());
    if (named?.length === 1) return named[0];
    const u = unique(idx.stem(imp.spec).filter((p) => p !== fromPath));
    return u;
  }
  return undefined;
}

function resolveLink(
  l: Link,
  f: DiscoveredFile,
  all: Set<string>,
): { path: string; inferred: boolean } | undefined {
  const target = l.target.replace(/^\.\//, '').replace(/\/$/, '');
  const fileDir = posix.dirname(f.path) === '.' ? '' : posix.dirname(f.path);
  const bases = LINK_BASE_ROOT.has(f.role ?? '') ? ['', fileDir] : [fileDir, ''];
  for (const b of bases) {
    const p = posix.normalize(b ? posix.join(b, target) : target);
    if (p.startsWith('..')) continue;
    if (all.has(p) && !l.dir) return { path: p, inferred: false };
    for (const d of l.defaultFile ?? []) {
      const q = posix.join(p === '.' ? '' : p, d);
      if (all.has(q)) return { path: q, inferred: true };
    }
    if (all.has(p)) return { path: p, inferred: false };
  }
  return undefined;
}

export function analyseNonTsFiles(
  ctx: AnalyseContext,
  files: DiscoveredFile[],
  texts: Map<string, string>,
  handledByAdapters: Set<string>,
): AnalyseStats {
  const stats: AnalyseStats = {
    filesAnalysed: 0,
    declarations: 0,
    imports: { internal: 0, external: 0, unresolved: 0 },
    links: { resolved: 0, unresolved: 0 },
    byAnalyser: {},
    syntax: {
      files: 0,
      withErrors: 0,
      fallbacks: 0,
      calls: { observed: 0, inferred: 0, unresolved: 0 },
      bases: { observed: 0, inferred: 0, unresolved: 0 },
      receivers: 0,
    },
    scip: {
      files: 0,
      resolved: 0,
      agreed: 0,
      corrected: 0,
      added: 0,
      external: 0,
      removed: 0,
      undecided: 0,
      notDrawn: 0,
    },
  };
  const { graph, records } = ctx;
  const extractions = new Map<string, { f: DiscoveredFile; x: Extraction; keys: string[] }>();
  const declaredNames = new Map<string, string[]>();
  const addName = (n: string, p: string) => {
    const list = declaredNames.get(n);
    if (!list) declaredNames.set(n, [p]);
    else if (!list.includes(p) && list.length < 4) list.push(p);
  };
  const fileRef = (p: string): NodeRef => ({ kind: 'file', key: p });
  const bump = (m: string) => (stats.byAnalyser[m] = (stats.byAnalyser[m] ?? 0) + 1);
  /** Files parsed by the syntax layer, for call, base and receiver linking after pass 2. */
  const parsed = new Map<
    string,
    {
      f: DiscoveredFile;
      r: SyntaxResult;
      keys: (string | undefined)[];
      /** For each syntax import, the index of its ImportRef (-1: not resolved by imports). */
      refIndex: number[];
      targets: (string | undefined)[];
      receivers: (string | undefined)[];
    }
  >();

  const addSymbols = (f: DiscoveredFile, syms: StructSymbol[], declKindData = true) => {
    const keyOf = new Map<string, string>();
    for (const s of syms) {
      const qname = s.parent ? `${s.parent}.${s.name}` : s.name;
      const key = `${f.path}#${qname}`;
      keyOf.set(s.name, key);
      graph.addNode({
        kind: 'symbol',
        key,
        name: qname,
        filePath: f.path,
        module: ctx.moduleOf(f.path),
        symbolKind: BRAIN_KIND[s.kind] ?? s.kind,
        exported: true,
        startLine: s.line,
        data: {
          extraction: 'pattern',
          language: f.language,
          ...(declKindData ? { declKind: s.kind } : {}),
        },
      });
      const parentKey = s.parent ? keyOf.get(s.parent) : undefined;
      graph.addEdge({
        kind: 'contains',
        src: parentKey ? { kind: 'symbol', key: parentKey } : fileRef(f.path),
        dst: { kind: 'symbol', key },
        confidence: parentKey ? 'inferred' : 'observed',
        evidencePath: f.path,
        evidenceLine: s.line,
      });
      stats.declarations++;
    }
  };

  /** File facts and links between files from a structured reader. */
  const addFactsAndLinks = (f: DiscoveredFile, r: StructuredResult) => {
    const node = graph.get(fileRef(f.path));
    if (node && Object.keys(r.facts).length)
      node.data = {
        ...node.data,
        facts: Object.fromEntries(Object.entries(r.facts).filter(([, v]) => v !== undefined)),
      };
    for (const l of r.links) {
      const hit = resolveLink(l, f, ctx.allPaths);
      if (!hit || hit.path === f.path) {
        stats.links.unresolved++;
        continue;
      }
      stats.links.resolved++;
      graph.addEdge({
        kind: l.kind,
        src: fileRef(f.path),
        dst: fileRef(hit.path),
        confidence: hit.inferred ? 'inferred' : 'observed',
        evidencePath: f.path,
        ...(l.line ? { evidenceLine: l.line } : {}),
        detail:
          [
            l.detail,
            hit.inferred
              ? `${posix.basename(hit.path)} found by convention in ${l.target}`
              : undefined,
          ]
            .filter(Boolean)
            .join('; ') || undefined,
      });
    }
  };

  /** Adds one parsed file's declarations to the graph and records its status. */
  const addParsed = (f: DiscoveredFile, r: SyntaxResult, rec: FileRecord | undefined) => {
    const decls = r.declarations;
    // An `impl` block (Rust impl, Objective-C @implementation) is not a declaration of its own:
    // its members belong to the type it names.
    const isImpl = (i: number | undefined) => i !== undefined && decls[i]?.kind === 'impl';
    const parentOf = (i: number): number | undefined => {
      const p = decls[i]?.parent;
      return isImpl(p) ? undefined : p;
    };
    const receivers = decls.map(
      (d) => d.receiver ?? (isImpl(d.parent) ? decls[d.parent!]!.name : undefined),
    );
    const qn = (i: number): string => {
      const d = decls[i]!;
      const p = parentOf(i);
      const recv = receivers[i];
      return [p !== undefined ? qn(p) : undefined, recv, d.name].filter(Boolean).join('.');
    };
    const keys: (string | undefined)[] = [];
    const seenKeys = new Set<string>();
    const label = grammarLabel(r.grammar);
    decls.forEach((d, i) => {
      if (d.kind === 'impl') {
        keys.push(undefined);
        return;
      }
      const qname = qn(i);
      let key = `${f.path}#${qname}`;
      if (seenKeys.has(key)) key = `${key}@${d.line}`;
      seenKeys.add(key);
      keys.push(key);
      const data: Record<string, unknown> = {
        extraction: 'syntax',
        language: f.language,
        parser: label,
        declKind: d.kind,
        signature: d.signature,
      };
      if (d.params)
        data.params = d.params.map((p) => ({
          name: `${p.variadic && !p.name.startsWith('.') ? '...' : ''}${p.name}`,
          type: p.type ?? '',
          optional: !!p.optional,
        }));
      if (d.returns) {
        data.returns = d.returns;
        data.returnsDeclared = true;
      }
      if (d.bases?.length) data.bases = d.bases;
      graph.addNode({
        kind: 'symbol',
        key,
        name: qname,
        filePath: f.path,
        module: ctx.moduleOf(f.path),
        symbolKind: BRAIN_KIND[d.kind] ?? d.kind,
        exported: true,
        startLine: d.line,
        endLine: d.endLine,
        data,
      });
      const p = parentOf(i);
      const parentKey = p !== undefined ? keys[p] : undefined;
      graph.addEdge({
        kind: 'contains',
        src: parentKey ? { kind: 'symbol', key: parentKey } : fileRef(f.path),
        dst: { kind: 'symbol', key },
        // Nesting comes from the parse tree, so it is what the source says.
        confidence: 'observed',
        evidencePath: f.path,
        evidenceLine: d.line,
      });
      stats.declarations++;
      if (
        CONTAINER_KINDS.has(d.kind) ||
        d.kind === 'module' ||
        d.kind === 'namespace' ||
        d.kind === 'type'
      ) {
        if (r.namespace) addName(`${r.namespace}.${d.name}`, f.path);
        addName(d.name, f.path);
      }
    });
    if (r.namespace) addName(r.namespace, f.path);

    const refs: ImportRef[] = [];
    const refIndex = r.imports.map((imp) => {
      const ref = importRefOf(f.language, f.path, imp);
      if (!ref) return -1;
      refs.push(ref);
      return refs.length - 1;
    });
    extractions.set(f.path, {
      f,
      x: { declarations: [], imports: refs, ...(r.namespace ? { namespace: r.namespace } : {}) },
      keys: [],
    });
    parsed.set(f.path, { f, r, keys, refIndex, targets: refs.map(() => undefined), receivers });

    stats.syntax.files++;
    const scipTool = ctx.scip?.covers(f.path);
    if (scipTool) stats.scip.files++;
    if (rec) {
      rec.method = scipTool
        ? `Full syntax parse (${label}); references resolved by ${scipTool}`
        : `Full syntax parse (${label})`;
      rec.resolution = scipTool ? 'compiler' : 'syntax';
      if (r.problems.length) {
        stats.syntax.withErrors++;
        const first = r.problems[0]!;
        rec.status = 'partial';
        rec.reason = `${r.problems.length}${r.problems.length >= 50 ? '+' : ''} syntax error${r.problems.length === 1 ? '' : 's'}; first at line ${first.line} (${first.kind === 'missing' ? first.text : `unexpected ${JSON.stringify(first.text.slice(0, 40))}`}); the rest of the file was still read`;
      } else {
        rec.status = 'full';
        delete rec.reason;
      }
    }
  };

  // Pass 1: read every file with an analyser.
  for (const f of files) {
    if (handledByAdapters.has(f.path)) continue;
    const text = texts.get(f.path);
    if (text === undefined) continue;
    const rec = records.get(f.path);
    const analyser = analyserOf(f.language);

    // SQL files are read in index.ts (tables, then every other object, then their links),
    // which also sets their status.
    if (analyser === 'sql') {
      bump('sql');
      stats.filesAnalysed++;
      continue;
    }
    if (analyser === 'prisma') {
      setStatus(rec, 'partial', 'Prisma schema reader');
      bump('prisma');
      stats.filesAnalysed++;
      continue;
    }
    if (analyser === 'markdown') continue; // the Markdown reader sets its own status

    // An empty file has nothing to read: it is complete as it is, never a parse failure.
    if (!text.trim() && analyser !== 'text') {
      setStatus(rec, 'full', 'Empty file (nothing to analyse)');
      bump('empty');
      stats.filesAnalysed++;
      continue;
    }

    // Full parse with the language's tree-sitter grammar. When the grammar cannot be used, the
    // file falls back to the declaration patterns (or the HCL reader) and the reason is kept.
    let fallback: string | undefined;
    if (analyser === 'syntax') {
      const unavailable = syntaxUnavailable();
      let r: SyntaxResult | Error | null;
      try {
        r = unavailable ? new Error(unavailable) : analyseSyntax(f.language, text);
      } catch (e) {
        r = new Error(`syntax layer error: ${(e as Error).message.slice(0, 160)}`);
      }
      if (r && !(r instanceof Error)) {
        addParsed(f, r, rec);
        if (f.language === 'HCL') {
          // Terraform module sources are folders: the HCL reader links them.
          try {
            const h = readStructured(f, text);
            if (h && !h.error) addFactsAndLinks(f, h);
          } catch {
            // The parse above already recorded the file; module links are an extra.
            stats.links.unresolved++;
          }
        }
        bump('syntax');
        stats.filesAnalysed++;
        continue;
      }
      fallback = r ? r.message : `no tree-sitter rules for ${f.language}`;
      stats.syntax.fallbacks++;
    }

    if (
      analyser === 'declarations' ||
      (fallback !== undefined &&
        (DECLARATION_LANGUAGES as readonly string[]).includes(f.language)) ||
      (analyser === 'ts-compiler' && f.lang === 'text')
    ) {
      let x: Extraction | null;
      try {
        x = extractDeclarations(f.language, text);
      } catch (e) {
        setStatus(
          rec,
          'failed',
          'Declaration and import extractor',
          `extractor error: ${(e as Error).message.slice(0, 160)}`,
        );
        continue;
      }
      if (!x) continue;
      const keys: string[] = [];
      const decls = x.declarations;
      const qn = (d: Declaration): string => {
        const parent = d.parent !== undefined ? decls[d.parent] : undefined;
        return parent ? `${qn(parent)}.${d.name}` : d.name;
      };
      const seenKeys = new Set<string>();
      for (const d of decls) {
        let qname = qn(d);
        if (d.receiver && d.parent === undefined) qname = `${d.receiver}.${d.name}`;
        let key = `${f.path}#${qname}`;
        if (seenKeys.has(key)) key = `${key}@${d.line}`;
        seenKeys.add(key);
        keys.push(key);
        const data: Record<string, unknown> = {
          extraction: 'pattern',
          language: f.language,
          declKind: d.kind,
          signature: d.signature,
        };
        if (d.returns) {
          data.returns = d.returns;
          data.returnsDeclared = true;
        }
        if (d.params !== undefined) data.paramsText = d.params;
        graph.addNode({
          kind: 'symbol',
          key,
          name: qname,
          filePath: f.path,
          module: ctx.moduleOf(f.path),
          symbolKind: BRAIN_KIND[d.kind] ?? d.kind,
          exported: true,
          startLine: d.line,
          ...(d.endLine ? { endLine: d.endLine } : {}),
          data,
        });
        const parentKey = d.parent !== undefined ? keys[d.parent] : undefined;
        graph.addEdge({
          kind: 'contains',
          src: parentKey ? { kind: 'symbol', key: parentKey } : fileRef(f.path),
          dst: { kind: 'symbol', key },
          confidence: parentKey ? 'inferred' : 'observed',
          evidencePath: f.path,
          evidenceLine: d.line,
        });
        stats.declarations++;
        // Names other files can import: package-qualified types, modules, program ids.
        if (/^(class|interface|struct|enum|trait|module|namespace|type)$/.test(d.kind)) {
          if (x.namespace) addName(`${x.namespace}.${d.name}`, f.path);
          addName(d.name, f.path);
          if (d.kind === 'module' && /^(COBOL|JCL|ABAP|RPGLE)$/.test(f.language))
            addName(d.name.toUpperCase(), f.path);
        }
      }
      if (x.namespace) addName(x.namespace, f.path);
      extractions.set(f.path, { f, x, keys });
      if (rec) {
        rec.status = 'partial';
        rec.method = 'Declaration and import extractor (patterns)';
        delete rec.reason;
        if (!decls.length && !x.imports.length)
          rec.reason = 'no declarations or imports matched the patterns';
        if (fallback)
          rec.reason = `syntax parser not used (${fallback.slice(0, 160)})${rec.reason ? `; ${rec.reason}` : ''}`;
      }
      bump('declarations');
      stats.filesAnalysed++;
      continue;
    }

    let r: StructuredResult | null;
    try {
      r = readStructured(f, text);
    } catch (e) {
      setStatus(rec, 'failed', analyser, `reader error: ${(e as Error).message.slice(0, 160)}`);
      continue;
    }
    if (!r) continue;
    if (r.error) {
      // When only a modeline or the content suggested the format, a parse error means the guess
      // was wrong, not that the file is broken: keep it as text and say why.
      if (rec && (rec.detectedBy === 'content' || rec.detectedBy === 'modeline'))
        setStatus(
          rec,
          'text',
          'Generic text indexer',
          `${rec.detectedBy === 'modeline' ? 'its editor modeline says' : 'its content looked like'} ${f.language}, but it does not parse as ${f.language} (${r.error.slice(0, 120)})`,
        );
      else setStatus(rec, 'failed', r.method, r.error);
      continue;
    }
    if (r.skipReason) {
      setStatus(rec, 'text', 'Generic text indexer', r.skipReason);
      continue;
    }
    setStatus(rec, r.level, r.method);
    if (fallback && rec)
      rec.reason = `syntax parser not used (${fallback.slice(0, 160)})${rec.reason ? `; ${rec.reason}` : ''}`;
    bump(r.method);
    stats.filesAnalysed++;
    addSymbols(f, r.symbols);
    addFactsAndLinks(f, r);
  }

  // Pass 2: resolve imports now that every file's declarations are known.
  const idx = new PathIndex(ctx.allPaths);
  const goModules = goModulesOf(texts);
  for (const { f, x } of extractions.values()) {
    const syntaxTargets = parsed.get(f.path)?.targets;
    for (const [k, imp] of x.imports.entries()) {
      const target =
        imp.resolve === 'none'
          ? undefined
          : resolveImport(imp, f.path, f.language, idx, ctx.allPaths, declaredNames, goModules);
      if (syntaxTargets && target && target !== f.path) syntaxTargets[k] = target;
      if (target && target !== f.path) {
        graph.addEdge({
          kind: 'imports',
          src: fileRef(f.path),
          dst: fileRef(target),
          confidence: 'inferred',
          evidencePath: f.path,
          evidenceLine: imp.line,
          detail: `${imp.spec} (resolved by ${imp.resolve === 'path' ? 'path' : imp.resolve === 'dotted' ? 'module path' : imp.resolve === 'gomod' ? 'go.mod module path; first file of the package folder' : 'declared name'})`,
        });
        stats.imports.internal++;
      } else {
        const top =
          imp.resolve === 'gomod'
            ? imp.spec
                .split('/')
                .slice(0, imp.spec.split('/')[0]?.includes('.') ? 3 : 1)
                .join('/')
            : imp.spec
                .replace(/^[./]+/, '')
                .split(/[./\\:]/)
                .filter(Boolean)
                .slice(0, imp.resolve === 'qualified' ? 3 : 1)
                .join('.');
        if (!top) {
          stats.imports.unresolved++;
          continue;
        }
        const ext = graph.addNode({
          kind: 'external',
          key: `${f.language}:${top}`,
          name: top,
          data: { language: f.language },
        });
        graph.addEdge({
          kind: 'imports',
          src: fileRef(f.path),
          dst: ext,
          confidence: 'unknown',
          evidencePath: f.path,
          evidenceLine: imp.line,
          detail: imp.spec,
        });
        stats.imports.external++;
      }
    }
  }
  // Go methods and Rust impl members belong to the type they name, when it is declared in the same folder.
  const typesByDir = new Map<string, Map<string, string>>();
  for (const { f, x, keys } of extractions.values()) {
    const dir = posix.dirname(f.path);
    const m = typesByDir.get(dir) ?? new Map<string, string>();
    x.declarations.forEach((d, i) => {
      if (/^(struct|class|interface|enum|type)$/.test(d.kind) && d.parent === undefined && keys[i])
        m.set(d.name, keys[i] as string);
    });
    typesByDir.set(dir, m);
  }
  for (const { f, x, keys } of extractions.values()) {
    const types = typesByDir.get(posix.dirname(f.path));
    x.declarations.forEach((d, i) => {
      const owner = d.receiver ? types?.get(d.receiver) : undefined;
      if (owner && d.kind === 'method' && keys[i] && owner !== keys[i])
        graph.addEdge({
          kind: 'contains',
          src: { kind: 'symbol', key: owner },
          dst: { kind: 'symbol', key: keys[i] as string },
          confidence: 'inferred',
          evidencePath: f.path,
          evidenceLine: d.line,
          detail: `receiver ${d.receiver}`,
        });
    });
  }
  linkParsed();
  return stats;

  /** Calls, base classes and receiver methods between parsed declarations. */
  function linkParsed() {
    if (!parsed.size) return;
    const list = [...parsed.values()];
    const files: ResolveFile[] = list.map((p) => ({
      path: p.f.path,
      language: p.f.language,
      result: p.r,
      importTargets: p.refIndex.map((k) => (k < 0 ? undefined : p.targets[k])),
    }));
    const keyOf = (file: string, decl: number) => parsed.get(file)?.keys[decl];

    /** The declaration a SCIP definition names: same file, same name, its line inside. */
    const declAt = (file: string, line: number, name: string): DeclRef | undefined => {
      const p = parsed.get(file);
      if (!p) return undefined;
      let best: { decl: number; span: number } | undefined;
      p.r.declarations.forEach((d, i) => {
        if (d.name !== name || line < d.line || line > d.endLine) return;
        const span = d.endLine - d.line;
        if (!best || span < best.span) best = { decl: i, span };
      });
      return best ? { file, decl: best.decl } : undefined;
    };

    /**
     * The compiler's answer for a name at a line, from SCIP: a target in the repository
     * (observed), 'external' (no link, not unresolved), or undefined (the syntax result stands).
     */
    const compiler = (
      file: string,
      line: number,
      name: string,
      syntaxTarget: DeclRef | undefined,
      syntaxConfidence: 'observed' | 'inferred' | 'unresolved',
    ): 'external' | { target: DeclRef; confidence: 'observed'; detail: string } | undefined => {
      const a = ctx.scip?.resolve(file, line, name);
      if (!a || a.kind === 'ambiguous' || a.kind === 'undefined') {
        if (ctx.scip?.covers(file)) stats.scip.undecided++;
        return undefined;
      }
      if (a.kind === 'external') {
        if (syntaxTarget && syntaxConfidence !== 'unresolved') {
          if (syntaxConfidence === 'observed') {
            // The syntax layer saw it declared in the repository: keep both views, the syntax one.
            stats.scip.undecided++;
            return undefined;
          }
          stats.scip.removed++;
        } else stats.scip.external++;
        return 'external';
      }
      // Every declaration of this symbol the syntax layer drew: the definition sites, and a
      // same-named declaration whose name line the symbol occurs on (an overload stub or the
      // implementation after it).
      const sites: DeclRef[] = [];
      const add = (t: DeclRef | undefined) => {
        if (t && !sites.some((x) => x.file === t.file && x.decl === t.decl)) sites.push(t);
      };
      for (const x of a.definition.sites) add(declAt(x.path, x.line, a.definition.name));
      for (const path of new Set(a.definition.sites.map((x) => x.path))) {
        const lines = ctx.scip!.linesOf(a.definition.symbol, path);
        parsed.get(path)?.r.declarations.forEach((d, i) => {
          if (d.name === a.definition.name && lines.has(d.line)) add({ file: path, decl: i });
        });
      }
      if (!sites.length) {
        stats.scip.notDrawn++;
        return undefined;
      }
      stats.scip.resolved++;
      const lineOf = (t: DeclRef) => parsed.get(t.file)?.r.declarations[t.decl]?.line ?? 0;
      const detail = (t: DeclRef) => `resolved by ${a.tool} to ${t.file}:${lineOf(t)}`;
      if (!syntaxTarget || syntaxConfidence === 'unresolved') stats.scip.added++;
      else if (sites.some((t) => t.file === syntaxTarget.file && t.decl === syntaxTarget.decl)) {
        stats.scip.agreed++;
        return { target: syntaxTarget, confidence: 'observed', detail: detail(syntaxTarget) };
      } else stats.scip.corrected++;
      // The site with the longest body: an implementation rather than an overload stub.
      const span = (t: DeclRef) => {
        const d = parsed.get(t.file)?.r.declarations[t.decl];
        return d ? d.endLine - d.line : 0;
      };
      const target = sites.reduce((m, t) => (span(t) > span(m) ? t : m));
      const corrected = syntaxTarget && syntaxConfidence !== 'unresolved';
      return {
        target,
        confidence: 'observed',
        detail: corrected
          ? `${detail(target)} (name matching had chosen ${syntaxTarget.file}:${lineOf(syntaxTarget)})`
          : detail(target),
      };
    };
    const unresolvedBy = new Map<string, Set<string>>();

    for (const l0 of resolveCalls(files)) {
      const srcKey = l0.from >= 0 ? keyOf(l0.file, l0.from) : undefined;
      const c = compiler(l0.file, l0.line, l0.name, l0.target, l0.confidence);
      if (c === 'external') continue;
      const l = c ? { ...l0, ...c } : l0;
      const dstKey = l.target ? keyOf(l.target.file, l.target.decl) : undefined;
      if (!dstKey || l.confidence === 'unresolved') {
        stats.syntax.calls.unresolved++;
        const k = srcKey ?? l.file;
        const set = unresolvedBy.get(k) ?? new Set<string>();
        if (set.size < 20) set.add(l.callee);
        unresolvedBy.set(k, set);
        continue;
      }
      stats.syntax.calls[l.confidence]++;
      if (srcKey === dstKey) continue; // recursion: not a link between two neurons
      graph.addEdge({
        kind: l.kind,
        src: srcKey ? { kind: 'symbol', key: srcKey } : fileRef(l.file),
        dst: { kind: 'symbol', key: dstKey },
        confidence: l.confidence,
        evidencePath: l.file,
        evidenceLine: l.line,
        detail: `${l.callee}: ${l.detail}`,
      });
    }
    for (const [k, names] of unresolvedBy) {
      const node = graph.get(k.includes('#') ? { kind: 'symbol', key: k } : fileRef(k));
      if (node) node.data = { ...node.data, unresolvedCalls: [...names] };
    }

    for (const b0 of resolveBases(files)) {
      const bName =
        b0.base
          .replace(/<.*$/s, '')
          .split(/\.|::|\\/)
          .filter(Boolean)
          .pop() ?? b0.base;
      const c = compiler(b0.file, b0.line, bName, b0.target, b0.confidence);
      if (c === 'external') continue;
      const b = c ? { ...b0, ...c } : b0;
      const srcKey = keyOf(b.file, b.from);
      const dstKey = b.target ? keyOf(b.target.file, b.target.decl) : undefined;
      if (!srcKey || !dstKey || b.confidence === 'unresolved') {
        stats.syntax.bases.unresolved++;
        continue;
      }
      stats.syntax.bases[b.confidence]++;
      graph.addEdge({
        kind: b.kind,
        src: { kind: 'symbol', key: srcKey },
        dst: { kind: 'symbol', key: dstKey },
        confidence: b.confidence,
        evidencePath: b.file,
        evidenceLine: b.line,
        detail: `${b.base}: ${b.detail}`,
      });
    }

    // Methods declared outside their type (Go receivers, Rust impl blocks, C++ Type::method,
    // Objective-C @implementation) belong to that type: same file, then folder, then a unique name.
    const types = new Map<string, { file: string; key: string }[]>();
    for (const p of list)
      p.r.declarations.forEach((d, i) => {
        const key = p.keys[i];
        if (!key || !/^(class|struct|interface|enum|record|object|type|trait)$/.test(d.kind))
          return;
        const k = `${p.f.language}\0${d.name}`;
        const l = types.get(k) ?? [];
        l.push({ file: p.f.path, key });
        types.set(k, l);
      });
    for (const p of list)
      p.r.declarations.forEach((d, i) => {
        const recv = p.receivers[i]?.split(/\.|::/).pop();
        const key = p.keys[i];
        if (!recv || !key) return;
        const cands = types.get(`${p.f.language}\0${recv}`) ?? [];
        const here = cands.filter((c) => c.file === p.f.path);
        const dir = cands.filter((c) => posix.dirname(c.file) === posix.dirname(p.f.path));
        const hit =
          here[0] ??
          (dir.length === 1 ? dir[0] : undefined) ??
          (cands.length === 1 ? cands[0] : undefined);
        if (!hit || hit.key === key) return;
        stats.syntax.receivers++;
        graph.addEdge({
          kind: 'contains',
          src: { kind: 'symbol', key: hit.key },
          dst: { kind: 'symbol', key },
          confidence: hit.file === p.f.path ? 'observed' : 'inferred',
          evidencePath: p.f.path,
          evidenceLine: d.line,
          detail: `receiver ${recv}${hit.file === p.f.path ? '' : ` declared in ${hit.file}`}`,
        });
      });
  }
}
