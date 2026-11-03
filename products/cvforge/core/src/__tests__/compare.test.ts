import { describe, expect, it } from 'vitest';
import { compareRequirements } from '../job/compare';

describe('compareRequirements (RI-4.4-04)', () => {
  it('matches jobs by shared concept and keeps input order', () => {
    const r = compareRequirements([
      {
        id: 'a',
        requirements: [
          { concepts: ['Java', 'Kafka'], importance: 'required', state: 'demonstrated' },
        ],
      },
      {
        id: 'b',
        requirements: [{ concepts: ['Kafka'], importance: 'preferred', state: 'missing' }],
      },
      {
        id: 'c',
        requirements: [{ concepts: ['Kafka', 'Go'], importance: 'required', state: 'pending' }],
      },
    ]);
    expect(r.shared.map((s) => s.concept)).toEqual(['Kafka']);
    expect(r.shared[0]!.jobs.map((j) => [j.id, j.importance, j.state])).toEqual([
      ['a', 'required', 'demonstrated'],
      ['b', 'preferred', 'missing'],
      ['c', 'required', 'pending'],
    ]);
    expect(r.unique).toEqual({ a: ['Java'], b: [], c: ['Go'] });
  });

  it('within one job, required beats preferred and the strongest evidence state wins', () => {
    const r = compareRequirements([
      {
        id: 'a',
        requirements: [
          { concepts: ['AWS'], importance: 'preferred', state: 'missing' },
          { concepts: ['AWS', 'AWS'], importance: 'required', state: 'user_confirmed' },
        ],
      },
      { id: 'b', requirements: [{ concepts: ['AWS'], importance: 'required', state: 'none' }] },
    ]);
    expect(r.shared[0]!.jobs[0]).toEqual({
      id: 'a',
      importance: 'required',
      state: 'user_confirmed',
    });
    expect(r.shared[0]!.jobs).toHaveLength(2);
  });

  it('does not match requirements that have no concept, and sorts by how widely shared', () => {
    const r = compareRequirements([
      {
        id: 'a',
        requirements: [
          { concepts: [], importance: 'required', state: 'pending' },
          { concepts: ['SQL'], importance: 'required', state: 'demonstrated' },
          { concepts: ['Docker'], importance: 'required', state: 'demonstrated' },
        ],
      },
      {
        id: 'b',
        requirements: [
          { concepts: [], importance: 'required', state: 'pending' },
          { concepts: ['Docker'], importance: 'required', state: 'demonstrated' },
          { concepts: ['SQL'], importance: 'required', state: 'demonstrated' },
        ],
      },
      {
        id: 'c',
        requirements: [{ concepts: ['SQL'], importance: 'required', state: 'demonstrated' }],
      },
    ]);
    expect(r.shared.map((s) => [s.concept, s.jobs.length])).toEqual([
      ['SQL', 3],
      ['Docker', 2],
    ]);
    expect(compareRequirements([]).shared).toEqual([]);
  });
});
