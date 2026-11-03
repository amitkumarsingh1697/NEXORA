import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startService, type TestService } from './helpers';

let svc: TestService;
beforeAll(async () => {
  svc = await startService();
});
afterAll(() => svc.close());

describe('POST /api/repos/clone', () => {
  it.each([
    ['file:///etc', 'INVALID_URL'],
    ['http://github.com/a/b', 'INVALID_URL'],
    ['https://localhost/a/b', 'BLOCKED_HOST'],
    ['https://169.254.169.254/latest', 'BLOCKED_HOST'],
  ])('refuses %s without running git', async (url, code) => {
    const r = await svc.api<{ error: { code: string } }>('/api/repos/clone', {
      method: 'POST',
      body: { url },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe(code);
    expect(existsSync(join(svc.home, 'clones'))).toBe(false);
  });

  it('requires the session token', async () => {
    const r = await svc.api('/api/repos/clone', {
      method: 'POST',
      body: { url: 'https://github.com/a/b' },
      token: null,
    });
    expect(r.status).toBe(401);
  });
});
