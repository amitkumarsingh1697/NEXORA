import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { AppError, parseOrThrow } from '@nexora/validation';
import {
  extractDocument,
  renderDocx,
  runAnalysis,
  type CareerStage,
  type ClarificationResponse,
  type JobDescription,
  type LayoutSignals,
} from '@nexora/cvforge-core';
import type { Ctx } from '../context';
import {
  analyses,
  clarificationQuestions,
  requirementEvidence,
  resumeDocuments,
  users,
  workspaces,
} from '../db/schema';
import { audit } from './audit';
import { ownedVersion } from './resumes';
import { ownedWorkspace, toCoreRequirement, workspaceJob } from './workspaces';

/**
 * ATS signals: for the original parse we measure the uploaded document; for
 * versions created in CVForge we measure a real render of the Classic template.
 */
async function layoutFor(ctx: Ctx, version: Awaited<ReturnType<typeof ownedVersion>>) {
  if (version.origin === 'original_parse') {
    const [doc] = await ctx.db
      .select()
      .from(resumeDocuments)
      .where(eq(resumeDocuments.resumeId, version.resumeId));
    return {
      layout: (doc?.layout as LayoutSignals) ?? null,
      headings: (doc?.headings as { title: string; recognised: boolean }[]) ?? [],
      measuredOn: 'uploaded document',
    };
  }
  const ex = await extractDocument(await renderDocx(version.content, 'classic'));
  const headings = version.content.sectionOrder.map((s) => ({ title: s, recognised: true }));
  return { layout: ex.layout, headings, measuredOn: 'Classic Professional export of this version' };
}

export async function runWorkspaceAnalysis(ctx: Ctx, userId: string, workspaceId: string) {
  const ws = await ownedWorkspace(ctx, userId, workspaceId);
  const version = await ownedVersion(ctx, userId, ws.baseVersionId);
  const { jd, requirements } = await workspaceJob(ctx, ws.id);
  if (!requirements.length)
    throw new AppError(
      'PRECONDITION_FAILED',
      'No requirements were found in this job description. Add requirements before analysing.',
    );
  const qs = await ctx.db
    .select()
    .from(clarificationQuestions)
    .where(eq(clarificationQuestions.workspaceId, ws.id));
  const responses: ClarificationResponse[] = qs
    .filter((q) => q.response && q.answeredAt)
    .map((q) => ({
      requirementId: q.requirementId,
      response: q.response as ClarificationResponse['response'],
      text: q.responseText,
      answeredAt: (q.answeredAt as Date).toISOString(),
    }));
  const [user] = await ctx.db
    .select({ stage: users.careerStageOverride })
    .from(users)
    .where(eq(users.id, userId));
  const { layout, headings, measuredOn } = await layoutFor(ctx, version);
  const job: JobDescription = {
    title: jd.title,
    company: jd.company,
    location: jd.location,
    country: jd.country,
    workMode: jd.workMode as JobDescription['workMode'],
    employmentType: jd.employmentType as JobDescription['employmentType'],
    salary: jd.salary as JobDescription['salary'],
    workAuthorization: jd.workAuthorization as string[],
    languages: jd.languages as string[],
    minYearsOverall: jd.minYearsOverall,
    requirements: requirements.map(toCoreRequirement),
  };
  const result = runAnalysis({
    resume: version.content,
    job,
    responses,
    layout,
    headings,
    stageOverride: (user?.stage as CareerStage | null) ?? null,
    now: ctx.now(),
  });
  result.ats.basis += ` Measured on: ${measuredOn}.`;

  return ctx.db.transaction(async (tx) => {
    const [a] = await tx
      .insert(analyses)
      .values({
        workspaceId: ws.id,
        resumeVersionId: version.id,
        jobDescriptionId: jd.id,
        engineVersion: result.engineVersion,
        stage: result.stage,
        stageSource: result.stageSource,
        totalYears: String(result.totalYears),
        jobMatchValue: result.jobMatch.value,
        atsValue: result.ats.value,
        evidenceQualityValue: result.evidenceQuality.value,
        jobMatch: result.jobMatch,
        ats: result.ats,
        evidenceQuality: result.evidenceQuality,
        counts: result.counts,
      })
      .returning();
    if (!a) throw new AppError('INTERNAL', 'Could not save analysis.');
    await tx.insert(requirementEvidence).values(
      result.classifications.map((c) => ({
        analysisId: a.id,
        requirementId: c.requirementId,
        status: c.status,
        state: c.state,
        evidence: c.evidence,
        confirmationText: c.confirmation?.text ?? null,
        confirmationDate: c.confirmation ? new Date(c.confirmation.date) : null,
        reasoning: c.reasoning,
        requiresExplicitConfirmation: c.requiresExplicitConfirmation,
      })),
    );
    // Keep answered questions; refresh unanswered ones to match current pending requirements.
    const pendingIds = result.questions.map((q) => q.requirementId);
    await tx
      .delete(clarificationQuestions)
      .where(
        and(
          eq(clarificationQuestions.workspaceId, ws.id),
          isNull(clarificationQuestions.response),
          pendingIds.length
            ? notInArray(clarificationQuestions.requirementId, pendingIds)
            : undefined,
        ),
      );
    for (const q of result.questions) {
      await tx
        .insert(clarificationQuestions)
        .values({
          workspaceId: ws.id,
          requirementId: q.requirementId,
          question: q.question,
          rationale: q.rationale,
          priority: q.priority,
        })
        .onConflictDoUpdate({
          target: [clarificationQuestions.workspaceId, clarificationQuestions.requirementId],
          set: { question: q.question, rationale: q.rationale, priority: q.priority },
        });
    }
    await tx.update(workspaces).set({ updatedAt: ctx.now() }).where(eq(workspaces.id, ws.id));
    await audit(
      ctx,
      userId,
      'analysis.run',
      { type: 'analysis', id: a.id },
      { jobMatch: result.jobMatch.value, pending: result.counts.pending },
      tx,
    );
    return { analysis: a, result };
  });
}

export const answerSchema = z
  .object({
    response: z.enum(['yes', 'no', 'skipped', 'deferred']),
    text: z.string().trim().max(4000).default(''),
  })
  .refine((a) => a.response !== 'yes' || a.text.length >= 10, {
    message: 'Describe your experience in your own words (at least 10 characters).',
    path: ['text'],
  });

/** Record an answer, then re-run the deterministic analysis so classifications update immediately. */
export async function answerQuestion(ctx: Ctx, userId: string, questionId: string, input: unknown) {
  const data = parseOrThrow(answerSchema, input);
  const [row] = await ctx.db
    .select({ q: clarificationQuestions, ws: workspaces })
    .from(clarificationQuestions)
    .innerJoin(workspaces, eq(workspaces.id, clarificationQuestions.workspaceId))
    .where(and(eq(clarificationQuestions.id, questionId), eq(workspaces.userId, userId)));
  if (!row) throw new AppError('NOT_FOUND', 'Question not found.');
  await ctx.db
    .update(clarificationQuestions)
    .set({
      response: data.response === 'deferred' ? null : data.response,
      responseText: data.text,
      answeredAt: data.response === 'deferred' ? null : ctx.now(),
    })
    .where(eq(clarificationQuestions.id, questionId));
  return runWorkspaceAnalysis(ctx, userId, row.ws.id);
}

export async function latestAnalysis(ctx: Ctx, userId: string, workspaceId: string) {
  await ownedWorkspace(ctx, userId, workspaceId);
  const [a] = await ctx.db
    .select()
    .from(analyses)
    .where(eq(analyses.workspaceId, workspaceId))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  return a ?? null;
}

export async function analysisHistory(ctx: Ctx, userId: string, workspaceId: string) {
  await ownedWorkspace(ctx, userId, workspaceId);
  return ctx.db
    .select({
      id: analyses.id,
      createdAt: analyses.createdAt,
      jobMatchValue: analyses.jobMatchValue,
      atsValue: analyses.atsValue,
      evidenceQualityValue: analyses.evidenceQualityValue,
      resumeVersionId: analyses.resumeVersionId,
      counts: analyses.counts,
    })
    .from(analyses)
    .where(eq(analyses.workspaceId, workspaceId))
    .orderBy(desc(analyses.createdAt));
}
