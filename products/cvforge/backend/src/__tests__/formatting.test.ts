import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import * as auth from '../services/auth';
import * as resumesSvc from '../services/resumes';
import { setupTestEnv, PASSWORD, type TestEnv } from './helpers';

// RI-4.8-05: formatting choices are stored on the version and diffed.

let env: TestEnv;
let userId: string;
let v1: string;
let resumeId: string;

beforeAll(async () => {
  env = await setupTestEnv();
  userId = (
    await auth.signUp(env.ctx, { email: 'f@example.com', password: PASSWORD, acceptPrivacy: true })
  ).id;
  const bytes = await renderDocx(
    parseResumeText('Ravi Kumar\nravi@example.com\n\nSKILLS\nJava, SQL\n').content,
    'classic',
  );
  const up = await resumesSvc.uploadResume(env.ctx, userId, { filename: 'ravi.docx', bytes });
  v1 = up.versionId;
  resumeId = up.resume.id;
  await resumesSvc.finalizeVersion(env.ctx, userId, v1);
});
afterAll(async () => env.cleanup());

describe('formatting changes (RI-4.8-05)', () => {
  it('stores the preferred template on a new version and diffs it with section order', async () => {
    const draft = await resumesSvc.createDraftFrom(env.ctx, userId, v1);
    const base = await resumesSvc.ownedVersion(env.ctx, userId, draft!.id);
    const next = structuredClone(base.content);
    next.template = 'modern';
    next.sectionOrder = [...base.content.sectionOrder].reverse();
    await resumesSvc.updateDraft(env.ctx, userId, draft!.id, next);
    await resumesSvc.finalizeVersion(env.ctx, userId, draft!.id);

    const stored = await resumesSvc.ownedVersion(env.ctx, userId, draft!.id);
    expect(stored.content.template).toBe('modern');
    const list = await resumesSvc.listResumes(env.ctx, userId);
    const versions = list.find((r) => r.id === resumeId)!.versions;
    expect(versions.map((v) => v.template)).toEqual([null, 'modern']);

    const cmp = await resumesSvc.compareVersions(env.ctx, userId, v1, draft!.id);
    const formatting = cmp.diff.changes.filter((c) => c.section === 'formatting');
    expect(formatting.map((c) => c.label).sort()).toEqual(['Section order', 'Template']);
    expect(cmp.diff.changes.filter((c) => c.section !== 'formatting')).toEqual([]);
  });

  it('rejects an unknown template at the boundary', async () => {
    const draft = await resumesSvc.createDraftFrom(env.ctx, userId, v1);
    const base = await resumesSvc.ownedVersion(env.ctx, userId, draft!.id);
    await expect(
      resumesSvc.updateDraft(env.ctx, userId, draft!.id, { ...base.content, template: 'fancy' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
