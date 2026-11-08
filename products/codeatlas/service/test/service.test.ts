import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixtureRepo } from '../../core/test/fixture';
import { rawGet, startService, type TestService } from './helpers';

let svc: TestService;
let root: string;
let repoId: number;

beforeAll(async () => {
  root = makeFixtureRepo();
  svc = await startService();
});

afterAll(async () => {
  await svc.close();
  rmSync(root, { recursive: true, force: true });
});

describe('local service security', () => {
  it('binds to loopback only', () => {
    expect((svc.server.address() as { address: string }).address).toBe('127.0.0.1');
  });

  it('stores the session token with owner-only permissions', () => {
    expect(statSync(join(svc.ctx.cfg.home, 'token')).mode & 0o777).toBe(0o600);
  });

  it('allows health without a token but nothing else', async () => {
    expect((await svc.api('/api/health', { token: null })).status).toBe(200);
    const r = await svc.api<{ error: { code: string } }>('/api/repos', { token: null });
    expect(r.status).toBe(401);
    expect((await svc.api('/api/repos', { token: 'wrong-token' })).status).toBe(401);
  });

  it('rejects foreign Host headers (DNS rebinding) and cross-origin requests', async () => {
    expect(await rawGet(svc.port, '/api/health', { host: `evil.example:${svc.port}` })).toBe(421);
    const r = await svc.api('/api/repos', { headers: { origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
    expect((await svc.api('/api/repos', { headers: { origin: svc.base } })).status).toBe(200);
  });

  it('refuses to index the CodeAtlas data folder or missing paths', async () => {
    expect(
      (await svc.api('/api/repos', { method: 'POST', body: { path: svc.ctx.cfg.home } })).status,
    ).toBe(400);
    expect(
      (await svc.api('/api/repos', { method: 'POST', body: { path: '/definitely/not/here' } }))
        .status,
    ).toBe(400);
    expect((await svc.api('/api/repos', { method: 'POST', body: {} })).status).toBe(400);
  });
});

describe('indexing and views over HTTP', () => {
  it('registers a repository and indexes it in a background job', async () => {
    const r = await svc.api<{ repo: { id: number }; job: { id: string; status: string } }>(
      '/api/repos',
      { method: 'POST', body: { path: root } },
    );
    expect(r.status).toBe(200);
    repoId = r.body.repo.id;
    // API stays responsive while indexing runs out of process.
    expect((await svc.api('/api/health')).status).toBe(200);
    const job = await svc.waitForJob(r.body.job.id);
    expect(job).toMatchObject({ status: 'succeeded' });
    const detail = await svc.api<{
      coverage: { symbols: number; files: { skipped: Record<string, number> } };
      runs: unknown[];
    }>(`/api/repos/${repoId}`);
    expect(detail.body.coverage.symbols).toBeGreaterThan(5);
    expect(detail.body.coverage.files.skipped.secret).toBe(1);
    expect(detail.body.runs).toHaveLength(1);
  });

  it('serves the tree level by level and validates the language filter', async () => {
    const mods = await svc.api<{ items: { label: string; expand: { module: string } }[] }>(
      `/api/repos/${repoId}/tree`,
    );
    expect(mods.status).toBe(200);
    const mod = mods.body.items[0]!.expand.module;
    const files = await svc.api<{ items: { label: string }[] }>(
      `/api/repos/${repoId}/tree?module=${encodeURIComponent(mod)}&lang=javascript`,
    );
    expect(files.body.items.map((f) => f.label)).toEqual(['src/legacy.js']);
    const langs = await svc.api<{ languages: { lang: string }[] }>(
      `/api/repos/${repoId}/languages`,
    );
    expect(langs.body.languages.map((l) => l.lang)).toContain('typescript');
    expect((await svc.api(`/api/repos/${repoId}/tree?lang=cobol`)).status).toBe(400);
    expect((await svc.api(`/api/repos/${repoId}/search?q=add&lang=cobol`)).status).toBe(400);
  });

  it('serves every view', async () => {
    for (const v of [
      'modules',
      'dependencies?external=1',
      'risk',
      'ownership',
      'knowledge',
      'integrations',
    ]) {
      const r = await svc.api(`/api/repos/${repoId}/views/${v}`);
      expect(r.status, v).toBe(200);
    }
    const flows = await svc.api<{ starts: { id: number; key: string }[] }>(
      `/api/repos/${repoId}/flows`,
    );
    const start = flows.body.starts.find((s) => s.key === 'GET /users');
    const flow = await svc.api<{ nodes: { label: string }[] }>(
      `/api/repos/${repoId}/views/flow?start=${start?.id}`,
    );
    expect(flow.body.nodes.map((n) => n.label)).toContain('listUsers');
  });

  it('serves the architecture brain, and 404 for an unknown repository', async () => {
    const r = await svc.api<{ brain: { format: number; neurons: { name: string }[] } }>(
      `/api/repos/${repoId}/brain`,
    );
    expect(r.status).toBe(200);
    expect(r.body.brain.format).toBe(1);
    expect(r.body.brain.neurons.map((n) => n.name)).toContain('handleUsers');
    expect((await svc.api('/api/repos/99999/brain')).status).toBe(404);
    expect((await svc.api(`/api/repos/${repoId}/brain`, { token: null })).status).toBe(401);
  });

  it('searches, finds nodes, shows details and impact', async () => {
    const s = await svc.api<{ hits: { filePath: string }[] }>(
      `/api/repos/${repoId}/search?q=${encodeURIComponent('list users')}`,
    );
    expect(s.body.hits[0]?.filePath).toBe('src/handlers.ts');
    const f = await svc.api<{ nodes: { id: number; key: string }[] }>(
      `/api/repos/${repoId}/find?q=add`,
    );
    const add = f.body.nodes.find((n) => n.key === 'src/lib/math.ts#add');
    const d = await svc.api<{ incoming: { kind: string; confidence: string }[] }>(
      `/api/repos/${repoId}/nodes/${add?.id}`,
    );
    expect(d.body.incoming.some((e) => e.kind === 'calls' && e.confidence === 'observed')).toBe(
      true,
    );
    const imp = await svc.api<{ tests: { key: string }[] }>(
      `/api/repos/${repoId}/impact/${add?.id}`,
    );
    expect(imp.body.tests.map((t) => t.key)).toContain('src/math.test.ts');
  });

  it('serves source lines but never outside the repository', async () => {
    const ok = await svc.api<{ lines: string[] }>(
      `/api/repos/${repoId}/source?path=src/lib/math.ts&start=4&end=4`,
    );
    expect(ok.body.lines[0]).toContain('export function add');
    expect(
      (
        await svc.api(
          `/api/repos/${repoId}/source?path=${encodeURIComponent('../../../etc/passwd')}`,
        )
      ).status,
    ).toBe(403);
    expect((await svc.api(`/api/repos/${repoId}/source?path=nope.ts`)).status).toBe(404);
  });

  it('deletes CodeAtlas data for a repository without touching files', async () => {
    const r = await svc.api(`/api/repos/${repoId}`, { method: 'DELETE' });
    expect(r.status).toBe(200);
    expect((await svc.api(`/api/repos/${repoId}`)).status).toBe(404);
    expect(statSync(join(root, 'src/lib/math.ts')).isFile()).toBe(true);
    const left = svc.ctx.db
      .prepare('SELECT (SELECT count(*) FROM nodes) n, (SELECT count(*) FROM chunks_fts) f')
      .get() as { n: number; f: number };
    expect(left).toEqual({ n: 0, f: 0 });
  });
});
