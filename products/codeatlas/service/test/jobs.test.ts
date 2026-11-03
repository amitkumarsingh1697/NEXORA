import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo } from '../../core/test/fixture';
import { startService } from './helpers';

const root = makeFixtureRepo();
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('index cancellation and interrupted runs (S2-6)', () => {
  it('cancels a running re-index and keeps the previous index queryable', async () => {
    const svc = await startService();
    try {
      const added = await svc.api<{ repo: { id: number }; job: { id: string } }>('/api/repos', {
        method: 'POST',
        body: { path: root },
      });
      expect((await svc.waitForJob(added.body.job.id)).status).toBe('succeeded');
      const id = added.body.repo.id;
      const before = (await svc.api<{ hits: unknown[] }>(`/api/repos/${id}/search?q=listUsers`))
        .body;

      const re = await svc.api<{ job: { id: string } }>(`/api/repos/${id}/index`, {
        method: 'POST',
      });
      const cancelled = await svc.api<{ job: { status: string; error: string } }>(
        `/api/jobs/${re.body.job.id}`,
        { method: 'DELETE' },
      );
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.job.status).toBe('cancelled');
      expect(cancelled.body.job.error).toMatch(/previous index is unchanged/);

      expect((await svc.api(`/api/repos/${id}/search?q=listUsers`)).body).toEqual(before);
      const detail = await svc.api<{ runs: { status: string }[]; job: unknown }>(
        `/api/repos/${id}`,
      );
      expect(detail.body.job).toBeNull();
      expect(detail.body.runs.some((r) => r.status === 'running')).toBe(false);
      // A new index can start after a cancel.
      const again = await svc.api<{ job: { id: string } }>(`/api/repos/${id}/index`, {
        method: 'POST',
      });
      expect((await svc.waitForJob(again.body.job.id)).status).toBe('succeeded');
      expect((await svc.api('/api/jobs/nope', { method: 'DELETE' })).status).toBe(404);
    } finally {
      await svc.close();
    }
  }, 60_000);

  it('marks runs left "running" by a crash as failed on the next start', async () => {
    const first = await startService();
    const home = first.home;
    await first.close();
    const db = new DatabaseSync(join(home, 'codeatlas.db'));
    db.exec(
      "INSERT INTO repos (root, name, created_at) VALUES ('/x', 'x', 't'); INSERT INTO index_runs (repo_id, started_at, status) VALUES (1, 't', 'running');",
    );
    db.close();
    const second = await startService([], {}, home);
    try {
      const row = second.ctx.db.prepare('SELECT status, error FROM index_runs').get() as {
        status: string;
        error: string;
      };
      expect(row.status).toBe('failed');
      expect(row.error).toMatch(/Interrupted/);
    } finally {
      await second.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
