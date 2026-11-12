// Prints a summary of a SCIP index: tsx scripts/inspect.mts <index.scip>
import { readFileSync } from 'node:fs';
import { decodeIndex, SymbolRole } from '../src/index';
const t0 = Date.now();
const idx = decodeIndex(readFileSync(process.argv[2]!));
const ms = Date.now() - t0;
let occ = 0,
  defs = 0,
  encl = 0,
  rels = 0,
  syms = 0;
for (const d of idx.documents) {
  occ += d.occurrences.length;
  for (const o of d.occurrences) {
    if (o.roles & SymbolRole.Definition) {
      defs++;
      if (o.enclosing) encl++;
    }
  }
  syms += d.symbols.length;
  for (const s of d.symbols) rels += s.relationships.length;
}
console.log({
  tool: idx.tool,
  root: idx.projectRoot,
  docs: idx.documents.length,
  occ,
  defs,
  enclosingOnDefs: encl,
  syms,
  rels,
  external: idx.externalSymbols.length,
  ms,
});
const d = idx.documents.find((x) => (process.argv[3] ? x.path.includes(process.argv[3]) : true))!;
console.log(d.path, d.language, d.positionEncoding);
for (const o of d.occurrences.slice(0, Number(process.argv[4] ?? 25)))
  console.log(JSON.stringify(o));
for (const s of d.symbols.slice(0, 8)) console.log(JSON.stringify(s));
