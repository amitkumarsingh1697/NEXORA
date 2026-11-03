import { execFileSync } from 'node:child_process';

export interface FileHistory {
  commits: number;
  churn: number; // lines added + deleted
  lastChange: number; // unix seconds
  authors: { name: string; email: string; commits: number; lines: number }[];
}

export interface GitInfo {
  available: boolean;
  head?: string;
  /** Checked-out branch, or null when HEAD is detached. */
  branch?: string | null;
  /** Number of paths with uncommitted changes (tracked or untracked), from `git status --porcelain`. */
  dirtyFiles?: number;
  commitsScanned: number;
  truncated: boolean;
  files: Map<string, FileHistory>;
}

const MAX_COMMITS = 5000;

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * Ownership and churn from `git log --numstat` (observed facts from history).
 * Reads history only; never changes the repository.
 */
export function readGitHistory(root: string): GitInfo {
  let head: string | undefined;
  try {
    git(root, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false, commitsScanned: 0, truncated: false, files: new Map() };
  }
  try {
    head = git(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    // Repository with no commits yet.
    return { available: true, commitsScanned: 0, truncated: false, files: new Map() };
  }
  let branch: string | null;
  try {
    branch = git(root, ['symbolic-ref', '-q', '--short', 'HEAD']).trim() || null;
  } catch {
    branch = null; // detached HEAD
  }
  let dirtyFiles: number | undefined;
  try {
    dirtyFiles = git(root, ['status', '--porcelain', '--no-renames'])
      .split('\n')
      .filter((l) => l.trim()).length;
  } catch {
    dirtyFiles = undefined;
  }
  const out = git(root, [
    'log',
    '--no-merges',
    `--max-count=${MAX_COMMITS}`,
    '--no-renames',
    '--numstat',
    '--format=\x1e%H\x1f%an\x1f%ae\x1f%at',
  ]);
  const files = new Map<string, FileHistory>();
  let commits = 0;
  for (const block of out.split('\x1e')) {
    if (!block.trim()) continue;
    commits++;
    const [header, ...lines] = block.split('\n');
    const [, name = 'unknown', email = '', at = '0'] = (header ?? '').split('\x1f');
    const time = Number(at);
    for (const line of lines) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!m) continue;
      const added = m[1] === '-' ? 0 : Number(m[1]);
      const deleted = m[2] === '-' ? 0 : Number(m[2]);
      const path = m[3] as string;
      const h = files.get(path) ?? { commits: 0, churn: 0, lastChange: 0, authors: [] };
      h.commits++;
      h.churn += added + deleted;
      h.lastChange = Math.max(h.lastChange, time);
      const key = email.toLowerCase() || name;
      let a = h.authors.find((x) => (x.email.toLowerCase() || x.name) === key);
      if (!a) {
        a = { name, email, commits: 0, lines: 0 };
        h.authors.push(a);
      }
      a.commits++;
      a.lines += added + deleted;
      files.set(path, h);
    }
  }
  for (const h of files.values())
    h.authors.sort((x, y) => y.lines - x.lines || y.commits - x.commits);
  return {
    available: true,
    head,
    branch,
    dirtyFiles,
    commitsScanned: commits,
    truncated: commits >= MAX_COMMITS,
    files,
  };
}
