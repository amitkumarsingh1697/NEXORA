// Copies the bundled inventory script into the ArchLens skill, with a header saying where it
// comes from. Run `pnpm --filter @nexora/languages build` after registry changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = readFileSync(join(pkg, 'dist/inventory.mjs'), 'utf8');
const header =
  '#!/usr/bin/env node\n// Generated from packages/languages (src/cli/inventory.ts) by `pnpm --filter @nexora/languages build`. Do not edit.\n// Language identification data: GitHub Linguist languages.yml (MIT licence, see packages/languages/data/LINGUIST-LICENSE).\n';
const out = header + js.replace(/^#!.*\n/, '');
writeFileSync(join(pkg, '../../skills/archlens/scripts/inventory.mjs'), out);
console.log(`inventory.mjs: ${(out.length / 1024).toFixed(0)} KiB`);
