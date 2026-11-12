// The ArchLens skill's bundled brain command (ADR 0020) is current and gives exactly what the
// CodeAtlas CLI gives.
import type { BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb } from '@nexora/codeatlas-core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const service = fileURLToPath(new URL('..', import.meta.url));
const skill = join(service, '..', '..', '..', 'skills', 'archlens', 'scripts', 'brain');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

function repo(): string {
  const r = mkdtempSync(join(tmpdir(), 'skill-bundle-repo-'));
  const put = (p: string, s: string) => {
    mkdirSync(join(r, p, '..'), { recursive: true });
    writeFileSync(join(r, p), s);
  };
  put(
    'src/app.ts',
    "import { total } from './cart';\nexport function main(): number {\n  return total([1, 2]);\n}\n",
  );
  put(
    'src/cart.ts',
    'export function total(xs: number[]): number {\n  return xs.reduce((a, b) => a + b, 0);\n}\n',
  );
  put(
    'svc/cart.py',
    'class Cart:\n    def add(self, x: int) -> int:\n        return helper(x)\n\ndef helper(x):\n    return x\n',
  );
  put(
    'legacy/PAY.cbl',
    '       IDENTIFICATION DIVISION.\n       PROGRAM-ID. PAY.\n       PROCEDURE DIVISION.\n       MAIN-PARA.\n           STOP RUN.\n',
  );
  put('db/schema.sql', 'CREATE TABLE cart (id INT PRIMARY KEY, total NUMERIC(10,2));\n');
  execFileSync('git', ['init', '-q', r]);
  execFileSync('git', ['-C', r, 'add', '.']);
  return r;
}

/** Synapses by the names of their ends, since neuron ids differ between runs. */
const facts = (m: BrainModel) => {
  const name = new Map(m.neurons.map((n) => [n.id, `${n.file ?? ''}:${n.name}`]));
  return {
    neurons: m.neurons.map((n) => `${n.kind}|${n.file ?? ''}:${n.name}`).sort(),
    synapses: m.synapses
      .map(
        (s) =>
          `${s.kind}|${name.get(s.source)}>${name.get(s.target)}|${s.confidence}|${s.line ?? ''}`,
      )
      .sort(),
  };
};

describe('ArchLens brain bundle', () => {
  it('is built from the current source', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'skill-bundle-'));
    execFileSync('node', [join(service, 'scripts', 'make-skill-brain.mjs')], {
      env: { ...process.env, ARCHLENS_BRAIN_OUT: fresh },
    });
    expect(
      sha(join(skill, 'brain.mjs')),
      'run `pnpm --filter @nexora/codeatlas-service skill`',
    ).toBe(sha(join(fresh, 'brain.mjs')));
    expect(sha(join(skill, 'grammars', 'MANIFEST.json'))).toBe(
      sha(join(fresh, 'grammars', 'MANIFEST.json')),
    );
  }, 60_000);

  it('runs with Node alone and matches the in-process indexer', () => {
    const r = repo();
    const out = mkdtempSync(join(tmpdir(), 'skill-bundle-out-'));
    const stdout = execFileSync(
      'node',
      [
        '--no-warnings',
        join(skill, 'brain.mjs'),
        r,
        '--out',
        join(out, 'b.html'),
        '--json',
        join(out, 'b.json'),
      ],
      { cwd: out, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    expect(stdout).toMatch(/Architecture brain: \d+ parts/);
    expect(readFileSync(join(out, 'b.html'), 'utf8')).toContain('id="brain-data"');
    const bundled = JSON.parse(readFileSync(join(out, 'b.json'), 'utf8')) as BrainModel;

    const db = openDb(join(mkdtempSync(join(tmpdir(), 'skill-bundle-db-')), 'x.db'));
    const report = indexRepository(db, r);
    const direct = buildBrain(db, report.repoId)!;
    expect(facts(bundled)).toEqual(facts(direct));
    // TypeScript is type-checked (the lib files ship with the bundle), COBOL is parsed.
    expect(
      facts(bundled).synapses.some((s) =>
        s.startsWith('calls|src/app.ts:main>src/cart.ts:total|observed'),
      ),
    ).toBe(true);
    expect(facts(bundled).neurons.some((n) => n.endsWith('legacy/PAY.cbl:PAY'))).toBe(true);
  }, 120_000);
});
