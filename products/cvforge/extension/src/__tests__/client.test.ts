import { describe, expect, it } from 'vitest';
import { ApiError, CvforgeClient, type KeyValueStore } from '../api/client';

function memStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

interface Call {
  url: string;
  method: string;
  auth?: string;
  body?: unknown;
}

function fakeServer(handler: (c: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    const c: Call = {
      url,
      method: String(init.method),
      auth: headers.authorization,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    const r = handler(c);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { calls, fetch: f };
}

const NOW = Date.parse('2026-01-01T00:00:00Z');
const tokens = (n: number, ttlMs = 15 * 60_000) => ({
  accessToken: `ext1.a${n}.sig`,
  accessTokenExpiresAt: new Date(NOW + ttlMs).toISOString(),
  refreshToken: `refresh-token-number-${n}-xxxxxxxx`,
  refreshTokenExpiresAt: new Date(NOW + 86400_000).toISOString(),
});

describe('CvforgeClient', () => {
  it('pairs, stores refresh token persistently and access token in session storage', async () => {
    const local = memStore();
    const session = memStore();
    const srv = fakeServer(() => ({ status: 200, body: { deviceId: 'd1', ...tokens(1) } }));
    const c = new CvforgeClient({
      baseUrl: 'http://localhost:3000/',
      local,
      session,
      fetch: srv.fetch,
      now: () => NOW,
    });
    await c.pair(' abcd-2345 ', 'Google Chrome');
    expect(srv.calls[0]).toMatchObject({
      url: 'http://localhost:3000/api/extension/pair',
      body: { code: 'ABCD-2345', deviceName: 'Google Chrome' },
    });
    expect(local.data.get('cvf.refreshToken')).toBe(tokens(1).refreshToken);
    expect(local.data.has('cvf.accessToken')).toBe(false);
    expect(session.data.get('cvf.accessToken')).toBe(tokens(1).accessToken);
    expect(await c.isPaired()).toBe(true);
  });

  it('refreshes an expiring access token once even under concurrent calls, and rotates the refresh token', async () => {
    const local = memStore();
    const session = memStore();
    let refreshes = 0;
    const srv = fakeServer((c) => {
      if (c.url.endsWith('/refresh')) {
        refreshes++;
        return { status: 200, body: tokens(2) };
      }
      return { status: 200, body: { resumes: [] } };
    });
    const c = new CvforgeClient({
      baseUrl: 'http://h',
      local,
      session,
      fetch: srv.fetch,
      now: () => NOW,
    });
    local.data.set('cvf.refreshToken', tokens(1).refreshToken);
    session.data.set('cvf.accessToken', 'old');
    session.data.set('cvf.accessTokenExpiresAt', String(NOW + 30_000)); // inside the 60s skew
    await Promise.all([c.resumes(), c.resumes(), c.resumes()]);
    expect(refreshes).toBe(1);
    expect(srv.calls.find((x) => x.url.endsWith('/refresh'))?.body).toEqual({
      refreshToken: tokens(1).refreshToken,
    });
    expect(local.data.get('cvf.refreshToken')).toBe(tokens(2).refreshToken);
    expect(
      srv.calls
        .filter((x) => x.url.endsWith('/resumes'))
        .every((x) => x.auth === `Bearer ${tokens(2).accessToken}`),
    ).toBe(true);
  });

  it('clears credentials and reports NOT_PAIRED when the refresh token is rejected (revoked or reused)', async () => {
    const local = memStore();
    const session = memStore();
    const srv = fakeServer(() => ({
      status: 401,
      body: { error: { code: 'UNAUTHENTICATED', message: 'revoked' } },
    }));
    const c = new CvforgeClient({
      baseUrl: 'http://h',
      local,
      session,
      fetch: srv.fetch,
      now: () => NOW,
    });
    local.data.set('cvf.refreshToken', tokens(1).refreshToken);
    await expect(c.resumes()).rejects.toMatchObject({ code: 'NOT_PAIRED' });
    expect(local.data.size).toBe(0);
    expect(await c.isPaired()).toBe(false);
  });

  it('retries once with a fresh token when the server rejects the access token', async () => {
    const local = memStore();
    const session = memStore();
    let first = true;
    const srv = fakeServer((c) => {
      if (c.url.endsWith('/refresh')) return { status: 200, body: tokens(3) };
      if (first) {
        first = false;
        return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'bad token' } } };
      }
      return { status: 200, body: { workspaceId: 'w', url: 'http://h/workspaces/w' } };
    });
    const c = new CvforgeClient({
      baseUrl: 'http://h',
      local,
      session,
      fetch: srv.fetch,
      now: () => NOW,
    });
    local.data.set('cvf.refreshToken', tokens(1).refreshToken);
    session.data.set('cvf.accessToken', 'stale');
    session.data.set('cvf.accessTokenExpiresAt', String(NOW + 600_000));
    const res = await c.capture({
      resumeVersionId: '00000000-0000-4000-8000-000000000000',
      jobText: 'x'.repeat(60),
      sourceUrl: 'https://example.com',
      sourceSite: 'generic',
    });
    expect(res.workspaceId).toBe('w');
    expect(srv.calls.map((x) => x.url.split('/').pop())).toEqual(['jobs', 'refresh', 'jobs']);
  });

  it('surfaces server error messages and network failures as ApiError', async () => {
    const srv = fakeServer(() => ({
      status: 401,
      body: {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'This pairing code is invalid, expired or already used.',
        },
      },
    }));
    const c = new CvforgeClient({
      baseUrl: 'http://h',
      local: memStore(),
      session: memStore(),
      fetch: srv.fetch,
    });
    await expect(c.pair('ABCD-EFGH', 'x')).rejects.toThrow(/invalid, expired or already used/);
    const down = new CvforgeClient({
      baseUrl: 'http://h',
      local: memStore(),
      session: memStore(),
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(down.pair('ABCD-EFGH', 'x')).rejects.toBeInstanceOf(ApiError);
  });

  it('logout clears local state even if the server call fails', async () => {
    const local = memStore();
    const session = memStore();
    const srv = fakeServer(() => ({ status: 500, body: {} }));
    const c = new CvforgeClient({
      baseUrl: 'http://h',
      local,
      session,
      fetch: srv.fetch,
      now: () => NOW,
    });
    local.data.set('cvf.refreshToken', 'r'.repeat(30));
    local.data.set('cvf.deviceId', 'd');
    session.data.set('cvf.accessToken', 'a');
    session.data.set('cvf.accessTokenExpiresAt', String(NOW + 600_000));
    await c.logout();
    expect(local.data.size + session.data.size).toBe(0);
  });
});
