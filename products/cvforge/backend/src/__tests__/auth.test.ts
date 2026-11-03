import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as auth from '../services/auth';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => env.cleanup());

describe('authentication', () => {
  it('signs up, rejects duplicates (case-insensitive) and requires consent', async () => {
    const u = await auth.signUp(env.ctx, {
      email: 'Amit@Example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    });
    expect(u.email).toBe('amit@example.com');
    await expect(
      auth.signUp(env.ctx, { email: 'amit@example.COM', password: PASSWORD, acceptPrivacy: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      auth.signUp(env.ctx, { email: 'x@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      auth.signUp(env.ctx, { email: 'y@example.com', password: 'short', acceptPrivacy: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('logs in with a generic error for bad credentials', async () => {
    await expect(
      auth.login(env.ctx, { email: 'amit@example.com', password: 'wrong password!!' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Invalid email or password.' });
    await expect(
      auth.login(env.ctx, { email: 'nobody@example.com', password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Invalid email or password.' });
  });

  it('creates sessions that can be resolved, expire and be revoked', async () => {
    const s = await auth.login(env.ctx, { email: 'amit@example.com', password: PASSWORD });
    expect(await auth.getSessionUser(env.ctx, s.token)).toMatchObject({
      email: 'amit@example.com',
    });
    expect(await auth.getSessionUser(env.ctx, 'not-a-real-token')).toBeNull();
    await auth.logout(env.ctx, s.token);
    expect(await auth.getSessionUser(env.ctx, s.token)).toBeNull();

    const s2 = await auth.login(env.ctx, { email: 'amit@example.com', password: PASSWORD });
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 15 * 86400_000);
    expect(await auth.getSessionUser(env.ctx, s2.token)).toBeNull();
    env.clock.now = saved;
  });

  it('password reset is single use, expires, and revokes sessions', async () => {
    const s = await auth.login(env.ctx, { email: 'amit@example.com', password: PASSWORD });
    await auth.requestPasswordReset(env.ctx, { email: 'amit@example.com' });
    await auth.requestPasswordReset(env.ctx, { email: 'unknown@example.com' }); // no error, no mail
    expect(env.ctx.mail.sent).toHaveLength(1);
    const token = /token=([^\s]+)/.exec(env.ctx.mail.sent[0]!.text)![1]!;
    const newPw = 'another long password 123';
    await auth.resetPassword(env.ctx, { token: decodeURIComponent(token), password: newPw });
    expect(await auth.getSessionUser(env.ctx, s.token)).toBeNull();
    await expect(
      auth.resetPassword(env.ctx, { token: decodeURIComponent(token), password: newPw }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await auth.login(env.ctx, { email: 'amit@example.com', password: newPw });

    await auth.requestPasswordReset(env.ctx, { email: 'amit@example.com' });
    const t2 = decodeURIComponent(/token=([^\s]+)/.exec(env.ctx.mail.sent[1]!.text)![1]!);
    env.clock.now = new Date(env.clock.now.getTime() + 31 * 60_000);
    await expect(
      auth.resetPassword(env.ctx, { token: t2, password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
