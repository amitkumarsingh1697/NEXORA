#!/usr/bin/env node
// Renders an architecture-brain model (JSON) into one self-contained HTML file.
// Usage: node render-brain.mjs <model.json> <out.html> [--template <brain-template.html>] [--strict]
// The page validates the model in full when it opens. This script refuses a model the page
// would refuse (wrong format, too large), warns about "observed" links with no file and
// line (an error with --strict), and escapes the model so it cannot break out of its
// <script> tag.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const strictAt = args.indexOf('--strict');
const strict = strictAt >= 0;
if (strict) args.splice(strictAt, 1);
const flag = args.indexOf('--template');
const templateArg = flag >= 0 ? args.splice(flag, 2)[1] : undefined;
const [input, output] = args;
if (!input || !output) {
  console.error('Usage: node render-brain.mjs <model.json> <out.html> [--template <file>]');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const template = [
  templateArg,
  join(here, '../assets/brain-template.html'),
  join(here, '../template/brain-template.html'),
].find((p) => p && existsSync(p));
if (!template) {
  console.error('brain-template.html not found; pass --template <file>.');
  process.exit(2);
}
let model;
try {
  model = JSON.parse(readFileSync(resolve(input), 'utf8'));
} catch (e) {
  console.error(`${input} is not valid JSON: ${e.message}`);
  process.exit(1);
}
// Accept the CodeAtlas API response ({ brain }) as well as a bare model.
if (model && typeof model === 'object' && model.brain) model = model.brain;
if (!model || !Array.isArray(model.neurons) || !Array.isArray(model.synapses)) {
  console.error(`${input} must be an object with "neurons" and "synapses" arrays.`);
  process.exit(1);
}
// The same limits the page enforces (packages/brain/src/model.ts), so a broken page is never
// reported as written.
const problems = [];
if (model.format !== 1) problems.push(`"format" must be 1 (got ${JSON.stringify(model.format)}).`);
if (model.neurons.length > 20000)
  problems.push(`Too many neurons (${model.neurons.length} > 20000).`);
if (model.synapses.length > 100000)
  problems.push(`Too many synapses (${model.synapses.length} > 100000).`);
if (problems.length) {
  console.error(`${input} cannot be shown by the brain page: ${problems.join(' ')}`);
  process.exit(1);
}
// ArchLens rule: every observed link cites the file and line it was read from.
const unbacked = model.synapses.filter(
  (s) => s && s.confidence === 'observed' && !(s.file && Number.isInteger(s.line) && s.line > 0),
);
if (unbacked.length) {
  const msg = `${unbacked.length} "observed" synapse(s) have no file and line, e.g. ${JSON.stringify(unbacked[0]).slice(0, 200)}. Add the evidence or label them "inferred".`;
  if (strict) {
    console.error(msg);
    process.exit(1);
  }
  console.error(`Warning: ${msg}`);
}
const data = JSON.stringify(model)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');
const title = String(model.title ?? 'Architecture brain')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;');
const html = readFileSync(template, 'utf8')
  .replace('<title>Architecture brain</title>', () => `<title>${title}</title>`)
  .replace('__BRAIN_DATA__', () => data);
writeFileSync(resolve(output), html);
console.log(
  `Wrote ${output}: ${model.neurons.length} neurons, ${model.synapses.length} synapses. Open it in a browser.`,
);
