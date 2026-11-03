import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelProvider } from '@nexora/ai';
import { makeFixtureRepo } from '../../core/test/fixture';
import { chatRoutes } from '../src/routes/chat';
import { startService, type TestService } from './helpers';

const fake: ModelProvider = {
  id: 'fake',
  local: true,
  capabilities: async () => ({
    provider: 'fake',
    available: true,
    model: 'fake-1',
    models: [],
    contextWindowTokens: 32000,
    supportsJsonSchema: true,
    local: true,
  }),
  generate: async () => ({
    text: JSON.stringify({
      answer: 'handleUsers returns listUsers() [S1].',
      citations: [{ source: 'S1' }],
      confidence: 'high',
      gaps: [],
    }),
    model: 'fake-1',
    provider: 'fake',
    durationMs: 1,
  }),
};

interface Summary {
  counts: Record<string, number>;
  indexing: { succeeded: number; last: { files: number; symbols: number; relationships: number } };
  questions: { asked: number; averageSources: number };
  feedback: { up: number; down: number; recentNotes: { note: string }[] };
  findings: { cycles: number; sensitiveConfig: number };
}

let root: string;
let svc: TestService;

beforeAll(async () => {
  root = makeFixtureRepo();
  svc = await startService([chatRoutes(fake)]);
});
afterAll(async () => {
  await svc.close();
  rmSync(root, { recursive: true, force: true });
});

describe('settings, first run and local analytics (S2-1)', () => {
  it('shows the welcome screen only on first run, until dismissed', async () => {
    const s = await svc.api<{ firstRun: boolean; dataLocation: string; analytics: unknown }>(
      '/api/settings',
    );
    expect(s.body.firstRun).toBe(true);
    expect(s.body.dataLocation).toBe(svc.home);
    expect(s.body.analytics).toEqual({ storedLocally: true, transmitted: false });
    await svc.api('/api/settings/welcome', { method: 'POST' });
    expect((await svc.api<{ firstRun: boolean }>('/api/settings')).body.firstRun).toBe(false);
  });

  it('records indexing, findings, module views, questions and feedback, with no content', async () => {
    const added = await svc.api<{ repo: { id: number }; job: { id: string } }>('/api/repos', {
      method: 'POST',
      body: { path: root },
    });
    await svc.waitForJob(added.body.job.id);
    const id = added.body.repo.id;
    const modules = await svc.api<{ nodes: { label: string }[] }>(`/api/repos/${id}/views/modules`);
    const mod = modules.body.nodes[0]!.label;
    await svc.api(`/api/repos/${id}/views/dependencies?module=${encodeURIComponent(mod)}`);
    await svc.api(`/api/repos/${id}/views/dependencies`); // the overall graph is not a module view
    const question = 'What does handleUsers do?';
    await svc.api(`/api/repos/${id}/chat`, { method: 'POST', body: { question } });
    await svc.api(`/api/repos/${id}/chat/feedback`, {
      method: 'POST',
      body: { rating: 'down', note: 'Wrong file cited', confidence: 'high', citations: 1 },
    });
    await svc.api(`/api/repos/${id}/chat/feedback`, { method: 'POST', body: { rating: 'up' } });
    const bad = await svc.api(`/api/repos/${id}/chat/feedback`, {
      method: 'POST',
      body: { rating: 'up', answer: 'smuggled content' },
    });
    expect(bad.status).toBe(400);

    const a = (await svc.api<Summary>('/api/analytics')).body;
    expect(a.indexing.succeeded).toBe(1);
    expect(a.indexing.last.files).toBeGreaterThan(0);
    expect(a.indexing.last.symbols).toBeGreaterThan(0);
    expect(a.indexing.last.relationships).toBeGreaterThan(0);
    expect(a.findings.cycles).toBeGreaterThan(0); // the fixture has src/ring/a.ts <-> b.ts
    expect(a.counts.module_explored).toBe(1);
    expect(a.questions.asked).toBe(1);
    expect(a.questions.averageSources).toBeGreaterThan(0);
    expect(a.feedback).toMatchObject({
      up: 1,
      down: 1,
      recentNotes: [{ note: 'Wrong file cited' }],
    });

    // The question text is never stored.
    const dbBytes = readFileSync(svc.ctx.dbPath);
    expect(dbBytes.includes(Buffer.from(question))).toBe(false);
    const rows = svc.ctx.db.prepare('SELECT data FROM analytics_events').all() as {
      data: string;
    }[];
    expect(rows.some((r) => r.data.includes('handleUsers'))).toBe(false);
  });

  it('deletes all local data only with the typed confirmation', async () => {
    expect(
      (await svc.api('/api/data/delete-all', { method: 'POST', body: { confirm: 'yes' } })).status,
    ).toBe(400);
    const r = await svc.api<{ deleted: { repos: number; events: number }; note: string }>(
      '/api/data/delete-all',
      { method: 'POST', body: { confirm: 'DELETE' } },
    );
    expect(r.status).toBe(200);
    expect(r.body.deleted.repos).toBe(1);
    expect(r.body.deleted.events).toBeGreaterThan(0);
    expect(r.body.note).toMatch(/not touched/);
    expect((await svc.api<{ repos: unknown[] }>('/api/repos')).body.repos).toEqual([]);
    expect((await svc.api<Summary>('/api/analytics')).body.questions.asked).toBe(0);
    expect((await svc.api<{ firstRun: boolean }>('/api/settings')).body.firstRun).toBe(true);
    // The repository itself is untouched.
    expect(readFileSync(`${root}/src/handlers.ts`, 'utf8').length).toBeGreaterThan(0);
  });
});
