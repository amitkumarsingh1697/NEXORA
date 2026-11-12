/**
 * `brain <path>`: index a repository and write its architecture brain. Shared by the CodeAtlas
 * CLI and the copy bundled into the ArchLens skill (src/skill-brain.ts, ADR 0020), so both give
 * the same result.
 */
import { buildBrain, indexRepository, type Db } from '@nexora/codeatlas-core';
import { renderBrainHtml } from '@nexora/brain';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SCIP_USAGE = '[--scip index.scip]… [--run-indexers]';
export const BRAIN_USAGE = '[--out file.html] [--json model.json] [--max-files n]';

/**
 * `--scip <file>` (repeatable) reads an index an indexer already wrote; `--run-indexers` runs the
 * source-only ones found on PATH (scip-python, scip-go). Removes the flags from `args`.
 */
export function scipFlags(a: string[]): { files: string[]; run: boolean } {
  const files: string[] = [];
  let run = false;
  for (let i = 0; i < a.length;) {
    if (a[i] === '--scip') {
      const f = a[i + 1];
      if (!f) throw new Error('--scip needs a .scip file');
      files.push(f);
      a.splice(i, 2);
    } else if (a[i] === '--run-indexers') {
      run = true;
      a.splice(i, 1);
    } else i++;
  }
  return { files, run };
}

function takeFlag(a: string[], name: string): string | undefined {
  const i = a.indexOf(name);
  if (i < 0) return undefined;
  const v = a[i + 1];
  if (!v) throw new Error(`${name} needs a value`);
  a.splice(i, 2);
  return v;
}

/** Indexes `args[0]` into `db`, writes the page (and the model with `--json`), prints coverage. */
export function writeBrain(
  db: Db,
  argv: string[],
  print: (text: string) => void,
  template?: string,
): { html: string; json?: string } {
  const args = [...argv];
  const out = takeFlag(args, '--out');
  const json = takeFlag(args, '--json');
  const maxFiles = takeFlag(args, '--max-files');
  const scip = scipFlags(args);
  const root = args[0];
  if (!root) throw new Error(`usage: brain <path> ${BRAIN_USAGE} ${SCIP_USAGE}`);
  // A brain covers the whole repository: no file-count limit unless one is asked for.
  const limit = maxFiles === undefined ? Infinity : Number(maxFiles);
  if (!(limit > 0)) throw new Error('--max-files needs a positive number');
  const report = indexRepository(db, root, {
    onProgress: (m) => process.stderr.write(`… ${m}\n`),
    scip,
    limits: { maxFiles: limit },
  });
  for (const s of report.scip?.sources ?? [])
    process.stderr.write(
      s.error
        ? `SCIP ${s.name}: not used (${s.error})\n`
        : `SCIP ${s.name}: ${s.documents} files from ${s.tool ?? 'an indexer'}\n`,
    );
  const brain = buildBrain(db, report.repoId);
  if (!brain) throw new Error('The repository was indexed but could not be read back.');
  const html = resolve(out ?? `${brain.source.repository || 'repository'}-brain.html`);
  writeFileSync(html, renderBrainHtml(brain, template));
  const jsonFile = json ? resolve(json) : undefined;
  if (jsonFile) writeFileSync(jsonFile, `${JSON.stringify(brain, null, 2)}\n`);
  print(
    `Architecture brain: ${brain.neurons.length} parts, ${brain.synapses.length} connections.\nOpen ${html} in a browser.\n${jsonFile ? `Model: ${jsonFile}\n` : ''}`,
  );
  // Coverage is part of the result, not a detail: a partial brain must say so (QA AL-01).
  if (brain.coverage) {
    print(
      `${brain.coverage.partial ? 'Partial coverage' : 'Coverage'}: ${brain.coverage.summary}\n`,
    );
    for (const g of brain.coverage.gaps) print(`  - ${g}\n`);
    const inv = brain.coverage.inventory;
    if (inv) {
      const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
      print('Languages and formats (files, analysed, status):\n');
      for (const l of inv.languages.slice(0, 20))
        print(
          `  ${l.language.padEnd(28)} ${String(l.files).padStart(7)} ${pct(l.coverage).padStart(5)}  ${l.status}\n`,
        );
      if (inv.languages.length > 20)
        print(`  … and ${inv.languages.length - 20} more (see Languages & files in the brain)\n`);
    }
  }
  return { html, ...(jsonFile ? { json: jsonFile } : {}) };
}
