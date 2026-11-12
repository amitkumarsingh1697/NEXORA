// Prints what the ORM readers find under a directory: tsx scripts/show.mts <dir>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { classify } from '@nexora/languages';
import { initSyntax } from '@nexora/syntax';
import { readOrm, resolveOrm, type OrmFile } from '../src/index';
await initSyntax();
const dir = process.argv[2]!;
const files: OrmFile[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (n !== 'node_modules' && n !== '.git') walk(p);
      continue;
    }
    const rel = relative(dir, p);
    const text = readFileSync(p, 'utf8');
    const lang = classify({ path: rel, head: readFileSync(p).subarray(0, 8192) }).language ?? '';
    const r = readOrm(rel, lang, text, { efCore: true, gorm: true });
    if (r) files.push(r);
  }
};
walk(dir);
const s = resolveOrm(files);
if (process.env.RAW)
  console.log(JSON.stringify(files, (k, v) => (typeof v === 'function' ? '[fn]' : v), 1));
for (const t of s.tables)
  console.log(
    `${t.kind} ${t.name} [${t.framework} ${t.naming}${t.alter ? ' alter' : ''}] ${t.path}:${t.line}${t.rule ? ` (${t.rule})` : ''}\n  ${t.columns.map((c) => `${c.name}:${c.type}${c.primaryKey ? ' PK' : ''}${c.nullable ? '' : ' NN'}${c.unique ? ' U' : ''}${c.length ? `(${c.length})` : ''}${c.default ? ` =${c.default}` : ''}${c.references ? ` →${c.references.table}.${c.references.column ?? ''}` : ''}${c.implicit ? ' *' : ''}`).join('\n  ')}`,
  );
for (const f of s.foreignKeys)
  console.log(
    `FK ${f.table}.${f.column} → ${f.refTable}.${f.refColumn ?? ''} ${f.confidence} ${f.path}:${f.line}`,
  );
for (const m of s.mappings)
  console.log(`MAP ${m.owner} → ${m.table} ${m.access} ${m.confidence}: ${m.detail}`);
for (const u of s.unresolved) console.log(`UNRESOLVED ${u.path}:${u.line} ${u.text}`);
for (const f of files)
  for (const p of f.problems) console.log(`PROBLEM ${f.path}:${p.line} ${p.message}`);
