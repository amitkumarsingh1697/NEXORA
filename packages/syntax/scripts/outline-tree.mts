// Prints only the nodes relevant to declaration, import and call extraction, with field names.
import type { Node } from 'web-tree-sitter';
import { initSyntax, parserFor } from '../src/engine.ts';
import { readFileSync } from 'node:fs';
await initSyntax();
const [id, file] = process.argv.slice(2);
const p = parserFor(id!);
if (p instanceof Error) throw p;
const t = p.parse(readFileSync(file!, 'utf8'))!;
const RX =
  /decl|def|class|struct|interface|enum|trait|impl|module|namespace|object|record|function|method|constructor|call|invocation|new|import|use|include|require|param|package|type_spec|property|field_decl|object_creation|instance_creation/;
function show(n: Node, depth: number, field: string | null) {
  const interesting = n.isNamed && RX.test(n.type);
  if (interesting) {
    const fields: string[] = [];
    for (let i = 0; i < n.childCount; i++) {
      const f = n.fieldNameForChild(i);
      if (f) fields.push(`${f}=${n.child(i).type}`);
    }
    console.log(
      `${'  '.repeat(depth)}${field ? field + ':' : ''}${n.type} [${n.startPosition.row + 1}] {${fields.join(', ')}} ${JSON.stringify(n.text.split('\n')[0].slice(0, 50))}`,
    );
  }
  for (let i = 0; i < n.childCount; i++)
    show(n.child(i)!, interesting ? depth + 1 : depth, n.fieldNameForChild(i));
}
show(t.rootNode, 0, null);
console.log('hasError', t.rootNode.hasError);
