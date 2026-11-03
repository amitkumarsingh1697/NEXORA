import { and, asc, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, parseOrThrow } from '@nexora/validation';
import {
  DocumentRejectedError,
  detectHeading,
  diffResumes,
  extractDocument,
  parseResumeText,
  resumeContentSchema,
  type ResumeContent,
} from '@nexora/cvforge-core';
import type { Ctx } from '../context';
import type { DbOrTx } from '../db/client';
import {
  exportsTable,
  resumeChanges,
  resumeDocuments,
  resumeSections,
  resumeVersions,
  resumes,
  workspaces,
} from '../db/schema';
import { canonicalJson, sha256 } from '../lib/crypto';
import { audit } from './audit';
import { personalOrgId } from './auth';

export function userPrefix(userId: string) {
  return `users/${userId}`;
}

export async function storageUsage(ctx: Ctx, userId: string) {
  const used = await ctx.storage.usage(userPrefix(userId));
  const quota = ctx.cfg.USER_STORAGE_QUOTA_BYTES;
  return { used, quota, warning: used >= quota * 0.8, full: used >= quota };
}

export async function uploadResume(
  ctx: Ctx,
  userId: string,
  input: { filename: string; bytes: Uint8Array; title?: string },
) {
  const filename = input.filename.replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'resume';
  const usage = await storageUsage(ctx, userId);
  if (usage.used + input.bytes.length > usage.quota) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      'Your storage is full. Delete old resumes or exports to upload more. Nothing was deleted automatically.',
    );
  }
  let extraction;
  try {
    extraction = await extractDocument(input.bytes);
  } catch (e) {
    if (e instanceof DocumentRejectedError) {
      throw new AppError(
        e.reason === 'too_large' ? 'PAYLOAD_TOO_LARGE' : 'UNSUPPORTED_MEDIA',
        e.message,
      );
    }
    throw e;
  }
  const parsed = parseResumeText(extraction.text);
  const headings = extraction.lines
    .map((l) => ({ l, h: detectHeading(l) }))
    .filter((x) => x.h)
    .map((x) => ({ title: x.l, recognised: x.h !== 'custom' }));
  const orgId = await personalOrgId(ctx, userId);
  const stored = await ctx.storage.put(`${userPrefix(userId)}/originals`, input.bytes);
  try {
    return await ctx.db.transaction(async (tx) => {
      const [resume] = await tx
        .insert(resumes)
        .values({
          userId,
          organizationId: orgId,
          title: input.title?.trim().slice(0, 200) || parsed.content.personal.fullName || filename,
        })
        .returning();
      if (!resume) throw new AppError('INTERNAL', 'Could not save resume.');
      await tx.insert(resumeDocuments).values({
        resumeId: resume.id,
        userId,
        originalFilename: filename,
        kind: extraction.kind,
        sizeBytes: input.bytes.length,
        sha256: sha256(input.bytes),
        storageKey: stored.key,
        extractedText: extraction.text,
        layout: extraction.layout,
        headings,
        parseConfidence: parsed.confidence,
        parseWarnings: [...extraction.warnings, ...parsed.warnings],
        unassignedLines: parsed.unassignedLines,
      });
      const [version] = await tx
        .insert(resumeVersions)
        .values({
          resumeId: resume.id,
          userId,
          versionNumber: 1,
          label: 'Parsed from upload',
          origin: 'original_parse',
          status: 'draft',
          content: parsed.content,
          contentHash: sha256(canonicalJson(parsed.content)),
        })
        .returning();
      await audit(
        ctx,
        userId,
        'resume.uploaded',
        { type: 'resume', id: resume.id },
        { kind: extraction.kind, size: input.bytes.length },
        tx,
      );
      return {
        resume,
        versionId: version?.id as string,
        confidence: parsed.confidence,
        warnings: [...extraction.warnings, ...parsed.warnings],
        unassignedLines: parsed.unassignedLines,
      };
    });
  } catch (e) {
    await ctx.storage.delete(stored.key); // do not leave orphaned files
    throw e;
  }
}

async function ownedResume(ctx: Ctx, userId: string, resumeId: string, tx: DbOrTx = ctx.db) {
  const [r] = await tx
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
  if (!r) throw new AppError('NOT_FOUND', 'Resume not found.');
  return r;
}

export async function ownedVersion(
  ctx: Ctx,
  userId: string,
  versionId: string,
  tx: DbOrTx = ctx.db,
) {
  const [v] = await tx
    .select()
    .from(resumeVersions)
    .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.userId, userId)));
  if (!v) throw new AppError('NOT_FOUND', 'Resume version not found.');
  return { ...v, content: resumeContentSchema.parse(v.content) };
}

export async function listResumes(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt));
  const out = [];
  for (const r of rows) {
    const versions = await ctx.db
      .select({
        id: resumeVersions.id,
        versionNumber: resumeVersions.versionNumber,
        status: resumeVersions.status,
        origin: resumeVersions.origin,
        label: resumeVersions.label,
        createdAt: resumeVersions.createdAt,
      })
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, r.id))
      .orderBy(asc(resumeVersions.versionNumber));
    out.push({ ...r, versions });
  }
  return out;
}

export async function getResume(ctx: Ctx, userId: string, resumeId: string) {
  const r = await ownedResume(ctx, userId, resumeId);
  const [doc] = await ctx.db
    .select()
    .from(resumeDocuments)
    .where(eq(resumeDocuments.resumeId, r.id));
  const versions = await ctx.db
    .select({
      id: resumeVersions.id,
      versionNumber: resumeVersions.versionNumber,
      parentVersionId: resumeVersions.parentVersionId,
      status: resumeVersions.status,
      origin: resumeVersions.origin,
      label: resumeVersions.label,
      workspaceId: resumeVersions.workspaceId,
      createdAt: resumeVersions.createdAt,
      finalizedAt: resumeVersions.finalizedAt,
    })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, r.id))
    .orderBy(asc(resumeVersions.versionNumber));
  const {
    storageKey: _k,
    extractedText: _t,
    ...docMeta
  } = doc ?? ({} as typeof resumeDocuments.$inferSelect);
  return { resume: r, document: doc ? docMeta : null, versions };
}

export async function getOriginalFile(ctx: Ctx, userId: string, resumeId: string) {
  await ownedResume(ctx, userId, resumeId);
  const [doc] = await ctx.db
    .select()
    .from(resumeDocuments)
    .where(eq(resumeDocuments.resumeId, resumeId));
  if (!doc) throw new AppError('NOT_FOUND', 'Original document not found.');
  const bytes = await ctx.storage.get(doc.storageKey);
  if (sha256(bytes) !== doc.sha256)
    throw new AppError('INTERNAL', 'The stored original failed its integrity check.');
  return { bytes, filename: doc.originalFilename, kind: doc.kind };
}

/** Drafts can be edited in place; finalized versions never can. */
export async function updateDraft(ctx: Ctx, userId: string, versionId: string, input: unknown) {
  const content = parseOrThrow(resumeContentSchema, input);
  const v = await ownedVersion(ctx, userId, versionId);
  if (v.status !== 'draft')
    throw new AppError(
      'CONFLICT',
      'Finalized versions cannot be modified. Create a new version to make changes.',
    );
  const [u] = await ctx.db
    .update(resumeVersions)
    .set({ content, contentHash: sha256(canonicalJson(content)) })
    .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.status, 'draft')))
    .returning();
  if (!u) throw new AppError('CONFLICT', 'Version was finalized concurrently.');
  return u;
}

export async function writeSections(tx: DbOrTx, versionId: string, content: ResumeContent) {
  const rows = content.sectionOrder.map((key, position) => ({
    versionId,
    sectionKey: key,
    position,
    content: content[key] as unknown,
  }));
  rows.push({
    versionId,
    sectionKey: 'personal' as never,
    position: -1,
    content: content.personal,
  });
  await tx.insert(resumeSections).values(rows);
}

export async function finalizeVersion(ctx: Ctx, userId: string, versionId: string, label?: string) {
  const v = await ownedVersion(ctx, userId, versionId);
  if (v.status === 'finalized') return v;
  return ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(resumeVersions)
      .set({ status: 'finalized', finalizedAt: ctx.now(), label: label?.slice(0, 200) ?? v.label })
      .where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.status, 'draft')))
      .returning();
    if (!u) throw new AppError('CONFLICT', 'Version was finalized concurrently.');
    await writeSections(tx, versionId, v.content);
    if (v.parentVersionId) {
      const parent = await ownedVersion(ctx, userId, v.parentVersionId, tx);
      const diff = diffResumes(parent.content, v.content);
      if (diff.changes.length) {
        await tx.insert(resumeChanges).values(
          diff.changes.map((c) => ({
            versionId,
            parentVersionId: parent.id,
            changeType: c.type,
            section: c.section,
            label: c.label,
            original: c.before,
            proposed: c.after,
            reason: 'Manual edit',
            evidence: [],
            decision: 'manual_edit',
          })),
        );
      }
    }
    await audit(
      ctx,
      userId,
      'version.finalized',
      { type: 'resume_version', id: versionId },
      {},
      tx,
    );
    return { ...u, content: v.content };
  });
}

export async function nextVersionNumber(tx: DbOrTx, resumeId: string) {
  const [row] = await tx
    .select({ n: max(resumeVersions.versionNumber) })
    .from(resumeVersions)
    .where(eq(resumeVersions.resumeId, resumeId));
  return (row?.n ?? 0) + 1;
}

/** Start a new editable draft from a finalized version. */
export async function createDraftFrom(
  ctx: Ctx,
  userId: string,
  versionId: string,
  label = 'Manual edits',
) {
  const v = await ownedVersion(ctx, userId, versionId);
  if (v.status !== 'finalized')
    throw new AppError('CONFLICT', 'Only finalized versions can be used as a base.');
  return ctx.db.transaction(async (tx) => {
    const [n] = await tx
      .insert(resumeVersions)
      .values({
        resumeId: v.resumeId,
        userId,
        parentVersionId: v.id,
        versionNumber: await nextVersionNumber(tx, v.resumeId),
        label,
        origin: 'edit',
        status: 'draft',
        content: v.content,
        contentHash: v.contentHash,
      })
      .returning();
    await audit(
      ctx,
      userId,
      'version.created',
      { type: 'resume_version', id: n?.id },
      { origin: 'edit' },
      tx,
    );
    return n;
  });
}

export async function deleteDraft(ctx: Ctx, userId: string, versionId: string) {
  const v = await ownedVersion(ctx, userId, versionId);
  if (v.status !== 'draft' || v.origin === 'original_parse')
    throw new AppError('CONFLICT', 'Only edit drafts can be discarded.');
  await ctx.db.delete(resumeVersions).where(eq(resumeVersions.id, versionId));
}

export async function compareVersions(ctx: Ctx, userId: string, fromId: string, toId: string) {
  const a = await ownedVersion(ctx, userId, fromId);
  const b = await ownedVersion(ctx, userId, toId);
  if (a.resumeId !== b.resumeId)
    throw new AppError('VALIDATION_FAILED', 'Versions belong to different resumes.');
  const changes = await ctx.db
    .select()
    .from(resumeChanges)
    .where(eq(resumeChanges.versionId, b.id));
  return {
    from: { id: a.id, versionNumber: a.versionNumber, label: a.label },
    to: { id: b.id, versionNumber: b.versionNumber, label: b.label },
    diff: diffResumes(a.content, b.content),
    recordedChanges: b.parentVersionId === a.id ? changes : [],
  };
}

export async function deleteResume(ctx: Ctx, userId: string, resumeId: string) {
  await ownedResume(ctx, userId, resumeId);
  const [doc] = await ctx.db
    .select()
    .from(resumeDocuments)
    .where(eq(resumeDocuments.resumeId, resumeId));
  // Remove exports of this resume's versions from storage first.
  const versionIds = (
    await ctx.db
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(eq(resumeVersions.resumeId, resumeId))
  ).map((v) => v.id);
  for (const vid of versionIds) {
    const ex = await ctx.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.resumeVersionId, vid));
    for (const e of ex) await ctx.storage.delete(e.storageKey);
  }
  await ctx.db.transaction(async (tx) => {
    // Workspaces reference versions with RESTRICT; delete them explicitly first.
    await tx.delete(workspaces).where(eq(workspaces.resumeId, resumeId));
    await tx
      .update(resumeVersions)
      .set({ parentVersionId: null })
      .where(eq(resumeVersions.resumeId, resumeId));
    await tx.delete(resumes).where(eq(resumes.id, resumeId));
    await audit(ctx, userId, 'resume.deleted', { type: 'resume', id: resumeId }, {}, tx);
  });
  if (doc) await ctx.storage.delete(doc.storageKey);
}

export const versionLabelSchema = z.object({ label: z.string().trim().max(200).optional() });
