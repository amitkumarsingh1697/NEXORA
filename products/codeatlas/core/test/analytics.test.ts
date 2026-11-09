import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  analyticsSummary,
  deleteAllLocalData,
  getSetting,
  openDb,
  recordEvent,
  setSetting,
  upsertRepo,
} from '../src/index';

const dir = mkdtempSync(join(tmpdir(), 'codeatlas-analytics-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
function folder(name: string): string {
  const p = join(dir, name);
  mkdirSync(p, { recursive: true });
  return p;
}

function freshDb() {
  const db = openDb(':memory:');
  const repo = upsertRepo(db, folder('example-repo'), new Date());
  return { db, repoId: repo.id };
}

describe('local analytics (AB-5.11-01)', () => {
  it('records every spec §5.11 metric and aggregates it', () => {
    const { db, repoId } = freshDb();
    recordEvent(db, 'index_succeeded', repoId, {
      files: 10,
      symbols: 40,
      relationships: 70,
      durationMs: 1000,
    });
    recordEvent(db, 'index_succeeded', repoId, {
      files: 12,
      symbols: 44,
      relationships: 80,
      durationMs: 3000,
    });
    recordEvent(db, 'index_failed', repoId, { cancelled: true, durationMs: 50 });
    recordEvent(db, 'index_failed', repoId, { cancelled: false });
    recordEvent(db, 'module_explored', repoId, {});
    recordEvent(db, 'question_asked', repoId, { sources: 4, citations: 2, confidence: 'high' });
    recordEvent(db, 'question_asked', repoId, { sources: 6, citations: 0, confidence: 'low' });
    recordEvent(db, 'answer_feedback', repoId, { rating: 'up' });
    recordEvent(db, 'answer_feedback', repoId, { rating: 'down', note: 'Cited the wrong file' });
    recordEvent(db, 'findings_generated', repoId, { cycles: 2, sensitiveConfig: 1 });
    recordEvent(db, 'change_request_proposed', repoId, { source: 'manual' });
    recordEvent(db, 'patch_decided', repoId, { decision: 'rejected' });
    recordEvent(db, 'patch_decided', repoId, { decision: 'approved' });
    recordEvent(db, 'validation_ran', repoId, { outcome: 'failed' });
    recordEvent(db, 'validation_ran', repoId, { outcome: 'passed' });
    recordEvent(db, 'change_merged', repoId, {});

    const s = analyticsSummary(db);
    expect(Object.values(s.counts).every((n) => n > 0)).toBe(true);
    expect(s.indexing).toMatchObject({
      succeeded: 2,
      failed: 1,
      cancelled: 1,
      averageDurationMs: 2000,
      last: { files: 12, symbols: 44, relationships: 80 },
    });
    expect(s.questions).toEqual({ asked: 2, averageSources: 5 });
    expect(s.feedback.up).toBe(1);
    expect(s.feedback.down).toBe(1);
    expect(s.feedback.recentNotes).toEqual([
      expect.objectContaining({ rating: 'down', note: 'Cited the wrong file' }),
    ]);
    expect(s.findings).toEqual({ cycles: 2, sensitiveConfig: 1 });
    expect(s.patches).toEqual({ proposed: 1, approved: 1, rejected: 1 });
    expect(s.validation).toEqual({ passed: 1, failed: 1 });
    expect(s.merges).toBe(1);
    expect(analyticsSummary(db, repoId).counts.question_asked).toBe(2);
    expect(analyticsSummary(db, repoId + 1).counts.question_asked).toBe(0);
  });

  it('refuses event data that could carry content', () => {
    const { db, repoId } = freshDb();
    expect(() =>
      recordEvent(db, 'question_asked', repoId, {
        sources: 1,
        citations: 1,
        confidence: 'high',
        // @ts-expect-error extra fields are rejected at runtime too
        question: 'what does auth.ts do?',
      }),
    ).toThrow();
    expect(() =>
      // @ts-expect-error unknown kinds are rejected
      recordEvent(db, 'page_viewed', repoId, {}),
    ).toThrow();
    expect(() =>
      recordEvent(db, 'answer_feedback', repoId, { rating: 'up', note: 'x'.repeat(1001) }),
    ).toThrow();
    expect(analyticsSummary(db).since).toBeNull();
  });

  it('removing a repository removes its events; delete-all clears data and settings', () => {
    const { db, repoId } = freshDb();
    recordEvent(db, 'module_explored', repoId, {});
    db.prepare('DELETE FROM repos WHERE id = ?').run(repoId);
    expect(analyticsSummary(db).counts.module_explored).toBe(0);

    const other = upsertRepo(db, folder('other-repo'), new Date());
    recordEvent(db, 'module_explored', other.id, {});
    setSetting(db, 'welcome_dismissed', 'true');
    expect(getSetting(db, 'welcome_dismissed')).toBe('true');
    expect(deleteAllLocalData(db)).toEqual({ repos: 1, events: 1 });
    expect((db.prepare('SELECT COUNT(*) AS n FROM repos').get() as { n: number }).n).toBe(0);
    expect(analyticsSummary(db).since).toBeNull();
    expect(getSetting(db, 'welcome_dismissed')).toBeNull();
    expect(
      (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string })
        .value,
    ).toBe('7');
  });
});
