/** What the syntax layer extracts from one file. Every position is a 1-based line in that file. */

export type DeclKind =
  | 'class'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'module'
  | 'namespace'
  | 'object'
  | 'record'
  | 'impl'
  | 'type'
  | 'function'
  | 'method'
  | 'constructor'
  | 'property'
  | 'resource';

/** Kinds that hold members: a function inside one of these is a method. */
export const CONTAINER_KINDS: ReadonlySet<DeclKind> = new Set([
  'class',
  'interface',
  'struct',
  'enum',
  'trait',
  'object',
  'record',
  'impl',
]);

export interface SyntaxParam {
  name: string;
  /** Type exactly as written; absent when the source writes none. */
  type?: string;
  optional?: boolean;
  variadic?: boolean;
}

export interface SyntaxDecl {
  name: string;
  kind: DeclKind;
  line: number;
  endLine: number;
  /** Index of the enclosing declaration in the same list. */
  parent?: number;
  /** Parameters as written (receiver parameters such as self and this are left out). */
  params?: SyntaxParam[];
  /** Return type exactly as written; absent when the source writes none. */
  returns?: string;
  /** The declaration's head as written, whitespace collapsed, at most 200 characters. */
  signature: string;
  /** Base classes, interfaces and traits as written. */
  bases?: string[];
  /** Go methods, Rust impl blocks and C++ out-of-class definitions: the type they belong to. */
  receiver?: string;
  /** The name the receiver is bound to inside the method (Go). */
  receiverName?: string;
}

export interface SyntaxImport {
  /** Module, package or path as written (quotes removed). */
  spec: string;
  line: number;
  /** Names brought in, with their local alias when renamed. */
  names?: { name: string; alias?: string }[];
  /** Alias for the whole module (`import x as y`, Go `st "pkg"`). */
  alias?: string;
  /** How the spec addresses its target. */
  style: 'module' | 'path' | 'include';
}

export interface SyntaxCall {
  /** Index of the enclosing function or method (or other declaration), -1 at file level. */
  owner: number;
  /** The callee as written, whitespace removed, at most 120 characters. */
  callee: string;
  /** Last name in the callee (`save` in `self.store.save`). */
  name: string;
  /** Everything before the last name (`self.store`), when there is one. */
  receiver?: string;
  line: number;
  /** `new X()` and other explicit instantiation. */
  isNew?: boolean;
}

export interface SyntaxProblem {
  line: number;
  kind: 'error' | 'missing';
  text: string;
}

export interface SyntaxResult {
  language: string;
  grammar: string;
  declarations: SyntaxDecl[];
  imports: SyntaxImport[];
  calls: SyntaxCall[];
  /** Syntax errors and missing tokens; a file with any is not fully parsed. */
  problems: SyntaxProblem[];
  /** Package or namespace the file declares (Java package, C# namespace, PHP namespace, Go package). */
  namespace?: string;
  /** Variables and fields with a declared type or a constructor as their value. */
  vars: SyntaxVar[];
}

/**
 * A variable, field or attribute and what the source says its type is: `type` when declared
 * (`Store s`, `s: Store`), `init` when only the value says (`s = new Store()`, `s := Store{}`).
 */
export interface SyntaxVar {
  /** Declaration index of the function or class it belongs to; -1 at the top level. */
  owner: number;
  /** As written; `self.x`, `this.x`, `@x` and `$this->x` name a field of the enclosing class. */
  name: string;
  type?: string;
  /** The class the value constructs, when the value is a constructor call or literal. */
  init?: string;
  /** When the value is another plain name (`self.store = store`): that name. */
  copyOf?: string;
  line: number;
}
