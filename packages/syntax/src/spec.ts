/**
 * The language-spec format and the helpers specs share. A spec says, for one grammar, which node
 * types declare something, which are calls and which are imports, and how to read their parts.
 */
import type { Node } from 'web-tree-sitter';
import type { DeclKind, SyntaxImport, SyntaxParam } from './types';

export interface DeclRule {
  kind: DeclKind | ((n: Node) => DeclKind | null);
  /** Default: the `name` field. */
  name?: (n: Node) => string | null | undefined;
  /** The node holding the parameters. Default: the `parameters` field. */
  params?: (n: Node) => Node | null | undefined;
  /** Reads the parameters directly, when they are not children of one node. Wins over `params`. */
  paramList?: (n: Node) => SyntaxParam[] | undefined;
  returns?: (n: Node) => string | null | undefined;
  bases?: (n: Node) => string[];
  receiver?: (n: Node) => string | null | undefined;
  /** The name the receiver is bound to inside the method (Go `func (c *Cart) …` → c). */
  receiverName?: (n: Node) => string | null | undefined;
  /** The node whose start ends the signature. Default: the `body` field. */
  body?: (n: Node) => Node | null | undefined;
  /**
   * A body the grammar places after the declaration, as its next sibling (Dart's
   * `function_signature` then `function_body`): walked as part of the declaration.
   */
  trailing?: (n: Node) => Node | null | undefined;
}

export interface CallParts {
  /** The callee expression, for its text (or receiver + name when absent). */
  callee?: Node | null | undefined;
  /** When the grammar separates them: the receiver and the called name. */
  receiver?: Node | null;
  name?: Node | null;
  isNew?: boolean;
  /** The called name as text, when it is not one node (HCL references such as `module.vpc`). */
  nameText?: string;
  /** The callee's name when it is not one node (an Objective-C selector such as `add:qty:`). */
  nameString?: string;
  /** With `nameString`: the receiver as text, when it is not one node (a Dart selector chain). */
  receiverText?: string;
}

export interface LangSpec {
  grammar: string;
  decls: Record<string, DeclRule>;
  calls: Record<string, (n: Node) => CallParts | null>;
  imports: Record<string, (n: Node) => SyntaxImport[]>;
  /** Reads one parameter node (some grammars declare several names in one). Default: `genericParam`. */
  param?: (n: Node) => SyntaxParam | SyntaxParam[] | null;
  /** Node types whose text is the file's package or namespace. */
  namespace?: Record<string, (n: Node) => string | null | undefined>;
  /** Tokens the language lets authors leave out (Groovy semicolons): missing ones are not errors. */
  optionalTokens?: string[];
  /** Receiver names that mean "this object" (default: self, this). */
  selfNames?: string[];
  /** Variable and field declarations: name, declared type and value node. */
  vars?: Record<string, (n: Node) => VarParts[]>;
}

export interface VarParts {
  name: string;
  type?: string | undefined;
  value?: Node | null | undefined;
}

export const line = (n: Node): number => n.startPosition.row + 1;
export const field = (n: Node | null | undefined, f: string): Node | null =>
  n ? n.childForFieldName(f) : null;
export const text = (n: Node | null | undefined): string | undefined =>
  n ? n.text.replace(/\s+/g, ' ').trim() || undefined : undefined;
export const fieldText = (f: string) => (n: Node) => text(field(n, f));
/** Every child under field `f` (some grammars repeat a field, such as Solidity's `ancestor`). */
export function childrenWithField(n: Node | null | undefined, f: string): Node[] {
  const out: Node[] = [];
  if (!n) return out;
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (c && n.fieldNameForChild(i) === f) out.push(c);
  }
  return out;
}
export const named = (n: Node | null | undefined): Node[] =>
  n ? (n.namedChildren.filter(Boolean) as Node[]) : [];
export const childOfType = (n: Node | null | undefined, ...types: string[]): Node | null =>
  named(n).find((c) => types.includes(c.type)) ?? null;
export const childrenOfType = (n: Node | null | undefined, ...types: string[]): Node[] =>
  named(n).filter((c) => types.includes(c.type));
export const unquote = (s: string): string => s.replace(/^[@]?["'`<]+|["'`>]+$/g, '');

const IDENT =
  /identifier|^name$|^constant$|^simple_identifier$|^type_identifier$|^field_identifier$/;

/** The first identifier-like node at or below `n`, depth first. */
export function firstIdentifier(n: Node | null | undefined): Node | null {
  if (!n) return null;
  if (IDENT.test(n.type) || n.type === 'variable_name') return n;
  for (const c of named(n)) {
    const hit = firstIdentifier(c);
    if (hit) return hit;
  }
  return null;
}

/** C-family declarators: follow `declarator` fields down to the declared name. */
export function declaratorName(n: Node | null | undefined): Node | null {
  let cur = n;
  for (let i = 0; cur && i < 12; i++) {
    const next = field(cur, 'declarator');
    if (!next) break;
    cur = next;
  }
  if (!cur) return null;
  if (/identifier|operator_name|destructor_name/.test(cur.type)) return cur;
  return firstIdentifier(cur);
}

const SELF = new Set(['self', 'this', 'cls', '&self', '&mut self', 'mut self']);

/**
 * Reads a parameter node in most grammars: name from `name`, `pattern` or `declarator`, type from
 * `type`, optional when a default is written.
 */
export function genericParam(n: Node): SyntaxParam | null {
  if (/comment/.test(n.type)) return null;
  if (n.type === 'self_parameter' || SELF.has(n.text.trim())) return null;
  const nameNode =
    field(n, 'name') ??
    field(n, 'pattern') ??
    declaratorName(n) ??
    (IDENT.test(n.type) ? n : firstIdentifier(n));
  const name = text(nameNode);
  if (!name || SELF.has(name)) return null;
  const typeNode = field(n, 'type');
  const p: SyntaxParam = { name: name.replace(/^[$&*]+/, '') };
  let type = text(typeNode);
  // C-family pointers and references live on the declarator: keep them with the type.
  // C-family: qualifiers (const, volatile), pointers, references and array bounds sit around
  // the declarator, so the type is the parameter text with the name and any default removed.
  const decl = field(n, 'declarator');
  if (type && decl && nameNode && nameNode.startIndex >= n.startIndex) {
    const full = n.text;
    const before = full.slice(0, nameNode.startIndex - n.startIndex);
    const after = full.slice(nameNode.endIndex - n.startIndex, decl.endIndex - n.startIndex);
    const t = `${before}${after}`
      .replace(/\s+/g, ' ')
      .replace(/\s*([*&[\]])\s*/g, '$1')
      .trim();
    if (t) type = t;
  }
  if (type) p.type = type;
  if (
    field(n, 'value') ||
    field(n, 'default_value') ||
    /default|optional/.test(n.type) ||
    n.children.some((c) => c && !c.isNamed && c.type === '=')
  )
    p.optional = true;
  if (/splat|variadic|rest|spread/.test(n.type) || /^(\.\.\.|\*)/.test(n.text.trim()))
    p.variadic = true;
  return p;
}

/** Parameters of a declaration: each named child of the parameter list, read by `read`. */
export function paramsOf(
  list: Node | null | undefined,
  read: (n: Node) => SyntaxParam | SyntaxParam[] | null,
): SyntaxParam[] | undefined {
  if (!list) return undefined;
  const out: SyntaxParam[] = [];
  for (const c of named(list)) {
    const p = read(c);
    if (Array.isArray(p)) out.push(...p);
    else if (p) out.push(p);
  }
  return out;
}

/**
 * The class a value constructs, read from its text: `new Store(…)`, `Store{…}`, `&Store{…}`,
 * `Store::new(…)`, `Store.new`, `Store(…)`. Undefined for anything else; a capitalised call that
 * is really a function (Go `NewStore()`) is filtered out by the resolver, which only accepts a
 * name declared as a class in the repository.
 */
export function constructedType(value: Node | null | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.text.slice(0, 160).replace(/\s+/g, ' ').trim();
  const m =
    /^new\s+([A-Za-z_][\w.]*)/.exec(t) ??
    /^&?([A-Z][\w.]*)\s*\{/.exec(t) ??
    /^([A-Z][\w]*(?:::[A-Z][\w]*)*)::(?:new|default|from)\b/.exec(t) ??
    /^([A-Z][\w:]*)\.new\b/.exec(t) ??
    /^\[\[?([A-Z]\w*) alloc\]/.exec(t) ??
    /^([A-Z][\w.]*)\s*\(/.exec(t);
  return m?.[1];
}
