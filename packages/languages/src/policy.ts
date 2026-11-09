/**
 * Which listed files are not read, and why: shared by CodeAtlas discovery and the ArchLens
 * inventory script so both products exclude the same files for the same reasons.
 */
import { roleOf } from './roles';

/**
 * Folder names whose tracked content is treated as build output or dependencies. A tracked
 * file inside one is recorded as excluded, never dropped, because real source can live in a
 * folder with one of these names.
 */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
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

/** Files that may hold credentials are never read. Templates such as .env.example are allowed. */
const SECRET_PATTERNS = [
  /(^|\/)\.env(\..*)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)credentials(\.json)?$/i,
  /secrets?\.(json|ya?ml)$/i,
  /\.tfstate(\.backup)?$/,
];
const SECRET_ALLOW = [/\.env\.(example|sample|template|dist|defaults)$/];

export function isSecretPath(p: string): boolean {
  return SECRET_PATTERNS.some((r) => r.test(p)) && !SECRET_ALLOW.some((r) => r.test(p));
}

/** Generated files, by path, with the reason shown in the inventory. */
export const GENERATED: readonly (readonly [RegExp, string])[] = [
  [/\.min\.(js|css)$/, 'minified build output'],
  [/\.map$/, 'source map'],
  [/(^|\/)migrations\/meta\//, 'migration tool snapshot'],
  [/\.d\.ts$/, 'TypeScript declaration file (usually generated)'],
];

export function generatedReason(p: string): string | undefined {
  return GENERATED.find(([r]) => r.test(p))?.[1];
}

/** True when a folder on the path is one of IGNORED_DIRS. */
export function inIgnoredDir(p: string): boolean {
  return p
    .split('/')
    .slice(0, -1)
    .some((seg) => IGNORED_DIRS.has(seg));
}

export const isLockfile = (p: string): boolean => roleOf(p)?.id === 'lockfile';

/** Long average line length usually means minified or generated output. */
export function looksGenerated(text: string): boolean {
  if (text.length < 5000) return false;
  const lines = text.split('\n').length;
  return text.length / lines > 300;
}
