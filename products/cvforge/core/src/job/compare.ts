/**
 * Requirement overlap across jobs (RI-4.4-04). Pure and deterministic.
 *
 * Two requirements are treated as the same skill when they share a canonical concept from the
 * skill taxonomy. Requirements without a concept (free-text responsibilities) are not matched
 * across jobs, because text similarity would be a guess.
 */

export type ComparedEvidenceState =
  'demonstrated' | 'user_confirmed' | 'missing' | 'pending' | 'none';

export interface ComparedJobRequirement {
  concepts: string[];
  importance: 'required' | 'preferred';
  /** Evidence state from that job's latest analysis, or 'none' when the job has no analysis. */
  state: ComparedEvidenceState;
}

export interface ComparedJob {
  id: string;
  requirements: ComparedJobRequirement[];
}

export interface SharedConcept {
  concept: string;
  /** One entry per compared job that asks for this concept, in input order. */
  jobs: { id: string; importance: 'required' | 'preferred'; state: ComparedEvidenceState }[];
}

export interface RequirementOverlap {
  /** Concepts asked for by at least two of the compared jobs, most widely shared first. */
  shared: SharedConcept[];
  /** Concepts asked for by exactly one job, keyed by job id. */
  unique: Record<string, string[]>;
}

const STATE_RANK: Record<ComparedEvidenceState, number> = {
  demonstrated: 4,
  user_confirmed: 3,
  pending: 2,
  missing: 1,
  none: 0,
};

export function compareRequirements(jobs: ComparedJob[]): RequirementOverlap {
  // concept -> job id -> strongest entry within that job
  const byConcept = new Map<
    string,
    Map<string, { importance: 'required' | 'preferred'; state: ComparedEvidenceState }>
  >();
  for (const job of jobs) {
    for (const r of job.requirements) {
      for (const concept of new Set(r.concepts)) {
        const perJob =
          byConcept.get(concept) ??
          new Map<string, { importance: 'required' | 'preferred'; state: ComparedEvidenceState }>();
        const prev = perJob.get(job.id);
        perJob.set(job.id, {
          importance: prev?.importance === 'required' ? 'required' : r.importance,
          state: prev && STATE_RANK[prev.state] >= STATE_RANK[r.state] ? prev.state : r.state,
        });
        byConcept.set(concept, perJob);
      }
    }
  }
  const order = new Map(jobs.map((j, i) => [j.id, i]));
  const shared: SharedConcept[] = [];
  const unique: Record<string, string[]> = Object.fromEntries(jobs.map((j) => [j.id, []]));
  for (const [concept, perJob] of byConcept) {
    const entries = [...perJob.entries()]
      .sort((a, b) => order.get(a[0])! - order.get(b[0])!)
      .map(([id, v]) => ({ id, ...v }));
    if (entries.length >= 2) shared.push({ concept, jobs: entries });
    else unique[entries[0]!.id]!.push(concept);
  }
  shared.sort((a, b) => b.jobs.length - a.jobs.length || a.concept.localeCompare(b.concept));
  for (const k of Object.keys(unique)) unique[k]!.sort((a, b) => a.localeCompare(b));
  return { shared, unique };
}
