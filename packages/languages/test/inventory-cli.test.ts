import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { citedFiles, inventoryRepository } from '../src/cli/inventory';
import { summarize } from '../src/inventory';

const SKILL_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../skills/archlens/scripts/inventory.mjs',
);

const FILES: Record<string, string | Buffer> = {
  'src/Main.java': 'package app;\npublic class Main {}\n',
  'src/util.go': 'package app\nfunc Util() {}\n',
  'bin/run': '#!/usr/bin/env bash\necho run\n',
  'infra/main.tf': 'resource "x" "y" {}\n',
  Dockerfile: 'FROM alpine\n',
  '.env': 'TOKEN=not-read\n',
  'dist/app.js': 'console.log(1)\n',
  'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
};
let root: string;
let listed: string[];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'archlens-inv-'));
  for (const [p, b] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), b);
  }
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'add', '-A', '-f']);
  listed = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('ArchLens inventory', () => {
  it('records every listed path; only files the session read count as analysed, never fully', () => {
    const run = inventoryRepository(root, new Set(['src/Main.java']));
    expect(run.records.map((r) => r.path).sort()).toEqual([...listed].sort());
    const by = Object.fromEntries(run.records.map((r) => [r.path, r]));
    expect(by['src/Main.java']).toMatchObject({ language: 'Java', status: 'partial' });
    expect(by['src/util.go']).toMatchObject({ language: 'Go', status: 'text' });
    expect(by['bin/run']).toMatchObject({ language: 'Shell', detectedBy: 'shebang' });
    expect(by['.env']).toMatchObject({
      status: 'excluded',
      reason: 'may contain credentials; never read',
    });
    expect(by['dist/app.js']).toMatchObject({ status: 'excluded' });
    expect(by['logo.png']).toMatchObject({ status: 'binary' });
    expect(run.records.some((r) => r.status === 'full')).toBe(false);
  });

  it('takes the files a brain model cites as the files that were read', () => {
    expect([
      ...citedFiles({
        neurons: [{ file: './src/Main.java' }],
        synapses: [{ file: 'src/util.go' }, {}],
      }),
    ]).toEqual(['src/Main.java', 'src/util.go']);
  });

  it('ships in the skill as a bundle that gives the same counts as the source', () => {
    const model = join(root, '..', `${root.split('/').pop()}-model.json`);
    writeFileSync(
      model,
      JSON.stringify({
        format: 1,
        neurons: [{ id: 'a', name: 'Main', kind: 'class', file: 'src/Main.java' }],
        synapses: [],
      }),
    );
    const out = execFileSync('node', [SKILL_SCRIPT, root, '--model', model], { encoding: 'utf8' });
    const expected = summarize(inventoryRepository(root, new Set(['src/Main.java'])).records, {
      producer: 'archlens',
    });
    const written = JSON.parse(readFileSync(model, 'utf8'));
    rmSync(model);
    expect(written.coverage.partial).toBe(true);
    expect(written.coverage.inventory.counts).toEqual(expected.counts);
    expect(written.coverage.inventory.total).toBe(listed.length);
    expect(out).toContain(`${listed.length} files found`);
  });
});
