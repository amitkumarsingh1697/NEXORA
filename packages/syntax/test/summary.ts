import type { SyntaxResult } from '../src/types';

/** One line per fact, so a whole file's extraction can be read and reviewed at a glance. */
export function summarise(r: SyntaxResult): string {
  const out: string[] = [];
  if (r.namespace) out.push(`namespace ${r.namespace}`);
  for (const i of r.imports)
    out.push(
      `import ${i.spec} @${i.line} ${i.style}${i.names ? ` {${i.names.map((n) => (n.alias ? `${n.name} as ${n.alias}` : n.name)).join(', ')}}` : ''}`,
    );
  r.declarations.forEach((d, i) => {
    const parent = d.parent !== undefined ? ` in #${d.parent}` : '';
    const params = d.params
      ? `(${d.params.map((p) => `${p.variadic ? '...' : ''}${p.name}${p.optional ? '?' : ''}${p.type ? `: ${p.type}` : ''}`).join(', ')})`
      : '';
    out.push(
      `#${i} ${d.kind} ${d.name}${params}${d.returns ? ` -> ${d.returns}` : ''} @${d.line}-${d.endLine}${parent}${d.receiver ? ` recv ${d.receiver}` : ''}${d.bases ? ` extends ${d.bases.join(', ')}` : ''}`,
    );
  });
  for (const c of r.calls)
    out.push(
      `call ${c.owner >= 0 ? `#${c.owner}` : 'top'} ${c.isNew ? 'new ' : ''}${c.receiver ? `${c.receiver} . ` : ''}${c.name} @${c.line}`,
    );
  for (const p of r.problems) out.push(`problem ${p.kind} @${p.line} ${p.text}`);
  return out.join('\n') + '\n';
}
