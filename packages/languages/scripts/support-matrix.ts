// Writes documentation/reports/LANGUAGE_SUPPORT_MATRIX.md from the registry, so the documented
// support is the implemented support. Validation results come from data/validation.json, which
// records real runs (repository, commit, files per analyser, failures).
// Run: node --import tsx packages/languages/scripts/support-matrix.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANALYSERS,
  CATEGORY_LABEL,
  DECLARATION_LANGUAGES,
  LANGUAGES,
  LINGUIST_VERSION,
  ROLE_GROUP_LABEL,
  allRoles,
  type AnalyserId,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../../documentation/reports/LANGUAGE_SUPPORT_MATRIX.md');

interface Validation {
  date: string;
  repositories: { name: string; url: string; commit: string; files: number }[];
  /** analyser label → repository → [files processed, files failed] */
  byMethod: Record<string, Record<string, [number, number]>>;
  /** language → repositories where at least one file was analysed */
  languages: Record<string, string[]>;
}
let validation: Validation | undefined;
try {
  validation = JSON.parse(
    readFileSync(join(here, '../data/validation.json'), 'utf8'),
  ) as Validation;
} catch {
  validation = undefined;
}

const esc = (s: string) => s.replace(/\|/g, '\\|');
const lines: string[] = [];
const p = (s = '') => lines.push(s);

p('# Language and file-format support matrix');
p();
p(
  `Generated from \`packages/languages\` by \`node --import tsx packages/languages/scripts/support-matrix.ts\`. Do not edit by hand. Identification data: GitHub Linguist ${LINGUIST_VERSION} (MIT), ${LANGUAGES.length} languages and formats. Decisions: [ADR 0014](../architecture/adr/0014-language-and-file-format-registry.md). Validation: [LANGUAGE_COVERAGE_VALIDATION.md](LANGUAGE_COVERAGE_VALIDATION.md).`,
);
p();
p(
  'Every listed file gets exactly one status: full, partial, text, unsupported, failed, excluded or binary. A language with no analyser below is still identified, counted and searchable as text; it is never reported as analysed.',
);
p();
p('## Analysers');
p();
p('| Analyser | Level | Capabilities | Limitations | Languages and formats |');
p('| --- | --- | --- | --- | --- |');
const byAnalyser = new Map<AnalyserId, string[]>();
for (const l of LANGUAGES)
  byAnalyser.set(l.analyser, [...(byAnalyser.get(l.analyser) ?? []), l.name]);
for (const [id, a] of Object.entries(ANALYSERS) as [AnalyserId, (typeof ANALYSERS)[AnalyserId]][]) {
  const langs = byAnalyser.get(id) ?? [];
  const shown = id === 'text' ? `every other language (${langs.length})` : langs.join(', ');
  p(
    `| ${esc(a.name)} | ${esc(a.level)} | ${esc(a.capabilities.join('; '))} | ${esc(a.limitations.join('; '))} | ${esc(shown)} |`,
  );
}
p();
p(
  `Declaration patterns cover ${DECLARATION_LANGUAGES.length} languages. Their level is always partial: names, kinds, lines, parameters as written and imports; no calls; not checked by a compiler.`,
);
p();
p('## File types');
p();
p(
  'A file type (role) says what a file does, independent of its syntax. It is matched by path, and for generic syntaxes also by a bounded check of the first 8 KiB.',
);
p();
p('| Group | File type | Path pattern | Content check |');
p('| --- | --- | --- | --- |');
for (const r of [...allRoles()].sort(
  (a, b) =>
    ROLE_GROUP_LABEL[a.group].localeCompare(ROLE_GROUP_LABEL[b.group]) ||
    a.label.localeCompare(b.label),
))
  p(
    `| ${esc(ROLE_GROUP_LABEL[r.group])} | ${esc(r.label)} | \`${esc(r.pathPattern ?? '')}\` | ${r.contentPattern ? `\`${esc(r.contentPattern)}\`` : ''} |`,
  );
p();
p('## Languages with an analyser');
p();
p('Languages not listed here are identified from Linguist data and indexed as text.');
p();
p(
  '| Language | Category | Analyser | Extensions | Filenames | Interpreters | Validated on real repositories |',
);
p('| --- | --- | --- | --- | --- | --- | --- |');
for (const l of [...LANGUAGES]
  .filter((x) => x.analyser !== 'text')
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const v = validation?.languages[l.name];
  p(
    `| ${esc(l.name)} | ${CATEGORY_LABEL[l.category]} | ${esc(ANALYSERS[l.analyser].name)} | ${esc(l.extensions.slice(0, 8).join(' '))}${l.extensions.length > 8 ? ' …' : ''} | ${esc(l.filenames.slice(0, 5).join(' '))}${l.filenames.length > 5 ? ' …' : ''} | ${esc(l.interpreters.slice(0, 5).join(' '))} | ${v?.length ? esc(v.join(', ')) : 'unit tests only'} |`,
  );
}
p();
if (validation) {
  p(`## Validation runs (${validation.date})`);
  p();
  p('Files each analyser processed, per repository (failed in brackets).');
  p();
  const repos = validation.repositories.map((r) => r.name);
  p(`| Method | ${repos.join(' | ')} |`);
  p(`| --- | ${repos.map(() => '---').join(' | ')} |`);
  for (const [m, per] of Object.entries(validation.byMethod).sort())
    p(
      `| ${esc(m)} | ${repos.map((r) => (per[r] ? `${per[r][0]}${per[r][1] ? ` (${per[r][1]})` : ''}` : '')).join(' | ')} |`,
    );
  p();
}
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote ${out}`);
