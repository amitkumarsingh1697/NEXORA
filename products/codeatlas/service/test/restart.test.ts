import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo } from '../../core/test/fixture';
import { investigationRoutes } from '../src/routes/investigations';
import { startService } from './helpers';

const root = makeFixtureRepo();
execFileSync('git', ['-C', root, 'config', 'user.name', 'Repo Owner']);
execFileSync('git', ['-C', root, 'config', 'user.email', 'owner@example.com']);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('restart survival (DATA-9-01)', () => {
  it('keeps repositories, index, views and investigations across a service restart', async () => {
    const first = await startService([investigationRoutes()]);
    const added = await first.api<{ repo: { id: number }; job: { id: string } }>('/api/repos', {
      method: 'POST',
      body: { path: root },
    });
    expect((await first.waitForJob(added.body.job.id)).status).toBe('succeeded');
    const id = added.body.repo.id;
    const inv = await first.api<{ investigation: { id: number } }>(
      `/api/repos/${id}/investigations`,
      {
        method: 'POST',
        body: { title: 'listUsers is empty', description: 'listUsers returns []' },
      },
    );
    const before = {
      repos: (await first.api('/api/repos')).body,
      modules: (await first.api(`/api/repos/${id}/views/modules`)).body,
      risk: (await first.api(`/api/repos/${id}/views/risk`)).body,
      search: (await first.api(`/api/repos/${id}/search?q=listUsers`)).body,
      inv: (await first.api(`/api/repos/${id}/investigations/${inv.body.investigation.id}`)).body,
    };
    // Guard against comparing two empty or error responses.
    expect(JSON.stringify(before.search)).toContain('src/handlers.ts');
    expect(JSON.stringify(before.modules)).toContain('fixture-app');
    expect(JSON.stringify(before.inv)).toContain('listUsers is empty');
    expect(JSON.stringify(before.risk)).not.toContain('"error"');
    const token = first.ctx.token;
    await first.close(); // closes the database

    const second = await startService([investigationRoutes()], {}, first.home);
    try {
      expect(second.ctx.token).toBe(token);
      expect((await second.api('/api/repos')).body).toEqual(before.repos);
      expect((await second.api(`/api/repos/${id}/views/modules`)).body).toEqual(before.modules);
      expect((await second.api(`/api/repos/${id}/views/risk`)).body).toEqual(before.risk);
      expect((await second.api(`/api/repos/${id}/search?q=listUsers`)).body).toEqual(before.search);
      expect(
        (await second.api(`/api/repos/${id}/investigations/${inv.body.investigation.id}`)).body,
      ).toEqual(before.inv);
    } finally {
      await second.close();
      rmSync(first.home, { recursive: true, force: true });
    }
  });
});
