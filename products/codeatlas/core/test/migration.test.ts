import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb } from '../src/index';

const dir = mkdtempSync(join(tmpdir(), 'codeatlas-mig-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The v2 shapes of the tables that v3 changes (repos, investigations) and one dependant (inv_patches). */
const V2 = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta VALUES ('schema_version', '2');
CREATE TABLE repos (id INTEGER PRIMARY KEY, root TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  created_at TEXT NOT NULL, last_indexed_at TEXT, head_commit TEXT);
CREATE TABLE investigations (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','patch_proposed','approved','committed','discarded')),
  analysis TEXT NOT NULL DEFAULT '{}', base_commit TEXT, branch TEXT, worktree_path TEXT,
  current_patch_id INTEGER, approved_sha TEXT, commit_sha TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE inv_patches (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL, diff TEXT NOT NULL, files TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, decided_at TEXT);
INSERT INTO repos VALUES (1, '/r', 'r', 't', NULL, 'abc');
INSERT INTO investigations VALUES (7, 1, 'bug', 'desc', 'committed', '{}', 'abc', 'codeatlas/inv-7',
  NULL, 3, 'sha', 'def', 't', 't');
INSERT INTO inv_patches VALUES (3, 7, 'sha', 'diff', '[]', '', 'manual', 'committed', 't', NULL);
`;

describe('schema migration', () => {
  it('upgrades a v2 database to the current schema (v3 rebuild, then v4) without losing rows or breaking foreign keys', () => {
    const file = join(dir, 'v2.db');
    const old = new DatabaseSync(file);
    old.exec(V2);
    old.close();

    const db = openDb(file);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({
      value: '4',
    });
    expect(
      (db.prepare('PRAGMA table_info(repos)').all() as { name: string }[]).map((c) => c.name),
    ).toContain('branch');
    expect(db.prepare('SELECT id, status, commit_sha FROM investigations').all()).toEqual([
      { id: 7, status: 'committed', commit_sha: 'def' },
    ]);
    db.prepare("UPDATE investigations SET status = 'merged' WHERE id = 7").run();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('inv_approvals','inv_merges','analytics_events')",
        )
        .all(),
    ).toHaveLength(3);
    // The patch's foreign key still points at the rebuilt table: cascade delete works.
    db.prepare('DELETE FROM investigations WHERE id = 7').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM inv_patches').get()).toEqual({ n: 0 });
    db.close();

    // Re-opening an up-to-date database is a no-op.
    openDb(file).close();
  });

  it('refuses a database from a newer CodeAtlas', () => {
    const file = join(dir, 'future.db');
    const d = new DatabaseSync(file);
    d.exec(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '99');",
    );
    d.close();
    expect(() => openDb(file)).toThrow(/newer than this CodeAtlas/);
  });
});
