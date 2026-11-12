/**
 * Walks one parse tree with a language spec and returns its declarations, imports, calls and
 * syntax problems. Pure: no file system, no resolution across files.
 */
import type { Node, Tree } from 'web-tree-sitter';
import { parserFor } from './engine';
import { constructedType, field, genericParam, line, paramsOf, text, type LangSpec } from './spec';
import {
  CONTAINER_KINDS,
  type SyntaxCall,
  type SyntaxDecl,
  type SyntaxProblem,
  type SyntaxResult,
  type SyntaxVar,
} from './types';

const MAX_PROBLEMS = 50;
const own = <T>(m: Record<string, T> | undefined, k: string): T | undefined =>
  m && Object.hasOwn(m, k) ? m[k] : undefined;
const CONSTRUCTOR_NAMES = new Set(['__init__', 'initialize', '__construct', 'constructor']);

/** The last line a node covers; a node that ends at a line's first column ends on the line before. */
function endLineOf(n: Node): number {
  const e = n.endPosition;
  return e.column === 0 && e.row > n.startPosition.row ? e.row : e.row + 1;
}

function signatureOf(n: Node, body: Node | null | undefined): string {
  const end = body && body.startIndex > n.startIndex ? body.startIndex : n.endIndex;
  const raw = n.tree.rootNode.text.slice(n.startIndex, end);
  const head = body ? raw : (raw.split('\n')[0] ?? raw);
  return head
    .replace(/\s+/g, ' ')
    .replace(/[\s{:=]+$/, '')
    .trim()
    .slice(0, 200);
}

function splitCallee(t: string): { name: string; receiver?: string } {
  const s = t.replace(/\s*(\.|::|->)\s*/g, '$1').replace(/\(\)$/, '');
  const m = /^(.*?)(?:\.|::|->|\\|#|:)([^.:\->\\#]+)$/.exec(s);
  if (m && m[1] && m[2]) return { receiver: m[1], name: m[2] };
  return { name: s.replace(/^[@$&*]+/, '') };
}

export function extractTree(tree: Tree, spec: LangSpec, language: string): SyntaxResult {
  const declarations: SyntaxDecl[] = [];
  const calls: SyntaxCall[] = [];
  const imports: SyntaxResult['imports'] = [];
  const problems: SyntaxProblem[] = [];
  const vars: SyntaxVar[] = [];
  let namespace: string | undefined;
  const readParam = spec.param ?? genericParam;

  /** Walks `n`; returns the index of the declaration it made, or -1. */
  const walk = (n: Node, owner: number, container: number): number => {
    if ((n.isError || n.isMissing) && !(n.isMissing && spec.optionalTokens?.includes(n.type))) {
      if (problems.length < MAX_PROBLEMS)
        problems.push({
          line: line(n),
          kind: n.isMissing ? 'missing' : 'error',
          text: (n.isMissing ? `missing ${n.type}` : n.text.split('\n')[0]!).slice(0, 80),
        });
    }
    let nextOwner = owner;
    let nextContainer = container;
    let made = -1;

    const ns = own(spec.namespace, n.type);
    if (ns && namespace === undefined) namespace = ns(n) ?? undefined;

    const imp = own(spec.imports, n.type);
    if (imp) imports.push(...imp(n));

    const call = own(spec.calls, n.type);
    if (call) {
      const parts = call(n);
      if (parts?.nameText) {
        calls.push({ owner, callee: parts.nameText, name: parts.nameText, line: line(n) });
      } else if (parts?.nameString) {
        const receiver = (parts.receiverText ?? parts.receiver?.text)
          ?.replace(/\s+/g, ' ')
          .trim()
          .replace(/(\?\.|\.|::|->)$/, '');
        calls.push({
          owner,
          callee: `${receiver ? `${receiver}.` : ''}${parts.nameString}`.slice(0, 120),
          name: parts.nameString,
          ...(receiver ? { receiver } : {}),
          line: line(n),
        });
      } else if (parts?.callee || parts?.name) {
        const calleeText = (
          parts.callee
            ? parts.callee.text
            : `${parts.receiver ? `${parts.receiver.text}.` : ''}${parts.name!.text}`
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
        let name: string;
        let receiver: string | undefined;
        if (parts.name) {
          name = parts.name.text.replace(/^[@$]+/, '');
          receiver = parts.receiver ? parts.receiver.text.replace(/\s+/g, ' ').trim() : undefined;
        } else ({ name, receiver } = splitCallee(calleeText));
        if (name)
          calls.push({
            owner,
            callee: calleeText,
            name,
            ...(receiver ? { receiver } : {}),
            line: line(n),
            ...(parts.isNew ? { isNew: true } : {}),
          });
      }
    }

    const v = own(spec.vars, n.type);
    if (v)
      for (const part of v(n)) {
        const name = part.name.replace(/\s+/g, '');
        if (!name || name.length > 80) continue;
        const type = part.type?.replace(/\s+/g, ' ').trim();
        const init = constructedType(part.value);
        const copy =
          part.value && /^\$?[A-Za-z_]\w*$/.test(part.value.text) ? part.value.text : undefined;
        if (!type && !init && !copy) continue;
        vars.push({
          // A field belongs to the class it is declared in; a local to its function.
          owner:
            owner >= 0 && /^(function|method|constructor)$/.test(declarations[owner]!.kind)
              ? owner
              : container,
          name,
          ...(type ? { type } : {}),
          ...(init ? { init } : {}),
          ...(!type && !init && copy ? { copyOf: copy } : {}),
          line: line(n),
        });
      }

    const rule = own(spec.decls, n.type);
    if (rule) {
      let kind = typeof rule.kind === 'function' ? rule.kind(n) : rule.kind;
      const name = kind ? (rule.name ? rule.name(n) : text(field(n, 'name'))) : undefined;
      if (kind && name) {
        const parentDecl = container >= 0 ? declarations[container] : undefined;
        if (kind === 'function' && parentDecl && CONTAINER_KINDS.has(parentDecl.kind))
          kind = 'method';
        const receiver = rule.receiver?.(n) ?? undefined;
        const receiverName = receiver ? (rule.receiverName?.(n) ?? undefined) : undefined;
        if (kind === 'function' && receiver) kind = 'method';
        if (
          kind === 'method' &&
          (CONSTRUCTOR_NAMES.has(name) ||
            (parentDecl && CONTAINER_KINDS.has(parentDecl.kind) && parentDecl.name === name) ||
            (receiver && receiver === name))
        )
          kind = 'constructor';
        let params: SyntaxDecl['params'];
        if (rule.paramList) params = rule.paramList(n);
        else {
          const pl = rule.params ? rule.params(n) : field(n, 'parameters');
          params = pl ? paramsOf(pl, readParam) : undefined;
        }
        const returns = rule.returns?.(n) ?? undefined;
        const bases = rule.bases?.(n);
        const d: SyntaxDecl = {
          name: name.replace(/\s+/g, ''),
          kind,
          line: line(n),
          endLine: endLineOf(n),
          signature: signatureOf(n, rule.body ? rule.body(n) : field(n, 'body')),
          ...(container >= 0 ? { parent: container } : {}),
          ...(params ? { params } : {}),
          ...(returns ? { returns } : {}),
          ...(bases?.length ? { bases } : {}),
          ...(receiver ? { receiver } : {}),
          ...(receiverName ? { receiverName } : {}),
        };
        declarations.push(d);
        const idx = declarations.length - 1;
        made = idx;
        nextContainer = idx;
        if (/^(function|method|constructor|property)$/.test(kind)) nextOwner = idx;
        else if (owner < 0 || CONTAINER_KINDS.has(kind)) nextOwner = idx;
      }
    }
    const kids = n.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (!c) continue;
      const d = walk(c, nextOwner, nextContainer);
      if (d < 0) continue;
      const trailing = own(spec.decls, c.type)?.trailing;
      const k = declarations[d]!.kind;
      const asOwner =
        /^(function|method|constructor|property)$/.test(k) ||
        nextOwner < 0 ||
        CONTAINER_KINDS.has(k);
      // Bodies (Dart) or further clauses (Erlang) after the declaration belong to it: their
      // calls and nested declarations too.
      for (let cur: Node = c; trailing;) {
        const body = trailing(cur);
        if (!body) break;
        // Unnamed tokens (a newline in assembly) may sit between the two.
        let j = i + 1;
        while (j < kids.length && !kids[j]!.isNamed && kids[j]!.startIndex < body.startIndex) j++;
        const next = kids[j];
        if (!next || body.startIndex !== next.startIndex) break;
        declarations[d]!.endLine = endLineOf(next);
        walk(next, asOwner ? d : nextOwner, d);
        i = j;
        cur = next;
      }
    }
    return made;
  };
  walk(tree.rootNode, -1, -1);
  return {
    language,
    grammar: spec.grammar,
    declarations,
    imports,
    calls,
    problems,
    vars,
    ...(namespace ? { namespace } : {}),
  };
}

/** Parses `source` with the spec's grammar. Returns an Error when the grammar cannot be used. */
export function extractSource(
  spec: LangSpec,
  language: string,
  source: string,
): SyntaxResult | Error {
  const parser = parserFor(spec.grammar);
  if (parser instanceof Error) return parser;
  const tree = parser.parse(source);
  if (!tree) return new Error('the parser returned no tree');
  try {
    return extractTree(tree, spec, language);
  } catch (e) {
    return new Error(`extraction failed: ${(e as Error).message}`);
  } finally {
    tree.delete();
  }
}
