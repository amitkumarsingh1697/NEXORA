import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export type FileLang = 'typescript' | 'javascript' | 'markdown' | 'json' | 'text' | 'unsupported';

export interface DiscoveredFile {
  /** Repo-relative POSIX path. */
  path: string;
  abs: string;
  lang: FileLang;
  size: number;
}

export interface SkippedFile {
  path: string;
  reason: 'secret' | 'binary' | 'too_large' | 'generated' | 'limit';
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  skipped: SkippedFile[];
  usedGit: boolean;
}

export const LIMITS = { maxFiles: 20_000, maxFileBytes: 512 * 1024 };

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const TEXT_EXT = new Set([
  '.yml',
  '.yaml',
  '.toml',
  '.sql',
  '.css',
  '.scss',
  '.html',
  '.sh',
  '.txt',
  '.graphql',
  '.prisma',
  '.env.example',
]);
const OTHER_CODE_EXT = new Set([
  '.py',
  '.go',
  '.java',
  '.kt',
  '.rb',
  '.rs',
  '.cs',
  '.php',
  '.swift',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.scala',
  '.dart',
  '.vue',
  '.svelte',
]);

/** Directories never walked (when git is unavailable). */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.output',
  '.wxt',
  'coverage',
  '.turbo',
  '.cache',
  '.data',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'test-results',
  'playwright-report',
]);

/** Files that may hold credentials are never read or indexed. */
const SECRET_PATTERNS = [
  /(^|\/)\.env(\..*)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)credentials(\.json)?$/i,
  /secrets?\.(json|ya?ml)$/i,
];
const SECRET_ALLOW = [/\.env\.example$/, /\.env\.sample$/, /\.env\.template$/];

const GENERATED = [
  /\.min\.(js|css)$/,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
  /\.map$/,
  /(^|\/)migrations\/meta\//,
  /\.d\.ts$/,
];

export function isSecretPath(p: string): boolean {
  return SECRET_PATTERNS.some((r) => r.test(p)) && !SECRET_ALLOW.some((r) => r.test(p));
}

export function langOf(p: string): FileLang {
  const ext = extname(p).toLowerCase();
  if (TS_EXT.has(ext)) return 'typescript';
  if (JS_EXT.has(ext)) return 'javascript';
  if (ext === '.md' || ext === '.mdx') return 'markdown';
  if (ext === '.json') return 'json';
  if (TEXT_EXT.has(ext) || p.endsWith('.env.example')) return 'text';
  if (OTHER_CODE_EXT.has(ext)) return 'unsupported';
  return 'unsupported';
}

function gitFiles(root: string): string[] | null {
  try {
    const out = execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < LIMITS.maxFiles * 2) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) stack.push(abs);
      } else if (e.isFile()) out.push(relative(root, abs).split(sep).join('/'));
    }
  }
  return out;
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Long average line length usually means minified or generated output. */
export function looksGenerated(text: string): boolean {
  if (text.length < 5000) return false;
  const lines = text.split('\n').length;
  return text.length / lines > 300;
}

export function discoverFiles(root: string): DiscoveryResult {
  const listed = gitFiles(root);
  const usedGit = listed !== null;
  const candidates = (listed ?? walk(root))
    .filter((p) => !p.split('/').some((seg) => IGNORED_DIRS.has(seg)))
    .sort();
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];
  for (const path of candidates) {
    if (isSecretPath(path)) {
      skipped.push({ path, reason: 'secret' });
      continue;
    }
    if (GENERATED.some((r) => r.test(path))) {
      skipped.push({ path, reason: 'generated' });
      continue;
    }
    const lang = langOf(path);
    const abs = join(root, path);
    let size: number;
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      size = st.size;
    } catch {
      continue; // deleted since listing
    }
    if (files.length >= LIMITS.maxFiles) {
      skipped.push({ path, reason: 'limit' });
      continue;
    }
    if (size > LIMITS.maxFileBytes) {
      skipped.push({ path, reason: 'too_large' });
      continue;
    }
    if (lang !== 'unsupported' || OTHER_CODE_EXT.has(extname(path).toLowerCase()))
      files.push({ path, abs, lang, size });
    else {
      // Unknown extension: keep only if it is text, for search.
      try {
        if (looksBinary(readFileSync(abs))) skipped.push({ path, reason: 'binary' });
        else files.push({ path, abs, lang: 'text', size });
      } catch {
        // unreadable: ignore
      }
    }
  }
  return { files, skipped, usedGit };
}

export function readText(file: DiscoveredFile): string | null {
  const buf = readFileSync(file.abs);
  if (looksBinary(buf)) return null;
  return buf.toString('utf8');
}

export function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}
