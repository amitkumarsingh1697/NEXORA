import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DisabledProvider, type GenerateRequest, type ModelProvider } from '@nexora/ai';
import {
  describeModule,
  indexRepository,
  moduleDoc,
  moduleDocMarkdown,
  moduleRetrieval,
  openDb,
  type Db,
} from '../src/index';
import { makeFixtureRepo } from './fixture';

let root: string;
let db: Db;
let repoId: number;

function fakeProvider(reply: (req: GenerateRequest) => string): ModelProvider {
  return {
    id: 'fake',
    local: true,
    capabilities: async () => ({
      provider: 'fake',
      available: true,
      model: 'fake-1',
      models: ['fake-1'],
      contextWindowTokens: 32000,
      supportsJsonSchema: true,
      local: true,
    }),
    generate: async (req) => ({
      text: reply(req),
      model: 'fake-1',
      provider: 'fake',
      durationMs: 1,
    }),
  };
}

beforeAll(() => {
  root = makeFixtureRepo();
  db = openDb(':memory:');
  repoId = indexRepository(db, root).repoId;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('module documentation (S3-5)', () => {
  it('summarises a module from the index, with a location for every item', () => {
    const d = moduleDoc(db, repoId, 'fixture-app')!;
    expect(d.files.tests).toBe(1);
    expect(d.files.source).toBeGreaterThan(5);
    expect(d.exports.find((e) => e.name === 'add')).toMatchObject({
      kind: 'function',
      doc: 'Adds two positive numbers.',
      at: { path: 'src/lib/math.ts', line: 4 },
    });
    // Test files' exports are not part of the module's API.
    expect(d.exports.every((e) => !e.at.path.endsWith('.test.ts'))).toBe(true);
    expect(d.externals.map((x) => x.name)).toContain('express');
    expect(d.routes.map((r) => r.name)).toEqual(
      expect.arrayContaining(['GET /users', 'POST /sum']),
    );
    expect(d.entrypoints.map((e) => e.name)).toEqual(
      expect.arrayContaining(['fixture-app main', 'fixture-app bin:fixture']),
    );
    expect(d.dependsOn).toEqual([]); // a single-module repository
    expect(d.docs.map((x) => x.path)).toContain('docs/README.md');
    expect(moduleDoc(db, repoId, 'no-such-module')).toBeNull();
  });

  it('renders Markdown with citations', () => {
    const md = moduleDocMarkdown(moduleDoc(db, repoId, 'fixture-app')!);
    expect(md).toMatch(/^# Module fixture-app/);
    expect(md).toContain('- `add` (function) (`src/lib/math.ts:4`): Adds two positive numbers.');
    expect(md).toContain('## Routes');
    expect(md).toContain('Generated from the index, not written by a model.');
  });

  it('feeds the model only the module summary and export code, and grounds its citations', async () => {
    const d = moduleDoc(db, repoId, 'fixture-app')!;
    const r = moduleRetrieval(db, repoId, d);
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.sources.every((s) => s.reason.startsWith('exported'))).toBe(true);
    expect(r.facts.some((f) => f.text.includes('route GET /users'))).toBe(true);
    const a = await describeModule(
      fakeProvider(() =>
        JSON.stringify({
          answer: 'The module exposes add [S1] and invents a helper [S42].',
          citations: [{ source: 'S1' }],
          confidence: 'high',
          gaps: [],
        }),
      ),
      db,
      repoId,
      d,
    );
    expect(a.mode).toBe('model');
    expect(a.citations.map((c) => c.source)).toEqual(['S1']);
    expect(a.warnings.join(' ')).toMatch(/do not exist \(S42\)/);
  });

  it('without a model returns the evidence list instead of prose', async () => {
    const d = moduleDoc(db, repoId, 'fixture-app')!;
    const a = await describeModule(new DisabledProvider(), db, repoId, d);
    expect(a.mode).toBe('retrieval-only');
  });
});
