import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateBrain, type BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb, type Db } from '../src/index';
import { makeFixtureRepo } from './fixture';

let root: string;
let db: Db;
let brain: BrainModel;

const byName = (name: string) => brain.neurons.find((n) => n.name === name);

beforeAll(() => {
  root = makeFixtureRepo();
  db = openDb(':memory:');
  const { repoId } = indexRepository(db, root);
  const b = buildBrain(db, repoId);
  if (!b) throw new Error('no brain for an indexed repository');
  brain = b;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('buildBrain', () => {
  it('produces a model the viewer accepts without warnings', () => {
    const r = validateBrain(JSON.parse(JSON.stringify(brain)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
    expect(brain.source.producer).toBe('codeatlas');
    expect(brain.notes?.join(' ')).toMatch(/inferred/);
  });

  it('records the inputs and output of functions and methods', () => {
    expect(byName('add')).toMatchObject({
      kind: 'function',
      file: 'src/lib/math.ts',
      line: 4,
      params: [
        { name: 'a', type: 'number', optional: false },
        { name: 'b', type: 'number', optional: false },
      ],
      returns: 'number',
      returnsDeclared: true,
      doc: 'Adds two positive numbers.',
    });
    // Return type worked out by TypeScript, not written in the source.
    expect(byName('handleUsers')).toMatchObject({ returns: 'void', returnsDeclared: false });
  });

  it('nests methods under their class and links calls with evidence', () => {
    const calc = byName('Calculator');
    const run = brain.neurons.find((n) => n.name.endsWith('run') && n.parent === calc?.id);
    expect(run?.kind).toBe('method');
    const add = byName('add');
    const call = brain.synapses.find((s) => s.source === run?.id && s.target === add?.id);
    expect(call).toMatchObject({ kind: 'calls', confidence: 'observed', file: 'src/lib/math.ts' });
    expect(call?.line).toBeGreaterThan(0);
    expect(brain.synapses.some((s) => s.source === calc?.id && s.kind === 'implements')).toBe(true);
  });

  it('puts routes in the backend and links them to their handlers', () => {
    const route = brain.neurons.find((n) => n.kind === 'route' && /\/users/.test(n.name));
    expect(route?.region).toBe('backend');
    const handler = byName('handleUsers');
    expect(
      brain.synapses.some(
        (s) => s.source === route?.id && s.target === handler?.id && s.kind === 'handles',
      ),
    ).toBe(true);
  });

  it('places tool and CI files in DevOps and leaves out tests and author data', () => {
    const files = new Set(brain.neurons.map((n) => n.file));
    expect(files.has('src/math.test.ts')).toBe(false);
    const json = JSON.stringify(brain);
    expect(json).not.toMatch(/asha@example\.com|Asha Rao|Ben Ortiz/);
    expect(json).not.toContain('supersecretvalue123');
    const devops = brain.neurons.filter((n) => n.region === 'devops');
    for (const n of devops) expect(n.regionReason).toBeTruthy();
  });

  it('returns null for an unknown repository', () => {
    expect(buildBrain(db, 99_999)).toBeNull();
  });
});
