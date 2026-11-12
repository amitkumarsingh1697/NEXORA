/**
 * Repository file discovery. Every path git lists (or a directory walk finds) gets exactly one
 * inventory record: readable files go on to analysis, everything else is recorded with the
 * reason it was not read. Nothing is dropped without a record (requirement: no silent
 * omissions). Language and file type come from @nexora/languages, the single registry.
 */
import { componentKindOf } from './sfc';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classify,
  generatedReason,
  IGNORED_DIRS,
  inIgnoredDir,
  isLockfile,
  isSecretPath,
  looksGenerated,
  decodeText,
  type Category,
  type Classification,
  type FileRecord,
} from '@nexora/languages';
import { listRepository, readHead, type UnlistedPaths } from '@nexora/languages/node';

export type FileLang = 'typescript' | 'javascript' | 'markdown' | 'json' | 'text' | 'unsupported';

export interface DiscoveredFile {
  /** Repo-relative POSIX path. */
  path: string;
  abs: string;
  /** Routing for language adapters. */
  lang: FileLang;
  size: number;
  /** Registry language name (GitHub Linguist naming). */
  language: string;
  category: Category;
  /** File type from the registry, for build, deployment, CI, schema and other files. */
  role?: string;
  classification: Classification;
}

export type SkipReason =
  | 'secret'
  | 'binary'
  | 'too_large'
  | 'generated'
  | 'limit'
  | 'ignored_dir'
  | 'submodule'
  | 'symlink'
  | 'unreadable'
  | 'lfs_pointer';

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

/** A directory or path set that was not listed file by file, with why. */
export type { UnlistedPaths };

export interface DiscoveryResult {
  files: DiscoveredFile[];
  skipped: SkippedFile[];
  usedGit: boolean;
  /** One record per listed path: readable files start as 'text' and analysers raise them. */
  records: Map<string, FileRecord>;
  /** Text of every readable file, read once. */
  texts: Map<string, string>;
  /** Paths git ignores, and folders the walk did not enter (counted, not listed file by file). */
  unlisted: UnlistedPaths[];
}

export interface DiscoveryLimits {
  /** Files read and analysed; the rest are recorded as excluded. Infinity for no limit. */
  maxFiles: number;
  /** Larger files are recorded but not read. */
  maxFileBytes: number;
  /** Lockfiles are often larger than source files and are only counted, so they get more room. */
  maxLockfileBytes: number;
}

/** Defaults for the local service. The brain command lifts the file count (see brain-command.ts). */
export const LIMITS: DiscoveryLimits = {
  maxFiles: 20_000,
  maxFileBytes: 4 * 1024 * 1024,
  maxLockfileBytes: 16 * 1024 * 1024,
};

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MiB` : `${bytes / 1024} KiB`;

/** The reason recorded for a skipped file, with the limits that applied. */
export function skipReasonText(reason: SkipReason, limits: DiscoveryLimits = LIMITS): string {
  if (reason === 'too_large') return `larger than the ${size(limits.maxFileBytes)} per-file limit`;
  if (reason === 'limit') return `beyond the ${limits.maxFiles.toLocaleString('en-US')}-file limit`;
  return SKIP_REASON_TEXT[reason];
}

/**
 * Directories never walked, and never indexed even when git tracks files in them (build
 * output, dependencies). Tracked files dropped this way are reported as excluded, because a
 * repository can keep real source in a folder with one of these names (QA AL-05).
 */
export { IGNORED_DIRS, isSecretPath, looksGenerated };

export const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  secret: 'may contain credentials; never read',
  binary: 'binary content',
  too_large: `larger than the ${size(LIMITS.maxFileBytes)} per-file limit`,
  generated: 'generated',
  limit: `beyond the ${LIMITS.maxFiles.toLocaleString('en-US')}-file limit`,
  ignored_dir: 'in a build-output or dependency folder',
  submodule: 'git submodule; its content is a separate repository and was not indexed',
  symlink: 'symbolic link; the target is not followed',
  unreadable: 'could not be read',
  lfs_pointer: 'Git LFS pointer; the real content is not in the clone',
};

/** Adapter routing for a classified file. */
export function fileLangOf(path: string, c: Classification): FileLang {
  // Svelte, Vue and Astro components are compiled as TypeScript (see sfc.ts), and so are
  // scripts without an extension that a `#!` line identifies.
  const bare = !/\.[^/]*$/.test(path.slice(path.lastIndexOf('/') + 1));
  if (c.language === 'Svelte' || c.language === 'Vue' || c.language === 'Astro')
    return componentKindOf(path) ? 'typescript' : 'text';
  if (c.language === 'TypeScript' || c.language === 'TSX')
    return bare || /\.(ts|tsx|mts|cts)$/i.test(path) ? 'typescript' : 'text';
  if (c.language === 'JavaScript')
    return bare || /\.(js|jsx|mjs|cjs)$/i.test(path) ? 'javascript' : 'text';
  if (c.language === 'Markdown' || c.language === 'MDX') return 'markdown';
  if (c.language === 'JSON' || c.language === 'JSON with Comments' || c.language === 'JSON5')
    return 'json';
  return 'text';
}

/** Kept for callers that only have a path. Uses the registry; content-based rules do not apply. */
export function langOf(p: string): FileLang {
  return fileLangOf(p, classify({ path: p, head: null }));
}

const HEAD_BYTES = 8192;

export function discoverFiles(root: string, limits: DiscoveryLimits = LIMITS): DiscoveryResult {
  const { paths, usedGit, submodules, unlisted } = listRepository(root);
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];
  const records = new Map<string, FileRecord>();
  const texts = new Map<string, string>();

  const record = (
    path: string,
    c: Classification,
    status: FileRecord['status'],
    method: string,
    reason?: string,
    bytes?: number,
  ) => {
    const r: FileRecord = {
      path,
      language: c.language,
      category: c.category,
      status,
      method,
      detectedBy: c.detectedBy,
      confidence: c.confidence,
    };
    if (c.role) r.role = c.role;
    if (reason) r.reason = reason;
    if (bytes !== undefined) r.bytes = bytes;
    if (c.alternatives) r.alternatives = c.alternatives;
    records.set(path, r);
  };
  const skip = (
    path: string,
    c: Classification,
    reason: SkipReason,
    status: FileRecord['status'] = 'excluded',
    bytes?: number,
  ) => {
    skipped.push({ path, reason });
    record(path, c, status, 'not read', skipReasonText(reason, limits), bytes);
  };
  const byName = (path: string) => classify({ path, head: null });

  for (const path of paths) {
    if (records.has(path)) continue;
    const segs = path.split('/');
    if (submodules.has(path)) {
      skip(path, { ...byName(path), language: 'Git submodule', category: 'data' }, 'submodule');
      continue;
    }
    if (inIgnoredDir(path)) {
      // Only git-tracked files are recorded: an untracked dist/ is build output.
      if (usedGit && !segs.includes('node_modules') && !segs.includes('.git'))
        skip(path, byName(path), 'ignored_dir');
      continue;
    }
    if (isSecretPath(path)) {
      skip(path, byName(path), 'secret');
      continue;
    }
    const gen = generatedReason(path);
    if (gen) {
      skipped.push({ path, reason: 'generated' });
      record(path, byName(path), 'excluded', 'not read', `generated: ${gen}`);
      continue;
    }
    const abs = join(root, path);
    let size: number;
    try {
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        skip(path, byName(path), 'symlink');
        continue;
      }
      if (!st.isFile()) {
        skip(path, byName(path), 'unreadable', 'failed');
        continue;
      }
      size = st.size;
    } catch (e) {
      skipped.push({ path, reason: 'unreadable' });
      record(
        path,
        byName(path),
        'failed',
        'not read',
        `could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
      );
      continue;
    }
    if (files.length >= limits.maxFiles) {
      skip(path, byName(path), 'limit', 'excluded', size);
      continue;
    }
    const isLock = isLockfile(path);
    const max = isLock ? limits.maxLockfileBytes : limits.maxFileBytes;
    let buf: Buffer;
    try {
      buf = size > max ? readHead(abs, HEAD_BYTES) : readFileSync(abs);
    } catch (e) {
      skipped.push({ path, reason: 'unreadable' });
      record(
        path,
        byName(path),
        'failed',
        'not read',
        `could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
        size,
      );
      continue;
    }
    const c = classify({ path, head: buf.subarray(0, HEAD_BYTES) });
    if (c.category === 'binary') {
      skip(path, c, 'binary', 'binary', size);
      continue;
    }
    if (c.lfsPointer) {
      skip(path, c, 'lfs_pointer', 'unsupported', size);
      continue;
    }
    if (size > max) {
      skip(path, c, 'too_large', 'excluded', size);
      continue;
    }
    const text = decodeText(buf);
    texts.set(path, text);
    const lang = fileLangOf(path, c);
    files.push({
      path,
      abs,
      lang,
      size,
      language: c.language,
      category: c.category,
      ...(c.role ? { role: c.role } : {}),
      classification: c,
    });
    record(path, c, 'text', 'Generic text indexer', undefined, size);
  }
  return { files, skipped, usedGit, records, texts, unlisted };
}

/** Reads a discovered file as text, or null when it is binary. */
export function readText(file: DiscoveredFile): string | null {
  const buf = readFileSync(file.abs);
  const c = classify({ path: file.path, head: buf.subarray(0, HEAD_BYTES) });
  if (c.category === 'binary') return null;
  return decodeText(buf);
}

export function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}
