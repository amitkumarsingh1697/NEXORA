// Prints a tree-sitter tree (debugging aid): tsx scripts/dump.mts <grammar> <file>
import { readFileSync } from 'node:fs';
import { initSyntax, parseTree, type SyntaxNode } from '@nexora/syntax';
await initSyntax();
const [g, f] = process.argv.slice(2) as [string, string];
const t = parseTree(g, readFileSync(f, 'utf8'));
if (t instanceof Error) throw t;
const walk = (n: SyntaxNode, d: number, field: string | null) => {
  const leaf = n.namedChildCount === 0 ? ` ${JSON.stringify(n.text.slice(0, 40))}` : '';
  console.log(`${'  '.repeat(d)}${field ? field + ': ' : ''}${n.type}${leaf}`);
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i)!;
    if (c.isNamed) walk(c, d + 1, n.fieldNameForChild(i));
  }
};
walk(t.rootNode, 0, null);
