import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import * as auth from '../services/auth';
import * as resumesSvc from '../services/resumes';
import * as ws from '../services/workspaces';
import * as analysis from '../services/analysis';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

// RI-4.4-04 job comparison, service level against real Postgres.

const RESUME = `Asha Rao
Backend Engineer
asha.rao@example.com | Chennai, India

SKILLS
Languages: Java, Python
Frameworks: Spring Boot
Cloud: AWS

EXPERIENCE
Backend Engineer | Ledgerly | Chennai
Jan 2018 – Present
• Built Java and Spring Boot services for invoicing used by 400 businesses
• Ran production workloads on AWS
`;

const JD_A = `Backend Engineer
Company: Alpha Pay
Location: Chennai, India

Requirements
- 4+ years of professional software development experience
- Strong experience with Java and Spring Boot
- Experience with Kafka
`;

const JD_B = `Platform Engineer
Company: Beta Cloud
Location: Remote

Requirements
- Strong experience with Java
- Experience with Kafka and Kubernetes
- Experience with AWS
`;

let env: TestEnv;
let userId: string;
let otherId: string;
let versionId: string;
const wsIds: string[] = [];

beforeAll(async () => {
  env = await setupTestEnv();
  userId = (
    await auth.signUp(env.ctx, { email: 'c@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  otherId = (
    await auth.signUp(env.ctx, { email: 'd@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  const bytes = await renderDocx(parseResumeText(RESUME).content, 'classic');
  const up = await resumesSvc.uploadResume(env.ctx, userId, { filename: 'asha.docx', bytes });
  await resumesSvc.finalizeVersion(env.ctx, userId, up.versionId);
  versionId = up.versionId;
  for (const jobText of [JD_A, JD_B]) {
    const w = await ws.createWorkspace(env.ctx, userId, {
      resumeVersionId: versionId,
      jobText,
      source: 'paste',
    });
    wsIds.push(w.id);
  }
  await analysis.runWorkspaceAnalysis(env.ctx, userId, wsIds[0]!);
  await analysis.runWorkspaceAnalysis(env.ctx, userId, wsIds[1]!);
});
afterAll(async () => env.cleanup());

describe('job comparison (RI-4.4-04)', () => {
  it('returns each job’s latest scores and the resume version they were computed against', async () => {
    const r = await ws.compareWorkspaces(env.ctx, userId, wsIds);
    expect(r.workspaces.map((w) => w.id).sort()).toEqual([...wsIds].sort());
    for (const w of r.workspaces) {
      expect(w.resumeVersionId).toBe(versionId);
      expect(typeof w.latestAnalysis?.jobMatchValue).toBe('number');
      expect(typeof w.latestAnalysis?.atsValue).toBe('number');
    }
    expect(r.sameResumeVersion).toBe(true);
  });

  it('reports skills the jobs share, with each job’s evidence state, and skills unique to one job', async () => {
    const r = await ws.compareWorkspaces(env.ctx, userId, wsIds);
    const shared = Object.fromEntries(r.overlap.shared.map((s) => [s.concept, s.jobs]));
    expect(Object.keys(shared)).toEqual(expect.arrayContaining(['Java', 'Kafka']));
    expect(shared.Java!.map((j) => j.id)).toEqual(
      wsIds.filter((id) => shared.Java!.some((j) => j.id === id)),
    );
    expect(shared.Java!.every((j) => j.state === 'demonstrated')).toBe(true);
    // Kafka is not on the resume, so it can never be demonstrated.
    expect(shared.Kafka!).toHaveLength(2);
    expect(shared.Kafka!.some((j) => j.state === 'demonstrated')).toBe(false);
    expect(r.overlap.unique[wsIds[1]!]).toContain('Kubernetes');
    expect(r.overlap.unique[wsIds[0]!]).not.toContain('Kubernetes');
    expect(r.overlap.unique[wsIds[0]!]).toContain('Spring Boot');
  });

  it('leaves out workspaces the user does not own and validates ids', async () => {
    const r = await ws.compareWorkspaces(env.ctx, otherId, wsIds);
    expect(r.workspaces).toEqual([]);
    expect(r.overlap.shared).toEqual([]);
    await expect(
      ws.compareWorkspaces(env.ctx, userId, ['not-a-uuid', wsIds[0]]),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(ws.compareWorkspaces(env.ctx, userId, [wsIds[0]])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
