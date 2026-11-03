import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertPublicHost,
  cloneRepository,
  CloneError,
  isBlockedAddress,
  parsePublicGitUrl,
} from '../src/index';
import { makeFixtureRepo } from './fixture';

const tmp = mkdtempSync(join(tmpdir(), 'codeatlas-clone-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('public URL validation', () => {
  it.each([
    ['http://github.com/a/b', 'INVALID_URL'],
    ['git@github.com:a/b.git', 'INVALID_URL'],
    ['ssh://github.com/a/b', 'INVALID_URL'],
    ['file:///etc/passwd', 'INVALID_URL'],
    ['ext::sh -c touch% /tmp/pwned', 'INVALID_URL'],
    ['https://user:token@github.com/a/b', 'INVALID_URL'],
    ['https://github.com:8443/a/b', 'INVALID_URL'],
    ['https://github.com/a/b?x=1', 'INVALID_URL'],
    ['https://github.com/', 'INVALID_URL'],
    ['https://localhost/a/b', 'BLOCKED_HOST'],
    ['https://api.localhost/a/b', 'BLOCKED_HOST'],
    ['https://printer.local/a/b', 'BLOCKED_HOST'],
    ['https://intranet/a/b', 'BLOCKED_HOST'],
    ['https://127.0.0.1/a/b', 'BLOCKED_HOST'],
    ['https://10.1.2.3/a/b', 'BLOCKED_HOST'],
    ['https://172.20.0.1/a/b', 'BLOCKED_HOST'],
    ['https://192.168.1.10/a/b', 'BLOCKED_HOST'],
    ['https://169.254.169.254/latest/meta-data', 'BLOCKED_HOST'],
    ['https://100.64.0.1/a/b', 'BLOCKED_HOST'],
    ['https://[::1]/a/b', 'BLOCKED_HOST'],
    ['https://[fd00::1]/a/b', 'BLOCKED_HOST'],
    ['https://[fe80::1]/a/b', 'BLOCKED_HOST'],
    ['https://[::ffff:127.0.0.1]/a/b', 'BLOCKED_HOST'],
    ['https://0.0.0.0/a/b', 'BLOCKED_HOST'],
    ['https://[::ffff:a9fe:a9fe]/latest', 'BLOCKED_HOST'],
    ['https://[::127.0.0.1]/a/b', 'BLOCKED_HOST'],
    ['https://2130706433/a/b', 'BLOCKED_HOST'],
  ])('rejects %s', (url, code) => {
    expect(() => parsePublicGitUrl(url)).toThrow(expect.objectContaining({ code }));
  });

  it('accepts public https repository URLs', () => {
    expect(parsePublicGitUrl(' https://github.com/nodejs/node.git ').href).toBe(
      'https://github.com/nodejs/node.git',
    );
    expect(parsePublicGitUrl('https://8.8.8.8/x/y').hostname).toBe('8.8.8.8');
    expect(isBlockedAddress('140.82.112.3')).toBe(false);
    expect(isBlockedAddress('2606:4700::1111')).toBe(false);
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('refuses a public-looking name that resolves to a private address (DNS check)', async () => {
    const url = parsePublicGitUrl('https://evil.example.com/a/b');
    await expect(
      assertPublicHost(url, async () => [{ address: '93.184.216.34' }, { address: '10.0.0.5' }]),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(
      assertPublicHost(url, async () => [{ address: '93.184.216.34' }]),
    ).resolves.toBeUndefined();
    await expect(
      assertPublicHost(url, async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
  });
});

describe('cloning', () => {
  it('clones a local bare repository through the test-only override into the clones folder', async () => {
    const src = makeFixtureRepo();
    const bare = join(tmp, 'origin.git');
    try {
      execFileSync('git', ['clone', '-q', '--bare', src, bare]);
      const clones = join(tmp, 'clones');
      const out = await cloneRepository({
        url: `file://${bare}`,
        clonesDir: clones,
        testOnlyAllowFileProtocol: true,
      });
      expect(out.path.startsWith(`${clones}/`)).toBe(true);
      expect(existsSync(join(out.path, 'src/handlers.ts'))).toBe(true);
      expect(
        execFileSync('git', ['-C', out.path, 'log', '--format=%s'], { encoding: 'utf8' }),
      ).toContain('initial');
      // The clone has no credential helper configured.
      expect(() =>
        execFileSync('git', ['-C', out.path, 'config', '--local', 'credential.helper']),
      ).toThrow();
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });

  it('without the override, file and local URLs are refused before git runs', async () => {
    const clones = join(tmp, 'clones-refused');
    await expect(
      cloneRepository({ url: `file://${tmp}/origin.git`, clonesDir: clones }),
    ).rejects.toBeInstanceOf(CloneError);
    await expect(
      cloneRepository({ url: 'https://127.0.0.1/a/b', clonesDir: clones }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    expect(existsSync(clones)).toBe(false);
  });

  it('the override is refused outside the test runner', async () => {
    const saved = process.env.VITEST;
    delete process.env.VITEST;
    try {
      await expect(
        cloneRepository({
          url: `file://${tmp}/origin.git`,
          clonesDir: join(tmp, 'x'),
          testOnlyAllowFileProtocol: true,
        }),
      ).rejects.toThrow(/only available in tests/);
    } finally {
      process.env.VITEST = saved;
    }
  });

  it('a failed clone leaves nothing behind', async () => {
    const clones = join(tmp, 'clones-fail');
    await expect(
      cloneRepository({
        url: `file://${tmp}/does-not-exist.git`,
        clonesDir: clones,
        testOnlyAllowFileProtocol: true,
      }),
    ).rejects.toMatchObject({ code: 'CLONE_FAILED' });
    expect(readdirSync(clones)).toEqual([]);
  });
});
