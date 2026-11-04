/**
 * Indexing benchmark (S3-6): cold index, no-change re-index, re-index after appending a
 * function to <file>, and a forced full index of the same state; checks the incremental and
 * full graphs are identical. <file> is restored afterwards.
 *
 * Usage: pnpm --filter @nexora/codeatlas-core exec tsx scripts/benchmark.ts <repo> <file>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexRepository, openDb, type Db } from '../src/index';
const root = process.argv[2]!;
const target = process.argv[3]!;
function snap(db: Db, id: number) {
  const n = (
    db
      .prepare(
        'SELECT kind,key,name,file_path,symbol_kind,exported,start_line,end_line,data FROM nodes WHERE repo_id=?',
      )
      .all(id) as Record<string, unknown>[]
  )
    .map((x) =>
      JSON.stringify({
        ...x,
        data: Object.fromEntries(Object.entries(JSON.parse(x.data as string) as object).sort()),
      }),
    )
    .sort();
  const e = (
    db
      .prepare(
        'SELECT e.kind,e.confidence,e.evidence_path,e.evidence_line,e.detail,s.key s,d.key d FROM edges e JOIN nodes s ON s.id=e.src JOIN nodes d ON d.id=e.dst WHERE e.repo_id=?',
      )
      .all(id) as Record<string, unknown>[]
  )
    .map((x) => JSON.stringify(x))
    .sort();
  const u = (
    db
      .prepare('SELECT file_path,line,kind,text,reason FROM unresolved WHERE repo_id=?')
      .all(id) as Record<string, unknown>[]
  )
    .map((x) => JSON.stringify(x))
    .sort();
  return JSON.stringify({ n, e, u });
}
const t = <T>(f: () => T) => {
  const s = Date.now();
  const r = f();
  return [r, Date.now() - s] as const;
};
const a = openDb(':memory:');
const [r1, cold] = t(() => indexRepository(a, root));
const [r2, noop] = t(() => indexRepository(a, root));
const abs = join(root, target);
const orig = readFileSync(abs, 'utf8');
try {
  writeFileSync(
    abs,
    orig + '\nexport function __codeatlasBenchProbe(): number {\n  return 1;\n}\n',
  );
  const [r3, one] = t(() => indexRepository(a, root));
  const b = openDb(':memory:');
  const [r4, full] = t(() => indexRepository(b, root, { full: true }));
  console.log(
    JSON.stringify(
      {
        cold,
        noopMs: noop,
        noop: r2.incremental[0],
        oneFileMs: one,
        one: r3.incremental[0],
        fullMs: full,
        equal: snap(a, r3.repoId) === snap(b, r4.repoId),
        files: r1.files.discovered,
        analysed: r1.files.structurallyAnalysed,
        symbols: r1.symbols,
        peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
        node: process.version,
      },
      null,
      1,
    ),
  );
} finally {
  writeFileSync(abs, orig);
}
