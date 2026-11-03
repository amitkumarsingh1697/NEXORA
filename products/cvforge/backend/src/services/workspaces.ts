import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, parseOrThrow } from '@nexora/validation';
import {
  REQUIREMENT_KINDS,
  findConcepts,
  parseJobDescription,
  type Requirement,
} from '@nexora/cvforge-core';
import type { Ctx } from '../context';
import type { DbOrTx } from '../db/client';
import {
  analyses,
  clarificationQuestions,
  jobDescriptions,
  jobRequirements,
  requirementEvidence,
  suggestions,
  workspaces,
} from '../db/schema';
import { audit } from './audit';
import { personalOrgId } from './auth';
import { ownedVersion } from './resumes';

export const MAX_JD_CHARS = 50_000;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().max(200).optional(),
  resumeVersionId: z.uuid(),
  jobText: z
    .string()
    .trim()
    .min(50, 'Paste the full job description (at least 50 characters).')
    .max(MAX_JD_CHARS),
  source: z.enum(['manual', 'paste', 'extension']).default('paste'),
  sourceUrl: z.string().max(2000).default(''),
  sourceSite: z.string().max(100).default(''),
  title: z.string().trim().max(300).optional(),
  company: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
});

/** Only http(s) URLs are stored, and only as text: the server never fetches them (no SSRF surface). */
function cleanUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().slice(0, 2000) : '';
  } catch {
    return '';
  }
}

async function insertJob(
  tx: DbOrTx,
  workspaceId: string,
  userId: string,
  data: z.infer<typeof createWorkspaceSchema>,
) {
  const parsed = parseJobDescription(data.jobText, {
    title: data.title,
    company: data.company,
    location: data.location,
  });
  const [jd] = await tx
    .insert(jobDescriptions)
    .values({
      workspaceId,
      userId,
      source: data.source,
      sourceUrl: cleanUrl(data.sourceUrl),
      sourceSite: data.sourceSite,
      rawText: data.jobText,
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      country: parsed.country,
      workMode: parsed.workMode,
      employmentType: parsed.employmentType,
      salary: parsed.salary,
      workAuthorization: parsed.workAuthorization,
      languages: parsed.languages,
      minYearsOverall: parsed.minYearsOverall,
    })
    .returning();
  if (!jd) throw new AppError('INTERNAL', 'Could not save job description.');
  if (parsed.requirements.length) {
    await tx.insert(jobRequirements).values(
      parsed.requirements.map((r, i) => ({
        jobDescriptionId: jd.id,
        position: i,
        kind: r.kind,
        text: r.text.slice(0, 2000),
        concepts: r.concepts,
        minYears: r.minYears,
        importance: r.importance,
        hard: r.hard,
        sourceSection: r.sourceSection.slice(0, 200),
      })),
    );
  }
  return { jd, parsed };
}

export async function createWorkspace(ctx: Ctx, userId: string, input: unknown) {
  const data = parseOrThrow(createWorkspaceSchema, input);
  const version = await ownedVersion(ctx, userId, data.resumeVersionId);
  if (version.status !== 'finalized')
    throw new AppError('CONFLICT', 'Review and confirm your parsed resume before analysing jobs.');
  const orgId = await personalOrgId(ctx, userId);
  return ctx.db.transaction(async (tx) => {
    const preview = parseJobDescription(data.jobText, { title: data.title, company: data.company });
    const name =
      data.name || [preview.title, preview.company].filter(Boolean).join(' — ') || 'Untitled job';
    const [ws] = await tx
      .insert(workspaces)
      .values({
        userId,
        organizationId: orgId,
        resumeId: version.resumeId,
        baseVersionId: version.id,
        name: name.slice(0, 200),
      })
      .returning();
    if (!ws) throw new AppError('INTERNAL', 'Could not create workspace.');
    await insertJob(tx, ws.id, userId, data);
    await audit(
      ctx,
      userId,
      'workspace.created',
      { type: 'workspace', id: ws.id },
      { source: data.source, site: data.sourceSite },
      tx,
    );
    return ws;
  });
}

export async function ownedWorkspace(
  ctx: Ctx,
  userId: string,
  workspaceId: string,
  tx: DbOrTx = ctx.db,
) {
  const [w] = await tx
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)));
  if (!w) throw new AppError('NOT_FOUND', 'Workspace not found.');
  return w;
}

export async function workspaceJob(ctx: Ctx, workspaceId: string, tx: DbOrTx = ctx.db) {
  const [jd] = await tx
    .select()
    .from(jobDescriptions)
    .where(eq(jobDescriptions.workspaceId, workspaceId));
  if (!jd) throw new AppError('NOT_FOUND', 'Job description not found.');
  const reqs = await tx
    .select()
    .from(jobRequirements)
    .where(eq(jobRequirements.jobDescriptionId, jd.id))
    .orderBy(asc(jobRequirements.position));
  return { jd, requirements: reqs };
}

export function toCoreRequirement(r: typeof jobRequirements.$inferSelect): Requirement {
  return {
    id: r.id,
    kind: r.kind as Requirement['kind'],
    text: r.text,
    concepts: r.concepts as string[],
    minYears: r.minYears,
    importance: r.importance as Requirement['importance'],
    hard: r.hard,
    sourceSection: r.sourceSection,
  };
}

export async function listWorkspaces(ctx: Ctx, userId: string) {
  const rows = await ctx.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .orderBy(desc(workspaces.updatedAt));
  if (!rows.length) return [];
  const jds = await ctx.db
    .select({
      workspaceId: jobDescriptions.workspaceId,
      title: jobDescriptions.title,
      company: jobDescriptions.company,
      location: jobDescriptions.location,
      country: jobDescriptions.country,
      source: jobDescriptions.source,
    })
    .from(jobDescriptions)
    .where(
      inArray(
        jobDescriptions.workspaceId,
        rows.map((r) => r.id),
      ),
    );
  const latest = await ctx.db
    .select({
      workspaceId: analyses.workspaceId,
      jobMatchValue: analyses.jobMatchValue,
      atsValue: analyses.atsValue,
      evidenceQualityValue: analyses.evidenceQualityValue,
      counts: analyses.counts,
      createdAt: analyses.createdAt,
    })
    .from(analyses)
    .where(
      inArray(
        analyses.workspaceId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(analyses.createdAt));
  return rows.map((w) => ({
    ...w,
    job: jds.find((j) => j.workspaceId === w.id) ?? null,
    latestAnalysis: latest.find((a) => a.workspaceId === w.id) ?? null,
  }));
}

export async function getWorkspace(ctx: Ctx, userId: string, workspaceId: string) {
  const ws = await ownedWorkspace(ctx, userId, workspaceId);
  const { jd, requirements } = await workspaceJob(ctx, ws.id);
  const questions = await ctx.db
    .select()
    .from(clarificationQuestions)
    .where(eq(clarificationQuestions.workspaceId, ws.id))
    .orderBy(desc(clarificationQuestions.priority));
  const [analysis] = await ctx.db
    .select()
    .from(analyses)
    .where(eq(analyses.workspaceId, ws.id))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  const evidence = analysis
    ? await ctx.db
        .select()
        .from(requirementEvidence)
        .where(eq(requirementEvidence.analysisId, analysis.id))
    : [];
  const sugg = await ctx.db
    .select()
    .from(suggestions)
    .where(eq(suggestions.workspaceId, ws.id))
    .orderBy(asc(suggestions.createdAt));
  const baseVersion = await ownedVersion(ctx, userId, ws.baseVersionId);
  return {
    workspace: ws,
    job: jd,
    requirements,
    questions,
    analysis: analysis
      ? { ...analysis, stale: analysis.resumeVersionId !== ws.baseVersionId }
      : null,
    evidence,
    suggestions: sugg,
    baseVersion: {
      id: baseVersion.id,
      versionNumber: baseVersion.versionNumber,
      label: baseVersion.label,
      origin: baseVersion.origin,
    },
  };
}

/** Changing the job text re-parses requirements and clears derived analysis state. */
export async function updateJobText(ctx: Ctx, userId: string, workspaceId: string, input: unknown) {
  const data = parseOrThrow(
    createWorkspaceSchema.pick({ jobText: true, title: true, company: true, location: true }),
    input,
  );
  const ws = await ownedWorkspace(ctx, userId, workspaceId);
  const { jd } = await workspaceJob(ctx, ws.id);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(analyses).where(eq(analyses.workspaceId, ws.id));
    await tx.delete(jobDescriptions).where(eq(jobDescriptions.id, jd.id));
    await insertJob(tx, ws.id, userId, {
      ...data,
      source: jd.source as 'manual',
      sourceUrl: jd.sourceUrl,
      sourceSite: jd.sourceSite,
      resumeVersionId: ws.baseVersionId,
    });
    await tx.update(workspaces).set({ updatedAt: ctx.now() }).where(eq(workspaces.id, ws.id));
  });
}

export const requirementInputSchema = z.object({
  kind: z.enum(REQUIREMENT_KINDS),
  text: z.string().trim().min(3).max(2000),
  importance: z.enum(['required', 'preferred']),
  hard: z.boolean().default(false),
  minYears: z.number().int().min(0).max(40).nullable().default(null),
});

export async function addRequirement(
  ctx: Ctx,
  userId: string,
  workspaceId: string,
  input: unknown,
) {
  const data = parseOrThrow(requirementInputSchema, input);
  const ws = await ownedWorkspace(ctx, userId, workspaceId);
  const { jd, requirements } = await workspaceJob(ctx, ws.id);
  const [r] = await ctx.db
    .insert(jobRequirements)
    .values({
      jobDescriptionId: jd.id,
      position: requirements.length,
      ...data,
      concepts: findConcepts(data.text).map((c) => c.name),
      sourceSection: 'Added by you',
      userEdited: true,
    })
    .returning();
  return r;
}

async function ownedRequirement(ctx: Ctx, userId: string, requirementId: string) {
  const [row] = await ctx.db
    .select({ r: jobRequirements, ws: workspaces })
    .from(jobRequirements)
    .innerJoin(jobDescriptions, eq(jobDescriptions.id, jobRequirements.jobDescriptionId))
    .innerJoin(workspaces, eq(workspaces.id, jobDescriptions.workspaceId))
    .where(and(eq(jobRequirements.id, requirementId), eq(workspaces.userId, userId)));
  if (!row) throw new AppError('NOT_FOUND', 'Requirement not found.');
  return row;
}

export async function updateRequirement(
  ctx: Ctx,
  userId: string,
  requirementId: string,
  input: unknown,
) {
  const data = parseOrThrow(requirementInputSchema, input);
  await ownedRequirement(ctx, userId, requirementId);
  const [r] = await ctx.db
    .update(jobRequirements)
    .set({ ...data, concepts: findConcepts(data.text).map((c) => c.name), userEdited: true })
    .where(eq(jobRequirements.id, requirementId))
    .returning();
  return r;
}

export async function deleteRequirement(ctx: Ctx, userId: string, requirementId: string) {
  await ownedRequirement(ctx, userId, requirementId);
  await ctx.db.delete(jobRequirements).where(eq(jobRequirements.id, requirementId));
}

export async function deleteWorkspace(ctx: Ctx, userId: string, workspaceId: string) {
  await ownedWorkspace(ctx, userId, workspaceId);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await audit(ctx, userId, 'workspace.deleted', { type: 'workspace', id: workspaceId }, {}, tx);
  });
}

export async function setBaseVersion(
  ctx: Ctx,
  userId: string,
  workspaceId: string,
  versionId: string,
) {
  const ws = await ownedWorkspace(ctx, userId, workspaceId);
  const v = await ownedVersion(ctx, userId, versionId);
  if (v.resumeId !== ws.resumeId || v.status !== 'finalized')
    throw new AppError('VALIDATION_FAILED', 'Choose a finalized version of the same resume.');
  await ctx.db
    .update(workspaces)
    .set({ baseVersionId: v.id, updatedAt: ctx.now() })
    .where(eq(workspaces.id, ws.id));
}

/** Side-by-side comparison of the latest analysis in several workspaces. */
export async function compareWorkspaces(ctx: Ctx, userId: string, ids: string[]) {
  const list = await listWorkspaces(ctx, userId);
  return list
    .filter((w) => ids.includes(w.id))
    .map((w) => ({ id: w.id, name: w.name, job: w.job, latestAnalysis: w.latestAnalysis }));
}
