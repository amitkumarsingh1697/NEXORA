#!/usr/bin/env node
// Structural check for the ArchLens skill. Limits come from the Claude Code
// skills documentation (research R11): frontmatter first, SKILL.md < 500 lines,
// description + when_to_use <= 1536 chars, portable fields for claude.ai upload.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTABLE = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);
const errors = [];
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');
const lines = skill.split('\n');

if (lines[0] !== '---') errors.push('frontmatter must start on line 1');
const end = lines.indexOf('---', 1);
if (end < 0) errors.push('frontmatter is not closed');
const fields = {};
for (const line of lines.slice(1, end)) {
  const m = /^([a-zA-Z-]+):\s*(.*)$/.exec(line);
  if (m) fields[m[1]] = m[2];
}
for (const required of ['name', 'description'])
  if (!fields[required]) errors.push(`missing ${required}`);
for (const key of Object.keys(fields))
  if (!PORTABLE.has(key)) errors.push(`non-portable field: ${key}`);
if (fields.name && !/^[a-z0-9-]+$/.test(fields.name))
  errors.push('name must be lowercase kebab-case');
if ((fields.description ?? '').length > 1536) errors.push('description exceeds 1536 characters');
if (lines.length >= 500) errors.push(`SKILL.md has ${lines.length} lines (limit 500)`);

const files = [
  'SKILL.md',
  ...[
    'evidence-model',
    'playbooks',
    'risk-heuristics',
    'report-templates',
    'safe-change-protocol',
    'codeatlas-integration',
    'brain-model',
  ].map((f) => `references/${f}.md`),
];
for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const [, target] of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
    const p = resolve(dirname(join(root, f)), target);
    if (!existsSync(p)) errors.push(`${f}: broken link ${target}`);
  }
}

for (const f of ['assets/brain-template.html', 'scripts/render-brain.mjs', 'scripts/inventory.mjs'])
  if (!existsSync(join(root, f))) errors.push(`missing ${f}`);
const template = join(root, 'assets/brain-template.html');
if (existsSync(template) && !readFileSync(template, 'utf8').includes('__BRAIN_DATA__'))
  errors.push('assets/brain-template.html has no __BRAIN_DATA__ placeholder');

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(
  `✓ archlens: ${Object.keys(fields).join(', ')}; ${lines.length} lines; ${files.length} files linked cleanly`,
);
