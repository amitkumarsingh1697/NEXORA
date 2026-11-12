#!/usr/bin/env node
// Builds the grammars that have no published WebAssembly from their source repositories, each at
// the commit pinned in scripts/grammar-sources.json, with tree-sitter-cli at the version pinned
// there (it compiles with wasi-sdk). Each grammar's generated parser is used as committed; only a
// repository that commits no `src/parser.c` is generated first (`tree-sitter generate`, which
// evaluates its grammar.js). Writes grammars/<id>.wasm.gz, grammars/<id>.LICENSE and the
// grammar's MANIFEST.json entry with the commit and the SHA-256 of the .wasm.
//
// Run: node scripts/build-grammars.mjs [id…]   (needs git and npx; downloads wasi-sdk once)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, 'grammar-sources.json'), 'utf8'));
const outDir = join(here, '..', 'grammars');
const only = process.argv.slice(2);
const manifestPath = join(outDir, 'MANIFEST.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const cli = `${spec.builder.package}@${spec.builder.version}`;
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

/** The SPDX id of a licence text, for the common licences only; anything else is recorded as such. */
function spdx(text) {
  if (/MIT License|Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Apache License,?\s+Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/BSD 3-Clause|Neither the name of/i.test(text)) return 'BSD-3-Clause';
  if (/BSD 2-Clause|Redistributions in binary form/i.test(text)) return 'BSD-2-Clause';
  if (/ISC License|Permission to use, copy, modify, and\/or distribute/i.test(text)) return 'ISC';
  if (/The Unlicense|This is free and unencumbered software/i.test(text)) return 'Unlicense';
  return 'see LICENSE';
}

const failed = [];
for (const g of spec.grammars) {
  if (only.length && !only.includes(g.id)) continue;
  const work = mkdtempSync(join(tmpdir(), 'grammar-src-'));
  try {
    run('git', ['init', '-q', work]);
    run('git', ['-C', work, 'fetch', '-q', '--depth', '1', g.repository, g.commit]);
    run('git', ['-C', work, '-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD']);
    const dir = g.path ? join(work, g.path) : work;
    if (!existsSync(join(dir, 'src', 'parser.c'))) run('npx', ['-y', cli, 'generate'], dir);
    const wasmPath = join(work, `${g.id}.wasm`);
    run('npx', ['-y', cli, 'build', '--wasm', '-o', wasmPath, '.'], dir);
    const wasm = readFileSync(wasmPath);
    const licence = [dir, work]
      .flatMap((d) => readdirSync(d).map((f) => join(d, f)))
      .find((f) => /\/licen[cs]e(\.(md|txt))?$/i.test(f));
    const licenceText = licence ? readFileSync(licence, 'utf8') : '';
    writeFileSync(join(outDir, `${g.id}.wasm.gz`), gzipSync(wasm, { level: 9 }));
    if (licence) writeFileSync(join(outDir, `${g.id}.LICENSE`), licenceText);
    manifest.grammars[g.id] = {
      package: g.repository.replace('https://github.com/', ''),
      version: g.commit,
      file: `${g.id}.wasm`,
      integrity: `git:${g.commit}`,
      sha256: createHash('sha256').update(wasm).digest('hex'),
      bytes: wasm.length,
      license: licence ? spdx(licenceText) : 'unknown',
      repository: g.repository + (g.path ? `/tree/${g.commit}/${g.path}` : ''),
      builtWith: cli,
    };
    console.log(`${g.id}: ${g.repository}@${g.commit.slice(0, 12)} ${wasm.length} bytes`);
  } catch (e) {
    failed.push(g.id);
    console.error(
      `${g.id}: FAILED ${String(e.stderr ?? e.message)
        .trim()
        .split('\n')
        .slice(-3)
        .join(' | ')}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
