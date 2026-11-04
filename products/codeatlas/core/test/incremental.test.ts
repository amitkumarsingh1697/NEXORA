import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declaresGlobals, dirtyFiles, indexRepository, openDb, type Db } from '../src/index';
import { makeFixtureRepo } from './fixture';

/** Everything a user can see from an index, without ids or timings. */
function snapshot(db: Db, repoId: number) {
  const sortKeys = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, sortKeys(x)]),
        )
      : v;
  const nodes = (
    db
      .prepare(
        'SELECT kind, key, name, file_path, module, symbol_kind, exported, start_line, end_line, data FROM nodes WHERE repo_id = ?',
      )
      .all(repoId) as Record<string, unknown>[]
  )
    .map((n) => JSON.stringify(sortKeys({ ...n, data: JSON.parse(n.data as string) })))
    .sort();
  const edges = (
    db
      .prepare(
        `SELECT e.kind, e.confidence, e.evidence_path, e.evidence_line, e.detail, s.kind AS sk, s.key AS s, d.kind AS dk, d.key AS d
         FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst WHERE e.repo_id = ?`,
      )
      .all(repoId) as Record<string, unknown>[]
  )
    .map((e) => JSON.stringify(e))
    .sort();
  const unresolved = (
    db
      .prepare('SELECT file_path, line, kind, text, reason FROM unresolved WHERE repo_id = ?')
      .all(repoId) as Record<string, unknown>[]
  )
    .map((u) => JSON.stringify(u))
    .sort();
  const chunks = (
    db
      .prepare(
        'SELECT file_path, start_line, end_line, symbol_key, kind, body FROM chunks WHERE repo_id = ?',
      )
      .all(repoId) as Record<string, unknown>[]
  )
    .map((c) => JSON.stringify(c))
    .sort();
  return { nodes, edges, unresolved, chunks };
}

function coverageFigures(r: ReturnType<typeof indexRepository>) {
  return {
    files: r.files.structurallyAnalysed,
    failures: r.files.parseFailures,
    symbols: r.symbols,
    routes: r.routes,
    imports: r.imports,
    calls: r.calls,
    edges: r.edgesByConfidence,
    integrations: r.integrations,
    unresolved: r.unresolvedRecorded,
  };
}

let root: string;
let db: Db;
const edit = (path: string, fn: (s: string) => string) =>
  writeFileSync(join(root, path), fn(readFileSync(join(root, path), 'utf8')));

/** Re-index incrementally, index from scratch in a fresh database, and require the same result. */
function expectSameAsFull() {
  const inc = indexRepository(db, root);
  const fresh = openDb(':memory:');
  const full = indexRepository(fresh, root, { full: true });
  expect(snapshot(db, inc.repoId)).toEqual(snapshot(fresh, full.repoId));
  expect(coverageFigures(inc)).toEqual(coverageFigures(full));
  expect(full.incremental[0]).toMatchObject({ mode: 'full', reused: 0 });
  fresh.close();
  return inc.incremental[0]!;
}

beforeAll(() => {
  root = makeFixtureRepo();
  db = openDb(':memory:');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('incremental indexing (S3-4)', () => {
  it('analyses everything on the first run', () => {
    const r = indexRepository(db, root);
    expect(r.incremental).toEqual([
      expect.objectContaining({
        adapter: 'typescript',
        mode: 'full',
        reason: 'no previous index to reuse',
        reused: 0,
      }),
    ]);
  });

  it('reuses every file when nothing changed, with the same result as a full index', () => {
    const info = expectSameAsFull();
    expect(info).toMatchObject({ mode: 'incremental', reanalysed: 0 });
    expect(info.reused).toBeGreaterThan(5);
  });

  it('re-analyses a changed file and the files that depend on it, and nothing else', () => {
    edit('src/lib/math.ts', (s) =>
      s.replace(
        '  return 0;\n}',
        '  return 0;\n}\n\nexport function mul(a: number, b: number): number {\n  return a * b;\n}',
      ),
    );
    const info = expectSameAsFull();
    expect(info.mode).toBe('incremental');
    // math.ts, plus server.ts and math.test.ts (import it), cli.ts (imports server.ts).
    expect(info.reanalysed).toBe(4);
  });

  it('keeps callers correct when a function they call is renamed', () => {
    edit('src/lib/math.ts', (s) => s.replace(/\badd\b/g, 'sum'));
    edit('src/server.ts', (s) => s.replace(/\badd\b/g, 'sum'));
    expect(expectSameAsFull().mode).toBe('incremental');
  });

  it('keeps database and HTTP links when only the file using a client changes', () => {
    writeFileSync(
      join(root, 'src/db.ts'),
      "import { Pool } from 'pg';\nexport const pool = new Pool();\n",
    );
    writeFileSync(
      join(root, 'src/users.ts'),
      "import { pool } from './db';\nexport async function listAll() {\n  return pool.query('SELECT 1');\n}\n",
    );
    // New files change the file set, so this run is full.
    expect(expectSameAsFull()).toMatchObject({
      mode: 'full',
      reason: 'project configuration, dependencies or the set of files changed',
    });
    edit('src/users.ts', (s) => s.replace('SELECT 1', 'SELECT 2'));
    const info = expectSameAsFull();
    expect(info).toMatchObject({ mode: 'incremental', reanalysed: 1 });
  });

  it('falls back to a full analysis when tsconfig changes', () => {
    edit('tsconfig.json', (s) => s.replace('"strict":true', '"strict":false'));
    expect(expectSameAsFull()).toMatchObject({ mode: 'full', reused: 0 });
  });

  it('falls back to a full analysis when a global declaration changes', () => {
    writeFileSync(
      join(root, 'src/globals.ts'),
      'declare global {\n  var APP: string;\n}\nexport {};\n',
    );
    expectSameAsFull();
    edit('src/globals.ts', (s) => s.replace('string', 'number'));
    expect(expectSameAsFull()).toMatchObject({
      mode: 'full',
      reason: 'a global declaration changed, or every file was affected',
    });
  });

  it('notices changes to declaration files, which are not analysed themselves', () => {
    writeFileSync(
      join(root, 'src/shapes.d.ts'),
      'export interface Shape {\n  area(): number;\n}\n',
    );
    writeFileSync(
      join(root, 'src/square.ts'),
      "import type { Shape } from './shapes';\nexport class Square implements Shape {\n  area(): number {\n    return 4;\n  }\n}\n",
    );
    expectSameAsFull();
    // Renaming the interface makes the heritage link unresolvable: square.ts must be re-analysed.
    edit('src/shapes.d.ts', (s) => s.replace('Shape', 'Polygon'));
    const info = expectSameAsFull();
    expect(info).toMatchObject({ mode: 'incremental', reanalysed: 1 });
  });

  it('a forced full index ignores the cache', () => {
    expect(indexRepository(db, root, { full: true }).incremental[0]).toMatchObject({
      mode: 'full',
      reason: 'incremental indexing not requested',
    });
  });
});

describe('incremental helpers', () => {
  it('classifies files that can declare globals', () => {
    expect(declaresGlobals('a.ts', 'export const a = 1;')).toBe(false);
    expect(declaresGlobals('a.ts', 'const a = 1;')).toBe(true);
    expect(declaresGlobals('a.d.ts', "declare module 'x' {}")).toBe(true);
    expect(declaresGlobals('a.ts', 'export {};\ndeclare global { var X: 1 }')).toBe(true);
    expect(declaresGlobals('a.js', "const fs = require('fs');")).toBe(false);
    expect(declaresGlobals('a.js', 'function legacy() {}')).toBe(true);
  });

  it('propagates changes through dependants transitively', () => {
    const entry = (sha: string, deps: string[]) => ({
      sha,
      deps,
      p1: [],
      p2: [],
      byName: [],
      pending: [],
      s1: { counts: {}, failed: [] },
      s2: { counts: {}, failed: [] },
    });
    const prev = {
      configHash: 'h',
      files: {
        'a.ts': entry('1', []),
        'b.ts': entry('2', ['a.ts']),
        'c.ts': entry('3', ['b.ts']),
        'd.ts': entry('4', []),
      },
    };
    const now = new Map([
      ['a.ts', 'X'],
      ['b.ts', '2'],
      ['c.ts', '3'],
      ['d.ts', '4'],
    ]);
    expect([...(dirtyFiles(prev, now, new Set()) ?? [])].sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(dirtyFiles(prev, now, new Set(['a.ts']))).toBeNull();
    expect(dirtyFiles(prev, new Map([...now, ['d.ts', 'Y']]), new Set())).toBeNull();
  });
});
