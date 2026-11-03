import { rmSync } from 'node:fs';
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

let root: string;
let withModel: TestService;
let noModel: TestService;
let repoA: number;
let repoB: number;

async function addRepo(svc: TestService): Promise<number> {
  const r = await svc.api<{ repo: { id: number }; job: { id: string } }>('/api/repos', {
    method: 'POST',
    body: { path: root },
  });
  await svc.waitForJob(r.body.job.id);
  return r.body.repo.id;
}

beforeAll(async () => {
  root = makeFixtureRepo();
  withModel = await startService([chatRoutes(fake)]);
  noModel = await startService([chatRoutes()], { AI_PROVIDER: 'disabled' });
  repoA = await addRepo(withModel);
  repoB = await addRepo(noModel);
});

afterAll(async () => {
  await withModel.close();
  await noModel.close();
  rmSync(root, { recursive: true, force: true });
});

describe('chat over HTTP', () => {
  it('answers with citations from the model', async () => {
    const r = await withModel.api<{
      mode: string;
      citations: { filePath: string }[];
      provider: { local: boolean };
    }>(`/api/repos/${repoA}/chat`, {
      method: 'POST',
      body: { question: 'What does handleUsers do?' },
    });
    expect(r.status).toBe(200);
    expect(r.body.mode).toBe('model');
    expect(r.body.citations[0]?.filePath).toBe('src/handlers.ts');
    expect(r.body.provider.local).toBe(true);
  });

  it('reports AI status and falls back to retrieval when disabled', async () => {
    const s = await noModel.api<{ capabilities: { available: boolean } }>('/api/ai/status');
    expect(s.body.capabilities.available).toBe(false);
    const r = await noModel.api<{ mode: string; warnings: string[] }>(`/api/repos/${repoB}/chat`, {
      method: 'POST',
      body: { question: 'What does handleUsers do?' },
    });
    expect(r.body.mode).toBe('retrieval-only');
    expect(r.body.warnings.length).toBeGreaterThan(0);
  });

  it('validates input and requires the session token', async () => {
    expect(
      (await withModel.api(`/api/repos/${repoA}/chat`, { method: 'POST', body: { question: '' } }))
        .status,
    ).toBe(400);
    expect(
      (
        await withModel.api(`/api/repos/${repoA}/chat`, {
          method: 'POST',
          body: { question: 'what?' },
          token: null,
        })
      ).status,
    ).toBe(401);
  });
});
