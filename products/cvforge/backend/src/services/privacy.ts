import { eq, inArray } from 'drizzle-orm';
import { AppError } from '@nexora/validation';
import type { Ctx } from '../context';
import {
  analyses,
  auditEvents,
  clarificationQuestions,
  exportsTable,
  extensionDevices,
  jobDescriptions,
  jobRequirements,
  organizationMembers,
  organizations,
  requirementEvidence,
  resumeChanges,
  resumeDocuments,
  resumeVersions,
  resumes,
  suggestions,
  users,
  workspaces,
} from '../db/schema';
import { audit } from './audit';
import { verifyUserPassword } from './auth';
import { userPrefix } from './resumes';

/** Machine-readable export of everything stored about the user (excluding credential hashes). */
export async function exportAccountData(ctx: Ctx, userId: string) {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new AppError('NOT_FOUND', 'User not found.');
  const { passwordHash: _p, ...user } = u;
  const rs = await ctx.db.select().from(resumes).where(eq(resumes.userId, userId));
  const docs = await ctx.db
    .select()
    .from(resumeDocuments)
    .where(eq(resumeDocuments.userId, userId));
  const versions = await ctx.db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.userId, userId));
  const vIds = versions.map((v) => v.id);
  const changes = vIds.length
    ? await ctx.db.select().from(resumeChanges).where(inArray(resumeChanges.versionId, vIds))
    : [];
  const ws = await ctx.db.select().from(workspaces).where(eq(workspaces.userId, userId));
  const wsIds = ws.map((w) => w.id);
  const jds = wsIds.length
    ? await ctx.db.select().from(jobDescriptions).where(inArray(jobDescriptions.workspaceId, wsIds))
    : [];
  const reqs = jds.length
    ? await ctx.db
        .select()
        .from(jobRequirements)
        .where(
          inArray(
            jobRequirements.jobDescriptionId,
            jds.map((j) => j.id),
          ),
        )
    : [];
  const qs = wsIds.length
    ? await ctx.db
        .select()
        .from(clarificationQuestions)
        .where(inArray(clarificationQuestions.workspaceId, wsIds))
    : [];
  const an = wsIds.length
    ? await ctx.db.select().from(analyses).where(inArray(analyses.workspaceId, wsIds))
    : [];
  const ev = an.length
    ? await ctx.db
        .select()
        .from(requirementEvidence)
        .where(
          inArray(
            requirementEvidence.analysisId,
            an.map((a) => a.id),
          ),
        )
    : [];
  const sg = wsIds.length
    ? await ctx.db.select().from(suggestions).where(inArray(suggestions.workspaceId, wsIds))
    : [];
  const ex = await ctx.db.select().from(exportsTable).where(eq(exportsTable.userId, userId));
  const devices = await ctx.db
    .select()
    .from(extensionDevices)
    .where(eq(extensionDevices.userId, userId));
  const events = await ctx.db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
  await audit(ctx, userId, 'user.data_exported');
  return {
    exportedAt: ctx.now().toISOString(),
    format: 'cvforge-account-export/1',
    user,
    resumes: rs,
    originalDocuments: docs.map(({ storageKey: _k, ...d }) => d),
    resumeVersions: versions,
    resumeChanges: changes,
    workspaces: ws,
    jobDescriptions: jds,
    jobRequirements: reqs,
    clarificationQuestions: qs,
    analyses: an,
    requirementEvidence: ev,
    suggestions: sg,
    exports: ex.map(({ storageKey: _k, ...e }) => e),
    extensionDevices: devices,
    auditEvents: events,
  };
}

/** Permanently delete the account, all rows (via cascades) and all stored files. Requires the password. */
export async function deleteAccount(ctx: Ctx, userId: string, password: string) {
  if (!(await verifyUserPassword(ctx, userId, password)))
    throw new AppError('UNAUTHENTICATED', 'Password is incorrect.');
  const orgIds = (
    await ctx.db
      .select({ id: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
  ).map((o) => o.id);
  await ctx.db.transaction(async (tx) => {
    // Break RESTRICT references before cascading deletes.
    await tx.delete(workspaces).where(eq(workspaces.userId, userId));
    await tx
      .update(resumeVersions)
      .set({ parentVersionId: null })
      .where(eq(resumeVersions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
    for (const id of orgIds) {
      const remaining = await tx
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, id));
      if (!remaining.length) await tx.delete(organizations).where(eq(organizations.id, id));
    }
    // Anonymised record that a deletion happened (no user id or email).
    await audit(ctx, null, 'user.deleted', {}, {}, tx);
  });
  await ctx.storage.deletePrefix(userPrefix(userId));
}
