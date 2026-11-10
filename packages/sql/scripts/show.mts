import { readFileSync } from 'node:fs';
import { classify } from '@nexora/languages';
import { analyseSql, initSql } from '../src/index';
await initSql();
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8');
  const lang =
    process.env.LANG_HINT ??
    classify({ path: f, head: readFileSync(f).subarray(0, 64 * 1024) }).language;
  const t0 = performance.now();
  const r = analyseSql(text, lang);
  if (process.env.BRIEF) {
    console.log(
      `${f}: lang=${lang} ${r.dialect} ${r.mode} stmts=${r.statements} understood=${r.understood} parsed=${r.parsedStatements} objects=${r.objects.length} problems=${r.problems.length} ${(performance.now() - t0).toFixed(0)}ms`,
    );
    for (const p of r.problems.slice(0, 4))
      console.log(`  ! ${p.line}: ${p.message.slice(0, 140)}`);
    continue;
  }
  console.log(
    `== ${f}: ${r.dialect} ${r.mode} "${r.method}" stmts=${r.statements} understood=${r.understood} parsed=${r.parsedStatements}`,
  );
  for (const p of r.problems) console.log(`  ! line ${p.line}: ${p.message}`);
  for (const o of r.objects) {
    const bits: string[] = [];
    if (o.params)
      bits.push(
        `params=${o.params.map((p) => `${p.mode} ${p.name}:${p.type}${p.default ? '=' + p.default : ''}`).join('; ')}`,
      );
    if (o.returns) bits.push(`returns=${o.returns}`);
    if (o.language) bits.push(`lang=${o.language}`);
    if (o.columns)
      bits.push(`cols=${o.columns.map((c) => c.name + (c.type ? ':' + c.type : '')).join(',')}`);
    if (o.values) bits.push(`values=${o.values.join(',')}`);
    for (const k of ['reads', 'writes', 'calls'] as const)
      if (o[k])
        bits.push(
          `${k}=${o[k]!.map((x) => `${x.schema ? x.schema + '.' : ''}${x.name}@${x.line}${x.explicit ? '!' : ''}`).join(',')}`,
        );
    if (o.dynamicSql) bits.push(`dynamic=${o.dynamicSql.join(',')}`);
    if (o.table) bits.push(`table=${o.table}`);
    if (o.timing)
      bits.push(
        `timing=${o.timing} events=${o.events?.join('|')} each=${o.forEach} exec=${o.executes}`,
      );
    if (o.indexColumns)
      bits.push(`idx=${o.indexColumns.join(',')} unique=${!!o.unique} method=${o.method}`);
    if (o.options) bits.push(`opts=${JSON.stringify(o.options)} owned=${o.ownedBy}`);
    if (o.comment) bits.push(`comment=${o.comment}`);
    console.log(
      `  ${o.kind} ${o.parent ? o.parent + '.' : ''}${o.schema ? o.schema + '.' : ''}${o.name} [${o.line}-${o.endLine}] ${bits.join(' ')}`,
    );
    if (o.signature) console.log(`      sig: ${o.signature}`);
  }
}
