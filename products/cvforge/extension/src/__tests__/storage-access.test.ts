import { describe, expect, it } from 'vitest';
import { restrictStorageToTrustedContexts, type AccessLevelArea } from '../storage-access';

function area(calls: string[], name: string): AccessLevelArea {
  return {
    setAccessLevel: async (o) => {
      calls.push(`${name}:${o.accessLevel}`);
    },
  };
}

describe('storage access level', () => {
  it('restricts local and session storage to trusted contexts', async () => {
    const calls: string[] = [];
    const out = await restrictStorageToTrustedContexts({
      local: area(calls, 'local'),
      session: area(calls, 'session'),
    });
    expect(calls).toEqual(['local:TRUSTED_CONTEXTS', 'session:TRUSTED_CONTEXTS']);
    expect(out).toEqual({ restricted: ['local', 'session'], unsupported: [] });
  });

  it('reports browsers without setAccessLevel instead of pretending', async () => {
    const calls: string[] = [];
    const out = await restrictStorageToTrustedContexts({
      local: {},
      session: area(calls, 'session'),
    });
    expect(out.unsupported).toEqual(['local']);
    expect(calls).toEqual(['session:TRUSTED_CONTEXTS']);
  });

  it('propagates failures so callers can log them', async () => {
    await expect(
      restrictStorageToTrustedContexts({
        local: { setAccessLevel: async () => Promise.reject(new Error('nope')) },
        session: {},
      }),
    ).rejects.toThrow('nope');
  });
});
