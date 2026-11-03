import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import * as auth from '../services/auth';
import * as resumesSvc from '../services/resumes';
import * as ext from '../services/extension';
import * as privacy from '../services/privacy';
import { resumes, users } from '../db/schema';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

let env: TestEnv;
let userId: string;
beforeAll(async () => {
  env = await setupTestEnv();
  userId = (
    await auth.signUp(env.ctx, {
      email: 'ext@example.com',
      password: PASSWORD,
      acceptPrivacy: true,
    })
  ).id;
});
afterAll(async () => env.cleanup());

const JD = `Senior Java Engineer\nCompany: Example Corp\nRequirements\n- 5+ years of Java experience\n- Experience with Spring Boot and AWS\n`;

describe('extension pairing and tokens', () => {
  it('pairing codes are single use', async () => {
    const { code } = await ext.createPairingCode(env.ctx, userId);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const pair = await ext.pairDevice(env.ctx, {
      code: code.toLowerCase().replace('-', ' '),
      deviceName: 'Chrome',
    });
    expect(pair.accessToken).toMatch(/^ext1\./);
    await expect(ext.pairDevice(env.ctx, { code })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('pairing codes expire after five minutes', async () => {
    const { code } = await ext.createPairingCode(env.ctx, userId);
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 5 * 60_000 + 1000);
    await expect(ext.pairDevice(env.ctx, { code })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    env.clock.now = saved;
  });

  it('access tokens authenticate, expire, and resist tampering', async () => {
    const { code } = await ext.createPairingCode(env.ctx, userId);
    const pair = await ext.pairDevice(env.ctx, { code });
    expect(await ext.authenticateExtension(env.ctx, `Bearer ${pair.accessToken}`)).toEqual({
      userId,
      deviceId: pair.deviceId,
    });
    const [p, payload, sig] = pair.accessToken.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'someone-else', did: pair.deviceId, exp: 9999999999 }),
    ).toString('base64url');
    await expect(
      ext.authenticateExtension(env.ctx, `Bearer ${p}.${forged}.${sig}`),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      ext.authenticateExtension(env.ctx, `Bearer ${p}.${payload}.x${sig}`),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(ext.authenticateExtension(env.ctx, undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 16 * 60_000);
    await expect(
      ext.authenticateExtension(env.ctx, `Bearer ${pair.accessToken}`),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    env.clock.now = saved;
  });

  it('rotates refresh tokens and revokes the device on reuse', async () => {
    const { code } = await ext.createPairingCode(env.ctx, userId);
    const pair = await ext.pairDevice(env.ctx, { code });
    const r1 = await ext.refreshDeviceToken(env.ctx, { refreshToken: pair.refreshToken });
    expect(r1.refreshToken).not.toBe(pair.refreshToken);
    const r2 = await ext.refreshDeviceToken(env.ctx, { refreshToken: r1.refreshToken });
    // Replaying the first (already used) token is detected...
    await expect(
      ext.refreshDeviceToken(env.ctx, { refreshToken: pair.refreshToken }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    // ...and kills the whole family, including the newest token and live access tokens.
    await expect(
      ext.refreshDeviceToken(env.ctx, { refreshToken: r2.refreshToken }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      ext.authenticateExtension(env.ctx, `Bearer ${r2.accessToken}`),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const devices = await ext.listDevices(env.ctx, userId);
    expect(devices.find((d) => d.id === pair.deviceId)?.revokedReason).toBe('refresh_token_reuse');
  });

  it('user can revoke a device', async () => {
    const { code } = await ext.createPairingCode(env.ctx, userId);
    const pair = await ext.pairDevice(env.ctx, { code });
    await ext.revokeDevice(env.ctx, userId, pair.deviceId);
    await expect(
      ext.authenticateExtension(env.ctx, `Bearer ${pair.accessToken}`),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      ext.refreshDeviceToken(env.ctx, { refreshToken: pair.refreshToken }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const other = (
      await auth.signUp(env.ctx, {
        email: 'other@example.com',
        password: PASSWORD,
        acceptPrivacy: true,
      })
    ).id;
    await expect(ext.revokeDevice(env.ctx, other, pair.deviceId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('captures an extracted job into a new workspace', async () => {
    const up = await resumesSvc.uploadResume(env.ctx, userId, {
      filename: 'r.docx',
      bytes: await renderDocx(
        parseResumeText(
          'Jane Doe\njane@example.com\nEXPERIENCE\nJava Engineer | X Corp\nJan 2018 - Present\n• Built Java services on AWS',
        ).content,
        'classic',
      ),
    });
    await resumesSvc.finalizeVersion(env.ctx, userId, up.versionId);
    const { code } = await ext.createPairingCode(env.ctx, userId);
    const pair = await ext.pairDevice(env.ctx, { code });
    const authn = await ext.authenticateExtension(env.ctx, `Bearer ${pair.accessToken}`);
    const resumesList = await ext.extensionResumes(env.ctx, authn.userId);
    expect(resumesList).toHaveLength(1);
    const w = await ext.captureJob(env.ctx, authn, {
      resumeVersionId: up.versionId,
      jobText: JD,
      sourceUrl: 'javascript:alert(1)',
      sourceSite: 'linkedin',
    });
    expect(w.name).toContain('Senior Java Engineer');
  });
});

describe('privacy controls', () => {
  it('account export excludes credential hashes and storage keys', async () => {
    const data = await privacy.exportAccountData(env.ctx, userId);
    const json = JSON.stringify(data);
    expect(json).not.toContain('scrypt$');
    expect(json).not.toContain('storageKey');
    expect(json).not.toContain('tokenHash');
    expect(data.resumes).toHaveLength(1);
    expect(data.jobDescriptions[0]?.sourceUrl).toBe(''); // unsafe URL scheme was dropped
  });

  it('account deletion requires the password and removes rows and files', async () => {
    await expect(privacy.deleteAccount(env.ctx, userId, 'wrong password')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await privacy.deleteAccount(env.ctx, userId, PASSWORD);
    expect(await env.ctx.db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await env.ctx.db.select().from(resumes).where(eq(resumes.userId, userId))).toHaveLength(
      0,
    );
    const dir = join(env.dir, 'storage', 'users');
    const remaining = await readdir(dir).catch(() => []);
    expect(remaining).not.toContain(userId);
  });
});
