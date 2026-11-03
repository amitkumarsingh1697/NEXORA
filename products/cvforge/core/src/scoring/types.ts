export interface ScoreComponent {
  key: string;
  label: string;
  /** Nominal weight (0-1). */
  weight: number;
  /** Weight after redistributing unassessed components (0-1). */
  effectiveWeight: number;
  /** 0-100, or null when not assessable. */
  score: number | null;
  explanation: string;
}

export interface ExplainedScore {
  name: string;
  /** 0-100 integer. Null when the score cannot be calculated at all. */
  value: number | null;
  /** Range reflecting pending (unanswered) items: worst case and best case. */
  range: { low: number; high: number } | null;
  components: ScoreComponent[];
  basis: string;
  positives: string[];
  gaps: string[];
  uncertainty: string[];
  recommendations: string[];
}

export function clamp100(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Redistribute weights of unassessed components proportionally. */
export function normaliseWeights<T extends { weight: number; score: number | null }>(
  items: T[],
): (T & { effectiveWeight: number })[] {
  const assessed = items.filter((i) => i.score !== null).reduce((n, i) => n + i.weight, 0);
  return items.map((i) => ({
    ...i,
    effectiveWeight: i.score === null || assessed === 0 ? 0 : i.weight / assessed,
  }));
}
