import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { indexRepository, loadScip, openDb, type CoverageReport, type Db } from '../src/index';

/**
 * The scip package's fixture: a small Python project and the index scip-python 0.6.8 wrote for
 * it (packages/scip/test/fixtures/README.md).
 */
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/scip/test/fixtures',
);
const SOURCES = ['shop/__init__.py', 'shop/models.py', 'shop/service.py'];

let root: string;
let plain: { db: Db; repoId: number; report: CoverageReport };
let withScip: { db: Db; repoId: number; report: CoverageReport };

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-scip-'));
  for (const p of SOURCES) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    copyFileSync(join(FIXTURE, 'py', p), join(root, p));
  }
  const run = (scip?: { files: string[] }) => {
    const db = openDb(':memory:');
    const report = indexRepository(db, root, scip ? { scip } : {});
    return { db, repoId: report.repoId, report };
  };
  plain = run();
  withScip = run({ files: [join(FIXTURE, 'py.scip')] });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

type Edge = { src: string; dst: string; kind: string; confidence: string; detail: string };
const edges = (x: { db: Db; repoId: number }): Edge[] =>
  x.db
    .prepare(
      `SELECT s.key AS src, d.key AS dst, e.kind, e.confidence, e.detail FROM edges e
       JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.kind IN ('calls', 'instantiates', 'extends', 'implements')`,
    )
    .all(x.repoId) as Edge[];
const from = (x: { db: Db; repoId: number }, src: string) => edges(x).filter((e) => e.src === src);

describe('compiler-grade links from a SCIP index', () => {
  it('reports the index it read', () => {
    expect(plain.report.scip).toBeUndefined();
    expect(withScip.report.scip?.sources).toEqual([
      expect.objectContaining({ from: 'file', tool: 'scip-python 0.6.8', documents: 3 }),
    ]);
    // The empty shop/__init__.py has nothing to resolve.
    expect(withScip.report.otherAnalysis.scip.files).toBe(2);
  });

  it('records the files an index covers as resolved by the compiler', () => {
    const rec = withScip.db
      .prepare('SELECT method, resolution FROM file_inventory WHERE repo_id = ? AND path = ?')
      .get(withScip.repoId, 'shop/service.py') as { method: string; resolution: string };
    expect(rec.resolution).toBe('compiler');
    expect(rec.method).toMatch(/references resolved by scip-python 0\.6\.8/);
  });

  it('adds method calls only types can resolve', () => {
    // Base and Draft both declare save and total: name matching cannot choose.
    const before = from(plain, 'shop/service.py#checkout').map((e) => e.dst);
    expect(before).not.toContain('shop/models.py#Base.save');
    expect(before).not.toContain('shop/models.py#Order.total');
    const after = from(withScip, 'shop/service.py#checkout');
    expect(after).toContainEqual(
      expect.objectContaining({
        dst: 'shop/models.py#Base.save',
        confidence: 'observed',
        detail: expect.stringMatching(/resolved by scip-python 0\.6\.8 to shop\/models\.py:9/),
      }),
    );
    expect(after).toContainEqual(
      expect.objectContaining({ dst: 'shop/models.py#Order.total', confidence: 'observed' }),
    );
  });

  it('links an overloaded function to its implementation, not a stub', () => {
    const parse = from(withScip, 'shop/service.py#checkout').filter((e) =>
      e.dst.startsWith('shop/models.py#parse'),
    );
    expect(parse).toHaveLength(1);
    expect(parse[0]).toMatchObject({
      confidence: 'observed',
      detail: 'parse: resolved by scip-python 0.6.8 to shop/models.py:22',
    });
    const impl = withScip.db
      .prepare('SELECT start_line FROM nodes WHERE repo_id = ? AND kind = ? AND key = ?')
      .get(withScip.repoId, 'symbol', parse[0]!.dst) as { start_line: number };
    expect(impl.start_line).toBe(22);
  });

  it('keeps the syntax link where the index has no definition for a repository symbol', () => {
    // scip-python records `class ConnectionError` as the builtin; the import says otherwise.
    const a = from(plain, 'shop/service.py#checkout').find((e) =>
      e.dst.endsWith('#ConnectionError'),
    );
    const b = from(withScip, 'shop/service.py#checkout').find((e) =>
      e.dst.endsWith('#ConnectionError'),
    );
    expect(a).toBeDefined();
    expect(b).toEqual(a);
  });

  it('counts library calls as external, not unresolved', () => {
    const s = withScip.report.otherAnalysis.scip;
    expect(s.external).toBeGreaterThan(0);
    expect(s.resolved).toBe(s.agreed + s.corrected + s.added);
    expect(withScip.report.otherAnalysis.syntax.calls.unresolved).toBeLessThan(
      plain.report.otherAnalysis.syntax.calls.unresolved,
    );
  });

  it('keeps base classes', () => {
    expect(edges(withScip)).toContainEqual(
      expect.objectContaining({ src: 'shop/models.py#Order', dst: 'shop/models.py#Base' }),
    );
  });
});

/** A minimal protobuf encoder for a hand-made index (test only). */
const varint = (n: number): number[] => {
  const out: number[] = [];
  do {
    out.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
    n = Math.floor(n / 128);
  } while (n > 0);
  return out;
};
const len = (no: number, b: number[] | string) => {
  const d = typeof b === 'string' ? [...new TextEncoder().encode(b)] : b;
  return [...varint(no * 8 + 2), ...varint(d.length), ...d];
};
const num = (no: number, v: number) => [...varint(no * 8), ...varint(v)];
const occ = (line: number, col: number, symbol: string, roles = 0) =>
  len(2, [...len(1, [line, col, col + 3].flatMap(varint)), ...len(2, symbol), ...num(3, roles)]);

describe('an index that disagrees with name matching', () => {
  // Two modules declare `run`; the import names a.py, the (hand-made) index says b.py.
  const FILES: Record<string, string> = {
    'a.py': 'def run():\n    pass\n',
    'b.py': 'def run():\n    pass\n',
    'main.py': 'from a import run\n\ndef main():\n    run()\n',
  };
  const A = 'scip-python python demo 1 a/run().';
  const B = 'scip-python python demo 1 b/run().';
  let dir: string;
  let x: { db: Db; repoId: number; report: CoverageReport };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeatlas-scip-'));
    for (const [p, t] of Object.entries(FILES)) writeFileSync(join(dir, p), t);
    const index = [
      ...len(1, len(2, [...len(1, 'test-indexer'), ...len(2, '1')])),
      ...len(2, [...len(1, 'a.py'), ...occ(0, 4, A, 1)]),
      ...len(2, [...len(1, 'b.py'), ...occ(0, 4, B, 1)]),
      ...len(2, [
        ...len(1, 'main.py'),
        ...occ(2, 4, 'scip-python python demo 1 main/main().', 1),
        ...occ(3, 4, B),
      ]),
    ];
    writeFileSync(join(dir, 'idx.scip'), Uint8Array.from(index));
    const db = openDb(':memory:');
    const report = indexRepository(db, dir, { scip: { files: ['idx.scip'] } });
    x = { db, repoId: report.repoId, report };
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('follows the index and names what name matching had chosen', () => {
    expect(from(x, 'main.py#main')).toEqual([
      {
        src: 'main.py#main',
        dst: 'b.py#run',
        kind: 'calls',
        confidence: 'observed',
        detail: 'run: resolved by test-indexer 1 to b.py:1 (name matching had chosen a.py:1)',
      },
    ]);
    expect(x.report.otherAnalysis.scip).toMatchObject({ resolved: 1, corrected: 1, agreed: 0 });
  });
});

describe('loadScip', () => {
  it('reports a missing or unreadable index instead of failing', () => {
    const bad = join(root, 'bad.scip');
    writeFileSync(bad, Uint8Array.from([0x0a, 0x05, 0x61]));
    const { resolver, report } = loadScip(root, SOURCES, { files: ['missing.scip', bad] });
    expect(resolver).toBeUndefined();
    expect(report.sources).toEqual([
      { from: 'file', name: 'missing.scip', error: 'file not found' },
      {
        from: 'file',
        name: bad,
        error: expect.stringMatching(/^unreadable index: length past the end/),
      },
    ]);
  });

  it('runs an indexer found on PATH in the repository, and reports one that is missing', () => {
    // A stand-in for scip-python (test only): checks its arguments, then writes the fixture index.
    const bin = mkdtempSync(join(tmpdir(), 'codeatlas-bin-'));
    const index = readFileSync(join(FIXTURE, 'py.scip'));
    writeFileSync(join(bin, 'fixture.scip'), index);
    writeFileSync(
      join(bin, 'scip-python'),
      [
        '#!/bin/sh',
        '[ "$1" = index ] && [ "$2" = . ] || exit 3',
        `[ -f shop/service.py ] || exit 4`,
        'while [ "$1" != --output ]; do shift; done',
        `cp "${join(bin, 'fixture.scip')}" "$2"`,
        '',
      ].join('\n'),
    );
    chmodSync(join(bin, 'scip-python'), 0o755);
    const path = process.env.PATH;
    // The stand-in needs cp; no indexer lives in /bin or /usr/bin.
    process.env.PATH = `${bin}:/bin:/usr/bin`;
    try {
      const run = loadScip(root, [...SOURCES, 'go.mod'], { run: true });
      expect(run.report.sources).toEqual([
        expect.objectContaining({
          from: 'run',
          name: 'scip-python',
          tool: 'scip-python 0.6.8',
          documents: 3,
        }),
        { from: 'run', name: 'scip-go', error: 'not installed' },
      ]);
      expect(run.resolver?.covers('shop/service.py')).toBe('scip-python 0.6.8');
      // Nothing to index: no indexer is started.
      expect(loadScip(root, ['README.md'], { run: true }).report.sources).toEqual([]);
    } finally {
      process.env.PATH = path;
      rmSync(bin, { recursive: true, force: true });
    }
  });

  it('reports an indexer that fails, with its last error line', () => {
    const bin = mkdtempSync(join(tmpdir(), 'codeatlas-bin-'));
    writeFileSync(
      join(bin, 'scip-go'),
      '#!/bin/sh\necho "go: go.mod requires go >= 9.0" >&2\nexit 1\n',
    );
    chmodSync(join(bin, 'scip-go'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = bin;
    try {
      expect(loadScip(root, ['go.mod'], { run: true }).report.sources).toEqual([
        expect.objectContaining({
          from: 'run',
          name: 'scip-go',
          error: 'exit code 1: go: go.mod requires go >= 9.0',
        }),
      ]);
    } finally {
      process.env.PATH = path;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
