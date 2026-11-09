/**
 * Runs the non-TypeScript analysers over discovered files, adds what they find to the graph,
 * and records each file's real outcome in the inventory (full / partial / failed, or text with
 * a reason). The analyser for a file comes from the registry (@nexora/languages).
 */
import { analyserOf, type FileRecord } from '@nexora/languages';
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
  readMakefile,
  readRequirements,
  readSln,
  readTextLockfile,
  readToml,
  readXml,
  readYaml,
  sqlObjects,
  type Link,
  type StructuredResult,
  type StructSymbol,
} from './structured';

export interface AnalyseStats {
  filesAnalysed: number;
  declarations: number;
  imports: { internal: number; external: number; unresolved: number };
  links: { resolved: number; unresolved: number };
  byAnalyser: Record<string, number>;
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
  'sql-procedure': 'function',
  'sql-function': 'function',
  'sql-package': 'class',
  'sql-package-body': 'class',
  'sql-trigger': 'function',
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

  // Pass 1: read every file with an analyser.
  for (const f of files) {
    if (handledByAdapters.has(f.path)) continue;
    const text = texts.get(f.path);
    if (text === undefined) continue;
    const rec = records.get(f.path);
    const analyser = analyserOf(f.language);

    // SQL and Prisma are read by the schema readers in index.ts; procedural objects here.
    if (analyser === 'sql') {
      const objs = sqlObjects(text);
      addSymbols(f, objs);
      setStatus(rec, 'partial', 'SQL schema parser and object extractor');
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

    if (analyser === 'declarations' || (analyser === 'ts-compiler' && f.lang === 'text')) {
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
    bump(r.method);
    stats.filesAnalysed++;
    const node = graph.get(fileRef(f.path));
    if (node && Object.keys(r.facts).length)
      node.data = {
        ...node.data,
        facts: Object.fromEntries(Object.entries(r.facts).filter(([, v]) => v !== undefined)),
      };
    addSymbols(f, r.symbols);
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
  }

  // Pass 2: resolve imports now that every file's declarations are known.
  const idx = new PathIndex(ctx.allPaths);
  const goModules = goModulesOf(texts);
  for (const { f, x } of extractions.values()) {
    for (const imp of x.imports) {
      const target =
        imp.resolve === 'none'
          ? undefined
          : resolveImport(imp, f.path, f.language, idx, ctx.allPaths, declaredNames, goModules);
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
  return stats;
}
