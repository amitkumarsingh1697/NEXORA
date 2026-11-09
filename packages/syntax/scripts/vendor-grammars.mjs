#!/usr/bin/env node
// Downloads each pinned grammar package from the npm registry (npm verifies the registry's
// sha512 integrity), copies its WebAssembly grammar and licence into grammars/, gzipped, and
// writes grammars/MANIFEST.json with the source package, version, integrity and SHA-256 of the
// uncompressed .wasm. Run: node scripts/vendor-grammars.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, 'grammars.json'), 'utf8'));
const outDir = join(here, '..', 'grammars');
const only = process.argv.slice(2);
const manifest = existsSync(join(outDir, 'MANIFEST.json'))
  ? JSON.parse(readFileSync(join(outDir, 'MANIFEST.json'), 'utf8'))
  : { grammars: {} };

for (const g of spec.grammars) {
  if (only.length && !only.includes(g.id)) continue;
  const work = mkdtempSync(join(tmpdir(), 'grammar-'));
  try {
    const out = execFileSync(
      'npm',
      [
        'pack',
        `${g.package}@${g.version}`,
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        work,
      ],
      { encoding: 'utf8' },
    );
    const info = JSON.parse(out)[0];
    execFileSync('tar', ['-xzf', join(work, info.filename), '-C', work]);
    const pkg = join(work, 'package');
    const wasm = readFileSync(join(pkg, g.wasm));
    const licenceFile = readdirSync(pkg).find((f) => /^licen[cs]e/i.test(f));
    const pj = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
    writeFileSync(join(outDir, `${g.id}.wasm.gz`), gzipSync(wasm, { level: 9 }));
    if (licenceFile)
      writeFileSync(join(outDir, `${g.id}.LICENSE`), readFileSync(join(pkg, licenceFile)));
    manifest.grammars[g.id] = {
      package: g.package,
      version: g.version,
      file: g.wasm,
      integrity: info.integrity,
      sha256: createHash('sha256').update(wasm).digest('hex'),
      bytes: wasm.length,
      license: pj.license ?? 'unknown',
      repository: typeof pj.repository === 'string' ? pj.repository : (pj.repository?.url ?? ''),
    };
    console.log(`${g.id}: ${g.package}@${g.version} ${wasm.length} bytes`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
writeFileSync(join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
