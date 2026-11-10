/** Small helpers over tree-sitter nodes, shared by the readers. */
import type { SyntaxNode } from '@nexora/syntax';

export type N = SyntaxNode;

export const line = (n: N) => n.startPosition.row + 1;
export const endLine = (n: N) => n.endPosition.row + 1;

export function named(n: N | null | undefined): N[] {
  if (!n) return [];
  const out: N[] = [];
  for (let i = 0; i < n.namedChildCount; i++) {
    const c = n.namedChild(i);
    if (c) out.push(c);
  }
  return out;
}

/** Every descendant (depth first) that passes `pick`; does not enter a node `pick` accepts when `stop` is set. */
export function findAll(root: N, pick: (n: N) => boolean, stop = false): N[] {
  const out: N[] = [];
  const walk = (n: N) => {
    if (pick(n)) {
      out.push(n);
      if (stop) return;
    }
    for (const c of named(n)) walk(c);
  };
  walk(root);
  return out;
}

export const field = (n: N | null | undefined, name: string): N | null =>
  n ? n.childForFieldName(name) : null;

/** The value of a string literal node in most grammars, or undefined when it is not a plain string. */
export function stringOf(n: N | null | undefined): string | undefined {
  if (!n) return undefined;
  const t = n.type;
  if (
    t === 'string' ||
    t === 'string_literal' ||
    t === 'interpreted_string_literal' ||
    t === 'raw_string_literal' ||
    t === 'encapsed_string' ||
    t === 'verbatim_string_literal' ||
    t === 'line_string_literal' ||
    t === 'string_content' ||
    t === 'charlist'
  ) {
    if (named(n).some((c) => /interpolation|substitution|template/.test(c.type))) return undefined;
    const raw = n.text;
    const m = /^(?:[rbuf]|@|r#*)?(["'`]{1,3})([\s\S]*?)\1#*$/i.exec(raw);
    if (m) return m[2];
    return raw.replace(/^["'`]+|["'`]+$/g, '');
  }
  if (t === 'symbol' || t === 'simple_symbol' || t === 'atom') return n.text.replace(/^:/, '');
  return undefined;
}

export const words = (s: string) => s.replace(/\s+/g, ' ').trim();
