/**
 * Local usage analytics (spec §5.11, AB-5.11-01).
 *
 * Every event is stored only in the local SQLite database and is never
 * transmitted. Event data is validated per kind so that only counts, durations
 * and enums are kept: no source code, file contents, questions or answers.
 * The one free-text field is the optional note a user types when rating an
 * answer, which they write for this purpose and which stays on this machine.
 */
import { z } from 'zod';
import type { Db } from './db';
import { tx } from './db';

const count = z.number().int().nonnegative().max(1e9);

export const ANALYTICS_EVENT_SCHEMAS = {
  index_succeeded: z.strictObject({
    files: count,
    symbols: count,
    relationships: count,
    durationMs: count,
  }),
  index_failed: z.strictObject({ durationMs: count.optional(), cancelled: z.boolean() }),
  module_explored: z.strictObject({}),
  question_asked: z.strictObject({
    sources: count,
    citations: count,
    confidence: z.enum(['high', 'medium', 'low', 'none']),
  }),
  answer_feedback: z.strictObject({
    rating: z.enum(['up', 'down']),
    note: z.string().trim().max(1000).default(''),
    confidence: z.enum(['high', 'medium', 'low', 'none']).optional(),
    citations: count.optional(),
  }),
  findings_generated: z.strictObject({ cycles: count, sensitiveConfig: count }),
  change_request_proposed: z.strictObject({ source: z.enum(['manual', 'model']) }),
  patch_decided: z.strictObject({ decision: z.enum(['approved', 'rejected']) }),
  validation_ran: z.strictObject({ outcome: z.enum(['passed', 'failed']) }),
  change_merged: z.strictObject({}),
} as const;

export type AnalyticsKind = keyof typeof ANALYTICS_EVENT_SCHEMAS;
export const ANALYTICS_KINDS = Object.keys(ANALYTICS_EVENT_SCHEMAS) as AnalyticsKind[];

export function recordEvent<K extends AnalyticsKind>(
  db: Db,
  kind: K,
  repoId: number | null,
  data: z.input<(typeof ANALYTICS_EVENT_SCHEMAS)[K]>,
  now: Date = new Date(),
): void {
  const parsed = ANALYTICS_EVENT_SCHEMAS[kind].parse(data);
  db.prepare('INSERT INTO analytics_events (at, repo_id, kind, data) VALUES (?, ?, ?, ?)').run(
    now.toISOString(),
    repoId,
    kind,
    JSON.stringify(parsed),
  );
}

export interface AnalyticsSummary {
  since: string | null;
  counts: Record<AnalyticsKind, number>;
  indexing: {
    succeeded: number;
    failed: number;
    cancelled: number;
    averageDurationMs: number | null;
    last: { files: number; symbols: number; relationships: number; at: string } | null;
  };
  questions: { asked: number; averageSources: number | null };
  feedback: {
    up: number;
    down: number;
    recentNotes: { at: string; rating: 'up' | 'down'; note: string }[];
  };
  findings: { cycles: number; sensitiveConfig: number } | null;
  patches: { proposed: number; approved: number; rejected: number };
  validation: { passed: number; failed: number };
  merges: number;
}

interface Row {
  at: string;
  kind: AnalyticsKind;
  data: string;
}

/** Aggregate the stored events, for all repositories or one. */
export function analyticsSummary(db: Db, repoId?: number): AnalyticsSummary {
  const rows = (repoId === undefined
    ? db.prepare('SELECT at, kind, data FROM analytics_events ORDER BY id').all()
    : db
        .prepare('SELECT at, kind, data FROM analytics_events WHERE repo_id = ? ORDER BY id')
        .all(repoId)) as unknown as Row[];
  const counts = Object.fromEntries(ANALYTICS_KINDS.map((k) => [k, 0])) as Record<
    AnalyticsKind,
    number
  >;
  const of = <K extends AnalyticsKind>(k: K) =>
    rows
      .filter((r) => r.kind === k)
      .map((r) => ({
        at: r.at,
        ...(JSON.parse(r.data) as z.output<(typeof ANALYTICS_EVENT_SCHEMAS)[K]>),
      }));
  for (const r of rows) counts[r.kind]++;
  const ok = of('index_succeeded');
  const failed = of('index_failed');
  const asked = of('question_asked');
  const fb = of('answer_feedback');
  const findings = of('findings_generated').at(-1);
  const decided = of('patch_decided');
  const runs = of('validation_ran');
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const last = ok.at(-1);
  return {
    since: rows[0]?.at ?? null,
    counts,
    indexing: {
      succeeded: ok.length,
      failed: failed.filter((f) => !f.cancelled).length,
      cancelled: failed.filter((f) => f.cancelled).length,
      averageDurationMs: avg(ok.map((x) => x.durationMs)),
      last: last
        ? {
            files: last.files,
            symbols: last.symbols,
            relationships: last.relationships,
            at: last.at,
          }
        : null,
    },
    questions: { asked: asked.length, averageSources: avg(asked.map((x) => x.sources)) },
    feedback: {
      up: fb.filter((f) => f.rating === 'up').length,
      down: fb.filter((f) => f.rating === 'down').length,
      recentNotes: fb
        .filter((f) => f.note)
        .slice(-10)
        .reverse()
        .map((f) => ({ at: f.at, rating: f.rating, note: f.note })),
    },
    findings: findings
      ? { cycles: findings.cycles, sensitiveConfig: findings.sensitiveConfig }
      : null,
    patches: {
      proposed: counts.change_request_proposed,
      approved: decided.filter((d) => d.decision === 'approved').length,
      rejected: decided.filter((d) => d.decision === 'rejected').length,
    },
    validation: {
      passed: runs.filter((r) => r.outcome === 'passed').length,
      failed: runs.filter((r) => r.outcome === 'failed').length,
    },
    merges: counts.change_merged,
  };
}

/** Small key/value settings kept in the meta table (for example, first-run state). */
export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(`setting:${key}`) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(`setting:${key}`, value);
}

/**
 * Delete everything CodeAtlas stored in its database: repositories, indexes,
 * investigations, analytics and settings. The schema version is kept. Files in
 * the user's repositories, and folders on disk, are not touched.
 */
export function deleteAllLocalData(db: Db): { repos: number; events: number } {
  return tx(db, () => {
    const repos = (db.prepare('SELECT COUNT(*) AS n FROM repos').get() as { n: number }).n;
    const events = (db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get() as { n: number })
      .n;
    db.exec(`DELETE FROM chunks_fts;
DELETE FROM analytics_events;
DELETE FROM repos;
DELETE FROM meta WHERE key LIKE 'setting:%';`);
    return { repos, events };
  });
}
