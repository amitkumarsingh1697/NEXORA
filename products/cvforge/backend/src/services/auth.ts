import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, emailSchema, parseOrThrow, passwordSchema } from '@nexora/validation';
import type { Ctx } from '../context';
import {
  emailVerificationTokens,
  organizationMembers,
  organizations,
  passwordResetTokens,
  sessions,
  users,
} from '../db/schema';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto';
import { RateLimiter } from '../lib/rate-limit';
import { audit } from './audit';

export const PRIVACY_POLICY_VERSION = '2026-11-01';

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(120).default(''),
  acceptPrivacy: z.literal(true, {
    message: 'You must accept the privacy notice to create an account.',
  }),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  country: string;
  careerStageOverride: string | null;
  aiAssistEnabled: boolean;
  emailVerified: boolean;
  createdAt: Date;
};

function toPublic(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    country: u.country,
    careerStageOverride: u.careerStageOverride,
    aiAssistEnabled: u.aiAssistEnabled,
    emailVerified: u.emailVerifiedAt !== null,
    createdAt: u.createdAt,
  };
}

// A real scrypt hash of a random password, used to equalise timing when the email does not exist.
let dummyHash: Promise<string> | null = null;
const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);
const resetLimiter = new RateLimiter(5, 60 * 60 * 1000);
const verifyLimiter = new RateLimiter(5, 60 * 60 * 1000);
const VERIFY_TTL_MS = 24 * 60 * 60_000;

export async function signUp(ctx: Ctx, input: unknown): Promise<PublicUser> {
  const data = parseOrThrow(signUpSchema, input);
  const existing = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`);
  if (existing.length) throw new AppError('CONFLICT', 'An account with this email already exists.');
  const passwordHash = await hashPassword(data.password);
  const created = await ctx.db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: data.displayName || data.email, kind: 'personal' })
      .returning();
    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        privacyConsentVersion: PRIVACY_POLICY_VERSION,
        privacyConsentAt: ctx.now(),
      })
      .returning();
    if (!org || !user) throw new AppError('INTERNAL', 'Could not create account.');
    await tx
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: user.id, role: 'owner' });
    await audit(ctx, user.id, 'user.signup', { type: 'user', id: user.id }, {}, tx);
    return user;
  });
  // The account exists either way; a failed send is logged (ids only) and can be retried.
  try {
    await sendVerification(ctx, created);
  } catch (e) {
    ctx.log.warn(
      { userId: created.id, error: e instanceof Error ? e.message : 'unknown' },
      'verification email not sent',
    );
  }
  return toPublic(created);
}

async function sendVerification(ctx: Ctx, user: typeof users.$inferSelect): Promise<void> {
  const token = randomToken();
  await ctx.db.insert(emailVerificationTokens).values({
    userId: user.id,
    email: user.email,
    tokenHash: sha256(token),
    expiresAt: new Date(ctx.now().getTime() + VERIFY_TTL_MS),
  });
  const link = `${ctx.cfg.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await ctx.mail.send({
    to: user.email,
    subject: 'Confirm your CVForge email address',
    text: `Use this link within 24 hours to confirm your email address:\n${link}\n\nIf you did not create a CVForge account, ignore this email.`,
  });
  await audit(ctx, user.id, 'user.email_verification_sent', { type: 'user', id: user.id });
}

/** Send a new verification link to a signed-in user whose address is not yet verified. */
export async function resendVerification(ctx: Ctx, userId: string): Promise<{ sent: boolean }> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError('NOT_FOUND', 'User not found.');
  if (user.emailVerifiedAt) return { sent: false };
  verifyLimiter.check(`verify:${userId}`);
  await sendVerification(ctx, user);
  return { sent: true };
}

/** Confirm an email address from a link. Single use, expires after 24 hours. */
export async function verifyEmail(ctx: Ctx, input: unknown): Promise<void> {
  const { token } = parseOrThrow(z.object({ token: z.string().min(10).max(200) }), input);
  await ctx.db.transaction(async (tx) => {
    const [t] = await tx
      .update(emailVerificationTokens)
      .set({ usedAt: ctx.now() })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, sha256(token)),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, ctx.now()),
        ),
      )
      .returning();
    if (!t)
      throw new AppError(
        'PRECONDITION_FAILED',
        'This confirmation link is invalid or has expired.',
      );
    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${ctx.now()})` })
      .where(and(eq(users.id, t.userId), sql`lower(${users.email}) = lower(${t.email})`))
      .returning({ id: users.id });
    if (!u)
      throw new AppError(
        'PRECONDITION_FAILED',
        'This confirmation link is invalid or has expired.',
      );
    await audit(ctx, t.userId, 'user.email_verified', { type: 'user', id: t.userId }, {}, tx);
  });
}

/**
 * When REQUIRE_EMAIL_VERIFICATION is on, stop unverified accounts from using storage
 * and model calls (risk S-03). A no-op otherwise.
 */
export async function assertEmailVerified(ctx: Ctx, userId: string): Promise<void> {
  if (ctx.cfg.REQUIRE_EMAIL_VERIFICATION !== 'true') return;
  const [u] = await ctx.db
    .select({ at: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!u?.at)
    throw new AppError(
      'PRECONDITION_FAILED',
      'Confirm your email address first. You can send a new link from Settings.',
    );
}

export async function personalOrgId(ctx: Ctx, userId: string): Promise<string> {
  const [m] = await ctx.db
    .select({ id: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  if (!m) throw new AppError('INTERNAL', 'User has no organization.');
  return m.id;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: PublicUser;
}

export async function login(
  ctx: Ctx,
  input: unknown,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<SessionResult> {
  const data = parseOrThrow(loginSchema, input);
  loginLimiter.check(`email:${data.email}`);
  if (meta.ip) loginLimiter.check(`ip:${meta.ip}`);
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`);
  if (!user) {
    dummyHash ??= hashPassword(randomToken());
    await verifyPassword(data.password, await dummyHash);
    throw new AppError('UNAUTHENTICATED', 'Invalid email or password.');
  }
  if (!(await verifyPassword(data.password, user.passwordHash))) {
    await audit(ctx, user.id, 'user.login_failed', { type: 'user', id: user.id });
    throw new AppError('UNAUTHENTICATED', 'Invalid email or password.');
  }
  const token = randomToken();
  const expiresAt = new Date(ctx.now().getTime() + ctx.cfg.SESSION_TTL_DAYS * 86400_000);
  await ctx.db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256(token),
    userAgent: (meta.userAgent ?? '').slice(0, 300),
    expiresAt,
  });
  await audit(ctx, user.id, 'user.login', { type: 'user', id: user.id });
  return { token, expiresAt, user: toPublic(user) };
}

/** Resolve a session token to its user. Returns null for unknown, expired or revoked sessions. */
export async function getSessionUser(
  ctx: Ctx,
  token: string | undefined | null,
): Promise<(PublicUser & { sessionId: string }) | null> {
  if (!token || token.length > 200) return null;
  const rows = await ctx.db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, ctx.now()),
      ),
    );
  const row = rows[0];
  if (!row) return null;
  // Throttle last-seen writes to once per 5 minutes.
  if (ctx.now().getTime() - row.s.lastSeenAt.getTime() > 5 * 60_000) {
    await ctx.db.update(sessions).set({ lastSeenAt: ctx.now() }).where(eq(sessions.id, row.s.id));
  }
  return { ...toPublic(row.u), sessionId: row.s.id };
}

export async function logout(ctx: Ctx, token: string): Promise<void> {
  const [s] = await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)))
    .returning();
  if (s) await audit(ctx, s.userId, 'user.logout', { type: 'session', id: s.id });
}

export async function listSessions(ctx: Ctx, userId: string) {
  return ctx.db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, ctx.now()),
      ),
    );
}

export async function revokeSession(ctx: Ctx, userId: string, sessionId: string): Promise<void> {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function revokeAllSessions(
  ctx: Ctx,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? sql`${sessions.id} <> ${exceptSessionId}` : undefined,
      ),
    );
  await audit(ctx, userId, 'user.sessions_revoked');
}

/** Always succeeds from the caller's view so account existence is not revealed. */
export async function requestPasswordReset(ctx: Ctx, input: unknown): Promise<void> {
  const { email } = parseOrThrow(z.object({ email: emailSchema }), input);
  resetLimiter.check(`reset:${email}`);
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (!user) return;
  const token = randomToken();
  await ctx.db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(ctx.now().getTime() + 30 * 60_000),
  });
  const link = `${ctx.cfg.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  await ctx.mail.send({
    to: user.email,
    subject: 'Reset your CVForge password',
    text: `Use this link within 30 minutes to reset your password:\n${link}\n\nIf you did not ask for this, ignore this email.`,
  });
  await audit(ctx, user.id, 'user.password_reset_requested', { type: 'user', id: user.id });
}

export async function resetPassword(ctx: Ctx, input: unknown): Promise<void> {
  const data = parseOrThrow(
    z.object({ token: z.string().min(10).max(200), password: passwordSchema }),
    input,
  );
  const passwordHash = await hashPassword(data.password);
  await ctx.db.transaction(async (tx) => {
    const [t] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: ctx.now() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256(data.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, ctx.now()),
        ),
      )
      .returning();
    if (!t) throw new AppError('PRECONDITION_FAILED', 'This reset link is invalid or has expired.');
    await tx.update(users).set({ passwordHash }).where(eq(users.id, t.userId));
    await tx
      .update(sessions)
      .set({ revokedAt: ctx.now() })
      .where(and(eq(sessions.userId, t.userId), isNull(sessions.revokedAt)));
    await audit(ctx, t.userId, 'user.password_reset', { type: 'user', id: t.userId }, {}, tx);
  });
}

export async function changePassword(
  ctx: Ctx,
  userId: string,
  sessionId: string,
  input: unknown,
): Promise<void> {
  const data = parseOrThrow(
    z.object({ currentPassword: z.string().min(1).max(256), newPassword: passwordSchema }),
    input,
  );
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(data.currentPassword, user.passwordHash)))
    throw new AppError('UNAUTHENTICATED', 'Current password is incorrect.');
  await ctx.db
    .update(users)
    .set({ passwordHash: await hashPassword(data.newPassword) })
    .where(eq(users.id, userId));
  await revokeAllSessions(ctx, userId, sessionId);
  await audit(ctx, userId, 'user.password_changed', { type: 'user', id: userId });
}

export async function verifyUserPassword(
  ctx: Ctx,
  userId: string,
  password: string,
): Promise<boolean> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId));
  return Boolean(user && (await verifyPassword(password, user.passwordHash)));
}

export const settingsSchema = z.object({
  displayName: z.string().trim().max(120).optional(),
  country: z.string().trim().max(100).optional(),
  careerStageOverride: z
    .enum(['early', 'mid', 'senior', 'lead', 'executive'])
    .nullable()
    .optional(),
  aiAssistEnabled: z.boolean().optional(),
});

export async function updateSettings(
  ctx: Ctx,
  userId: string,
  input: unknown,
): Promise<PublicUser> {
  const data = parseOrThrow(settingsSchema, input);
  const [u] = await ctx.db.update(users).set(data).where(eq(users.id, userId)).returning();
  if (!u) throw new AppError('NOT_FOUND', 'User not found.');
  await audit(ctx, userId, 'user.settings_updated');
  return toPublic(u);
}
