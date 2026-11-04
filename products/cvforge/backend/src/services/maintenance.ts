import { lt } from 'drizzle-orm';
import type { Ctx } from '../context';
import {
  auditEvents,
  extensionPairingCodes,
  extensionRefreshTokens,
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
} from '../db/schema';
import { purgeExpiredExports } from './exports';

export interface MaintenanceResult {
  exports: number;
  sessions: number;
  passwordResetTokens: number;
  emailVerificationTokens: number;
  pairingCodes: number;
  refreshTokens: number;
  auditEvents: number;
}

/**
 * Retention sweep. Safe to run repeatedly (e.g. hourly from cron or a
 * scheduler): it only deletes rows past their expiry or retention window.
 */
export async function runMaintenance(ctx: Ctx): Promise<MaintenanceResult> {
  const now = ctx.now();
  const auditCutoff = new Date(now.getTime() - ctx.cfg.AUDIT_RETENTION_DAYS * 86_400_000);
  const exportsPurged = await purgeExpiredExports(ctx);
  const count = async (p: Promise<unknown[]>) => (await p).length;
  const result: MaintenanceResult = {
    exports: exportsPurged,
    sessions: await count(
      ctx.db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    ),
    passwordResetTokens: await count(
      ctx.db
        .delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, now))
        .returning({ id: passwordResetTokens.id }),
    ),
    emailVerificationTokens: await count(
      ctx.db
        .delete(emailVerificationTokens)
        .where(lt(emailVerificationTokens.expiresAt, now))
        .returning({ id: emailVerificationTokens.id }),
    ),
    pairingCodes: await count(
      ctx.db
        .delete(extensionPairingCodes)
        .where(lt(extensionPairingCodes.expiresAt, now))
        .returning({ id: extensionPairingCodes.id }),
    ),
    refreshTokens: await count(
      ctx.db
        .delete(extensionRefreshTokens)
        .where(lt(extensionRefreshTokens.expiresAt, now))
        .returning({ id: extensionRefreshTokens.id }),
    ),
    auditEvents: await count(
      ctx.db
        .delete(auditEvents)
        .where(lt(auditEvents.createdAt, auditCutoff))
        .returning({ id: auditEvents.id }),
    ),
  };
  ctx.log.info({ maintenance: result }, 'retention sweep complete');
  return result;
}
