/**
 * Specs for the grammars built from source in sprint L5 (scripts/grammar-sources.json). Each is
 * checked by a fixture in test/l5.test.ts.
 */
import type { Node } from 'web-tree-sitter';
import {
  childOfType,
  childrenOfType,
  childrenWithField,
  field,
  firstIdentifier,
  line,
  named,
  text,
  unquote,
  type CallParts,
  type LangSpec,
} from '../spec';
import type { DeclKind, SyntaxImport, SyntaxParam } from '../types';
import { lua } from './more';

const imp = (spec: string, n: Node, extra: Partial<SyntaxImport> = {}): SyntaxImport => ({
  spec,
  line: line(n),
  style: 'module',
  ...extra,
});
const hasToken = (n: Node | null | undefined, tok: string): boolean =>
  !!n && n.children.some((c) => c && !c.isNamed && c.type === tok);
const strip = (s: string | undefined) => (s ? unquote(s.trim()) : undefined);

// ---------------------------------------------------------------- Dart

const DART_TYPE = /type_identifier|function_type|void_type|inferred_type|nullable_type/;

/** The type written before the name in a Dart signature (`int`, `List<int>`, `Future<void>`). */
function dartReturns(n: Node): string | undefined {
  const name = field(n, 'name');
  const parts: string[] = [];
  for (const c of named(n)) {
    if (name && c.startIndex >= name.startIndex) break;
    if (DART_TYPE.test(c.type) || c.type === 'type_arguments') parts.push(c.text);
  }
  return parts.join('').replace(/\s+/g, ' ') || undefined;
}

const dartParam = (n: Node): SyntaxParam | SyntaxParam[] | null => {
  if (n.type === 'optional_formal_parameters')
    return named(n).flatMap((c) => {
      const p = dartParam(c);
      return (Array.isArray(p) ? p : p ? [p] : []).map((x) => ({ ...x, optional: true }));
    });
  if (n.type !== 'formal_parameter') return null;
  const inner = childOfType(n, 'constructor_param', 'super_formal_parameter') ?? n;
  const nameNode =
    field(inner, 'name') ?? childrenOfType(inner, 'identifier').pop() ?? firstIdentifier(inner);
  const name = text(nameNode);
  if (!name) return null;
  const p: SyntaxParam = { name };
  const type = named(inner)
    .filter((c) => nameNode && c.startIndex < nameNode.startIndex)
    .filter((c) => DART_TYPE.test(c.type) || c.type === 'type_arguments')
    .map((c) => c.text)
    .join('');
  if (type) p.type = type;
  if (/^required\b/.test(n.text)) p.optional = false;
  return p;
};

/** The body after a Dart signature: `function_body` as the next sibling. */
const dartBody = (n: Node) => (n.nextNamedSibling?.type === 'function_body' ? n.nextNamedSibling : null);

/** A Dart call is a `selector` holding an `argument_part`, after the expression it calls. */
function dartCall(n: Node): CallParts | null {
  if (!childOfType(n, 'argument_part')) return null;
  const prev = n.previousNamedSibling;
  if (!prev) return null;
  // The start of the chain: the first sibling before the run of selectors.
  let start: Node = prev;
  while (start.type === 'selector' && start.previousNamedSibling) start = start.previousNamedSibling;
  const src = n.tree.rootNode.text;
  if (prev.type === 'selector') {
    const sel = childOfType(prev, 'unconditional_assignable_selector', 'conditional_assignable_selector');
    const name = text(childOfType(sel, 'identifier'));
    if (!name) return null;
    return { nameString: name, receiverText: src.slice(start.startIndex, prev.startIndex) };
  }
  if (prev.type === 'identifier') return { nameString: prev.text };
  if (prev.type === 'super' || prev.type === 'this') return null;
  return null;
}

export const dart: LangSpec = {
  grammar: 'dart',
  param: dartParam,
  decls: {
    class_definition: {
      kind: 'class',
      bases: (n) => {
        const sup = field(n, 'superclass');
        const out = [
          ...childrenOfType(sup, 'type_identifier'),
          ...childrenOfType(childOfType(sup, 'mixins'), 'type_identifier'),
          ...childrenOfType(field(n, 'interfaces'), 'type_identifier'),
        ];
        return out.map((t) => t.text);
      },
    },
    mixin_declaration: { kind: 'trait', name: (n) => text(childOfType(n, 'identifier')) },
    enum_declaration: { kind: 'enum' },
    extension_declaration: {
      kind: 'impl',
      name: (n) => text(field(n, 'name')) ?? text(field(n, 'class')),
      receiver: (n) => (field(n, 'name') ? text(field(n, 'class')) : undefined),
    },
    type_alias: { kind: 'type', name: (n) => text(childOfType(n, 'type_identifier')) },
    function_signature: {
      // Inside a method_signature the method itself is the declaration.
      kind: (n) => (n.parent?.type === 'method_signature' ? null : 'function'),
      params: (n) => childOfType(n, 'formal_parameter_list'),
      returns: dartReturns,
      trailing: dartBody,
      body: () => null,
    },
    method_signature: {
      kind: 'method',
      name: (n) => {
        const s = named(n)[0];
        if (!s) return undefined;
        if (s.type === 'constructor_signature' || s.type === 'factory_constructor_signature')
          return childrenWithField(s, 'name').filter((x) => x.isNamed).map((x) => x.text).join('.') || undefined;
        return text(field(s, 'name')) ?? text(childOfType(s, 'identifier'));
      },
      params: (n) => childOfType(named(n)[0], 'formal_parameter_list') ?? field(named(n)[0], 'parameters'),
      returns: (n) => {
        const s = named(n)[0];
        return s && /^(function|getter)_signature$/.test(s.type) ? dartReturns(s) : undefined;
      },
      trailing: dartBody,
      body: () => null,
    },
    constructor_signature: {
      kind: (n) => (n.parent?.type === 'method_signature' ? null : 'constructor'),
      name: (n) => childrenWithField(n, 'name').filter((x) => x.isNamed).map((x) => x.text).join('.') || undefined,
      trailing: dartBody,
    },
    getter_signature: {
      kind: (n) => (n.parent?.type === 'method_signature' ? null : 'property'),
      returns: dartReturns,
      trailing: dartBody,
    },
    setter_signature: {
      kind: (n) => (n.parent?.type === 'method_signature' ? null : 'property'),
      params: (n) => childOfType(n, 'formal_parameter_list'),
      trailing: dartBody,
    },
  },
  calls: { selector: dartCall },
  imports: {
    library_import: (n) => {
      const spec = childOfType(n, 'import_specification');
      const uri = strip(text(childOfType(childOfType(spec, 'configurable_uri'), 'uri')));
      if (!uri) return [];
      const alias = text(childOfType(spec, 'identifier'));
      return [
        imp(uri, n, {
          style: uri.startsWith('package:') || uri.startsWith('dart:') ? 'module' : 'path',
          ...(alias ? { alias } : {}),
        }),
      ];
    },
  },
  selfNames: ['this'],
};

// ---------------------------------------------------------------- Swift

const SWIFT_TYPE = /user_type|optional_type|array_type|dictionary_type|function_type|tuple_type/;

/** The field name of the child after `c` in its parent, and that child. */
function nextField(c: Node): { field: string | null; node: Node | null } {
  const p = c.parent;
  if (!p) return { field: null, node: null };
  for (let i = 0; i < p.childCount; i++)
    if (p.child(i)?.startIndex === c.startIndex && p.child(i)?.type === c.type) {
      for (let j = i + 1; j < p.childCount; j++) {
        const k = p.child(j);
        if (k?.isNamed) return { field: p.fieldNameForChild(j), node: k };
        if (k?.type === '...') return { field: '...', node: k };
      }
    }
  return { field: null, node: null };
}

const swiftParams = (n: Node): SyntaxParam[] =>
  childrenOfType(n, 'parameter').map((p) => {
    const out: SyntaxParam = { name: text(field(p, 'name')) ?? p.text };
    const type = childrenWithField(p, 'name').find((c) => SWIFT_TYPE.test(c.type));
    if (type) out.type = type.text;
    const next = nextField(p);
    if (next.field === 'default_value') out.optional = true;
    if (next.field === '...' || /\.\.\.\s*$/.test(p.text)) out.variadic = true;
    return out;
  });

/** The return type: a type-like child named `name` after the last parameter. */
function swiftReturns(n: Node): string | undefined {
  const body = field(n, 'body');
  const types = childrenWithField(n, 'name').filter(
    (c) => SWIFT_TYPE.test(c.type) && (!body || c.startIndex < body.startIndex),
  );
  return text(types[types.length - 1]);
}

export const swift: LangSpec = {
  grammar: 'swift',
  decls: {
    class_declaration: {
      kind: (n): DeclKind => {
        const k = n.children.find((c) => c && !c.isNamed && /^(class|struct|enum|extension|actor)$/.test(c.type))?.type;
        return k === 'struct' ? 'struct' : k === 'enum' ? 'enum' : k === 'extension' ? 'impl' : 'class';
      },
      name: (n) => text(field(n, 'name')),
      receiver: (n) =>
        n.children.some((c) => c && !c.isNamed && c.type === 'extension') ? text(field(n, 'name')) : undefined,
      bases: (n) =>
        childrenOfType(n, 'inheritance_specifier')
          .map((s) => text(field(s, 'inherits_from')))
          .filter((s): s is string => !!s),
    },
    protocol_declaration: { kind: 'interface' },
    function_declaration: { kind: 'function', paramList: swiftParams, returns: swiftReturns },
    protocol_function_declaration: { kind: 'method', paramList: swiftParams, returns: swiftReturns },
    init_declaration: { kind: 'constructor', name: () => 'init', paramList: swiftParams },
    typealias_declaration: { kind: 'type' },
  },
  calls: {
    call_expression: (n) => {
      const f = named(n)[0];
      if (!f || f.type === 'call_expression') return null;
      if (f.type === 'navigation_expression') {
        const suffix = field(field(f, 'suffix'), 'suffix');
        return { callee: f, receiver: field(f, 'target'), name: suffix };
      }
      return { callee: f };
    },
  },
  imports: {
    import_declaration: (n) => {
      const id = text(childOfType(n, 'identifier'));
      return id ? [imp(id, n)] : [];
    },
  },
  selfNames: ['self'],
};

// ---------------------------------------------------------------- Perl

const PERL_PRAGMAS = new Set([
  'strict', 'warnings', 'utf8', 'feature', 'lib', 'constant', 'vars', 'integer', 'overload',
  'parent', 'base', 'version', 'bytes', 'open', 'locale', 'diagnostics', 'subs', 'mro', 'bigint',
]);

/** The package a top-level Perl statement belongs to: the last `package` before it. */
function perlPackage(n: Node): Node | undefined {
  let top: Node | null = n;
  while (top?.parent && top.parent.type !== 'source_file') top = top.parent;
  for (let s = top?.previousNamedSibling ?? null; s; s = s.previousNamedSibling)
    if (s.type === 'package_statement') return s;
  return undefined;
}

/** `my ($self, $x, %opts) = @_;` as the first statement of a sub: its parameters. */
function perlParams(n: Node): SyntaxParam[] | undefined {
  const first = named(field(n, 'body'))[0];
  const a = childOfType(first, 'assignment_expression');
  if (!a || !/^@_$/.test(field(a, 'right')?.text ?? '')) {
    const sig = childOfType(n, 'signature');
    return sig
      ? named(sig).map((p) => ({ name: p.text.replace(/\s*=.*$/s, ''), ...(/=/.test(p.text) ? { optional: true } : {}) }))
      : undefined;
  }
  return named(field(a, 'left'))
    .map((v) => v.text)
    .filter((v) => !/^\$(self|class|this)$/.test(v))
    .map((v) => ({ name: v, ...(/^[@%]/.test(v) ? { variadic: true } : {}) }));
}

export const perl: LangSpec = {
  grammar: 'perl',
  namespace: { package_statement: (n) => text(field(n, 'name')) },
  decls: {
    package_statement: {
      kind: 'class',
      bases: (n) => {
        const out: string[] = [];
        for (let s = n.nextNamedSibling; s && s.type !== 'package_statement'; s = s.nextNamedSibling) {
          const mod = text(field(s, 'module'));
          if (s.type === 'use_statement' && (mod === 'parent' || mod === 'base'))
            for (const w of named(s).slice(1))
              out.push(...w.text.replace(/^qw\s*[([{/]|[)\]}/]$/g, '').split(/[\s,'"]+/).filter((x) => x && x !== '-norequire'));
          if (/^our\s+@ISA\s*=/.test(s.text) || /^@ISA\s*=/.test(s.text))
            out.push(...(s.text.split('=')[1] ?? '').split(/[\s,'"()]+|qw/).filter(Boolean).map((x) => x.replace(/;$/, '')).filter(Boolean));
        }
        return out;
      },
    },
    subroutine_declaration_statement: {
      kind: 'function',
      paramList: perlParams,
      receiver: (n) => text(field(perlPackage(n) ?? null, 'name')),
    },
  },
  calls: {
    function_call_expression: (n) => ({ callee: field(n, 'function') }),
    ambiguous_function_call_expression: (n) => {
      const f = field(n, 'function');
      return f && /^\w[\w:]*$/.test(f.text) && f.text !== 'bless' ? { callee: f } : null;
    },
    method_call_expression: (n) => ({
      callee: n,
      receiver: field(n, 'invocant'),
      name: field(n, 'method'),
    }),
  },
  imports: {
    use_statement: (n) => {
      const m = text(field(n, 'module'));
      return m && !PERL_PRAGMAS.has(m) && !/^v?\d/.test(m) ? [imp(m, n)] : [];
    },
    require_expression: (n) => {
      const b = childOfType(n, 'bareword');
      if (b) return [imp(b.text, n)];
      const s = strip(text(childOfType(n, 'string_literal', 'interpolated_string_literal')));
      return s ? [imp(s, n, { style: 'path' })] : [];
    },
  },
  selfNames: ['$self', '$class', '$this', 'self'],
};

// ---------------------------------------------------------------- R

const R_CLASS = new Set(['setRefClass', 'R6Class', 'setClass', 'setRefClass']);

/** `name <- function(…)`, `name = function(…)`, `name <<- function(…)`. */
const rAssigned = (n: Node): Node | null => {
  const op = n.children.find((c) => c && !c.isNamed)?.type;
  return op && /^(<-|<<-|=|:=)$/.test(op) ? field(n, 'rhs') : null;
};

const rParams = (n: Node): SyntaxParam[] | undefined => {
  const fn = rAssigned(n);
  if (fn?.type !== 'function_definition') return undefined;
  return childrenWithField(field(fn, 'parameters'), 'parameter').map((p) => {
    const name = text(field(p, 'name')) ?? p.text;
    return {
      name,
      ...(field(p, 'default') ? { optional: true } : {}),
      ...(name === '...' ? { variadic: true } : {}),
    };
  });
};

const rCallName = (n: Node): string | undefined => {
  const f = field(n, 'function');
  return f?.type === 'identifier' ? f.text : undefined;
};
const rFirstString = (n: Node): string | undefined => {
  const a = childrenWithField(field(n, 'arguments'), 'argument')[0];
  const v = field(a ?? null, 'value');
  return v ? strip(v.text) : undefined;
};

export const r: LangSpec = {
  grammar: 'r',
  decls: {
    binary_operator: {
      kind: (n) => {
        const rhs = rAssigned(n);
        if (!rhs || field(n, 'lhs')?.type !== 'identifier') return null;
        if (rhs.type === 'function_definition') return 'function';
        if (rhs.type === 'call' && R_CLASS.has(rCallName(rhs) ?? '')) return 'class';
        return null;
      },
      name: (n) => text(field(n, 'lhs')),
      paramList: rParams,
      body: (n) => field(rAssigned(n), 'body'),
    },
    call: {
      // setClass("Shape", …) and setGeneric("area", …) declare by name, without an assignment.
      kind: (n) => {
        const f = rCallName(n);
        if (f === 'setClass' && n.parent?.type !== 'binary_operator') return 'class';
        if (f === 'setGeneric') return 'function';
        return null;
      },
      name: rFirstString,
    },
  },
  calls: {
    call: (n) => {
      const f = field(n, 'function');
      if (!f) return null;
      const name = f.type === 'identifier' ? f.text : undefined;
      if (
        name &&
        /^(library|require|requireNamespace|source|function|setClass|setRefClass|R6Class|setGeneric|setMethod|setValidity|standardGeneric|representation)$/.test(name)
      )
        return null;
      if (f.type === 'namespace_operator') return { callee: f, receiver: field(f, 'lhs'), name: field(f, 'rhs') };
      if (f.type === 'extract_operator') return { callee: f, receiver: field(f, 'lhs'), name: field(f, 'rhs') };
      return f.type === 'identifier' ? { callee: f } : null;
    },
  },
  imports: {
    call: (n) => {
      const f = rCallName(n);
      if (f === 'library' || f === 'require' || f === 'requireNamespace') {
        const s = rFirstString(n);
        return s ? [imp(s, n)] : [];
      }
      if (f === 'source' || f === 'sys.source') {
        const s = rFirstString(n);
        return s ? [imp(s, n, { style: 'path' })] : [];
      }
      return [];
    },
  },
  selfNames: ['self', '.self'],
};

// ---------------------------------------------------------------- Erlang

const erlangName = (n: Node | null | undefined) =>
  n?.type === 'fun_decl' ? text(field(field(n, 'clause'), 'name')) : undefined;

export const erlang: LangSpec = {
  grammar: 'erlang',
  namespace: { module_attribute: (n) => text(field(n, 'name')) },
  decls: {
    module_attribute: { kind: 'module', bases: (n) => {
      const out: string[] = [];
      for (let s = n.nextNamedSibling; s; s = s.nextNamedSibling)
        if (s.type === 'behaviour_attribute') out.push(text(field(s, 'name')) ?? '');
      return out.filter(Boolean);
    } },
    record_decl: { kind: 'record' },
    type_alias: { kind: 'type', name: (n) => text(firstIdentifier(field(n, 'name'))) ?? text(field(n, 'name')) },
    fun_decl: {
      // `f(…) -> …; f(…) -> ….`: a later clause of the same function continues it.
      kind: (n) => (erlangName(n.previousNamedSibling) === erlangName(n) && erlangName(n) ? null : 'function'),
      trailing: (n) =>
        n.nextNamedSibling?.type === 'fun_decl' && erlangName(n.nextNamedSibling) === erlangName(n)
          ? n.nextNamedSibling
          : null,
      name: (n) => text(field(field(n, 'clause'), 'name')),
      paramList: (n) => {
        const args = childrenWithField(field(field(n, 'clause'), 'args'), 'args');
        return args.map((a, i) => ({ name: a.type === 'var' ? a.text : `arg${i + 1}` }));
      },
      body: (n) => field(field(n, 'clause'), 'body'),
    },
  },
  calls: {
    call: (n) => {
      if (n.parent?.type === 'remote' || n.parent?.type === 'type_sig') return null;
      if (n.parent?.parent?.type === 'type_sig' || /spec|type_alias/.test(n.parent?.parent?.type ?? '')) return null;
      const e = field(n, 'expr');
      return e?.type === 'atom' ? { callee: e } : null;
    },
    remote: (n) => {
      const fn = field(n, 'fun');
      const name = fn?.type === 'call' ? field(fn, 'expr') : fn;
      const mod = field(field(n, 'module'), 'module');
      if (!name || !mod) return null;
      const m = mod.type === 'macro_call_expr' && mod.text.includes('MODULE') ? null : mod;
      return m ? { receiver: m, name } : { callee: name };
    },
  },
  imports: {
    import_attribute: (n) => {
      const m = text(field(n, 'module'));
      if (!m) return [];
      const names = childrenWithField(n, 'funs').map((f) => ({ name: text(field(f, 'fun')) ?? '' }));
      return [imp(m, n, { names: names.filter((x) => x.name) })];
    },
    pp_include: (n) => {
      const f = strip(text(field(n, 'file')));
      return f ? [imp(f, n, { style: 'include' })] : [];
    },
    pp_include_lib: (n) => {
      const f = strip(text(field(n, 'file')));
      return f ? [imp(f, n, { style: 'include' })] : [];
    },
  },
};

// ---------------------------------------------------------------- Lisp family

interface LispShape {
  grammar: string;
  list: string[];
  /** The symbol text of a node, or undefined when it is not a symbol. */
  sym: (n: Node | null | undefined) => string | undefined;
  defs: Record<string, DeclKind>;
  /** Heads that are special forms or definitions, never calls. */
  special: RegExp;
  imports: (head: string, n: Node, items: Node[]) => SyntaxImport[];
  /** The parameter vector or list of a definition, from its items after the name. */
  params?: (items: Node[], head: string) => SyntaxParam[] | undefined;
  /** Base classes or protocols of a type definition, from its items after the name. */
  bases?: (items: Node[], head: string) => string[];
}

const lispItems = (n: Node) => named(n).filter((c) => !/comment|meta|discard/.test(c.type));

function lispSpec(s: LispShape): LangSpec {
  const head = (n: Node) => s.sym(lispItems(n)[0]);
  const declOf = (n: Node): DeclKind | null => {
    const h = head(n);
    if (h && Object.hasOwn(s.defs, h)) {
      const k = s.defs[h]!;
      // `(define x 42)` defines a value; `(define (f x) …)` and `(define f (lambda …))` a function.
      if (k === 'function' && /^define$/.test(h)) {
        const items = lispItems(n);
        const target = items[1];
        const value = items[2];
        if (target && !s.list.includes(target.type)) {
          const vh = value && s.list.includes(value.type) ? s.sym(lispItems(value)[0]) : undefined;
          return vh && /^(lambda|λ|case-lambda)$/.test(vh) ? 'function' : 'property';
        }
      }
      return k;
    }
    // A method inside a protocol, record or type: `(area [this] …)`.
    const p = n.parent;
    const ph = p && s.list.includes(p.type) ? head(p) : undefined;
    const pk = ph && Object.hasOwn(s.defs, ph) ? s.defs[ph] : undefined;
    const items = lispItems(n);
    if (pk && /^(interface|record|class|struct)$/.test(pk) && h && items[1]?.type === 'vec_lit')
      return 'method';
    return null;
  };
  const BINDERS =
    /^(let|let\*|letrec|letrec\*|let-values|let\*-values|flet|labels|macrolet|do|do\*|loop|binding|with-slots|destructuring-bind|multiple-value-bind|named-let|parameterize|with-handlers|cond|case|match)$/;
  /** Lists that are data in their position, not calls: parameter lists, bindings, fields. */
  /** A parameter list: a declaration's `parameters`, or the `(name args…)` head of a definition. */
  const isParams = (x: Node | null): boolean => {
    const p = x?.parent;
    if (!x || !p) return false;
    if (!s.list.includes(p.type))
      return [field(p, 'parameters'), field(p, 'lambda_list')].some((f) => f?.startIndex === x.startIndex);
    return !!declOf(p) && lispItems(p)[1]?.startIndex === x.startIndex;
  };
  const notCall = (n: Node): boolean => {
    const p = n.parent;
    if (!p) return false;
    if (isParams(n) || isParams(p)) return true;
    if (!s.list.includes(p.type)) return false;
    const pk = declOf(p);
    const items = lispItems(p);
    const at = items.findIndex((c) => c.startIndex === n.startIndex);
    // `(defclass c (base) …)`, `(defgeneric f (x))`: the list after a symbol name is data.
    if (pk && pk !== 'module' && pk !== 'property' && at === 2 && items[1] && !s.list.includes(items[1].type))
      return true;
    for (let a: Node | null = p; a; a = a.parent)
      if (s.list.includes(a.type) && /^(import|require|use-modules|provide|export)$/.test(head(a) ?? ''))
        return true;
    if (pk && /^(struct|record)$/.test(pk)) return true;
    const ph = head(p);
    if (ph && BINDERS.test(ph) && at === 1) return true;
    const g = p.parent;
    if (g && s.list.includes(g.type)) {
      const gk = declOf(g);
      if (gk && /^(class|struct|record|type)$/.test(gk) && head(g) !== 'defrecord' && head(g) !== 'deftype')
        return true;
      const gh = head(g);
      // `(let ((x (f))) …)`: the binding pairs are not calls (their values are).
      if (gh && BINDERS.test(gh) && lispItems(g)[1]?.startIndex === p.startIndex && !/^(cond|case|match)$/.test(gh))
        return true;
    }
    return false;
  };
  /** Inside a namespace or module form: its clauses are not calls. */
  const inModuleForm = (n: Node) => {
    for (let p = n.parent; p; p = p.parent)
      if (s.list.includes(p.type) && Object.hasOwn(s.defs, head(p) ?? '') && s.defs[head(p)!] === 'module')
        return true;
    return false;
  };
  /** The defined name: a symbol, or the first symbol of a `(name args…)` head (Scheme). */
  const nameOf = (n: Node) => {
    if (declOf(n) === 'method' && !Object.hasOwn(s.defs, head(n) ?? '')) return head(n);
    const target = lispItems(n)[1];
    if (!target) return undefined;
    const direct = s.sym(target);
    if (direct) return direct.replace(/^.*\//, '');
    if (s.list.includes(target.type)) return s.sym(lispItems(target)[0]);
    return undefined;
  };
  const rules: LangSpec['decls'] = {};
  const calls: LangSpec['calls'] = {};
  const imports: LangSpec['imports'] = {};
  for (const t of s.list) {
    rules[t] = {
      kind: declOf,
      name: nameOf,
      paramList: (n) => {
        const k = declOf(n);
        if (k !== 'function' && k !== 'method') return undefined;
        const items = lispItems(n);
        if (k === 'method' && !Object.hasOwn(s.defs, head(n) ?? ''))
          return s.params?.(items.slice(1), '')?.filter((p) => !/^(this|self|_)$/.test(p.name));
        const target = items[1];
        if (target && s.list.includes(target.type)) return lambdaList(lispItems(target).slice(1));
        return s.params?.(items.slice(2), head(n) ?? '');
      },
      bases: (n) => {
        const k = declOf(n);
        return k && /^(class|record|struct|interface)$/.test(k) ? (s.bases?.(lispItems(n).slice(2), head(n) ?? '') ?? []) : [];
      },
      body: () => null,
    };
    calls[t] = (n) => {
      const first = lispItems(n)[0];
      const h = s.sym(first);
      if (!h || !first || s.special.test(h) || declOf(n) || !/[A-Za-z]/.test(h)) return null;
      if (inModuleForm(n) || notCall(n)) return null;
      // Quoted data and binding lists are not calls.
      const p = n.parent;
      if (p && /quot/.test(p.type)) return null;
      // Racket's `(send obj method args…)` calls a method on obj.
      if (h === 'send') {
        const [, recv, m] = lispItems(n);
        return recv && m && s.sym(m) ? { nameString: s.sym(m)!, receiverText: recv.text } : null;
      }
      const slash = h.lastIndexOf('/');
      return slash > 0
        ? { nameString: h.slice(slash + 1), receiverText: h.slice(0, slash) }
        : { nameString: h };
    };
    imports[t] = (n) => {
      const h = head(n);
      return h ? s.imports(h, n, lispItems(n)) : [];
    };
  }
  return { grammar: s.grammar, decls: rules, calls, imports };
}

const vecParams = (items: Node[]): SyntaxParam[] | undefined => {
  const v = items.find((c) => c.type === 'vec_lit');
  if (!v) return undefined;
  const out: SyntaxParam[] = [];
  let rest = false;
  for (const p of lispItems(v)) {
    if (p.text === '&') {
      rest = true;
      continue;
    }
    out.push({ name: p.text, ...(rest ? { variadic: true } : {}) });
  }
  return out;
};

export const clojure: LangSpec = lispSpec({
  grammar: 'clojure',
  list: ['list_lit'],
  sym: (n) => (n?.type === 'sym_lit' ? n.text : undefined),
  defs: {
    defn: 'function', 'defn-': 'function', defmacro: 'function', defmulti: 'function',
    def: 'property', defonce: 'property', defprotocol: 'interface', defrecord: 'record',
    deftype: 'class', definterface: 'interface', ns: 'module', defstruct: 'struct',
  },
  special: /^(fn|let|if|do|when|when-not|cond|case|loop|recur|quote|try|catch|finally|throw|and|or|not|->|->>|doto|binding|for|doseq|dotimes|if-let|when-let|letfn|new|set!|var|defmethod|extend-type|extend-protocol|reify|proxy|comment)$/,
  params: (items) => {
    const direct = vecParams(items);
    if (direct) return direct;
    // Multi-arity: ([x] …) ([x y] …): the longest parameter vector.
    const arities = items.filter((c) => c.type === 'list_lit').map((c) => vecParams(lispItems(c)) ?? []);
    return arities.length ? arities.reduce((a, b) => (b.length > a.length ? b : a)) : undefined;
  },
  bases: (items, h) => {
    if (h !== 'defrecord' && h !== 'deftype') return [];
    const v = items.findIndex((c) => c.type === 'vec_lit');
    return items.slice(v + 1).filter((c) => c.type === 'sym_lit').map((c) => c.text);
  },
  imports: (h, n, items) => {
    if (h !== 'ns') return [];
    const out: SyntaxImport[] = [];
    for (const clause of items.filter((c) => c.type === 'list_lit')) {
      const kw = text(lispItems(clause)[0]);
      if (kw !== ':require' && kw !== ':use' && kw !== ':import') continue;
      for (const spec of lispItems(clause).slice(1)) {
        const parts = lispItems(spec);
        const target = spec.type === 'sym_lit' ? spec.text : text(parts[0]);
        if (!target) continue;
        const asAt = parts.findIndex((p) => p.text === ':as');
        const alias = asAt >= 0 ? text(parts[asAt + 1]) : undefined;
        if (kw === ':import' && spec.type !== 'sym_lit')
          for (const cls of parts.slice(1)) out.push(imp(`${target}.${cls.text}`, spec));
        else out.push(imp(target, spec, alias ? { alias } : {}));
      }
    }
    return out;
  },
});

/** A Lisp lambda list: `&optional` marks the rest optional, `&rest`/`&body` variadic. */
function lambdaList(items: Node[]): SyntaxParam[] {
  const out: SyntaxParam[] = [];
  let mode = '';
  for (const p of items) {
    const t = p.text;
    if (t.startsWith('&')) {
      mode = t;
      continue;
    }
    if (t === '.') {
      mode = '&rest';
      continue;
    }
    const name = /^[([]/.test(t) ? (t.match(/^[([]\s*([^\s)\]]+)/)?.[1] ?? t) : t;
    out.push({
      name,
      ...(/^&(optional|key)$/.test(mode) || (/^\[/.test(t) && !mode) ? { optional: true } : {}),
      ...(/^&(rest|body)$/.test(mode) ? { variadic: true } : {}),
    });
  }
  return out;
}

const schemeImports = (h: string, n: Node, items: Node[]): SyntaxImport[] => {
  if (h !== 'import' && h !== 'require' && h !== 'use-modules' && h !== 'load' && h !== 'include')
    return [];
  return items.slice(1).flatMap((c) => {
    if (c.type === 'string') return [imp(strip(c.text)!, c, { style: 'path' })];
    if (c.type === 'symbol') return [imp(c.text, c)];
    if (c.type === 'list') {
      const parts = lispItems(c).map((x) => x.text);
      if (/^(only|except|prefix|rename|for-syntax|for-label|only-in|except-in|prefix-in|rename-in)$/.test(parts[0] ?? ''))
        return parts[1] ? [imp(parts[1].replace(/^"|"$/g, ''), c)] : [];
      return [imp(parts.join(' '), c)];
    }
    return [];
  });
};

const SCHEME_SPECIAL =
  /^(define|lambda|let|let\*|letrec|letrec\*|let-values|if|cond|case|when|unless|begin|do|quote|quasiquote|unquote|set!|and|or|else|=>|delay|guard|parameterize|syntax-rules|match|for|for\/list|for\/fold|with-handlers|provide|require|import|module|module\+|module\*|super-new|define-values|new|class|interface|inherit|field|init-field|public|override)$/;

export const scheme: LangSpec = lispSpec({
  grammar: 'scheme',
  list: ['list'],
  sym: (n) => (n?.type === 'symbol' ? n.text : undefined),
  defs: {
    define: 'function', 'define-syntax': 'function', 'define-record-type': 'record',
    'define-library': 'module', 'define-module': 'module', 'define-values': 'property',
  },
  special: SCHEME_SPECIAL,
  params: () => undefined,
  imports: schemeImports,
});

/** Racket: Scheme's shapes plus `struct`, classes and `define/public`. */
export const racket: LangSpec = lispSpec({
  grammar: 'racket',
  list: ['list'],
  sym: (n) => (n?.type === 'symbol' ? n.text : undefined),
  defs: {
    define: 'function', 'define-syntax': 'function', 'define-syntax-rule': 'function',
    struct: 'struct', 'define-struct': 'struct', 'define/public': 'method',
    'define/override': 'method', 'define/private': 'method', 'define/augment': 'method',
    module: 'module', 'define-values': 'property',
  },
  special: SCHEME_SPECIAL,
  params: () => undefined,
  imports: schemeImports,
});

const commonLispBase = lispSpec({
  grammar: 'commonlisp',
  list: ['list_lit'],
  sym: (n) => (n?.type === 'sym_lit' ? n.text : undefined),
  defs: {
    defclass: 'class', defstruct: 'struct', defvar: 'property', defparameter: 'property',
    defconstant: 'property', defpackage: 'module', defgeneric: 'function', 'define-condition': 'class',
    deftype: 'type',
  },
  special:
    /^(let|let\*|flet|labels|if|cond|case|when|unless|progn|prog1|loop|do|dolist|dotimes|quote|function|lambda|setf|setq|and|or|declare|in-package|return|return-from|block|handler-case|unwind-protect|multiple-value-bind|destructuring-bind|with-slots|with-open-file|eval-when|the|values)$/,
  params: (items) => {
    const l = items.find((c) => c.type === 'list_lit');
    return l ? lambdaList(lispItems(l)) : undefined;
  },
  bases: (items, h) => {
    if (h !== 'defclass' && h !== 'define-condition') return [];
    const l = items.find((c) => c.type === 'list_lit');
    return l ? lispItems(l).map((c) => c.text) : [];
  },
  imports: (h, n, items) => {
    if (h === 'require' || h === 'ql:quickload' || h === 'asdf:load-system')
      return items.slice(1).map((c) => imp(c.text.replace(/^[':#]+|"/g, ''), c));
    if (h === 'load') return items.slice(1, 2).map((c) => imp(strip(c.text)!, c, { style: 'path' }));
    return [];
  },
});

export const commonlisp: LangSpec = {
  ...commonLispBase,
  decls: {
    ...commonLispBase.decls,
    defun: {
      kind: (n) => (/defmethod/.test(childOfType(n, 'defun_header')?.text ?? '') ? 'function' : 'function'),
      name: (n) => text(field(childOfType(n, 'defun_header'), 'function_name')),
      paramList: (n) => lambdaList(named(field(childOfType(n, 'defun_header'), 'lambda_list'))),
      body: () => null,
    },
  },
};

const elispBase = lispSpec({
  grammar: 'elisp',
  list: ['list'],
  sym: (n) => (n?.type === 'symbol' ? n.text : undefined),
  defs: {
    defcustom: 'property', defconst: 'property', defgroup: 'module', 'cl-defstruct': 'struct',
    'cl-defun': 'function', 'cl-defmethod': 'function', 'cl-defgeneric': 'function',
    'define-minor-mode': 'function', 'define-derived-mode': 'function', defface: 'property',
    defsubst: 'function', defalias: 'function',
  },
  special:
    /^(let|let\*|if|cond|when|unless|progn|prog1|while|dolist|dotimes|quote|function|lambda|setq|setf|and|or|interactive|save-excursion|with-current-buffer|condition-case|unwind-protect|catch|throw|pcase|declare|provide|require)$/,
  params: (items) => {
    const l = items.find((c) => c.type === 'list');
    return l ? lambdaList(lispItems(l)) : undefined;
  },
  imports: (h, n, items) =>
    h === 'require' || h === 'load' || h === 'load-file'
      ? items.slice(1, 2).map((c) => imp(c.text.replace(/^'|"/g, ''), c, h === 'require' ? {} : { style: 'path' }))
      : [],
});

export const elisp: LangSpec = {
  ...elispBase,
  decls: {
    ...elispBase.decls,
    function_definition: {
      kind: 'function',
      paramList: (n) => lambdaList(named(field(n, 'parameters'))),
      body: () => null,
    },
    macro_definition: {
      kind: 'function',
      paramList: (n) => lambdaList(named(field(n, 'parameters'))),
      body: () => null,
    },
    special_form: {
      kind: (n) => (/^\(\s*(defvar|defvar-local)\b/.test(n.text) ? 'property' : null),
      name: (n) => text(childOfType(n, 'symbol')),
      body: () => null,
    },
  },
};

// ---------------------------------------------------------------- Luau (Lua's shapes, typed)

const luauParam = (n: Node): SyntaxParam | null => {
  if (n.type !== 'parameter') return null;
  if (childOfType(n, 'vararg_expression')) return { name: '...', variadic: true };
  const id = childOfType(n, 'identifier');
  if (!id) return null;
  const type = named(n).find((c) => c.startIndex > id.startIndex);
  return { name: id.text, ...(type ? { type: type.text } : {}) };
};

export const luau: LangSpec = {
  ...lua,
  grammar: 'luau',
  param: luauParam,
  decls: {
    function_declaration: {
      ...lua.decls.function_declaration!,
      returns: (n) => {
        const params = field(n, 'parameters');
        const body = field(n, 'body');
        const t = named(n).find(
          (c) => params && c.startIndex > params.endIndex - 1 && (!body || c.startIndex < body.startIndex),
        );
        return text(t);
      },
    },
    type_definition: { kind: 'type', name: (n) => text(childOfType(n, 'identifier')) },
  },
};

// ---------------------------------------------------------------- Crystal

/** A field's named node: Crystal marks the `:` token with the `type` field too. */
const namedField = (n: Node | null | undefined, f: string): Node | null =>
  childrenWithField(n, f).find((c) => c.isNamed) ?? null;

const crystalParams = (n: Node): SyntaxParam[] | undefined => {
  const list = field(n, 'params');
  if (!list) return n.type === 'method_def' ? [] : undefined;
  return childrenOfType(list, 'param', 'splat_param', 'double_splat_param', 'block_param').map((p) => ({
    name: (text(field(p, 'name')) ?? p.text).replace(/^@/, ''),
    ...(namedField(p, 'type') ? { type: namedField(p, 'type')!.text } : {}),
    ...(namedField(p, 'default') ? { optional: true } : {}),
    ...(p.type !== 'param' ? { variadic: true } : {}),
  }));
};

export const crystal: LangSpec = {
  grammar: 'crystal',
  decls: {
    class_def: {
      kind: 'class',
      bases: (n) => {
        const out: string[] = [];
        const sup = text(field(n, 'superclass'));
        if (sup) out.push(sup.replace(/\(.*$/s, ''));
        for (const c of named(field(n, 'body')))
          if (c.type === 'include') out.push((text(named(c)[0]) ?? '').replace(/\(.*$/s, ''));
        return out.filter(Boolean);
      },
    },
    struct_def: { kind: 'struct' },
    module_def: { kind: 'module' },
    enum_def: { kind: 'enum' },
    lib_def: { kind: 'module' },
    alias: { kind: 'type' },
    annotation_def: { kind: 'type' },
    method_def: {
      kind: 'function',
      paramList: crystalParams,
      returns: (n) => text(namedField(n, 'type')),
      receiver: (n) => {
        const cls = field(n, 'class');
        return cls ? text(cls) : undefined;
      },
    },
    abstract_method_def: { kind: 'method', paramList: crystalParams, returns: (n) => text(field(n, 'type')) },
    fun_def: { kind: 'function', paramList: crystalParams, returns: (n) => text(field(n, 'type')) },
    macro_def: { kind: 'function', paramList: crystalParams },
  },
  calls: {
    call: (n) => {
      const m = field(n, 'method');
      if (!m || m.type === 'operator') return null;
      if (m.text === 'require' || m.text === 'include' || m.text === 'extend') return null;
      const recv = field(n, 'receiver');
      return { nameString: m.text, ...(recv ? { receiverText: recv.text } : {}) };
    },
  },
  imports: {
    require: (n) => {
      const s = text(childOfType(childOfType(n, 'string'), 'literal_content'));
      return s ? [imp(s, n, { style: s.startsWith('.') ? 'path' : 'module' })] : [];
    },
  },
  selfNames: ['self'],
};

// ---------------------------------------------------------------- GDScript

const gdParam = (n: Node): SyntaxParam | null => {
  if (!/parameter|identifier/.test(n.type)) return null;
  const id = n.type === 'identifier' ? n : childOfType(n, 'identifier');
  if (!id) return null;
  const type = field(n, 'type');
  return {
    name: id.text,
    ...(type && type.type !== 'inferred_type' ? { type: type.text } : {}),
    ...(/default/.test(n.type) ? { optional: true } : {}),
  };
};

const gdExtends = (n: Node | null) => text(childOfType(n, 'type')) ?? text(named(n)[0]);

export const gdscript: LangSpec = {
  grammar: 'gdscript',
  param: gdParam,
  decls: {
    // A script is a class; `class_name` names it and `extends` gives its base.
    class_name_statement: {
      kind: 'class',
      bases: (n) => {
        for (const c of named(n.parent))
          if (c.type === 'extends_statement') return [gdExtends(c)].filter((x): x is string => !!x);
        return [];
      },
    },
    class_definition: {
      kind: 'class',
      bases: (n) => [gdExtends(field(n, 'extends'))].filter((x): x is string => !!x),
    },
    function_definition: { kind: 'function', returns: (n) => text(field(n, 'return_type')) },
    constructor_definition: { kind: 'constructor', name: () => '_init' },
    enum_definition: { kind: 'enum' },
    signal_statement: { kind: 'property' },
  },
  calls: {
    call: (n) => {
      const f = named(n)[0];
      if (!f || f.type !== 'identifier' || /^(preload|load)$/.test(f.text)) return null;
      return { callee: f };
    },
    attribute_call: (n) => {
      const name = childOfType(n, 'identifier');
      const recv = n.previousNamedSibling;
      return name ? { nameString: name.text, ...(recv ? { receiverText: recv.text } : {}) } : null;
    },
  },
  imports: {
    call: (n) => {
      const f = named(n)[0];
      if (f?.type !== 'identifier' || !/^(preload|load)$/.test(f.text)) return [];
      const s = strip(text(childOfType(field(n, 'arguments'), 'string')));
      return s ? [imp(s, n, { style: 'path' })] : [];
    },
    extends_statement: (n) => {
      const s = childOfType(n, 'string');
      return s ? [imp(strip(s.text)!, n, { style: 'path' })] : [];
    },
  },
  selfNames: ['self'],
};

// ---------------------------------------------------------------- Hack

const hackParams = (n: Node): SyntaxParam[] =>
  childrenOfType(childOfType(n, 'parameters'), 'parameter').map((p) => ({
    name: text(field(p, 'name')) ?? p.text,
    ...(field(p, 'type') ? { type: field(p, 'type')!.text } : {}),
    ...(field(p, 'default_value') || hasToken(p, '=') ? { optional: true } : {}),
    ...(childOfType(p, 'variadic_modifier') ? { variadic: true } : {}),
  }));
const hackTypes = (n: Node | null) =>
  childrenOfType(n, 'type_specifier').map((t) => t.text.replace(/<.*$/s, ''));

export const hack: LangSpec = {
  grammar: 'hack',
  namespace: { namespace_declaration: (n) => text(field(n, 'name')) },
  decls: {
    class_declaration: {
      kind: 'class',
      bases: (n) => [...hackTypes(childOfType(n, 'extends_clause')), ...hackTypes(childOfType(n, 'implements_clause'))],
    },
    interface_declaration: { kind: 'interface', bases: (n) => hackTypes(childOfType(n, 'extends_clause')) },
    trait_declaration: { kind: 'trait' },
    enum_declaration: { kind: 'enum' },
    alias_declaration: { kind: 'type' },
    method_declaration: { kind: 'method', paramList: hackParams, returns: (n) => text(field(n, 'return_type')) },
    function_declaration: { kind: 'function', paramList: hackParams, returns: (n) => text(field(n, 'return_type')) },
  },
  calls: {
    call_expression: (n) => {
      const f = field(n, 'function');
      if (!f) return null;
      if (f.type === 'selection_expression' || f.type === 'scoped_identifier') {
        const parts = named(f);
        const name = parts[parts.length - 1];
        return name ? { callee: f, receiver: parts.length > 1 ? parts[0]! : null, name } : null;
      }
      const ids = childrenOfType(f, 'identifier');
      return { callee: f, name: ids[ids.length - 1] ?? f };
    },
    new_expression: (n) => {
      const t = childOfType(n, 'qualified_identifier', 'identifier');
      return t ? { callee: t, isNew: true } : null;
    },
  },
  imports: {
    use_statement: (n) =>
      childrenOfType(n, 'use_clause').map((c) => imp((text(named(c)[0]) ?? c.text).replace(/^\\/, ''), c)),
    require_once_expression: (n) => {
      const s = strip(text(childOfType(n, 'string')));
      return s ? [imp(s, n, { style: 'path' })] : [];
    },
  },
  selfNames: ['$this', 'this'],
};

// ---------------------------------------------------------------- V

export const v: LangSpec = {
  grammar: 'v',
  namespace: { module_clause: (n) => text(childOfType(n, 'identifier')) },
  decls: {
    struct_declaration: { kind: 'struct' },
    interface_declaration: { kind: 'interface' },
    enum_declaration: { kind: 'enum' },
    type_declaration: { kind: 'type' },
    function_declaration: {
      kind: 'function',
      params: (n) => field(field(n, 'signature'), 'parameters'),
      returns: (n) => text(field(field(n, 'signature'), 'result')),
      receiver: (n) => text(field(field(n, 'receiver'), 'type'))?.replace(/^[&]?(mut\s+)?/, ''),
      receiverName: (n) => text(field(field(n, 'receiver'), 'name')),
      body: (n) => field(n, 'body'),
    },
  },
  calls: {
    call_expression: (n) => {
      const f = field(n, 'name');
      if (!f) return null;
      if (f.type === 'selector_expression')
        return { callee: f, receiver: field(f, 'operand'), name: field(f, 'field') };
      return { callee: f };
    },
  },
  imports: {
    import_declaration: (n) => {
      const spec = childOfType(n, 'import_spec');
      const path = text(childOfType(spec, 'import_path'));
      if (!path) return [];
      const alias = text(childOfType(spec, 'import_alias'));
      return [imp(path, n, alias ? { alias } : {})];
    },
  },
};

// ---------------------------------------------------------------- Odin

const odinParams = (n: Node): SyntaxParam[] | undefined => {
  const proc = childOfType(n, 'procedure');
  const list = childOfType(proc, 'parameters');
  if (!list) return undefined;
  return childrenOfType(list, 'parameter', 'default_parameter', 'variadic_parameter').flatMap((p) => {
    const type = childOfType(p, 'type');
    return childrenOfType(p, 'identifier').map((id) => ({
      name: id.text,
      ...(type ? { type: type.text } : {}),
      ...(p.type === 'default_parameter' ? { optional: true } : {}),
      ...(p.type === 'variadic_parameter' ? { variadic: true } : {}),
    }));
  });
};

export const odin: LangSpec = {
  grammar: 'odin',
  namespace: { package_declaration: (n) => text(childOfType(n, 'identifier')) },
  decls: {
    procedure_declaration: {
      kind: 'function',
      name: (n) => text(childOfType(n, 'identifier')),
      paramList: odinParams,
      returns: (n) => {
        const proc = childOfType(n, 'procedure');
        return text(named(proc).find((c) => c.type === 'type' && c.startIndex > (childOfType(proc, 'parameters')?.endIndex ?? 0) - 1));
      },
      body: (n) => childOfType(childOfType(n, 'procedure'), 'block'),
    },
    struct_declaration: { kind: 'struct', name: (n) => text(childOfType(n, 'identifier')) },
    enum_declaration: { kind: 'enum', name: (n) => text(childOfType(n, 'identifier')) },
    union_declaration: { kind: 'type', name: (n) => text(childOfType(n, 'identifier')) },
  },
  calls: {
    call_expression: (n) => {
      const f = field(n, 'function');
      if (!f) return null;
      // `pkg.f(…)` parses as member_expression(pkg, call_expression(f, …)).
      const p = n.parent;
      if (p?.type === 'member_expression' && named(p)[1]?.startIndex === n.startIndex)
        return { nameString: f.text, receiverText: named(p)[0]!.text };
      return { callee: f };
    },
  },
  imports: {
    import_declaration: (n) => {
      const s = strip(text(childOfType(n, 'string')));
      if (!s) return [];
      const alias = text(field(n, 'alias'));
      return [imp(s.replace(/^core:|^vendor:|^base:/, (x) => x), n, alias ? { alias } : {})];
    },
  },
};
