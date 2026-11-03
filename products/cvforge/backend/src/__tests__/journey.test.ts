import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import * as auth from '../services/auth';
import * as resumesSvc from '../services/resumes';
import * as ws from '../services/workspaces';
import * as analysis from '../services/analysis';
import * as sugg from '../services/suggestions';
import * as exportsSvc from '../services/exports';
import { requirementEvidence, resumeDocuments } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

const RESUME = `Priya Sharma
Senior Software Engineer
priya.sharma@example.com | +91 98765 43210 | Pune, India

SUMMARY
Backend engineer focused on Java microservices for payments.

SKILLS
Languages: Java, SQL, Python
Frameworks: Spring Boot, Hibernate
Cloud: AWS, Docker

EXPERIENCE
Senior Software Engineer | FinPay Technologies | Pune
Jan 2019 – Present
• Designed and built Java microservices for payment processing handling 2 million transactions per day
• Responsible for developing REST APIs consumed by 3 partner banks
• Mentored 4 junior engineers and led code reviews
Software Engineer, DataWorks Ltd, Bengaluru
Jun 2015 - Dec 2018
• Worked on ETL pipelines using Python and PostgreSQL
• Implemented Kafka consumers for event ingestion

EDUCATION
B.Tech in Computer Science, Pune Institute of Technology, 2011 - 2015
`;

const JD = `Senior Backend Engineer
Company: Acme Payments
Location: Bengaluru, India (Hybrid)

Responsibilities
- Design and build scalable microservices for payment processing
- Mentor engineers and lead technical design reviews

Requirements
- 6+ years of professional software development experience
- Strong experience with Java and Spring Boot
- Experience with Kafka, Kubernetes and AWS
- Bachelor's degree in Computer Science or related field

Nice to have
- Experience with Terraform
`;

let env: TestEnv;
let userId: string;
let otherId: string;
let docxBytes: Buffer;

beforeAll(async () => {
  env = await setupTestEnv();
  userId = (
    await auth.signUp(env.ctx, { email: 'a@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  otherId = (
    await auth.signUp(env.ctx, { email: 'b@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  docxBytes = await renderDocx(parseResumeText(RESUME).content, 'classic');
});
afterAll(async () => env.cleanup());

describe('end-to-end resume journey (service level, real Postgres)', () => {
  const state: Record<string, string> = {};

  it('uploads and parses a DOCX, preserving the original exactly', async () => {
    const up = await resumesSvc.uploadResume(env.ctx, userId, {
      filename: 'priya.docx',
      bytes: docxBytes,
    });
    state.resumeId = up.resume.id;
    state.v1 = up.versionId;
    expect(up.confidence.overall).toBeGreaterThan(0.6);
    const orig = await resumesSvc.getOriginalFile(env.ctx, userId, up.resume.id);
    expect(sha256(orig.bytes)).toBe(sha256(docxBytes));
    const v = await resumesSvc.ownedVersion(env.ctx, userId, up.versionId);
    expect(v.status).toBe('draft');
    expect(v.content.experience).toHaveLength(2);
  });

  it('lets the user correct the draft, then finalizes it immutably', async () => {
    const v = await resumesSvc.ownedVersion(env.ctx, userId, state.v1!);
    const corrected = structuredClone(v.content);
    corrected.personal.headline = 'Senior Software Engineer (Payments)';
    await resumesSvc.updateDraft(env.ctx, userId, state.v1!, corrected);
    await resumesSvc.finalizeVersion(env.ctx, userId, state.v1!);
    await expect(
      resumesSvc.updateDraft(env.ctx, userId, state.v1!, corrected),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const [doc] = await env.ctx.db
      .select()
      .from(resumeDocuments)
      .where(eq(resumeDocuments.resumeId, state.resumeId!));
    expect(doc?.sha256).toBe(sha256(docxBytes)); // original metadata untouched
  });

  it('requires a finalized version to create a workspace', async () => {
    const draft = await resumesSvc.createDraftFrom(env.ctx, userId, state.v1!);
    await expect(
      ws.createWorkspace(env.ctx, userId, { resumeVersionId: draft!.id, jobText: JD }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await resumesSvc.deleteDraft(env.ctx, userId, draft!.id);
  });

  it('creates a workspace, parses requirements and runs an explainable analysis', async () => {
    const w = await ws.createWorkspace(env.ctx, userId, {
      resumeVersionId: state.v1!,
      jobText: JD,
      source: 'paste',
    });
    state.ws = w.id;
    const got = await ws.getWorkspace(env.ctx, userId, w.id);
    expect(got.job.title).toBe('Senior Backend Engineer');
    expect(got.requirements.length).toBeGreaterThan(5);
    const { result } = await analysis.runWorkspaceAnalysis(env.ctx, userId, w.id);
    expect(result.counts.total).toBe(got.requirements.length);
    expect(result.counts.pending).toBeGreaterThan(0);
    expect(result.jobMatch.value).not.toBeNull();
    expect(result.ats.basis).toMatch(/uploaded document/);
    const after = await ws.getWorkspace(env.ctx, userId, w.id);
    expect(after.questions.length).toBe(result.questions.length);
    expect(after.evidence.filter((e) => e.status === 'pending').length).toBe(result.counts.pending);
  });

  it('answering questions updates classifications; unanswered stay pending', async () => {
    const got = await ws.getWorkspace(env.ctx, userId, state.ws!);
    const k8sReq = got.requirements.find((r) => (r.concepts as string[]).includes('Kubernetes'))!;
    const tfReq = got.requirements.find((r) => (r.concepts as string[]).includes('Terraform'))!;
    const qK8s = got.questions.find((q) => q.requirementId === k8sReq.id)!;
    const qTf = got.questions.find((q) => q.requirementId === tfReq.id)!;
    await expect(
      analysis.answerQuestion(env.ctx, userId, qK8s.id, { response: 'yes', text: 'yes' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await analysis.answerQuestion(env.ctx, userId, qK8s.id, {
      response: 'yes',
      text: 'Deployed the FinPay payment services to Kubernetes clusters',
    });
    const { result } = await analysis.answerQuestion(env.ctx, userId, qTf.id, {
      response: 'skipped',
    });
    expect(result.classifications.find((c) => c.requirementId === k8sReq.id)?.state).toBe(
      'user_confirmed',
    );
    expect(result.classifications.find((c) => c.requirementId === tfReq.id)?.state).toBe('missing');
    const otherPending = result.classifications.filter((c) => c.status === 'pending');
    expect(otherPending.every((c) => c.state === null)).toBe(true);
  });

  it('database enforces the evidence state model', async () => {
    const [row] = await env.ctx.db.select().from(requirementEvidence).limit(1);
    const pgError = async (p: Promise<unknown>) => {
      try {
        await p;
        return 'no error';
      } catch (e) {
        return String((e as { cause?: Error }).cause?.message ?? (e as Error).message);
      }
    };
    expect(
      await pgError(
        env.ctx.db.execute(
          sql`update requirement_evidence set status = 'pending', state = 'demonstrated' where id = ${row!.id}`,
        ),
      ),
    ).toMatch(/requirement_evidence_state_chk/);
    expect(
      await pgError(
        env.ctx.db.execute(
          sql`update requirement_evidence set status = 'classified', state = 'user_confirmed', confirmation_text = null where id = ${row!.id}`,
        ),
      ),
    ).toMatch(/requirement_evidence_confirm_chk/);
  });

  it('generates suggestions; accepted ones form a new immutable version and rejected ones are excluded', async () => {
    const list = await sugg.generateWorkspaceSuggestions(env.ctx, userId, state.ws!);
    expect(list.length).toBeGreaterThan(2);
    const addBullet = list.find((s) => s.type === 'add_bullet')!;
    const modify = list.find((s) => s.type === 'modify_bullet')!;
    const skill = list.find((s) => s.type === 'add_skill')!;
    await sugg.decideSuggestion(env.ctx, userId, addBullet.id, { decision: 'accepted' });
    await sugg.decideSuggestion(env.ctx, userId, modify.id, {
      decision: 'accepted',
      editedProposed: 'Developed REST APIs consumed by 3 partner banks',
    });
    await sugg.decideSuggestion(env.ctx, userId, skill.id, { decision: 'rejected' });
    const { version, diff } = await sugg.createVersionFromSuggestions(env.ctx, userId, state.ws!, {
      label: 'Acme tailored',
    });
    state.v2 = version.id;
    expect(version.status).toBe('finalized');
    expect(version.parentVersionId).toBe(state.v1);
    const content = JSON.stringify(version.content);
    expect(content).toContain(addBullet.proposed);
    expect(content).toContain('Developed REST APIs consumed by 3 partner banks');
    expect(content).not.toContain('Responsible for developing REST APIs');
    expect(
      (version.content as { skills: { name: string }[] }).skills.map((s) => s.name),
    ).not.toContain(skill.proposed);
    expect(diff.counts.added).toBeGreaterThan(0);
    // Original version unchanged
    const v1 = await resumesSvc.ownedVersion(env.ctx, userId, state.v1!);
    expect(JSON.stringify(v1.content)).toContain('Responsible for developing REST APIs');
    // Applied suggestions cannot be re-decided
    await expect(
      sugg.decideSuggestion(env.ctx, userId, addBullet.id, { decision: 'rejected' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('compares versions with recorded changes', async () => {
    const cmp = await resumesSvc.compareVersions(env.ctx, userId, state.v1!, state.v2!);
    expect(cmp.diff.changes.length).toBeGreaterThan(0);
    expect(cmp.recordedChanges).toHaveLength(2);
    expect(
      cmp.recordedChanges.every(
        (c) => c.decision === 'accepted' && c.reason && c.parentVersionId === state.v1,
      ),
    ).toBe(true);
  });

  it('re-analysing the tailored version measures the CVForge template for ATS', async () => {
    const { result } = await analysis.runWorkspaceAnalysis(env.ctx, userId, state.ws!);
    expect(result.ats.basis).toMatch(/Classic Professional export/);
    expect(result.ats.value).toBeGreaterThanOrEqual(85);
  });

  it('exports DOCX and PDF that match the approved version, with signed downloads', async () => {
    const docx = await exportsSvc.createExport(env.ctx, userId, {
      versionId: state.v2!,
      template: 'modern',
      format: 'docx',
    });
    expect(docx.verification).toMatchObject({ ok: true });
    const pdf = await exportsSvc.createExport(env.ctx, userId, {
      versionId: state.v2!,
      template: 'classic',
      format: 'pdf',
    });
    const url = new URL(pdf.downloadUrl, 'http://x');
    const dl = await exportsSvc.downloadExport(
      env.ctx,
      userId,
      pdf.id,
      url.searchParams.get('exp')!,
      url.searchParams.get('sig')!,
    );
    expect(dl.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(dl.filename).toMatch(/_v2_classic\.pdf$/);
    await expect(
      exportsSvc.downloadExport(
        env.ctx,
        userId,
        pdf.id,
        url.searchParams.get('exp')!,
        'bad-signature',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    env.clock.now = new Date(env.clock.now.getTime() + 10 * 60_000);
    await expect(
      exportsSvc.downloadExport(
        env.ctx,
        userId,
        pdf.id,
        url.searchParams.get('exp')!,
        url.searchParams.get('sig')!,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      exportsSvc.createExport(env.ctx, userId, {
        versionId: (await resumesSvc.createDraftFrom(env.ctx, userId, state.v2!))!.id,
        template: 'modern',
        format: 'docx',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  }, 120_000);

  it('enforces tenant isolation on every resource', async () => {
    const got = await ws.getWorkspace(env.ctx, userId, state.ws!);
    const ex = await exportsSvc.listExports(env.ctx, userId);
    await expect(resumesSvc.getResume(env.ctx, otherId, state.resumeId!)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      resumesSvc.getOriginalFile(env.ctx, otherId, state.resumeId!),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(resumesSvc.ownedVersion(env.ctx, otherId, state.v1!)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(ws.getWorkspace(env.ctx, otherId, state.ws!)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      ws.createWorkspace(env.ctx, otherId, { resumeVersionId: state.v1!, jobText: JD }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      analysis.answerQuestion(env.ctx, otherId, got.questions[0]!.id, { response: 'no' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      sugg.decideSuggestion(env.ctx, otherId, got.suggestions[0]!.id, { decision: 'accepted' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      ws.deleteRequirement(env.ctx, otherId, got.requirements[0]!.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const u = new URL(ex[0]!.downloadUrl, 'http://x');
    await expect(
      exportsSvc.downloadExport(
        env.ctx,
        otherId,
        ex[0]!.id,
        u.searchParams.get('exp')!,
        u.searchParams.get('sig')!,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await resumesSvc.listResumes(env.ctx, otherId)).toEqual([]);
    expect(await ws.listWorkspaces(env.ctx, otherId)).toEqual([]);
  });

  it('rejects malicious and oversized uploads and respects the storage quota', async () => {
    await expect(
      resumesSvc.uploadResume(env.ctx, userId, {
        filename: 'evil.pdf',
        bytes: new TextEncoder().encode('<script>alert(1)</script>'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    await expect(
      resumesSvc.uploadResume(env.ctx, userId, {
        filename: 'big.pdf',
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    const saved = env.ctx.cfg.USER_STORAGE_QUOTA_BYTES;
    env.ctx.cfg.USER_STORAGE_QUOTA_BYTES = 1000;
    await expect(
      resumesSvc.uploadResume(env.ctx, userId, { filename: 'a.docx', bytes: docxBytes }),
    ).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    env.ctx.cfg.USER_STORAGE_QUOTA_BYTES = saved;
  });

  it('deleting a workspace leaves the resume and its versions intact', async () => {
    await ws.deleteWorkspace(env.ctx, userId, state.ws!);
    const r = await resumesSvc.getResume(env.ctx, userId, state.resumeId!);
    expect(r.versions.length).toBeGreaterThanOrEqual(2);
    await expect(ws.getWorkspace(env.ctx, userId, state.ws!)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
