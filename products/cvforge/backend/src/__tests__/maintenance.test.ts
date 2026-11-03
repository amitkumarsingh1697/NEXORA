import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as auth from '../services/auth';
import * as ext from '../services/extension';
import { runMaintenance } from '../services/maintenance';
import { auditEvents, extensionPairingCodes, sessions } from '../db/schema';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

let env: TestEnv;
let userId: string;
beforeAll(async () => {
  env = await setupTestEnv();
  userId = (
    await auth.signUp(env.ctx, {
      email: 'retention@example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    })
  ).id;
});
afterAll(async () => env.cleanup());

describe('retention sweep', () => {
  it('keeps live rows and deletes only expired ones', async () => {
    const session = await auth.login(env.ctx, {
      email: 'retention@example.com',
      password: PASSWORD,
    });
    await ext.createPairingCode(env.ctx, userId);

    const first = await runMaintenance(env.ctx);
    expect(first).toMatchObject({ sessions: 0, pairingCodes: 0, auditEvents: 0 });
    expect(await auth.getSessionUser(env.ctx, session.token)).not.toBeNull();

    // Ten minutes later the pairing code (5 min TTL) is gone but the session survives.
    const start = env.clock.now;
    env.clock.now = new Date(start.getTime() + 10 * 60_000);
    const second = await runMaintenance(env.ctx);
    expect(second.pairingCodes).toBe(1);
    expect(second.sessions).toBe(0);
    expect(await env.ctx.db.select().from(extensionPairingCodes)).toHaveLength(0);

    // Past the session TTL and the audit retention window, both are purged.
    const days = Math.max(env.ctx.cfg.SESSION_TTL_DAYS, env.ctx.cfg.AUDIT_RETENTION_DAYS) + 2;
    env.clock.now = new Date(Date.now() + days * 86_400_000);
    const auditBefore = (await env.ctx.db.select().from(auditEvents)).length;
    expect(auditBefore).toBeGreaterThan(0);
    const third = await runMaintenance(env.ctx);
    expect(third.sessions).toBe(1);
    expect(third.auditEvents).toBe(auditBefore);
    expect(await env.ctx.db.select().from(sessions)).toHaveLength(0);

    // Idempotent.
    const fourth = await runMaintenance(env.ctx);
    expect(Object.values(fourth).every((n) => n === 0)).toBe(true);
    env.clock.now = start;
  });
});
