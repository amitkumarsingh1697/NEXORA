import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, parseOrThrow } from '@nexora/validation';
import type { Ctx } from '../context';
import {
  extensionDevices,
  extensionPairingCodes,
  extensionRefreshTokens,
  resumeVersions,
  resumes,
} from '../db/schema';
import {
  hmac,
  normalisePairingCode,
  pairingCode,
  randomToken,
  safeEqual,
  sha256,
} from '../lib/crypto';
import { RateLimiter } from '../lib/rate-limit';
import { audit } from './audit';
import { createWorkspace } from './workspaces';

const PAIRING_TTL_MS = 5 * 60_000;
const pairLimiter = new RateLimiter(10, 15 * 60_000);

export async function createPairingCode(ctx: Ctx, userId: string) {
  const code = pairingCode();
  const expiresAt = new Date(ctx.now().getTime() + PAIRING_TTL_MS);
  await ctx.db
    .insert(extensionPairingCodes)
    .values({ userId, codeHash: sha256(normalisePairingCode(code)), expiresAt });
  await audit(ctx, userId, 'extension.pairing_code_created');
  return { code, expiresAt };
}

interface AccessPayload {
  sub: string;
  did: string;
  exp: number;
}

/** Compact HMAC-signed access token: base64url(payload).signature. Short lived, bound to a device. */
export function issueAccessToken(
  ctx: Ctx,
  userId: string,
  deviceId: string,
): { token: string; expiresAt: Date } {
  const exp = Math.floor(ctx.now().getTime() / 1000) + ctx.cfg.EXTENSION_ACCESS_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, did: deviceId, exp } satisfies AccessPayload),
  ).toString('base64url');
  return {
    token: `ext1.${payload}.${hmac(ctx.cfg.APP_SECRET, `ext1.${payload}`)}`,
    expiresAt: new Date(exp * 1000),
  };
}

async function issueRefresh(ctx: Ctx, deviceId: string, familyId: string) {
  const token = randomToken();
  const expiresAt = new Date(ctx.now().getTime() + ctx.cfg.EXTENSION_REFRESH_TTL_DAYS * 86400_000);
  await ctx.db
    .insert(extensionRefreshTokens)
    .values({ deviceId, familyId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

export const pairSchema = z.object({
  code: z.string().min(8).max(20),
  deviceName: z.string().trim().min(1).max(100).default('Browser extension'),
});

/** Exchange a single-use pairing code for device-bound credentials. */
export async function pairDevice(ctx: Ctx, input: unknown, meta: { ip?: string } = {}) {
  const data = parseOrThrow(pairSchema, input);
  pairLimiter.check(`pair:${meta.ip ?? 'unknown'}`);
  const codeHash = sha256(normalisePairingCode(data.code));
  // Atomic consume: only one request can ever succeed for a given code.
  const [consumed] = await ctx.db
    .update(extensionPairingCodes)
    .set({ consumedAt: ctx.now() })
    .where(
      and(
        eq(extensionPairingCodes.codeHash, codeHash),
        isNull(extensionPairingCodes.consumedAt),
        gt(extensionPairingCodes.expiresAt, ctx.now()),
      ),
    )
    .returning();
  if (!consumed)
    throw new AppError('UNAUTHENTICATED', 'This pairing code is invalid, expired or already used.');
  const [device] = await ctx.db
    .insert(extensionDevices)
    .values({ userId: consumed.userId, name: data.deviceName })
    .returning();
  if (!device) throw new AppError('INTERNAL', 'Could not register device.');
  const familyId = crypto.randomUUID();
  const refresh = await issueRefresh(ctx, device.id, familyId);
  const access = issueAccessToken(ctx, consumed.userId, device.id);
  await audit(ctx, consumed.userId, 'extension.paired', {
    type: 'extension_device',
    id: device.id,
  });
  return {
    deviceId: device.id,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

async function revokeDeviceInternal(ctx: Ctx, deviceId: string, reason: string) {
  await ctx.db
    .update(extensionDevices)
    .set({ revokedAt: ctx.now(), revokedReason: reason })
    .where(and(eq(extensionDevices.id, deviceId), isNull(extensionDevices.revokedAt)));
}

/**
 * Rotate a refresh token. Reusing an already-rotated token indicates theft:
 * the whole device (token family) is revoked.
 */
export async function refreshDeviceToken(ctx: Ctx, input: unknown) {
  const { refreshToken } = parseOrThrow(
    z.object({ refreshToken: z.string().min(20).max(200) }),
    input,
  );
  const [row] = await ctx.db
    .select({ t: extensionRefreshTokens, d: extensionDevices })
    .from(extensionRefreshTokens)
    .innerJoin(extensionDevices, eq(extensionDevices.id, extensionRefreshTokens.deviceId))
    .where(eq(extensionRefreshTokens.tokenHash, sha256(refreshToken)));
  if (!row) throw new AppError('UNAUTHENTICATED', 'Please pair the extension again.');
  if (row.d.revokedAt)
    throw new AppError('UNAUTHENTICATED', 'This device was revoked. Please pair again.');
  if (row.t.usedAt) {
    await revokeDeviceInternal(ctx, row.d.id, 'refresh_token_reuse');
    await audit(ctx, row.d.userId, 'extension.refresh_reuse_detected', {
      type: 'extension_device',
      id: row.d.id,
    });
    throw new AppError(
      'UNAUTHENTICATED',
      'Security check failed; the device was signed out. Please pair again.',
    );
  }
  if (row.t.expiresAt <= ctx.now())
    throw new AppError('UNAUTHENTICATED', 'Session expired. Please pair again.');
  const [marked] = await ctx.db
    .update(extensionRefreshTokens)
    .set({ usedAt: ctx.now() })
    .where(and(eq(extensionRefreshTokens.id, row.t.id), isNull(extensionRefreshTokens.usedAt)))
    .returning();
  if (!marked) {
    // Lost a race with a concurrent refresh using the same token: treat as reuse.
    await revokeDeviceInternal(ctx, row.d.id, 'refresh_token_reuse');
    throw new AppError(
      'UNAUTHENTICATED',
      'Security check failed; the device was signed out. Please pair again.',
    );
  }
  await ctx.db
    .update(extensionDevices)
    .set({ lastSeenAt: ctx.now() })
    .where(eq(extensionDevices.id, row.d.id));
  const refresh = await issueRefresh(ctx, row.d.id, row.t.familyId);
  const access = issueAccessToken(ctx, row.d.userId, row.d.id);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

/** Validate an extension access token. Also rejects tokens for revoked devices. */
export async function authenticateExtension(
  ctx: Ctx,
  authorization: string | null | undefined,
): Promise<{ userId: string; deviceId: string }> {
  const m = /^Bearer (ext1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+))$/.exec(authorization ?? '');
  if (!m || !m[2] || !m[3])
    throw new AppError('UNAUTHENTICATED', 'Missing or malformed extension token.');
  if (!safeEqual(hmac(ctx.cfg.APP_SECRET, `ext1.${m[2]}`), m[3]))
    throw new AppError('UNAUTHENTICATED', 'Invalid extension token.');
  let payload: AccessPayload;
  try {
    payload = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8')) as AccessPayload;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid extension token.');
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(ctx.now().getTime() / 1000))
    throw new AppError('UNAUTHENTICATED', 'Extension token expired.');
  const [device] = await ctx.db
    .select()
    .from(extensionDevices)
    .where(and(eq(extensionDevices.id, payload.did), eq(extensionDevices.userId, payload.sub)));
  if (!device || device.revokedAt)
    throw new AppError('UNAUTHENTICATED', 'This device was revoked.');
  return { userId: payload.sub, deviceId: payload.did };
}

export async function listDevices(ctx: Ctx, userId: string) {
  return ctx.db
    .select()
    .from(extensionDevices)
    .where(eq(extensionDevices.userId, userId))
    .orderBy(desc(extensionDevices.createdAt));
}

export async function revokeDevice(
  ctx: Ctx,
  userId: string,
  deviceId: string,
  reason = 'user_revoked',
) {
  const [d] = await ctx.db
    .select()
    .from(extensionDevices)
    .where(and(eq(extensionDevices.id, deviceId), eq(extensionDevices.userId, userId)));
  if (!d) throw new AppError('NOT_FOUND', 'Device not found.');
  await revokeDeviceInternal(ctx, deviceId, reason);
  await audit(
    ctx,
    userId,
    'extension.device_revoked',
    { type: 'extension_device', id: deviceId },
    { reason },
  );
}

/** Finalized resumes the extension can attach a captured job to. */
export async function extensionResumes(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select({
      resumeId: resumes.id,
      title: resumes.title,
      versionId: resumeVersions.id,
      versionNumber: resumeVersions.versionNumber,
      label: resumeVersions.label,
    })
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(and(eq(resumeVersions.userId, userId), eq(resumeVersions.status, 'finalized')))
    .orderBy(desc(resumeVersions.createdAt));
  return rows;
}

export const captureSchema = z.object({
  resumeVersionId: z.uuid(),
  jobText: z.string().min(50).max(50_000),
  sourceUrl: z.string().max(2000),
  sourceSite: z.enum(['linkedin', 'naukri', 'generic']),
  title: z.string().max(300).optional(),
  company: z.string().max(300).optional(),
  location: z.string().max(300).optional(),
});

/** Save a job the user explicitly extracted and reviewed in the extension. */
export async function captureJob(
  ctx: Ctx,
  auth: { userId: string; deviceId: string },
  input: unknown,
) {
  const data = parseOrThrow(captureSchema, input);
  const ws = await createWorkspace(ctx, auth.userId, { ...data, source: 'extension' });
  await audit(
    ctx,
    auth.userId,
    'extension.job_captured',
    { type: 'workspace', id: ws.id },
    { site: data.sourceSite },
  );
  return ws;
}
