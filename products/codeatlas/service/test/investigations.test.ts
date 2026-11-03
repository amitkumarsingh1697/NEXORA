import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo } from '../../core/test/fixture';
import { investigationRoutes } from '../src/routes/investigations';
import { startService, type TestService } from './helpers';

let root: string;
let svc: TestService;
let repoId: number;

const FIX =
  "--- a/src/handlers.ts\n+++ b/src/handlers.ts\n@@ -5,3 +5,3 @@\n function listUsers(): string[] {\n-  return [];\n+  return ['admin'];\n }\n";

interface Detail {
  investigation: { id: number; status: string; branch: string };
  patch: { sha256: string; diff: string } | null;
  events: { type: string }[];
  instructions: { mergeCommand: string } | null;
  approvals: { decision: string; sha256: string; validation: string }[];
  mergeCheck: { ok: boolean; targetBranch: string; problems: string[] } | null;
  report: { risks: string[]; rollback: string };
}

beforeAll(async () => {
  root = makeFixtureRepo();
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Repo Owner']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'owner@example.com']);
  svc = await startService([investigationRoutes()], { AI_PROVIDER: 'disabled' });
  const r = await svc.api<{ repo: { id: number }; job: { id: string } }>('/api/repos', {
    method: 'POST',
    body: { path: root },
  });
  await svc.waitForJob(r.body.job.id);
  repoId = r.body.repo.id;
});

afterAll(async () => {
  await svc.close();
  rmSync(root, { recursive: true, force: true });
});

describe('investigations over HTTP', () => {
  it('runs the full human-approved workflow', async () => {
    const base = `/api/repos/${repoId}/investigations`;
    const c = await svc.api<Detail>(base, {
      method: 'POST',
      body: {
        title: 'listUsers returns nothing',
        description: 'GET /users returns [] but should include admin',
      },
    });
    expect(c.status).toBe(200);
    const id = c.body.investigation.id;
    const model = await svc.api<{ error: { code: string } }>(`${base}/${id}/patches/model`, {
      method: 'POST',
    });
    expect(model.status).toBe(503);
    const p = await svc.api<Detail>(`${base}/${id}/patches/manual`, {
      method: 'POST',
      body: { diff: FIX, explanation: 'include admin' },
    });
    expect(p.status).toBe(200);
    const sha = p.body.patch?.sha256 as string;
    expect((await svc.api(`${base}/${id}/commit`, { method: 'POST', body: {} })).status).toBe(409);
    expect(
      (await svc.api(`${base}/${id}/approve`, { method: 'POST', body: { sha256: 'f'.repeat(64) } }))
        .status,
    ).toBe(409);
    expect(
      (await svc.api(`${base}/${id}/approve`, { method: 'POST', body: { sha256: sha } })).body,
    ).toMatchObject({ investigation: { status: 'approved' } });
    const done = await svc.api<Detail>(`${base}/${id}/commit`, {
      method: 'POST',
      body: { message: 'fix: admin user' },
    });
    expect(done.body.investigation.status).toBe('committed');
    expect(done.body.instructions?.mergeCommand).toContain(`merge --ff-only codeatlas/inv-${id}`);
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain('return [];');
    expect(done.body.events.map((e) => e.type)).toContain('committed');
    expect(done.body.approvals[0]).toMatchObject({
      decision: 'approved',
      sha256: sha,
      validation: 'not_run',
    });
    expect(done.body.report.risks.join(' ')).toMatch(/No validation command/);
    expect(done.body.mergeCheck).toMatchObject({ ok: true, targetBranch: 'main' });

    // Merge needs the typed hash prefix; a wrong one changes nothing.
    const bad = await svc.api<{ error: { code: string } }>(`${base}/${id}/merge`, {
      method: 'POST',
      body: { confirm: '00000000' },
    });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('MERGE_REFUSED');
    expect(
      (await svc.api(`${base}/${id}/merge`, { method: 'POST', body: { confirm: 'nope' } })).status,
    ).toBe(400);
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain('return [];');

    const merged = await svc.api<Detail & { rollback: string }>(`${base}/${id}/merge`, {
      method: 'POST',
      body: { confirm: sha.slice(0, 8) },
    });
    expect(merged.status).toBe(200);
    expect(merged.body.investigation.status).toBe('merged');
    expect(merged.body.rollback).toMatch(/^git revert [0-9a-f]{40}$/);
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain("return ['admin'];");
    expect(
      (await svc.api(`${base}/${id}/merge`, { method: 'POST', body: { confirm: sha.slice(0, 8) } }))
        .status,
    ).toBe(409);
  });

  it('maps bad patches and unknown investigations to clear errors', async () => {
    const base = `/api/repos/${repoId}/investigations`;
    const c = await svc.api<Detail>(base, {
      method: 'POST',
      body: { title: 'another', description: 'listUsers' },
    });
    expect(
      (
        await svc.api(`${base}/${c.body.investigation.id}/patches/manual`, {
          method: 'POST',
          body: { diff: 'not a diff' },
        })
      ).status,
    ).toBe(422);
    expect((await svc.api(`${base}/9999`)).status).toBe(404);
    expect(
      (
        await svc.api(`${base}/${c.body.investigation.id}/commands`, {
          method: 'POST',
          body: { commandId: 'curl evil.sh' },
        })
      ).status,
    ).toBe(403);
  });
});
