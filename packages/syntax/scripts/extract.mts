// Prints what the syntax layer extracts from a file: tsx scripts/extract.mts <Language> <file>
import { readFileSync } from 'node:fs';
import { analyseSyntax, initSyntax } from '../src/index';
await initSyntax();
const r = analyseSyntax(process.argv[2]!, readFileSync(process.argv[3]!, 'utf8'));
if (!r || r instanceof Error) throw r ?? new Error('no spec');
for (const d of r.declarations)
  console.log(
    `D ${d.line}-${d.endLine} ${d.kind} ${d.name}${d.receiver ? ` recv=${d.receiver}` : ''}${d.parent !== undefined ? ` in=${r.declarations[d.parent]!.name}` : ''} params=${JSON.stringify(d.params ?? null)} ret=${d.returns ?? ''} bases=${JSON.stringify(d.bases ?? [])}`,
  );
for (const c of r.calls)
  console.log(
    `C ${c.line} ${c.owner >= 0 ? r.declarations[c.owner]!.name : '-'} ${c.callee} name=${c.name} recv=${c.receiver ?? ''}`,
  );
for (const i of r.imports) console.log(`I ${i.line} ${i.spec} ${i.style} ${i.alias ?? ''}`);
for (const p of r.problems) console.log(`P ${p.line} ${p.kind} ${p.text}`);
