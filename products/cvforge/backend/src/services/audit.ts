import type { Ctx } from '../context';
import type { DbOrTx } from '../db/client';
import { auditEvents } from '../db/schema';

export type AuditAction =
  | 'user.signup'
  | 'user.login'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.password_reset_requested'
  | 'user.password_reset'
  | 'user.password_changed'
  | 'user.email_verification_sent'
  | 'user.email_verified'
  | 'user.sessions_revoked'
  | 'user.settings_updated'
  | 'user.data_exported'
  | 'user.deleted'
  | 'resume.uploaded'
  | 'resume.deleted'
  | 'version.finalized'
  | 'version.created'
  | 'workspace.created'
  | 'workspace.deleted'
  | 'analysis.run'
  | 'suggestion.decided'
  | 'export.created'
  | 'export.downloaded'
  | 'extension.pairing_code_created'
  | 'extension.paired'
  | 'extension.refresh_reuse_detected'
  | 'extension.device_revoked'
  | 'extension.job_captured';

/** Record an audit event. Metadata must not contain resume text, tokens or passwords. */
export async function audit(
  ctx: Pick<Ctx, 'db'>,
  userId: string | null,
  action: AuditAction,
  entity: { type?: string; id?: string } = {},
  metadata: Record<string, string | number | boolean | null> = {},
  tx?: DbOrTx,
): Promise<void> {
  await (tx ?? ctx.db)
    .insert(auditEvents)
    .values({ userId, action, entityType: entity.type ?? '', entityId: entity.id ?? '', metadata });
}
