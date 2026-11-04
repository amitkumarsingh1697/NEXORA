/**
 * Incremental indexing for the TypeScript adapter (spec §5.3, S3-4).
 *
 * The analysis of one file depends on its own text, on the files it imports (transitively,
 * because types flow through them), on files that declare globals, and on the project
 * configuration. So each file's recorded graph changes are cached together with its
 * content hash and its in-repo dependencies. On the next run:
 *
 * - If the configuration fingerprint changed (any tsconfig/jsconfig, package.json or
 *   lockfile, the set of files, the TypeScript version or the cache format), everything
 *   is analysed again ("full").
 * - Otherwise a file is analysed again when it, anything in its dependency closure, or
 *   any global-declaring file changed. Every other file's recorded changes are replayed
 *   in the same order as a full run, so the resulting graph is the same.
 *
 * Cross-file steps (matching untyped calls by unique name, linking tests to code) always
 * run over the whole merged result.
 */
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import type { GraphOp, NodeRef } from './model';

/** Bump when the recorded format or the analysis changes, so old caches are discarded. */
export const TS_CACHE_FORMAT = 1;

export interface PendingInferred {
  owner: NodeRef;
  name: string;
  path: string;
  line: number;
  text: string;
  kind: 'calls' | 'instantiates';
}

/** Numeric counters and failures added by one file in one pass. */
export interface StatsDelta {
  counts: Record<string, number>;
  failed: { path: string; error: string }[];
}

export interface TsFileCache {
  sha: string;
  /** In-repo files this file's module references resolve to. */
  deps: string[];
  p1: GraphOp[];
  p2: GraphOp[];
  byName: [string, string][];
  pending: PendingInferred[];
  s1: StatsDelta;
  s2: StatsDelta;
}

export interface TsCacheState {
  configHash: string;
  files: Record<string, TsFileCache>;
  /**
   * Content hashes of in-repo dependencies that are not analysed themselves (for example
   * declaration files, which discovery skips), so a change to them is still noticed.
   */
  extra?: Record<string, string>;
}

export interface IncrementalInfo {
  mode: 'full' | 'incremental';
  reason: string;
  reanalysed: number;
  reused: number;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const CONFIG_FILE_RE =
  /(^|\/)(tsconfig[\w.-]*\.json|jsconfig\.json|package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock|npm-shrinkwrap\.json|pnpm-workspace\.yaml)$/;

/** Fingerprint of everything that can change how any file resolves. */
export function configFingerprint(
  allPaths: Set<string>,
  read: (path: string) => string | null,
): string {
  const h = createHash('sha256');
  h.update(`format:${TS_CACHE_FORMAT}\nts:${ts.version}\n`);
  const sorted = [...allPaths].sort();
  for (const p of sorted) h.update(`path:${p}\n`);
  for (const p of sorted)
    if (CONFIG_FILE_RE.test(p)) h.update(`config:${p}:${sha256(read(p) ?? '<unreadable>')}\n`);
  return h.digest('hex');
}

/**
 * Whether a file can declare names visible to other files without being imported: a
 * script (no ES module syntax, and for JavaScript no CommonJS either), or a file with
 * `declare global` / `declare module`. These are compiled with every re-analysed file.
 */
export function declaresGlobals(path: string, text: string): boolean {
  if (/\bdeclare\s+(global|module)\b/.test(text)) return true;
  const esm = /^\s*(import|export)\b/m.test(text);
  if (esm) return false;
  const js = /\.[cm]?jsx?$/.test(path);
  if (js && /\brequire\s*\(|\bmodule\.exports\b|\bexports\.\w/.test(text)) return false;
  return true;
}

export function statsSnapshot(stats: object): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (o: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') out[prefix + k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v))
        walk(v as Record<string, unknown>, `${prefix}${k}.`);
    }
  };
  walk(stats as Record<string, unknown>, '');
  return out;
}

export function statsDelta(
  before: Record<string, number>,
  after: Record<string, number>,
  failedBefore: number,
  failed: { path: string; error: string }[],
): StatsDelta {
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(after)) if (v !== before[k]) counts[k] = v - (before[k] ?? 0);
  return { counts, failed: failed.slice(failedBefore) };
}

export function applyDelta(
  stats: { filesFailed: { path: string; error: string }[] },
  d: StatsDelta,
): void {
  for (const [path, n] of Object.entries(d.counts)) {
    const parts = path.split('.');
    let o = stats as unknown as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) o = o[p] as Record<string, unknown>;
    const last = parts[parts.length - 1] as string;
    o[last] = (o[last] as number) + n;
  }
  stats.filesFailed.push(...d.failed);
}

/**
 * Files that must be analysed again: changed files, files whose dependency closure
 * contains a changed file, or every file when a global-declaring file changed.
 * Returns null when everything has to be analysed.
 */
export function dirtyFiles(
  previous: TsCacheState,
  current: Map<string, string>,
  globals: Set<string>,
  extraNow: Record<string, string> = {},
): Set<string> | null {
  const changed = new Set<string>();
  for (const [p, sha] of current) if (previous.files[p]?.sha !== sha) changed.add(p);
  for (const [p, sha] of Object.entries(previous.extra ?? {}))
    if (extraNow[p] !== sha) changed.add(p);
  for (const p of changed) if (globals.has(p)) return null;
  const dependants = new Map<string, string[]>();
  for (const [p, entry] of Object.entries(previous.files))
    for (const d of entry.deps) {
      const list = dependants.get(d) ?? [];
      list.push(p);
      dependants.set(d, list);
    }
  const dirty = new Set(changed);
  const queue = [...changed];
  while (queue.length) {
    const p = queue.pop() as string;
    for (const q of dependants.get(p) ?? [])
      if (!dirty.has(q)) {
        dirty.add(q);
        queue.push(q);
      }
  }
  let analysed = 0;
  for (const p of dirty) if (current.has(p)) analysed++;
  return analysed >= current.size ? null : dirty;
}

/**
 * In-repo files a source file depends on: import/export/require/import() specifiers,
 * import types, and triple-slash path references, resolved with the program's settings.
 */
export function fileDependencies(
  sf: ts.SourceFile,
  options: ts.CompilerOptions,
  host: ts.CompilerHost,
  toRepoPath: (abs: string) => string | null,
): string[] {
  const specs = new Set<string>();
  const info = ts.preProcessFile(sf.text, true, true);
  for (const i of info.importedFiles) specs.add(i.fileName);
  const visit = (n: ts.Node): void => {
    if (
      ts.isImportTypeNode(n) &&
      ts.isLiteralTypeNode(n.argument) &&
      ts.isStringLiteral(n.argument.literal)
    )
      specs.add(n.argument.literal.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const out = new Set<string>();
  for (const s of specs) {
    const r = ts.resolveModuleName(s, sf.fileName, options, host).resolvedModule;
    const p = r && toRepoPath(r.resolvedFileName);
    if (p) out.add(p);
  }
  for (const ref of info.referencedFiles) {
    const abs = resolve(dirname(sf.fileName), ref.fileName);
    const p = toRepoPath(abs);
    if (p) out.add(p);
  }
  return [...out].sort();
}
