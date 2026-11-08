import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dependencyView,
  explainSchemaError,
  detectFrameworks,
  edgesFrom,
  edgesTo,
  findCycles,
  findManifests,
  findNodes,
  flowStarts,
  flowView,
  impactOf,
  indexRepository,
  integrationsView,
  repoLanguages,
  treeChildren,
  knowledgeView,
  modulesView,
  nextRoutePath,
  nodeByKey,
  openDb,
  ownershipView,
  readSource,
  riskView,
  search,
  splitMarkdown,
  stronglyConnected,
  unresolvedList,
  type CoverageReport,
  type Db,
} from '../src/index';
import { makeFixtureRepo } from './fixture';

let root: string;
let db: Db;
let report: CoverageReport;
let repoId: number;

function edge(kind: string, srcKind: string, srcKey: string, dstKind: string, dstKey: string) {
  const s = nodeByKey(db, repoId, srcKind, srcKey);
  const d = nodeByKey(db, repoId, dstKind, dstKey);
  if (!s || !d) return undefined;
  return edgesFrom(db, repoId, s.id, [kind]).find((e) => e.dst === d.id);
}

beforeAll(() => {
  root = makeFixtureRepo();
  db = openDb(':memory:');
  report = indexRepository(db, root);
  repoId = report.repoId;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('indexer: structure and labels', () => {
  it('records symbols with kind, export flag, location, doc and complexity', () => {
    const add = nodeByKey(db, repoId, 'symbol', 'src/lib/math.ts#add');
    expect(add).toMatchObject({ symbolKind: 'function', exported: true, startLine: 4 });
    expect(add?.data.doc).toBe('Adds two positive numbers.');
    expect(add?.data.complexity).toBe(3); // if + && + base
    expect(nodeByKey(db, repoId, 'symbol', 'src/lib/math.ts#Calculator.run')?.symbolKind).toBe(
      'method',
    );
    expect(nodeByKey(db, repoId, 'symbol', 'src/handlers.ts#listUsers')?.exported).toBe(false);
  });

  it('labels compiler-resolved imports (including path aliases) as observed', () => {
    expect(edge('imports', 'file', 'src/server.ts', 'file', 'src/lib/math.ts')?.confidence).toBe(
      'observed',
    );
    expect(edge('imports', 'file', 'src/server.ts', 'file', 'src/handlers.ts')?.confidence).toBe(
      'observed',
    );
  });

  it('labels a bare import that cannot be resolved locally as an inferred external package', () => {
    const e = edge('imports', 'file', 'src/server.ts', 'external', 'express');
    expect(e?.confidence).toBe('inferred');
    expect(e?.detail).toMatch(/not resolvable locally/);
  });

  it('records unresolvable relative imports as unknown instead of guessing', () => {
    expect(
      unresolvedList(db, repoId).some(
        (u) => u.kind === 'import' && u.text === './missing' && u.filePath === 'src/server.ts',
      ),
    ).toBe(true);
    expect(report.imports.unresolved).toBe(1);
  });

  it('resolves calls, constructor calls and method calls through the type checker', () => {
    expect(
      edge('calls', 'symbol', 'src/lib/math.ts#Calculator.run', 'symbol', 'src/lib/math.ts#add'),
    ).toMatchObject({ confidence: 'observed', evidencePath: 'src/lib/math.ts', evidenceLine: 11 });
    expect(
      edge('instantiates', 'symbol', 'src/server.ts#start', 'symbol', 'src/lib/math.ts#Calculator')
        ?.confidence,
    ).toBe('observed');
    expect(
      edge('calls', 'symbol', 'src/server.ts#start', 'symbol', 'src/lib/math.ts#Calculator.run')
        ?.confidence,
    ).toBe('observed');
    expect(
      edge('calls', 'symbol', 'src/handlers.ts#handleUsers', 'symbol', 'src/handlers.ts#listUsers')
        ?.confidence,
    ).toBe('observed');
    expect(
      edge('implements', 'symbol', 'src/lib/math.ts#Calculator', 'symbol', 'src/lib/types.ts#Op')
        ?.confidence,
    ).toBe('observed');
  });

  it('links an untyped JS call to the only matching declaration as inferred', () => {
    const e = edge(
      'calls',
      'symbol',
      'src/legacy.js#legacy',
      'symbol',
      'src/cart.ts#Cart.computeTotal',
    );
    expect(e?.confidence).toBe('inferred');
    expect(e?.detail).toMatch(/unique name/);
  });

  it('counts callback and computed calls as dynamic rather than linking them', () => {
    expect(report.calls.dynamic).toBeGreaterThanOrEqual(2); // cb() and fns[0]()
    expect(
      edgesFrom(db, repoId, nodeByKey(db, repoId, 'symbol', 'src/handlers.ts#each')!.id, ['calls']),
    ).toHaveLength(0);
  });

  it('detects express-style and Next.js routes as inferred, with handlers', () => {
    expect(
      edge('handled_by', 'route', 'GET /users', 'symbol', 'src/handlers.ts#handleUsers')
        ?.confidence,
    ).toBe('inferred');
    expect(nodeByKey(db, repoId, 'route', 'POST /sum')).not.toBeNull();
    expect(
      edge('handled_by', 'route', 'GET /api/items/:id', 'symbol', 'app/api/items/[id]/route.ts#GET')
        ?.confidence,
    ).toBe('inferred');
    expect(nextRoutePath('src/app/(app)/workspaces/[id]/page.tsx')).toEqual({
      kind: 'page',
      path: '/workspaces/:id',
    });
  });

  it('records package.json entry points and test linkage', () => {
    expect(
      edge('starts_at', 'entrypoint', 'fixture-app:bin:fixture', 'file', 'src/cli.ts')?.confidence,
    ).toBe('observed');
    expect(edge('tests', 'file', 'src/math.test.ts', 'file', 'src/lib/math.ts')?.confidence).toBe(
      'inferred',
    );
  });

  it('links docs to code they name (inferred)', () => {
    expect(
      edge('mentions', 'doc', 'docs/README.md', 'symbol', 'src/lib/math.ts#add')?.confidence,
    ).toBe('inferred');
    expect(edge('mentions', 'doc', 'docs/README.md', 'file', 'src/lib/math.ts')?.confidence).toBe(
      'inferred',
    );
    expect(
      splitMarkdown('# A\ntext\n```\n# not a heading\n```\n## B\nmore').map((s) => s.heading),
    ).toEqual(['A', 'B']);
  });
});

describe('indexer: safety and coverage', () => {
  it('never reads files that may hold credentials', () => {
    expect(report.files.skipped.secret).toBe(1);
    expect(report.files.skippedSecretPaths).toEqual(['.env']);
    expect(nodeByKey(db, repoId, 'file', '.env')).toBeNull();
    expect(search(db, repoId, 'supersecretvalue123')).toEqual([]);
    expect(search(db, repoId, 'SECRET_TOKEN')).toEqual([]);
  });

  it('reports unsupported languages as text-only and keeps them searchable', () => {
    expect(report.files.textOnlyByExtension['.py']).toBe(1);
    expect(report.limitations.join(' ')).toMatch(/text only.*\.py/);
    expect(search(db, repoId, 'quarterly report')[0]?.filePath).toBe('tools/report.py');
  });

  it('produces a coverage report with resolution figures', () => {
    expect(report.files.structurallyAnalysed).toBe(12);
    expect(report.files.parseFailures).toEqual([]);
    expect(report.calls.observed).toBeGreaterThan(0);
    expect(report.calls.resolutionRate).toBeGreaterThan(0);
    expect(report.calls.resolutionRate).toBeLessThan(1);
    expect(report.git).toMatchObject({ available: true, commitsScanned: 2 });
  });

  it('records branch, HEAD and whether the working tree was clean', () => {
    expect(report.git).toMatchObject({ branch: 'main', dirtyFiles: 0 });
    expect(report.git.head).toMatch(/^[0-9a-f]{40}$/);
    expect(db.prepare('SELECT branch, head_commit FROM repos WHERE id = ?').get(repoId)).toEqual({
      branch: 'main',
      head_commit: report.git.head,
    });
    expect(report.limitations.join(' ')).not.toMatch(/uncommitted/);
  });

  it('lists manifests and declared frameworks as observed, never reading secret files', () => {
    const byPath = Object.fromEntries(report.manifests.map((m) => [m.path, m.kind]));
    expect(byPath).toMatchObject({
      'package.json': 'package',
      'tsconfig.json': 'tsconfig',
      Dockerfile: 'container',
      '.github/workflows/ci.yml': 'ci',
    });
    expect(byPath['.env']).toBeUndefined();
    expect(report.manifests.every((m) => m.confidence === 'observed')).toBe(true);
    expect(report.frameworks.map((f) => [f.name, f.dev, f.evidence])).toEqual([
      ['Express', false, 'package.json'],
      ['TypeScript', true, 'package.json'],
      ['Vitest', true, 'package.json'],
    ]);
  });

  it('refuses to read source outside the repository', () => {
    expect(readSource(root, 'src/lib/math.ts', 4, 4).lines).toEqual([
      'export function add(a: number, b: number): number {',
    ]);
    expect(() => readSource(root, '../../etc/passwd')).toThrow();
  });

  it('re-indexing replaces data instead of duplicating it', () => {
    const before = db
      .prepare(
        'SELECT (SELECT count(*) FROM nodes) n, (SELECT count(*) FROM edges) e, (SELECT count(*) FROM chunks_fts) f',
      )
      .get();
    indexRepository(db, root);
    const after = db
      .prepare(
        'SELECT (SELECT count(*) FROM nodes) n, (SELECT count(*) FROM edges) e, (SELECT count(*) FROM chunks_fts) f',
      )
      .get();
    expect(after).toEqual(before);
  });
});

describe('queries and views', () => {
  it('search ranks symbol chunks and splits identifiers', () => {
    const hits = search(db, repoId, 'list users');
    expect(hits[0]).toMatchObject({
      filePath: 'src/handlers.ts',
      symbolKey: 'src/handlers.ts#listUsers',
    });
    expect(search(db, repoId, 'how does computeTotal work')[0]?.filePath).toBe('src/cart.ts');
    expect(findNodes(db, repoId, 'Calculator')[0]?.key).toBe('src/lib/math.ts#Calculator');
  });

  it('module and dependency views', () => {
    expect(modulesView(db, repoId).nodes.map((n) => n.label)).toEqual(['fixture-app']);
    const deps = dependencyView(db, repoId, { includeExternal: true });
    const server = deps.nodes.find((n) => n.label === 'src/server.ts');
    expect(server?.metrics?.fanOut).toBe(3);
    expect(deps.nodes.some((n) => n.kind === 'external' && n.label === 'express')).toBe(true);
  });

  it('flow view follows a route into its handler and callees', () => {
    const start = flowStarts(db, repoId).find((n) => n.key === 'GET /users');
    const flow = flowView(db, repoId, start!.id);
    expect(flow.nodes.map((n) => n.label)).toEqual(
      expect.arrayContaining(['GET /users', 'handleUsers', 'listUsers']),
    );
  });

  it('risk view explains every factor', () => {
    const risk = riskView(db, repoId);
    const math = risk.items.find((i) => i.path === 'src/lib/math.ts');
    expect(math?.factors.map((f) => f.name)).toEqual([
      'complexity',
      'churn',
      'fan-in',
      'untested',
      'size',
    ]);
    expect(math?.factors.find((f) => f.name === 'untested')?.value).toBe(0);
    expect(
      risk.items
        .find((i) => i.path === 'src/handlers.ts')
        ?.factors.find((f) => f.name === 'untested')?.value,
    ).toBe(1);
  });

  it('ownership view uses git authors', () => {
    const own = ownershipView(db, repoId, Date.parse('2026-02-01'));
    const names = own.modules[0]?.authors.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Asha Rao', 'Ben Ortiz']));
    expect(own.modules[0]?.busFactor).toBe(1);
  });

  it('knowledge view lists docs and undocumented hotspots', () => {
    const k = knowledgeView(db, repoId);
    expect(k.docs[0]).toMatchObject({ path: 'docs/README.md', title: 'Fixture App' });
    expect(k.undocumentedHotspots.map((h) => h.path)).not.toContain('src/lib/math.ts');
  });

  it('impact analysis walks callers back to routes and tests', () => {
    const add = nodeByKey(db, repoId, 'symbol', 'src/lib/math.ts#add')!;
    const imp = impactOf(db, repoId, add.id);
    expect(imp.affected.map((n) => n.key)).toEqual(
      expect.arrayContaining(['src/lib/math.ts#Calculator.run', 'src/server.ts#start']),
    );
    expect(imp.tests.map((t) => t.key)).toContain('src/math.test.ts');
    expect(edgesTo(db, repoId, add.id, ['calls']).length).toBeGreaterThan(0);
  });
});

describe('without git', () => {
  it('indexes and states that ownership is unavailable', () => {
    const plain = makeFixtureRepo(false);
    try {
      const d = openDb(':memory:');
      const r = indexRepository(d, plain);
      expect(r.git.available).toBe(false);
      expect(r.limitations[0]).toMatch(/Not a git repository/);
      expect(ownershipView(d, r.repoId).notes[0]).toMatch(/cannot be determined/);
      expect(r.files.skipped.secret).toBe(1);
      expect(r.git.branch).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('manifest classification', () => {
  it('recognises lockfiles, workspaces, build configs and CI files, and ignores ordinary files', () => {
    expect(
      findManifests([
        'pnpm-lock.yaml',
        'apps/web/package-lock.json',
        'pnpm-workspace.yaml',
        'apps/web/vite.config.ts',
        'docker-compose.yml',
        '.gitlab-ci.yml',
        '.env.example',
        'src/index.ts',
        'README.md',
      ]).map((m) => `${m.kind}:${m.path}`),
    ).toEqual([
      'build:apps/web/vite.config.ts',
      'ci:.gitlab-ci.yml',
      'container:docker-compose.yml',
      'env-example:.env.example',
      'lockfile:apps/web/package-lock.json',
      'lockfile:pnpm-lock.yaml',
      'workspace:pnpm-workspace.yaml',
    ]);
  });

  it('ignores invalid package.json and unknown dependencies', () => {
    expect(
      detectFrameworks([
        { path: 'a/package.json', text: '{not json' },
        {
          path: 'b/package.json',
          text: '{"dependencies":{"left-pad":"1.0.0","@remix-run/node":"2"}}',
        },
      ]).map((f) => f.name),
    ).toEqual(['Remix']);
  });

  it('flags an index built from a dirty working tree', () => {
    const r = makeFixtureRepo();
    try {
      writeFileSync(join(r, 'src/cart.ts'), '// uncommitted\n', { flag: 'a' });
      const d = openDb(':memory:');
      const rep = indexRepository(d, r);
      expect(rep.git.dirtyFiles).toBe(1);
      expect(rep.limitations.join(' ')).toMatch(/1 paths had uncommitted changes/);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });
});

describe('circular dependencies (S1-4)', () => {
  it('finds the fixture import cycle with its import statements, and flags nothing acyclic', () => {
    const { file, module } = findCycles(db, repoId);
    expect(file).toHaveLength(1);
    expect(file[0]).toMatchObject({
      level: 'file',
      members: ['src/ring/a.ts', 'src/ring/b.ts'],
      typeOnly: false,
    });
    expect(file[0]?.edges.map((e) => `${e.path}:${e.line}`).sort()).toEqual([
      'src/ring/a.ts:1',
      'src/ring/b.ts:1',
    ]);
    expect(module).toEqual([]);
    expect(riskView(db, repoId).findings.cycles).toHaveLength(1);
  });

  it('reports secret-like files as potentially sensitive configuration, by path only', () => {
    const f = riskView(db, repoId).findings.sensitiveConfig;
    expect(f.map((x) => x.path)).toEqual(['.env']);
    expect(JSON.stringify(f)).not.toContain('supersecretvalue123');
    expect(f[0]?.note).toMatch(/did not read it/);
  });

  it('detects module-level cycles across packages and marks type-only cycles', () => {
    const r = mkdtempSync(join(tmpdir(), 'codeatlas-cyc-'));
    try {
      const w = (p: string, c: string) => {
        mkdirSync(dirname(join(r, p)), { recursive: true });
        writeFileSync(join(r, p), c);
      };
      w('packages/x/package.json', '{"name":"x"}');
      w('packages/y/package.json', '{"name":"y"}');
      w('packages/x/index.ts', "import { y } from '../y/index';\nexport const x = () => y();\n");
      w(
        'packages/y/index.ts',
        "import { x } from '../x/index';\nexport const y = (): number => 1;\nexport const z = () => x();\n",
      );
      w('packages/x/t1.ts', "import type { T2 } from './t2';\nexport interface T1 { b?: T2 }\n");
      w('packages/x/t2.ts', "import type { T1 } from './t1';\nexport interface T2 { a?: T1 }\n");
      w('packages/y/leaf.ts', 'export const leaf = 1;\n');
      const d = openDb(':memory:');
      const id = indexRepository(d, r).repoId;
      const { file, module } = findCycles(d, id);
      expect(module.map((c) => c.members)).toEqual([['x', 'y']]);
      expect(modulesView(d, id).cycles).toHaveLength(1);
      expect(file.map((c) => [c.members, c.typeOnly])).toEqual([
        [['packages/x/index.ts', 'packages/y/index.ts'], false],
        [['packages/x/t1.ts', 'packages/x/t2.ts'], true],
      ]);
      expect(file.flatMap((c) => c.members)).not.toContain('packages/y/leaf.ts');
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });

  it('Tarjan: self-loops, separate components, chains and deep graphs', () => {
    const g: Record<string, string[]> = {
      a: ['b'],
      b: ['a'],
      c: ['c'],
      d: ['e'],
      e: [],
      f: ['g'],
      g: ['h'],
      h: ['f'],
    };
    const sccs = stronglyConnected(Object.keys(g), (n) => g[n] ?? []).map((c) => c.sort().join(''));
    expect(sccs.sort()).toEqual(['ab', 'c', 'fgh']);
    const n = 50_000;
    const ids = Array.from({ length: n }, (_, i) => i);
    expect(stronglyConnected(ids, (i) => (i + 1 < n ? [i + 1] : []))).toEqual([]);
    expect(stronglyConnected(ids, (i) => [(i + 1) % n])[0]).toHaveLength(n);
  });
});

describe('failure safety (S2-6)', () => {
  it('a failure while saving leaves the previous index intact and queryable', () => {
    const r = makeFixtureRepo();
    try {
      const d = openDb(':memory:');
      const first = indexRepository(d, r);
      const count = () =>
        (
          d.prepare('SELECT COUNT(*) AS n FROM nodes WHERE repo_id = ?').get(first.repoId) as {
            n: number;
          }
        ).n;
      const before = count();
      expect(before).toBeGreaterThan(0);
      // Inject a failure in the middle of the save transaction, after old rows are deleted.
      d.exec(
        "CREATE TRIGGER fail_edges BEFORE INSERT ON edges BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
      );
      expect(() => indexRepository(d, r)).toThrow(/injected failure/);
      expect(count()).toBe(before);
      expect(search(d, first.repoId, 'listUsers').length).toBeGreaterThan(0);
      const runs = d
        .prepare('SELECT status, error FROM index_runs WHERE repo_id = ? ORDER BY id')
        .all(first.repoId) as { status: string; error: string }[];
      expect(runs.map((x) => x.status)).toEqual(['succeeded', 'failed']);
      expect(runs[1]?.error).toMatch(/injected failure/);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });

  it('explains a missing FTS5 module', () => {
    expect(explainSchemaError(new Error('no such module: fts5')).message).toMatch(
      /without the FTS5 extension/,
    );
    const other = new Error('disk I/O error');
    expect(explainSchemaError(other)).toBe(other);
  });
});

describe('language adapters (S3-1)', () => {
  it('reports each adapter and the languages nothing analyses', () => {
    expect(report.adapters).toEqual([
      expect.objectContaining({
        id: 'typescript',
        languages: ['typescript', 'javascript'],
        filesAnalysed: report.files.structurallyAnalysed,
      }),
    ]);
    expect(report.unsupportedLanguages).toEqual({ Python: 1 });
  });

  it('claims no structure for a language without an adapter', () => {
    const other = openDb(':memory:');
    const r = indexRepository(other, root, { adapters: [] });
    expect(r.adapters).toEqual([]);
    expect(r.files.structurallyAnalysed).toBe(0);
    expect(r.symbols).toBe(0);
    expect(r.unsupportedLanguages.TypeScript).toBeGreaterThan(0);
    expect(r.unsupportedLanguages.Python).toBe(1);
    // Every file is still registered, just without symbols.
    const files = other.prepare("SELECT COUNT(*) AS n FROM nodes WHERE kind = 'file'").get() as {
      n: number;
    };
    expect(files.n).toBe(r.files.discovered);
  });

  it('refuses two adapters claiming the same language', () => {
    const dup = {
      id: 'dup',
      name: 'dup',
      languages: ['typescript' as const],
      analyse: () => ({ filesParsed: 0, filesFailed: [], symbols: 0, routes: 0 }),
    };
    const other = openDb(':memory:');
    expect(() => indexRepository(other, root, { adapters: [dup, { ...dup, id: 'dup2' }] })).toThrow(
      /Two language adapters claim typescript/,
    );
  });
});

describe('configuration, services and databases (S3-3, S3-7)', () => {
  const FILES: Record<string, string> = {
    'src/config.ts': [
      "import 'dotenv/config';",
      "import { readFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      'export const port = Number(process.env.PORT ?? 3000);',
      'export function settings() {',
      '  const { DATABASE_URL, API_KEY: key } = process.env;',
      "  const raw = readFileSync(join(__dirname, 'settings.json'), 'utf8');",
      "  const other = readFileSync('/etc/app/app.yaml', 'utf8');",
      "  return { DATABASE_URL, key, raw, other, mode: import.meta.env.MODE, flag: process.env['FEATURE_X'] };",
      '}',
      'export function dynamic(name: string) {',
      '  return process.env[name];',
      '}',
      'export function setDebug() {',
      "  process.env.DEBUG = '1';",
      '}',
      '',
    ].join('\n'),
    'src/settings.json': '{"theme":"dark"}\n',
    'src/db.ts': "import { Pool } from 'pg';\nexport const pool = new Pool();\n",
    'src/users.ts': [
      "import { pool } from './db';",
      "import { PrismaClient } from '@prisma/client';",
      "import axios from 'axios';",
      'const prisma = new PrismaClient();',
      "const api = axios.create({ baseURL: 'https://api.example.com/v1' });",
      'export async function listUsers() {',
      "  return pool.query('SELECT 1');",
      '}',
      'export async function countPosts() {',
      '  return prisma.post.count();',
      '}',
      'export async function remote() {',
      "  await fetch('https://billing.example.org/invoices', { method: 'POST' });",
      '  await fetch(`/api/items/${1}`);',
      "  return api.get('/users');",
      '}',
      'export async function anyUrl(u: string) {',
      '  return axios.get(u);',
      '}',
      '',
    ].join('\n'),
    'src/local.ts': [
      'function fetch(x: string): string {',
      '  return x;',
      '}',
      "export const notHttp = () => fetch('https://not-a-request.example');",
      '',
    ].join('\n'),
  };
  let r2: string;
  let d2: Db;
  let id2: number;
  let rep2: CoverageReport;
  beforeAll(() => {
    r2 = mkdtempSync(join(tmpdir(), 'codeatlas-integrations-'));
    for (const [p, c] of Object.entries(FILES)) {
      mkdirSync(dirname(join(r2, p)), { recursive: true });
      writeFileSync(join(r2, p), c);
    }
    d2 = openDb(':memory:');
    rep2 = indexRepository(d2, r2);
    id2 = rep2.repoId;
  });
  afterAll(() => rmSync(r2, { recursive: true, force: true }));

  const into = (kind: string, key: string, edgeKind: string) => {
    const n = nodeByKey(d2, id2, kind, key);
    if (!n) return [];
    return edgesTo(d2, id2, n.id, [edgeKind]).map((e) => {
      const src = d2.prepare('SELECT key FROM nodes WHERE id = ?').get(e.src) as { key: string };
      return { src: src.key, confidence: e.confidence, line: e.evidenceLine, detail: e.detail };
    });
  };

  it('links literal environment variable reads to config nodes as observed', () => {
    expect(into('config', 'env:PORT', 'reads_config')).toEqual([
      expect.objectContaining({ src: 'src/config.ts#port', confidence: 'observed', line: 4 }),
    ]);
    for (const name of ['DATABASE_URL', 'API_KEY', 'MODE', 'FEATURE_X'])
      expect(into('config', `env:${name}`, 'reads_config')).toEqual([
        expect.objectContaining({ src: 'src/config.ts#settings', confidence: 'observed' }),
      ]);
    expect(into('config', 'env:DEBUG', 'writes_config')).toEqual([
      expect.objectContaining({ src: 'src/config.ts#setDebug', confidence: 'observed' }),
    ]);
  });

  it('records a computed variable name as unresolved instead of guessing', () => {
    expect(unresolvedList(d2, id2).filter((u) => u.kind === 'config')).toEqual([
      expect.objectContaining({ filePath: 'src/config.ts', line: 12 }),
    ]);
  });

  it('links configuration files as inferred: to the repo file when it exists, otherwise a config node', () => {
    expect(into('file', 'src/settings.json', 'reads_config')).toEqual([
      expect.objectContaining({ src: 'src/config.ts#settings', confidence: 'inferred' }),
    ]);
    expect(into('config', 'file:/etc/app/app.yaml', 'reads_config')).toHaveLength(1);
    expect(into('config', 'file:.env', 'reads_config')).toEqual([
      expect.objectContaining({ src: 'src/config.ts', confidence: 'inferred' }),
    ]);
  });

  it('links database clients, including one imported from another file, as inferred', () => {
    const pg = into('service', 'db:pg', 'accesses_db');
    expect(pg.map((e) => e.src).sort()).toEqual(['src/db.ts#pool', 'src/users.ts#listUsers']);
    expect(pg.every((e) => e.confidence === 'inferred')).toBe(true);
    expect(into('service', 'db:@prisma/client', 'accesses_db').map((e) => e.src)).toContain(
      'src/users.ts#countPosts',
    );
    expect(nodeByKey(d2, id2, 'service', 'db:pg')?.name).toBe('PostgreSQL (pg)');
  });

  it('links outbound HTTP by host, relative path or as not known statically', () => {
    expect(into('service', 'http:billing.example.org', 'calls_service')).toEqual([
      expect.objectContaining({ src: 'src/users.ts#remote', confidence: 'inferred' }),
    ]);
    expect(into('service', 'http:billing.example.org', 'calls_service')[0]!.detail).toMatch(
      /^POST \/invoices/,
    );
    expect(into('service', 'http:same-origin', 'calls_service')[0]!.detail).toMatch(
      /\/api\/items\//,
    );
    // axios.create({ baseURL }) carries its host to later calls.
    expect(into('service', 'http:api.example.com', 'calls_service')[0]!.detail).toMatch(
      /^GET \/v1\/users/,
    );
    expect(into('service', 'http:dynamic', 'calls_service').map((e) => e.src)).toEqual([
      'src/users.ts#anyUrl',
    ]);
  });

  it('summarises integrations in the coverage report', () => {
    expect(rep2.integrations).toEqual({
      envVars: 6,
      configFiles: 3,
      // PORT, DATABASE_URL, API_KEY, MODE, FEATURE_X, DEBUG (write), settings.json, app.yaml, .env
      configReads: 9,
      // billing.example.org, same origin, api.example.com, not known statically
      services: { http: 4, db: 2 },
      serviceCalls: 4,
      // new Pool(), pool.query(), new PrismaClient(), prisma.post.count()
      dbAccesses: 4,
    });
    expect(report.integrations.serviceCalls).toBe(0);
  });

  it('integrations view groups targets with their uses and evidence', () => {
    const v = integrationsView(d2, id2);
    expect(v.config.map((c) => `${c.category}:${c.name}`)).toEqual([
      'configuration file:.env',
      'configuration file:/etc/app/app.yaml',
      'configuration file:src/settings.json',
      'environment variable:API_KEY',
      'environment variable:DATABASE_URL',
      'environment variable:DEBUG',
      'environment variable:FEATURE_X',
      'environment variable:MODE',
      'environment variable:PORT',
    ]);
    const pg = v.services.find((s) => s.key === 'db:pg');
    expect(pg?.category).toBe('database');
    expect(pg?.uses.map((u) => [u.key, u.path, u.confidence])).toEqual([
      ['src/db.ts#pool', 'src/db.ts', 'inferred'],
      ['src/users.ts#listUsers', 'src/users.ts', 'inferred'],
    ]);
    // Impact analysis walks back from a variable to the code that reads it.
    const port = nodeByKey(d2, id2, 'config', 'env:PORT');
    expect(impactOf(d2, id2, port!.id).affected.map((n) => n.key)).toContain('src/config.ts#port');
  });

  it('does not treat a local function named fetch as HTTP', () => {
    expect(into('service', 'http:not-a-request.example', 'calls_service')).toEqual([]);
  });
});

describe('tree and language filter (S3-2)', () => {
  it('drills down repository → module → file → symbol → member', () => {
    const modules = treeChildren(db, repoId);
    expect(modules).toEqual([
      expect.objectContaining({
        kind: 'module',
        label: 'fixture-app',
        expand: { module: 'fixture-app' },
      }),
    ]);
    const files = treeChildren(db, repoId, { module: 'fixture-app' });
    const math = files.find((f) => f.label === 'src/lib/math.ts');
    expect(math).toMatchObject({ kind: 'file', lang: 'typescript', childCount: 3 });
    const symbols = treeChildren(db, repoId, math!.expand as { file: string });
    expect(symbols.map((s) => [s.label, s.symbolKind, s.line])).toEqual([
      ['add', 'function', 4],
      ['Calculator', 'class', 9],
      ['PI', 'variable', 15],
    ]);
    const members = treeChildren(db, repoId, symbols[1]!.expand as { symbol: string });
    expect(members.map((m) => [m.label, m.symbolKind])).toEqual([['run', 'method']]);
    expect(members[0]!.expand).toBeUndefined();
    // Files without symbols cannot be expanded; unknown parents give nothing.
    expect(files.find((f) => f.label === 'docs/README.md')?.expand).toBeUndefined();
    expect(treeChildren(db, repoId, { file: 'nope.ts' })).toEqual([]);
  });

  it('filters the tree, dependency graph and search by language', () => {
    expect(repoLanguages(db, repoId)).toEqual(
      expect.arrayContaining([
        { lang: 'typescript', files: expect.any(Number) },
        { lang: 'javascript', files: 1 },
      ]),
    );
    const js = treeChildren(db, repoId, { module: 'fixture-app', lang: 'javascript' });
    expect(js.map((f) => f.label)).toEqual(['src/legacy.js']);
    expect(treeChildren(db, repoId, { lang: 'javascript' })[0]?.childCount).toBe(1);
    const graph = dependencyView(db, repoId, { lang: 'javascript' });
    expect(graph.nodes.map((n) => n.label)).toEqual(['src/legacy.js']);
    expect(
      search(db, repoId, 'computeTotal', { lang: 'javascript' }).map((h) => h.filePath),
    ).toEqual(['src/legacy.js']);
    expect(
      search(db, repoId, 'computeTotal', { lang: 'typescript' }).every(
        (h) => h.filePath !== 'src/legacy.js',
      ),
    ).toBe(true);
  });
});
