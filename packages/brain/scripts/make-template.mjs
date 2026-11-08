// Inlines the built viewer into a single HTML page with a data placeholder (template/, kept
// in git), then copies the page and the renderer next to the ArchLens skill so the skill
// works without this repository. Run `pnpm --filter @nexora/brain build` after viewer changes.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const js = readFileSync(join(pkg, 'dist/brain-viewer.js'), 'utf8').replace(
  /<\/script/gi,
  '<\\/script',
);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Architecture brain</title>
<style>html,body{margin:0;height:100%;background:#05060d}#brain{position:fixed;inset:0}</style>
</head>
<body>
<main id="brain" tabindex="-1"></main>
<script id="brain-data" type="application/json">__BRAIN_DATA__</script>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(join(pkg, 'template'), { recursive: true });
writeFileSync(join(pkg, 'template/brain-template.html'), html);
const skill = join(pkg, '../../skills/archlens');
mkdirSync(join(skill, 'assets'), { recursive: true });
writeFileSync(join(skill, 'assets/brain-template.html'), html);
copyFileSync(join(here, 'render-brain.mjs'), join(skill, 'scripts/render-brain.mjs'));
console.log(`brain-template.html: ${(html.length / 1024).toFixed(0)} KiB`);
