/**
 * Clone a public repository on the user's explicit request (spec §5.2, AB-5.2-03).
 *
 * Only `https://` URLs to public hosts are accepted. The host name and every
 * address it resolves to are checked against loopback, private, link-local,
 * shared (CGNAT), multicast and unspecified ranges, so the clone cannot be
 * pointed at the user's own machine or local network.
 *
 * git runs with: no system or global configuration (so no credential helper,
 * URL rewrites or LFS filters from the user's setup), no credential helper,
 * no terminal or askpass prompt, hooks disabled, only the https protocol
 * allowed, redirects not followed, no submodules, and a timeout.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';

export type CloneErrorCode = 'INVALID_URL' | 'BLOCKED_HOST' | 'CLONE_FAILED' | 'TIMEOUT';

export class CloneError extends Error {
  constructor(
    readonly code: CloneErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const BLOCKED_NAMES = [/^localhost$/, /\.localhost$/, /\.local$/, /\.internal$/, /\.home\.arpa$/];

function v4(ip: string): number[] {
  return ip.split('.').map(Number);
}

/** True for addresses that are not on the public internet. */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a = 0, b = 0] = v4(ip);
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // shared address space (CGNAT)
      (a === 169 && b === 254) || // link-local, including cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // 192.0.0.0/24 IETF, 192.0.2.0/24 documentation
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast, reserved, broadcast
    );
  }
  if (kind === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isBlockedAddress(mapped[1] as string);
    // WHATWG URL parsing normalises ::ffff:127.0.0.1 to ::ffff:7f00:1.
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
    if (hex) {
      const hi = parseInt(hex[1] as string, 16);
      const lo = parseInt(hex[2] as string, 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // Deprecated IPv4-compatible addresses (::a.b.c.d, ::xxxx:xxxx).
    if (/^::[0-9a-f]{0,4}(:[0-9a-f]{1,4})?$/.test(s) || /^::\d+\.\d+\.\d+\.\d+$/.test(s))
      return true;
    return (
      s === '::' ||
      s === '::1' ||
      /^f[cd][0-9a-f]{2}:/.test(s) || // unique local fc00::/7
      /^fe[89ab][0-9a-f]:/.test(s) || // link-local fe80::/10
      /^ff[0-9a-f]{2}:/.test(s) || // multicast
      s.startsWith('2001:db8:') || // documentation
      s.startsWith('64:ff9b:') // NAT64, can reach IPv4 private ranges
    );
  }
  return true;
}

/** Synchronous URL checks. Returns the normalised URL. */
export function parsePublicGitUrl(raw: string): URL {
  const text = raw.trim();
  if (!text || text.length > 2048) throw new CloneError('INVALID_URL', 'Enter a repository URL.');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new CloneError('INVALID_URL', 'That is not a valid URL.');
  }
  if (url.protocol !== 'https:')
    throw new CloneError('INVALID_URL', 'Only https:// repository URLs can be cloned.');
  if (url.username || url.password)
    throw new CloneError(
      'INVALID_URL',
      'Remove credentials from the URL. CodeAtlas clones public repositories only.',
    );
  if (url.port && url.port !== '443')
    throw new CloneError('INVALID_URL', 'Only the standard https port is allowed.');
  if (url.search || url.hash)
    throw new CloneError('INVALID_URL', 'Remove the query string or fragment from the URL.');
  if (url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length < 1)
    throw new CloneError('INVALID_URL', 'The URL must point at a repository, not a host.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) {
    if (isBlockedAddress(host))
      throw new CloneError('BLOCKED_HOST', 'That address is on a private or local network.');
  } else if (!host.includes('.') || BLOCKED_NAMES.some((r) => r.test(host)))
    throw new CloneError('BLOCKED_HOST', 'That host name refers to a local or private network.');
  return url;
}

type Resolver = (host: string) => Promise<{ address: string }[]>;
const defaultResolver: Resolver = (host) => lookup(host, { all: true, verbatim: true });

/** Resolve the host and refuse if any address is non-public. */
export async function assertPublicHost(url: URL, resolve: Resolver = defaultResolver) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  let addrs: { address: string }[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new CloneError('BLOCKED_HOST', `Could not resolve ${host}.`);
  }
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address)))
    throw new CloneError(
      'BLOCKED_HOST',
      `${host} resolves to a private or local address, so it cannot be cloned.`,
    );
}

function folderName(url: URL): string {
  const parts = [
    url.hostname,
    ...url.pathname
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean),
  ];
  const base = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 80);
  return `${base || 'repo'}-${randomBytes(3).toString('hex')}`;
}

export interface CloneOptions {
  url: string;
  /** `$CODEATLAS_HOME/clones` */
  clonesDir: string;
  timeoutMs?: number;
  resolve?: Resolver;
  /**
   * Test-only: allow a `file://` URL to a local bare repository and skip URL
   * checks. Refused unless running under the test runner (VITEST is set).
   * The service never passes this.
   */
  testOnlyAllowFileProtocol?: boolean;
}

/** Clone into a new folder under `clonesDir`. Removes partial output on failure. */
export async function cloneRepository(opts: CloneOptions): Promise<{ path: string; url: string }> {
  const testFile = opts.testOnlyAllowFileProtocol === true;
  if (testFile && !process.env.VITEST)
    throw new CloneError('INVALID_URL', 'The file protocol override is only available in tests.');
  let url: URL;
  if (testFile) {
    url = new URL(opts.url);
    if (url.protocol !== 'file:') throw new CloneError('INVALID_URL', 'Expected a file:// URL.');
  } else {
    url = parsePublicGitUrl(opts.url);
    await assertPublicHost(url, opts.resolve);
  }
  mkdirSync(opts.clonesDir, { recursive: true });
  const dest = join(opts.clonesDir, folderName(url));
  const args = [
    '-c',
    'credential.helper=',
    '-c',
    'core.askPass=',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'protocol.allow=never',
    '-c',
    testFile ? 'protocol.file.allow=always' : 'protocol.https.allow=always',
    '-c',
    'http.followRedirects=false',
    'clone',
    '--quiet',
    '--single-branch',
    '--no-recurse-submodules',
    '--',
    url.href,
    dest,
  ];
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: opts.clonesDir,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GCM_INTERACTIVE: 'never',
    LANG: 'C',
    // Network settings the user's environment needs to reach the host; nothing that carries credentials.
    ...Object.fromEntries(
      ['HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'GIT_SSL_CAINFO', 'SSL_CERT_FILE']
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]]),
    ),
  };
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'git',
        args,
        { env, timeout: opts.timeoutMs ?? 10 * 60_000, maxBuffer: 1024 * 1024 },
        (err, _out, stderr) => {
          if (!err) return resolve();
          if ((err as { killed?: boolean }).killed)
            return reject(new CloneError('TIMEOUT', 'The clone took too long and was stopped.'));
          const reason = String(stderr)
            .split('\n')
            .filter((l) => l.trim())
            .slice(-2)
            .join(' ')
            .replace(/https:\/\/[^\s@]*@/g, 'https://')
            .slice(0, 300);
          reject(new CloneError('CLONE_FAILED', `git clone failed: ${reason || 'unknown error'}`));
        },
      );
    });
  } catch (e) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    throw e;
  }
  return { path: dest, url: testFile ? url.href : url.href.replace(/\/+$/, '') };
}
