import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local SQLite store (Node's built-in node:sqlite, FTS5 enabled).
 * Everything CodeAtlas learns about a repository lives here, on the user's machine.
 */
export type Db = DatabaseSync;

const SCHEMA_VERSION = 8;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY,
  root TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_indexed_at TEXT,
  head_commit TEXT,
  branch TEXT
);

CREATE TABLE IF NOT EXISTS index_runs (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
  error TEXT,
  coverage TEXT,
  duration_ms INTEGER
);

-- Generic graph: files, symbols, modules (packages), external packages, routes, docs, entrypoints,
-- configuration (environment variables, config files) and services (HTTP hosts, databases).
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('file','symbol','module','external','route','doc','entrypoint','config','service','table')),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT,
  module TEXT,
  symbol_kind TEXT,
  exported INTEGER NOT NULL DEFAULT 0,
  start_line INTEGER,
  end_line INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  UNIQUE (repo_id, kind, key)
);
CREATE INDEX IF NOT EXISTS nodes_repo_kind ON nodes(repo_id, kind);
CREATE INDEX IF NOT EXISTS nodes_repo_file ON nodes(repo_id, file_path);
CREATE INDEX IF NOT EXISTS nodes_repo_name ON nodes(repo_id, name);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  src INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  dst INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('observed','inferred','unknown')),
  evidence_path TEXT,
  evidence_line INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS edges_src ON edges(src, kind);
CREATE INDEX IF NOT EXISTS edges_dst ON edges(dst, kind);
CREATE INDEX IF NOT EXISTS edges_repo_kind ON edges(repo_id, kind);

-- Per-file analysis kept for incremental indexing (S3-4). path '' holds the config fingerprint
-- and hashes of dependencies that are not analysed themselves.
CREATE TABLE IF NOT EXISTS index_cache (
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  adapter TEXT NOT NULL,
  path TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (repo_id, adapter, path)
);

-- Things the indexer saw but could not resolve. Reported, never guessed.
CREATE TABLE IF NOT EXISTS unresolved (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS unresolved_repo ON unresolved(repo_id, kind);

-- v7: one row per listed repository path and what was done to it (no silent omissions).
CREATE TABLE IF NOT EXISTS file_inventory (
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL CHECK (status IN ('full','partial','text','unsupported','failed','excluded','binary')),
  method TEXT NOT NULL,
  reason TEXT,
  bytes INTEGER,
  detected_by TEXT,
  confidence TEXT,
  -- v8: how references were linked ('compiler' or 'syntax'); NULL when none were.
  resolution TEXT,
  PRIMARY KEY (repo_id, path)
);
CREATE INDEX IF NOT EXISTS file_inventory_status ON file_inventory(repo_id, status);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  symbol_key TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('code','doc','text')),
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_repo_file ON chunks(repo_id, file_path);
-- v2: bug investigation -> patch workflow (every action is audited in inv_events).
CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','patch_proposed','approved','committed','merged','discarded')),
  analysis TEXT NOT NULL DEFAULT '{}',
  base_commit TEXT,
  branch TEXT,
  worktree_path TEXT,
  current_patch_id INTEGER,
  approved_sha TEXT,
  commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inv_patches (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  diff TEXT NOT NULL,
  files TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('model','manual')),
  status TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected','superseded','committed')),
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS inv_runs (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  patch_id INTEGER,
  command TEXT NOT NULL,
  exit_code INTEGER,
  timed_out INTEGER NOT NULL DEFAULT 0,
  output TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inv_events (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inv_approvals (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  patch_id INTEGER NOT NULL REFERENCES inv_patches(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  approver TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  validation TEXT NOT NULL CHECK (validation IN ('passed','failed','not_run')),
  run_ids TEXT NOT NULL DEFAULT '[]',
  acknowledged_unvalidated INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inv_merges (
  id INTEGER PRIMARY KEY,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  patch_id INTEGER NOT NULL REFERENCES inv_patches(id) ON DELETE CASCADE,
  approval_id INTEGER NOT NULL REFERENCES inv_approvals(id),
  sha256 TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  merged_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- v4: local usage analytics (spec §5.11). Counts and enums only; never transmitted.
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  repo_id INTEGER REFERENCES repos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('index_succeeded','index_failed','module_explored','question_asked','answer_feedback','findings_generated','change_request_proposed','patch_decided','validation_ran','change_merged')),
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS analytics_events_kind_idx ON analytics_events(kind, at);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(path, symbol, body, terms, tokenize = 'unicode61 remove_diacritics 2');
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const before = (
    db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      { value: string } | undefined
  )?.value;
  if (before && Number(before) > SCHEMA_VERSION)
    throw new Error(
      `Database schema v${before} is newer than this CodeAtlas (v${SCHEMA_VERSION}).`,
    );
  if (before && Number(before) < 3) migrateToV3(db);
  if (before && Number(before) < 6) migrateNodeKinds(db);
  try {
    db.exec(SCHEMA);
  } catch (e) {
    throw explainSchemaError(e);
  }
  // v7 -> v8: file_inventory gains `resolution`. CREATE TABLE IF NOT EXISTS leaves an existing
  // table as it was, so the column is added when it is missing.
  const cols = db.prepare('PRAGMA table_info(file_inventory)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'resolution'))
    db.exec('ALTER TABLE file_inventory ADD COLUMN resolution TEXT');
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(SCHEMA_VERSION));
  return db;
}

/**
 * v2 -> v3: adds 'merged' to the investigations status CHECK (SQLite cannot
 * alter a CHECK, so the table is rebuilt with the documented 12-step procedure:
 * foreign keys off, copy, swap, foreign_key_check, foreign keys on) and adds
 * repos.branch. inv_approvals / inv_merges are created by SCHEMA afterwards.
 */
function migrateToV3(db: Db): void {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const cols = db.prepare('PRAGMA table_info(repos)').all() as { name: string }[];
      if (cols.length && !cols.some((c) => c.name === 'branch'))
        db.exec('ALTER TABLE repos ADD COLUMN branch TEXT');
      const hasInv = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'investigations'")
        .get();
      if (hasInv) {
        db.exec(`CREATE TABLE investigations_v3 (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','patch_proposed','approved','committed','merged','discarded')),
  analysis TEXT NOT NULL DEFAULT '{}',
  base_commit TEXT,
  branch TEXT,
  worktree_path TEXT,
  current_patch_id INTEGER,
  approved_sha TEXT,
  commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO investigations_v3 SELECT id, repo_id, title, description, status, analysis, base_commit, branch, worktree_path, current_patch_id, approved_sha, commit_sha, created_at, updated_at FROM investigations;
DROP TABLE investigations;
ALTER TABLE investigations_v3 RENAME TO investigations;`);
      }
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length)
        throw new Error(`Migration to v3 left ${broken.length} broken references.`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * v4 -> v5 added 'config' and 'service' to the nodes kind CHECK (S3-3, S3-7); v5 -> v6 adds
 * 'table' (database tables read from schemas). Same 12-step rebuild as v3, to the current
 * kind list; edges reference nodes(id), which are copied unchanged.
 */
function migrateNodeKinds(db: Db): void {
  const has = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nodes'")
    .get() as { sql: string } | undefined;
  if (!has || has.sql.includes("'table'")) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE nodes_next (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('file','symbol','module','external','route','doc','entrypoint','config','service','table')),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT,
  module TEXT,
  symbol_kind TEXT,
  exported INTEGER NOT NULL DEFAULT 0,
  start_line INTEGER,
  end_line INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  UNIQUE (repo_id, kind, key)
);
INSERT INTO nodes_next SELECT id, repo_id, kind, key, name, file_path, module, symbol_kind, exported, start_line, end_line, data FROM nodes;
DROP TABLE nodes;
ALTER TABLE nodes_next RENAME TO nodes;
CREATE INDEX IF NOT EXISTS nodes_repo_kind ON nodes(repo_id, kind);
CREATE INDEX IF NOT EXISTS nodes_repo_file ON nodes(repo_id, file_path);
CREATE INDEX IF NOT EXISTS nodes_repo_name ON nodes(repo_id, name);`);
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length)
        throw new Error(`Node kind migration left ${broken.length} broken references.`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Run fn in a transaction; rolls back on error. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Turn a missing-FTS5 failure into an actionable message (research R1). */
export function explainSchemaError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/no such module: fts5/i.test(msg))
    return new Error(
      'This Node.js build has SQLite without the FTS5 extension, which CodeAtlas needs for search. Use an official Node.js 22.13+ build from nodejs.org.',
    );
  return e instanceof Error ? e : new Error(msg);
}
