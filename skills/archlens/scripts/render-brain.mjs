#!/usr/bin/env node
// Renders an architecture-brain model (JSON) into one self-contained HTML file.
// Usage: node render-brain.mjs <model.json> <out.html> [--template <brain-template.html>]
// The page validates the model when it opens; this script only checks it is JSON with
// neurons and synapses, and escapes it so it cannot break out of its <script> tag.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
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
