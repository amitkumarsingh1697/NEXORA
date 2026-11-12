import { initSyntax, parserFor } from '../src/engine.ts';
import type { Node } from 'web-tree-sitter';
import { readFileSync } from 'node:fs';
await initSyntax();
const [id, file] = process.argv.slice(2);
const p = parserFor(id!);
if (p instanceof Error) throw p;
const t = p.parse(readFileSync(file!, 'utf8'))!;
function show(n: Node, depth: number, field: string | null) {
  const pad = '  '.repeat(depth);
  const txt =
    n.childCount === 0 || n.type.endsWith('identifier')
      ? ' ' + JSON.stringify(n.text.slice(0, 40))
      : '';
  if (n.isNamed)
    console.log(`${pad}${field ? field + ': ' : ''}${n.type} [${n.startPosition.row + 1}]${txt}`);
  for (let i = 0; i < n.childCount; i++)
    show(n.child(i)!, n.isNamed ? depth + 1 : depth, n.fieldNameForChild(i));
}
show(t.rootNode, 0, null);
console.log('hasError', t.rootNode.hasError);
