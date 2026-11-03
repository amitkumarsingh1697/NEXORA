import { findConcepts } from '../taxonomy/skills';

/**
 * Fabrication guard for proposed text. A suggestion may only use numbers and
 * technology concepts that already exist in its allowed sources (the original
 * text, the resume, and the user's own confirmations).
 */
export interface GuardResult {
  ok: boolean;
  violations: string[];
}

function numbers(s: string): string[] {
  return [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(/,/g, ''));
}

export function checkNoFabrication(proposed: string, allowedSources: string[]): GuardResult {
  const corpus = allowedSources.join('\n');
  const allowedNums = new Set(numbers(corpus));
  const allowedConcepts = new Set(findConcepts(corpus).map((c) => c.name));
  const violations: string[] = [];
  for (const n of numbers(proposed)) {
    if (!allowedNums.has(n))
      violations.push(`Introduces the number "${n}" which is not in your resume or answers.`);
  }
  for (const c of findConcepts(proposed)) {
    if (!allowedConcepts.has(c.name))
      violations.push(`Introduces "${c.name}" which is not in your resume or answers.`);
  }
  return { ok: violations.length === 0, violations };
}
