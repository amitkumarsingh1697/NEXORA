import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, parseOrThrow } from '@nexora/validation';
import {
  TEMPLATE_IDS,
  convertDocxToPdf,
  extractDocument,
  renderDocx,
  verifyExportText,
  PdfConversionError,
} from '@nexora/cvforge-core';
import type { Ctx } from '../context';
import { exportsTable } from '../db/schema';
import { hmac, safeEqual, sha256 } from '../lib/crypto';
import { audit } from './audit';
import { ownedVersion, storageUsage, userPrefix } from './resumes';

export const exportSchema = z.object({
  versionId: z.uuid(),
  template: z.enum(TEMPLATE_IDS),
  format: z.enum(['docx', 'pdf']),
});

/**
 * Export a finalized version. The file is re-extracted and verified to
 * contain exactly the approved content before it is stored.
 */
export async function createExport(ctx: Ctx, userId: string, input: unknown) {
  const data = parseOrThrow(exportSchema, input);
  const version = await ownedVersion(ctx, userId, data.versionId);
  if (version.status !== 'finalized')
    throw new AppError('CONFLICT', 'Only finalized versions can be exported.');
  const usage = await storageUsage(ctx, userId);
  if (usage.full)
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      'Your storage is full. Delete old exports first. Nothing was deleted automatically.',
    );
  const docx = await renderDocx(version.content, data.template);
  let bytes: Buffer = docx;
  if (data.format === 'pdf') {
    try {
      bytes = await convertDocxToPdf(docx);
    } catch (e) {
      if (e instanceof PdfConversionError) throw new AppError('UNAVAILABLE', e.message);
      throw e;
    }
  }
  const extracted = await extractDocument(bytes);
  const verification = verifyExportText(version.content, extracted.text);
  if (!verification.ok) {
    ctx.log.error({ missing: verification.missing.length }, 'export verification failed');
    throw new AppError(
      'INTERNAL',
      'The generated file did not match the approved version, so it was not saved.',
    );
  }
  const stored = await ctx.storage.put(`${userPrefix(userId)}/exports`, bytes);
  const [row] = await ctx.db
    .insert(exportsTable)
    .values({
      userId,
      resumeVersionId: version.id,
      template: data.template,
      format: data.format,
      storageKey: stored.key,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      verification,
      expiresAt: new Date(ctx.now().getTime() + ctx.cfg.EXPORT_RETENTION_DAYS * 86400_000),
    })
    .returning();
  if (!row) throw new AppError('INTERNAL', 'Could not record export.');
  await audit(
    ctx,
    userId,
    'export.created',
    { type: 'export', id: row.id },
    { format: data.format, template: data.template },
  );
  return { ...row, downloadUrl: signedDownloadPath(ctx, row.id) };
}

/** Short-lived HMAC-signed download path (5 minutes). Ownership is still checked on download. */
export function signedDownloadPath(ctx: Ctx, exportId: string, ttlSeconds = 300): string {
  const exp = Math.floor(ctx.now().getTime() / 1000) + ttlSeconds;
  const sig = hmac(ctx.cfg.APP_SECRET, `export:${exportId}:${exp}`);
  return `/api/exports/${exportId}/download?exp=${exp}&sig=${sig}`;
}

export function verifyDownloadSignature(
  ctx: Ctx,
  exportId: string,
  exp: string,
  sig: string,
): boolean {
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Math.floor(ctx.now().getTime() / 1000)) return false;
  return safeEqual(hmac(ctx.cfg.APP_SECRET, `export:${exportId}:${e}`), sig);
}

export async function listExports(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.userId, userId))
    .orderBy(desc(exportsTable.createdAt));
  return rows.map(({ storageKey: _k, ...r }) => ({
    ...r,
    downloadUrl: signedDownloadPath(ctx, r.id),
  }));
}

export async function downloadExport(
  ctx: Ctx,
  userId: string,
  exportId: string,
  exp: string,
  sig: string,
) {
  if (!verifyDownloadSignature(ctx, exportId, exp, sig))
    throw new AppError('FORBIDDEN', 'This download link is invalid or has expired.');
  const [row] = await ctx.db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, exportId), eq(exportsTable.userId, userId)));
  if (!row) throw new AppError('NOT_FOUND', 'Export not found.');
  const bytes = await ctx.storage.get(row.storageKey);
  if (sha256(bytes) !== row.sha256)
    throw new AppError('INTERNAL', 'The stored export failed its integrity check.');
  await audit(ctx, userId, 'export.downloaded', { type: 'export', id: row.id });
  const version = await ownedVersion(ctx, userId, row.resumeVersionId);
  const base = (version.content.personal.fullName || 'resume').replace(/[^\w-]+/g, '_');
  return {
    bytes,
    filename: `${base}_v${version.versionNumber}_${row.template}.${row.format}`,
    contentType:
      row.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

export async function deleteExport(ctx: Ctx, userId: string, exportId: string) {
  const [row] = await ctx.db
    .delete(exportsTable)
    .where(and(eq(exportsTable.id, exportId), eq(exportsTable.userId, userId)))
    .returning();
  if (!row) throw new AppError('NOT_FOUND', 'Export not found.');
  await ctx.storage.delete(row.storageKey);
}

/** Retention: remove exports past their expiry. Run on a schedule (see operations docs). */
export async function purgeExpiredExports(ctx: Ctx) {
  const rows = await ctx.db
    .delete(exportsTable)
    .where(lt(exportsTable.expiresAt, ctx.now()))
    .returning();
  for (const r of rows) await ctx.storage.delete(r.storageKey);
  return rows.length;
}
