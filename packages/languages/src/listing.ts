/**
 * Lists every path of a repository (Node.js only): `git ls-files` when it is a git checkout,
 * otherwise a directory walk. Shared by CodeAtlas discovery and the ArchLens inventory script,
 * so both count the same files. Paths that exist but are not listed one by one (ignored
 * folders, unreadable directories) are returned in `unlisted`, never dropped silently.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { IGNORED_DIRS } from './policy';

export interface UnlistedPaths {
  path: string;
  reason: string;
}

export interface RepositoryListing {
  /** Repository-relative paths with forward slashes, sorted. */
  paths: string[];
  usedGit: boolean;
  /** Paths that are git submodules (gitlinks). */
  submodules: Set<string>;
  unlisted: UnlistedPaths[];
}

function git(root: string, args: string[]): string[] | null {
  try {
    const out = execFileSync('git', ['-C', root, ...args], {
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walk(root: string, unlisted: UnlistedPaths[]): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      unlisted.push({
        path: relative(root, dir).split(sep).join('/') || '.',
        reason: `directory could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
      });
      continue;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) stack.push(abs);
        else if (e.name !== '.git')
          unlisted.push({
            path: `${rel}/`,
            reason: 'build-output or dependency folder; not walked',
          });
      } else out.push(rel); // files, symlinks and special files are all recorded
    }
  }
  return out;
}

export function listRepository(root: string): RepositoryListing {
  const unlisted: UnlistedPaths[] = [];
  const listed = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const usedGit = listed !== null;
  const submodules = new Set<string>();
  if (usedGit) {
    for (const line of git(root, ['ls-files', '-z', '--stage']) ?? []) {
      const m = /^160000 [0-9a-f]+ \d+\t(.+)$/.exec(line);
      if (m) submodules.add(m[1] as string);
    }
    const ignored = git(root, [
      'ls-files',
      '-z',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
    ]);
    if (ignored?.length) {
      const shown = ignored
        .filter((p) => !p.split('/').some((s) => s === 'node_modules'))
        .slice(0, 20);
      for (const p of shown) unlisted.push({ path: p, reason: 'ignored by .gitignore rules' });
      if (ignored.length > shown.length)
        unlisted.push({
          path: `(${ignored.length - shown.length} more)`,
          reason: 'ignored by .gitignore rules (including node_modules)',
        });
    }
  }
  const paths = [...new Set(listed ?? walk(root, unlisted))].sort();
  return { paths, usedGit, submodules, unlisted };
}

/** Reads up to `max` bytes from the start of a file. */
export function readHead(abs: string, max: number): Buffer {
  const fd = openSync(abs, 'r');
  try {
    const buf = Buffer.alloc(max);
    const n = readSync(fd, buf, 0, max, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}
