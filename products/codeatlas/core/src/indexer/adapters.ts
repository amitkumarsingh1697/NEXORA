/**
 * Language adapters (spec §5.3, AB-5.3-06).
 *
 * Each adapter declares which discovered languages it analyses structurally. The
 * indexer runs every registered adapter over its files and reports, per adapter,
 * how many files it analysed. Files in a language with no adapter are indexed as
 * searchable text only and listed under `unsupportedLanguages`, so coverage never
 * claims structure that was not parsed.
 */
import { extname } from 'node:path';
import type { DiscoveredFile, FileLang } from './files';
import type { GraphBuilder } from './model';
import type { IncrementalInfo, TsCacheState } from './ts-cache';
import { indexTypeScript, type TsIndexStats } from './ts-indexer';

/** What an adapter keeps between runs for incremental indexing (S3-4). Adapter-specific per file. */
export interface AdapterCache {
  configHash: string;
  files: Record<string, unknown>;
  extra?: Record<string, string>;
}

export interface AdapterContext {
  root: string;
  /** Readable files in the languages this adapter declared. */
  files: DiscoveredFile[];
  /** Every discovered path in the repository, for import resolution. */
  allPaths: Set<string>;
  graph: GraphBuilder;
  moduleOf: (path: string) => string;
  /** Present when incremental indexing is on; `previous` is this adapter's cache from the last run. */
  cache?: { previous: AdapterCache | null };
}

export interface AdapterResult {
  filesParsed: number;
  filesFailed: { path: string; error: string }[];
  symbols: number;
  routes: number;
  /** Import and call statistics, for adapters that resolve them. */
  imports?: TsIndexStats['imports'];
  calls?: TsIndexStats['calls'];
  /** State to keep for the next incremental run, and how this run used the previous one. */
  cache?: AdapterCache;
  incremental?: IncrementalInfo;
}

export interface LanguageAdapter {
  id: string;
  name: string;
  languages: FileLang[];
  analyse(ctx: AdapterContext): AdapterResult;
}

export const typeScriptAdapter: LanguageAdapter = {
  id: 'typescript',
  name: 'TypeScript and JavaScript (TypeScript Compiler API)',
  languages: ['typescript', 'javascript'],
  analyse: (ctx) => {
    const s = indexTypeScript(
      ctx.root,
      ctx.files,
      ctx.allPaths,
      ctx.graph,
      ctx.moduleOf,
      ctx.cache ? { previous: (ctx.cache.previous as TsCacheState | null) ?? null } : undefined,
    );
    return {
      cache: s.cache as unknown as AdapterCache,
      incremental: s.incremental,
      filesParsed: s.filesParsed,
      filesFailed: s.filesFailed,
      symbols: s.symbols,
      routes: s.routes,
      imports: s.imports,
      calls: s.calls,
    };
  },
};

/** The adapters CodeAtlas ships. Adding a language means adding an adapter here, with tests. */
export const DEFAULT_ADAPTERS: LanguageAdapter[] = [typeScriptAdapter];

const LANGUAGE_BY_EXT: Record<string, string> = {
  // Listed so that, if the TypeScript adapter is not registered, these files are reported too.
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.cs': 'C#',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.c': 'C',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.h': 'C/C++ header',
  '.hpp': 'C++ header',
  '.scala': 'Scala',
  '.dart': 'Dart',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
};

/** Name of the programming language for a source file no adapter handles, or null for non-code files. */
export function unsupportedLanguageOf(path: string): string | null {
  return LANGUAGE_BY_EXT[extname(path).toLowerCase()] ?? null;
}

export interface AdapterCoverage {
  id: string;
  name: string;
  languages: FileLang[];
  filesAnalysed: number;
  filesFailed: number;
}

export interface AdapterRun {
  coverage: AdapterCoverage[];
  filesParsed: number;
  filesFailed: { path: string; error: string }[];
  symbols: number;
  routes: number;
  imports: TsIndexStats['imports'];
  calls: TsIndexStats['calls'];
  caches: Record<string, AdapterCache>;
  incremental: (IncrementalInfo & { adapter: string })[];
}

/** Run each adapter over the files in its languages and merge the results. */
export function runAdapters(
  adapters: LanguageAdapter[],
  base: Omit<AdapterContext, 'files'>,
  files: DiscoveredFile[],
  caches?: { previous: Record<string, AdapterCache> },
): AdapterRun {
  const out: AdapterRun = {
    coverage: [],
    filesParsed: 0,
    filesFailed: [],
    symbols: 0,
    routes: 0,
    imports: { internal: 0, external: 0, unresolved: 0 },
    calls: { observed: 0, inferred: 0, external: 0, builtin: 0, dynamic: 0, unresolved: 0 },
    caches: {},
    incremental: [],
  };
  const claimed = new Set<FileLang>();
  for (const a of adapters) {
    for (const l of a.languages) {
      if (claimed.has(l)) throw new Error(`Two language adapters claim ${l}.`);
      claimed.add(l);
    }
    const r = a.analyse({
      ...base,
      files: files.filter((f) => a.languages.includes(f.lang)),
      ...(caches ? { cache: { previous: caches.previous[a.id] ?? null } } : {}),
    });
    if (r.cache) out.caches[a.id] = r.cache;
    if (r.incremental) out.incremental.push({ adapter: a.id, ...r.incremental });
    out.coverage.push({
      id: a.id,
      name: a.name,
      languages: a.languages,
      filesAnalysed: r.filesParsed,
      filesFailed: r.filesFailed.length,
    });
    out.filesParsed += r.filesParsed;
    out.filesFailed.push(...r.filesFailed);
    out.symbols += r.symbols;
    out.routes += r.routes;
    for (const k of Object.keys(out.imports) as (keyof AdapterRun['imports'])[])
      out.imports[k] += r.imports?.[k] ?? 0;
    for (const k of Object.keys(out.calls) as (keyof AdapterRun['calls'])[])
      out.calls[k] += r.calls?.[k] ?? 0;
  }
  return out;
}
