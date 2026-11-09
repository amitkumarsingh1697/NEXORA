/**
 * ArchLens inventory: lists every file of a repository, identifies its language and file type
 * with the shared registry, and records what was done to it. Bundled into
 * skills/archlens/scripts/inventory.mjs (standalone, Node.js built-ins only).
 *
 *   node inventory.mjs <repo> [--model brain-model.json] [--read paths.txt] [--out inventory.json]
 *
 * Without a model every readable file is "text" (listed and identified, not analysed). Files the
 * model cites (neuron or synapse `file`) and files named in --read were read in the session:
 * they become "partial" (structure recorded by hand, not checked by a compiler). Nothing is ever
 * "full" here. With --model the summary is written into the model's coverage.inventory.
 */
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classify } from '../detect';
import { checkInventory, coverageSentence, summarize, type FileRecord } from '../inventory';
import { listRepository, readHead } from '../listing';
import { generatedReason, inIgnoredDir, isSecretPath } from '../policy';
import { LINGUIST_VERSION } from '../registry';
import type { Classification } from '../types';

const HEAD_BYTES = 8192;
const MAX_FILES = 200_000;

export interface InventoryRun {
  records: FileRecord[];
  unlisted: { path: string; reason: string }[];
  usedGit: boolean;
}

/** Classifies every listed path. `read` holds paths the session actually read. */
export function inventoryRepository(root: string, read: Set<string> = new Set()): InventoryRun {
  const { paths, usedGit, submodules, unlisted } = listRepository(root);
  const records: FileRecord[] = [];
  const add = (
    path: string,
    c: Classification,
    status: FileRecord['status'],
    method: string,
    reason?: string,
    bytes?: number,
  ) => {
    const r: FileRecord = {
      path,
      language: c.language,
      category: c.category,
      status,
      method,
      detectedBy: c.detectedBy,
      confidence: c.confidence,
    };
    if (c.role) r.role = c.role;
    if (reason) r.reason = reason;
    if (bytes !== undefined) r.bytes = bytes;
    if (c.alternatives) r.alternatives = c.alternatives;
    records.push(r);
  };
  const byName = (path: string) => classify({ path, head: null });
  for (const path of paths) {
    if (records.length >= MAX_FILES) {
      add(
        path,
        byName(path),
        'excluded',
        'not read',
        `beyond the ${MAX_FILES.toLocaleString('en-US')}-file limit`,
      );
      continue;
    }
    if (submodules.has(path)) {
      add(
        path,
        { ...byName(path), language: 'Git submodule', category: 'data' },
        'excluded',
        'not read',
        'git submodule; a separate repository',
      );
      continue;
    }
    if (inIgnoredDir(path)) {
      if (usedGit)
        add(path, byName(path), 'excluded', 'not read', 'in a build-output or dependency folder');
      continue;
    }
    if (isSecretPath(path)) {
      add(path, byName(path), 'excluded', 'not read', 'may contain credentials; never read');
      continue;
    }
    const gen = generatedReason(path);
    if (gen) {
      add(path, byName(path), 'excluded', 'not read', `generated: ${gen}`);
      continue;
    }
    const abs = join(root, path);
    let size: number;
    try {
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        add(
          path,
          byName(path),
          'excluded',
          'not read',
          'symbolic link; the target is not followed',
        );
        continue;
      }
      if (!st.isFile()) {
        add(path, byName(path), 'failed', 'not read', 'not a regular file');
        continue;
      }
      size = st.size;
    } catch (e) {
      add(
        path,
        byName(path),
        'failed',
        'not read',
        `could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
      );
      continue;
    }
    let head: Buffer;
    try {
      head = readHead(abs, HEAD_BYTES);
    } catch (e) {
      add(
        path,
        byName(path),
        'failed',
        'not read',
        `could not be read (${(e as NodeJS.ErrnoException).code ?? 'error'})`,
        size,
      );
      continue;
    }
    const c = classify({ path, head });
    if (c.category === 'binary')
      add(
        path,
        c,
        'binary',
        'not read',
        c.binaryKind ? `binary content (${c.binaryKind})` : 'binary content',
        size,
      );
    else if (c.lfsPointer)
      add(
        path,
        c,
        'unsupported',
        'not read',
        'Git LFS pointer; the real content is not in the clone',
        size,
      );
    else if (read.has(path))
      add(path, c, 'partial', 'read by ArchLens (structure recorded by hand)', undefined, size);
    else add(path, c, 'text', 'listed and identified; not read', undefined, size);
  }
  return { records, unlisted, usedGit };
}

/** Paths a brain model cites: the files whose content was read to build it. */
export function citedFiles(model: unknown): Set<string> {
  const out = new Set<string>();
  const m = model as { neurons?: unknown[]; synapses?: unknown[] };
  for (const x of [
    ...(Array.isArray(m?.neurons) ? m.neurons : []),
    ...(Array.isArray(m?.synapses) ? m.synapses : []),
  ]) {
    const f = (x as { file?: unknown })?.file;
    if (typeof f === 'string' && f) out.add(f.replace(/^\.\//, ''));
  }
  return out;
}

function main(argv: string[]): number {
  const args = [...argv];
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const modelPath = opt('--model');
  const readPath = opt('--read');
  const outPath = opt('--out');
  const [root] = args;
  if (!root) {
    console.error(
      'Usage: node inventory.mjs <repo> [--model brain-model.json] [--read paths.txt] [--out inventory.json]',
    );
    return 2;
  }
  let model: Record<string, unknown> | undefined;
  if (modelPath) {
    try {
      model = JSON.parse(readFileSync(resolve(modelPath), 'utf8')) as Record<string, unknown>;
    } catch (e) {
      console.error(`${modelPath} is not valid JSON: ${(e as Error).message}`);
      return 1;
    }
    if (model && typeof model === 'object' && 'brain' in model)
      model = model.brain as Record<string, unknown>;
  }
  const read = model ? citedFiles(model) : new Set<string>();
  if (readPath)
    for (const line of readFileSync(resolve(readPath), 'utf8').split('\n'))
      if (line.trim()) read.add(line.trim().replace(/^\.\//, ''));
  const run = inventoryRepository(resolve(root), read);
  const summary = summarize(run.records, { producer: 'archlens' });
  const errors = checkInventory(summary);
  if (errors.length) {
    console.error(`Inventory invariant broken: ${errors.join('; ')}`);
    return 1;
  }
  const sentence = coverageSentence(summary);
  const listedPaths = new Set(run.records.map((r) => r.path));
  const missing = [...read].filter((p) => !listedPaths.has(p));
  console.log(
    `${run.usedGit ? 'git ls-files' : 'directory walk'}; registry: GitHub Linguist ${LINGUIST_VERSION} data plus Nexora overlays.`,
  );
  console.log(sentence);
  console.log('Languages and formats (files, analysed, status):');
  for (const l of summary.languages.slice(0, 25))
    console.log(
      `  ${l.language.padEnd(30)} ${String(l.files).padStart(7)} ${String(l.analysed).padStart(7)}  ${l.status}`,
    );
  if (summary.languages.length > 25) console.log(`  … and ${summary.languages.length - 25} more`);
  if (summary.fileTypes.length)
    console.log(`File types: ${summary.fileTypes.map((r) => `${r.files} ${r.label}`).join(', ')}.`);
  for (const r of summary.reasons) console.log(`  ${r.status}: ${r.reason} (${r.files})`);
  for (const u of run.unlisted.slice(0, 10)) console.log(`  not listed: ${u.path} (${u.reason})`);
  if (missing.length)
    console.log(
      `Warning: ${missing.length} cited paths are not files of this repository, e.g. ${missing.slice(0, 3).join(', ')}.`,
    );
  const inventory = { ...summary, summary: sentence, unlisted: run.unlisted };
  if (outPath)
    writeFileSync(
      resolve(outPath),
      `${JSON.stringify({ inventory, records: run.records }, null, 1)}\n`,
    );
  if (model && modelPath) {
    const cov = (
      model.coverage && typeof model.coverage === 'object' ? model.coverage : {}
    ) as Record<string, unknown>;
    const gaps = Array.isArray(cov.gaps)
      ? (cov.gaps as unknown[]).filter(
          (g) => typeof g === 'string' && !g.startsWith('File inventory:'),
        )
      : [];
    model.coverage = {
      ...cov,
      // A hand-built brain reads files by hand: it is always partial.
      partial: true,
      summary: typeof cov.summary === 'string' && cov.summary ? cov.summary : sentence,
      gaps: [`File inventory: ${sentence}`, ...gaps],
      inventory,
    };
    writeFileSync(resolve(modelPath), `${JSON.stringify(model, null, 1)}\n`);
    console.log(`Wrote coverage.inventory into ${modelPath}.`);
  }
  return 0;
}

const isMain =
  typeof process !== 'undefined' && process.argv[1] && /inventory\.(mjs|ts)$/.test(process.argv[1]);
if (isMain) process.exitCode = main(process.argv.slice(2));
