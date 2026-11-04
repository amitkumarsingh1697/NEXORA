import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as auth from '../services/auth';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

let env: TestEnv;
beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => env.cleanup());

const linkToken = (text: string) =>
  decodeURIComponent(/verify-email\?token=([^\s]+)/.exec(text)?.[1] ?? '');
const verifyMails = () => env.ctx.mail.sent.filter((m) => m.subject.includes('Confirm'));

describe('email verification', () => {
  let userId = '';

  it('sends a confirmation link at signup and starts unverified', async () => {
    const u = await auth.signUp(env.ctx, {
      email: 'Verify@Example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    });
    userId = u.id;
    expect(u.emailVerified).toBe(false);
    expect(verifyMails()).toHaveLength(1);
    expect(verifyMails()[0]!.to).toBe('verify@example.com');
    expect(verifyMails()[0]!.text).toContain('http://localhost:3000/verify-email?token=');
  });

  it('rejects unknown and expired links, then verifies once', async () => {
    await expect(auth.verifyEmail(env.ctx, { token: 'x'.repeat(40) })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(auth.verifyEmail(env.ctx, { token: 'short' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    const first = linkToken(verifyMails()[0]!.text);
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 25 * 3600_000);
    await expect(auth.verifyEmail(env.ctx, { token: first })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    env.clock.now = saved;

    expect(await auth.resendVerification(env.ctx, userId)).toEqual({ sent: true });
    const second = linkToken(verifyMails()[1]!.text);
    expect(second).not.toBe(first);
    await auth.verifyEmail(env.ctx, { token: second });
    const s = await auth.login(env.ctx, { email: 'verify@example.com', password: PASSWORD });
    expect(s.user.emailVerified).toBe(true);
    // Single use.
    await expect(auth.verifyEmail(env.ctx, { token: second })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    // Nothing more to send once verified.
    expect(await auth.resendVerification(env.ctx, userId)).toEqual({ sent: false });
    expect(verifyMails()).toHaveLength(2);
  });

  it('rate-limits resending', async () => {
    const u = await auth.signUp(env.ctx, {
      email: 'spam@example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    });
    for (let i = 0; i < 5; i++) await auth.resendVerification(env.ctx, u.id);
    await expect(auth.resendVerification(env.ctx, u.id)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('only gates uploads and AI when REQUIRE_EMAIL_VERIFICATION is on', async () => {
    const u = await auth.signUp(env.ctx, {
      email: 'gate@example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    });
    await expect(auth.assertEmailVerified(env.ctx, u.id)).resolves.toBeUndefined();
    const strict = {
      ...env.ctx,
      cfg: { ...env.ctx.cfg, REQUIRE_EMAIL_VERIFICATION: 'true' as const },
    };
    await expect(auth.assertEmailVerified(strict, u.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    const mail = verifyMails().find((m) => m.to === 'gate@example.com')!;
    await auth.verifyEmail(env.ctx, { token: linkToken(mail.text) });
    await expect(auth.assertEmailVerified(strict, u.id)).resolves.toBeUndefined();
  });

  it('keeps the account when the confirmation email cannot be sent', async () => {
    const failing = {
      ...env.ctx,
      mail: {
        send: async () => {
          throw new Error('Mail delivery failed (ECONNECTION).');
        },
      },
    };
    const u = await auth.signUp(failing, {
      email: 'nomail@example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    });
    expect(u.emailVerified).toBe(false);
    await expect(
      auth.login(env.ctx, { email: 'nomail@example.com', password: PASSWORD }),
    ).resolves.toMatchObject({ user: { id: u.id } });
  });
});
