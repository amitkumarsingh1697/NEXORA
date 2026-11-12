import { initSyntax, analyseSyntax } from '../src/index.ts';
import { readFileSync } from 'node:fs';
await initSyntax();
const [lang, file] = process.argv.slice(2);
const r = analyseSyntax(lang!, readFileSync(file!, 'utf8'));
if (!r || r instanceof Error) {
  console.log(r);
  process.exit(1);
}
console.log('namespace', r.namespace, 'problems', JSON.stringify(r.problems));
for (const i of r.imports) console.log('IMPORT', JSON.stringify(i));
r.declarations.forEach((d, i) =>
  console.log(
    'DECL',
    i,
    d.kind,
    d.name,
    `L${d.line}-${d.endLine}`,
    'parent',
    d.parent,
    'recv',
    d.receiver ?? '',
    'params',
    JSON.stringify(d.params),
    'ret',
    d.returns ?? '',
    'bases',
    JSON.stringify(d.bases ?? []),
    '|',
    d.signature,
  ),
);
for (const c of r.calls)
  console.log('CALL', c.owner, c.line, c.receiver ?? '', c.name, c.isNew ? 'NEW' : '');
