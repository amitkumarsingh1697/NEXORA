// Prints the variables a file declares (name, type, constructed class, owner).
import { initSyntax, analyseSyntax } from '../src/index.ts';
import { readFileSync } from 'node:fs';
await initSyntax();
const [lang, file] = process.argv.slice(2);
const r = analyseSyntax(lang!, readFileSync(file!, 'utf8'));
if (!r || r instanceof Error) throw r;
for (const v of r.vars)
  console.log(
    `${v.name} type=${v.type ?? '-'} init=${v.init ?? '-'} owner=${v.owner >= 0 ? r.declarations[v.owner]!.name : 'top'} @${v.line}`,
  );
