// Prints the reviewed summary of every fixture (the same text the snapshot test compares).
import { initSyntax, analyseSyntax } from '../src/index.ts';
import { FIXTURES } from '../test/fixtures.ts';
import { summarise } from '../test/summary.ts';
import { readFileSync } from 'node:fs';
await initSyntax();
for (const [lang, file] of FIXTURES) {
  const r = analyseSyntax(
    lang,
    readFileSync(new URL(`../test/fixtures/${file}`, import.meta.url), 'utf8'),
  );
  console.log(`===== ${lang} (${file})`);
  console.log(r instanceof Error ? `ERROR ${r.message}` : r ? summarise(r) : 'NO SPEC');
}
