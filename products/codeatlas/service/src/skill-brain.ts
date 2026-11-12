/**
 * Entry point of the ArchLens skill's `scripts/brain/brain.mjs` (ADR 0020), bundled by
 * `pnpm --filter @nexora/codeatlas-service skill`. Runs the CodeAtlas indexer with Node alone:
 * the index lives in a temporary folder that is removed afterwards.
 *
 *   node brain.mjs <repo> [--out file.html] [--json model.json] [--max-files n] [--scip x.scip]… [--run-indexers]
 */
import { openDb } from '@nexora/codeatlas-core';
import { setGrammarDir } from '@nexora/syntax';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBrain } from './brain-command';
import { relaunchWithLargerHeap } from './heap';

const here = dirname(fileURLToPath(import.meta.url));
const relaunched = relaunchWithLargerHeap(fileURLToPath(import.meta.url), process.argv.slice(2));
if (relaunched !== null) process.exit(relaunched);
setGrammarDir(join(here, 'grammars'));
const template = readFileSync(join(here, '..', '..', 'assets', 'brain-template.html'), 'utf8');
const home = mkdtempSync(join(tmpdir(), 'archlens-index-'));
try {
  const db = openDb(join(home, 'index.db'));
  try {
    writeBrain(db, process.argv.slice(2), (t) => process.stdout.write(t), template);
  } finally {
    db.close();
  }
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exitCode = 1;
} finally {
  rmSync(home, { recursive: true, force: true });
}
