/**
 * Specs for Kotlin, Groovy, Lua, Elixir, Haskell, Julia, OCaml, F#, Zig, Solidity, Bash,
 * PowerShell, Puppet, Bicep and HCL/Terraform. These grammars expose fewer named fields, so the
 * specs read children by node type. Each is checked by a fixture in test/.
 */
import type { Node } from 'web-tree-sitter';
import {
  childOfType,
  childrenOfType,
  childrenWithField,
  field,
  fieldText,
  firstIdentifier,
  genericParam,
  line,
  named,
  text,
  unquote,
  type LangSpec,
} from '../spec';
import type { DeclKind, SyntaxImport, SyntaxParam } from '../types';
import { java } from './mainstream';
import * as V from './vars';

const imp = (spec: string, n: Node, extra: Partial<SyntaxImport> = {}): SyntaxImport => ({
  spec,
  line: line(n),
  style: 'module',
  ...extra,
});
const hasToken = (n: Node, tok: string): boolean =>
  n.children.some((c) => c && !c.isNamed && c.type === tok);
const TYPEISH = /type|user_type|nullable|function_type|parenthesized_type/;

// ---------------------------------------------------------------- Kotlin

const kotlinParam = (n: Node): SyntaxParam | null => {
  if (n.type !== 'parameter' && n.type !== 'class_parameter') return null;
  const name = text(childOfType(n, 'identifier', 'simple_identifier'));
  if (!name) return null;
  const type = text(named(n).find((c) => TYPEISH.test(c.type)));
  const p: SyntaxParam = { name };
  if (type) p.type = type;
  // A default value follows the parameter as a sibling: `qty: Int = 1`.
  if (n.nextSibling?.type === '=') p.optional = true;
  const mods = childOfType(n.previousNamedSibling, 'parameter_modifiers');
  if (/vararg/.test(n.previousNamedSibling?.text ?? '') || mods) p.variadic = true;
  return p;
};

export const kotlin: LangSpec = {
  vars: V.KOTLIN_VARS,
  grammar: 'kotlin',
  param: kotlinParam,
  namespace: { package_header: (n) => text(childOfType(n, 'qualified_identifier', 'identifier')) },
  decls: {
    class_declaration: {
      kind: (n) =>
        hasToken(n, 'interface')
          ? 'interface'
          : /\benum\b/.test(text(childOfType(n, 'modifiers')) ?? '')
            ? 'enum'
            : 'class',
      bases: (n) =>
        childrenOfType(childOfType(n, 'delegation_specifiers'), 'delegation_specifier')
          .map((d) => text(firstIdentifier(d)))
          .filter((s): s is string => !!s),
      body: (n) => childOfType(n, 'class_body', 'enum_class_body'),
    },
    object_declaration: { kind: 'object', body: (n) => childOfType(n, 'class_body') },
    companion_object: {
      kind: 'object',
      name: (n) => text(field(n, 'name')) ?? 'Companion',
      body: (n) => childOfType(n, 'class_body'),
    },
    function_declaration: {
      kind: 'function',
      params: (n) => childOfType(n, 'function_value_parameters'),
      returns: (n) => {
        const params = childOfType(n, 'function_value_parameters');
        const after = named(n).filter((c) => params && c.startIndex > params.startIndex);
        return text(after.find((c) => TYPEISH.test(c.type)));
      },
      receiver: (n) => {
        const params = childOfType(n, 'function_value_parameters');
        const before = named(n).filter(
          (c) => params && c.startIndex < params.startIndex && TYPEISH.test(c.type),
        );
        return text(before[0]);
      },
      body: (n) => childOfType(n, 'function_body'),
    },
    secondary_constructor: {
      kind: 'constructor',
      name: () => 'constructor',
      params: (n) => childOfType(n, 'function_value_parameters'),
    },
  },
  calls: {
    call_expression: (n) => {
      const f = named(n)[0];
      if (!f) return null;
      if (f.type === 'navigation_expression') {
        const parts = named(f);
        const last = parts[parts.length - 1];
        return { callee: f, name: last ?? null, receiver: parts.length > 1 ? parts[0]! : null };
      }
      if (f.type === 'call_expression') return null;
      return { callee: f };
    },
  },
  imports: {
    import: (n) => {
      const q = text(childOfType(n, 'qualified_identifier', 'identifier'));
      if (!q) return [];
      const ids = childrenOfType(n, 'identifier');
      const alias = ids.length && hasToken(n, 'as') ? text(ids[ids.length - 1]) : undefined;
      return [imp(q, n, alias ? { alias } : {})];
    },
  },
  selfNames: ['this'],
};

// ---------------------------------------------------------------- Groovy (Java grammar family)

export const groovy: LangSpec = {
  ...java,
  grammar: 'groovy',
  optionalTokens: [';'],
  decls: {
    ...java.decls,
    function_definition: { kind: 'function', returns: fieldText('type') },
  },
};

// ---------------------------------------------------------------- Lua

const luaName = (n: Node | null) => {
  if (!n) return {};
  if (n.type === 'dot_index_expression')
    return { name: text(field(n, 'field')), receiver: text(field(n, 'table')) };
  if (n.type === 'method_index_expression')
    return { name: text(field(n, 'method')), receiver: text(field(n, 'table')) };
  return { name: text(n) };
};

export const lua: LangSpec = {
  grammar: 'lua',
  param: (n) =>
    n.type === 'vararg_expression'
      ? { name: '...', variadic: true }
      : n.type === 'identifier'
        ? { name: n.text }
        : null,
  decls: {
    function_declaration: {
      kind: 'function',
      name: (n) => luaName(field(n, 'name')).name,
      receiver: (n) => luaName(field(n, 'name')).receiver,
    },
  },
  calls: {
    function_call: (n) => {
      const f = field(n, 'name');
      if (!f) return null;
      if (f.type === 'identifier' && f.text === 'require') return null;
      if (f.type === 'method_index_expression')
        return { callee: f, receiver: field(f, 'table'), name: field(f, 'method') };
      if (f.type === 'dot_index_expression')
        return { callee: f, receiver: field(f, 'table'), name: field(f, 'field') };
      return { callee: f };
    },
  },
  imports: {
    function_call: (n) => {
      const f = field(n, 'name');
      if (f?.type !== 'identifier' || f.text !== 'require') return [];
      const s = named(field(n, 'arguments')).find((c) => c.type === 'string') ?? null;
      const content = text(field(s, 'content')) ?? (s ? unquote(s.text) : undefined);
      return content ? [imp(content, n)] : [];
    },
  },
  selfNames: ['self'],
};

// ---------------------------------------------------------------- Elixir

const EX_DEF = new Set(['def', 'defp', 'defmacro', 'defmacrop', 'defguard', 'defdelegate']);
const EX_MOD: Record<string, DeclKind> = {
  defmodule: 'module',
  defprotocol: 'interface',
  defimpl: 'impl',
};
const EX_IMPORT = new Set(['alias', 'import', 'require', 'use']);
const exTarget = (n: Node) => text(field(n, 'target'));
/** The head call of `def name(args)`, unwrapping `when` guards. */
const exHead = (n: Node): Node | null => {
  let a = named(childOfType(n, 'arguments'))[0] ?? null;
  if (a?.type === 'binary_operator') a = field(a, 'left');
  return a;
};

export const elixir: LangSpec = {
  grammar: 'elixir',
  namespace: {},
  param: (n) => {
    if (n.type === 'identifier') return { name: n.text };
    if (n.type === 'binary_operator' && hasToken(n, '\\\\'))
      return { name: text(field(n, 'left')) ?? '_', optional: true };
    return { name: n.text.replace(/\s+/g, ' ').slice(0, 40) };
  },
  decls: {
    call: {
      kind: (n) => {
        const t = exTarget(n);
        if (!t) return null;
        if (EX_DEF.has(t)) return 'function';
        return EX_MOD[t] ?? null;
      },
      name: (n) => {
        const t = exTarget(n)!;
        if (EX_MOD[t]) return text(named(childOfType(n, 'arguments'))[0]);
        const h = exHead(n);
        return h?.type === 'call' ? exTarget(h) : text(h);
      },
      params: (n) => {
        const t = exTarget(n);
        if (!t || !EX_DEF.has(t)) return null;
        const h = exHead(n);
        return h?.type === 'call' ? childOfType(h, 'arguments') : null;
      },
      body: (n) => childOfType(n, 'do_block'),
    },
  },
  calls: {
    call: (n) => {
      const t = field(n, 'target');
      if (!t) return null;
      if (t.type === 'identifier') {
        if (EX_DEF.has(t.text) || EX_MOD[t.text] || EX_IMPORT.has(t.text)) return null;
        if (t.text === 'defstruct' || t.text === 'defexception') return null;
        // The head of a def is not a call.
        const gp = n.parent?.parent;
        if (n.parent?.type === 'arguments' && gp?.type === 'call' && EX_DEF.has(exTarget(gp) ?? ''))
          return null;
        const op = n.parent;
        if (op?.type === 'binary_operator' && op.parent?.type === 'arguments') {
          const def = op.parent.parent;
          if (def?.type === 'call' && EX_DEF.has(exTarget(def) ?? '')) return null;
        }
        return { callee: t };
      }
      if (t.type === 'dot')
        return { callee: t, receiver: field(t, 'left'), name: field(t, 'right') };
      return null;
    },
  },
  imports: {
    call: (n) => {
      const t = exTarget(n);
      if (!t || !EX_IMPORT.has(t)) return [];
      const a = named(childOfType(n, 'arguments'))[0];
      return a && a.type === 'alias' ? [imp(a.text, n)] : [];
    },
  },
};

// ---------------------------------------------------------------- Haskell

const hsSignature = (n: Node): Node | null => {
  const name = text(field(n, 'name'));
  let s = n.previousNamedSibling;
  for (let i = 0; s && i < 4; i++, s = s.previousNamedSibling)
    if (s.type === 'signature' && text(field(s, 'name')) === name) return s;
  return null;
};
const hsTypes = (sig: Node | null): { params: string[]; returns?: string } => {
  const params: string[] = [];
  let t = field(sig, 'type');
  while (t && t.type === 'function') {
    const p = text(field(t, 'parameter'));
    if (p) params.push(p);
    t = field(t, 'result');
  }
  return { params, returns: text(t) };
};

export const haskell: LangSpec = {
  grammar: 'haskell',
  namespace: { header: (n) => text(field(n, 'module')) },
  decls: {
    data_type: { kind: 'type' },
    newtype: { kind: 'type' },
    type_synomym: { kind: 'type', body: () => null },
    class: { kind: 'interface', body: (n) => field(n, 'declarations') },
    instance: {
      kind: 'impl',
      name: (n) => text(field(n, 'name')) ?? text(firstIdentifier(n)),
      body: (n) => field(n, 'declarations'),
    },
    function: {
      kind: (n) => {
        const name = text(field(n, 'name'));
        const prev = n.previousNamedSibling;
        // Later equations of the same function are not new declarations.
        return prev?.type === 'function' && text(field(prev, 'name')) === name ? null : 'function';
      },
      paramList: (n) => {
        const types = hsTypes(hsSignature(n)).params;
        return named(field(n, 'patterns')).map((p, i) => ({
          name: p.text.replace(/\s+/g, ' ').slice(0, 40),
          ...(types[i] ? { type: types[i] } : {}),
        }));
      },
      returns: (n) => hsTypes(hsSignature(n)).returns,
      body: (n) => field(n, 'match'),
    },
  },
  calls: {
    apply: (n) => {
      const f = field(n, 'function');
      if (!f || f.type === 'apply' || f.type === 'parens') return null;
      return { callee: f };
    },
  },
  imports: {
    import: (n) => {
      const m = text(field(n, 'module'));
      if (!m) return [];
      const alias = text(field(n, 'alias'));
      const names = named(field(n, 'names'))
        .map((c) => text(c))
        .filter((s): s is string => !!s)
        .map((name) => ({ name }));
      return [
        imp(m.replace(/\s+/g, ''), n, {
          ...(alias ? { alias } : {}),
          ...(names.length ? { names } : {}),
        }),
      ];
    },
  },
};

// ---------------------------------------------------------------- Julia

const juliaSigCall = (n: Node): { call: Node | null; returns?: string } => {
  let s = n.type === 'function_definition' ? childOfType(n, 'signature') : n;
  let returns: string | undefined;
  let c = s ? (named(s)[0] ?? null) : null;
  if (n.type === 'assignment') c = named(n)[0] ?? null;
  if (c?.type === 'typed_expression') {
    const parts = named(c);
    returns = text(parts[parts.length - 1]);
    c = parts[0] ?? null;
  }
  if (c?.type === 'where_expression') c = named(c)[0] ?? null;
  s = c;
  return { call: s?.type === 'call_expression' ? s : null, ...(returns ? { returns } : {}) };
};
const juliaName = (call: Node | null) => {
  const f = named(call)[0];
  if (f?.type === 'field_expression') {
    const parts = named(f);
    return { name: text(parts[parts.length - 1]), receiver: text(parts[0]) };
  }
  return { name: text(f) };
};
const juliaParam = (n: Node): SyntaxParam | SyntaxParam[] | null => {
  if (n.type === 'identifier') return { name: n.text };
  if (n.type === 'typed_expression') {
    const [a, b] = named(n);
    return { name: text(a) ?? '_', ...(b ? { type: text(b)! } : {}) };
  }
  if (n.type === 'named_argument' || n.type === 'optional_parameter') {
    const p = juliaParam(named(n)[0]!);
    return p && !Array.isArray(p) ? { ...p, optional: true } : null;
  }
  if (n.type === 'splat_expression') return { name: text(named(n)[0]) ?? '...', variadic: true };
  if (n.type === 'keyword_parameters') {
    const out: SyntaxParam[] = [];
    for (const c of named(n)) {
      const p = juliaParam(c);
      if (Array.isArray(p)) out.push(...p);
      else if (p) out.push(p);
    }
    return out;
  }
  return null;
};

export const julia: LangSpec = {
  grammar: 'julia',
  param: juliaParam,
  decls: {
    module_definition: { kind: 'module' },
    struct_definition: {
      kind: 'struct',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_head'))),
      body: () => null,
    },
    abstract_definition: {
      kind: 'type',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_head'))),
      body: () => null,
    },
    function_definition: {
      kind: 'function',
      name: (n) => juliaName(juliaSigCall(n).call).name,
      receiver: (n) => juliaName(juliaSigCall(n).call).receiver,
      params: (n) => childOfType(juliaSigCall(n).call, 'argument_list'),
      returns: (n) => juliaSigCall(n).returns,
      body: (n) => named(n)[1] ?? null,
    },
    assignment: {
      kind: (n) => (juliaSigCall(n).call ? 'function' : null),
      name: (n) => juliaName(juliaSigCall(n).call).name,
      params: (n) => childOfType(juliaSigCall(n).call, 'argument_list'),
      returns: (n) => juliaSigCall(n).returns,
      body: (n) => childOfType(n, 'operator'),
    },
  },
  calls: {
    call_expression: (n) => {
      // The call written in a function's own signature is its head, not a call.
      let p = n.parent;
      if (p?.type === 'typed_expression' || p?.type === 'where_expression') p = p.parent;
      if (p?.type === 'signature') return null;
      if (
        p?.type === 'assignment' &&
        named(p)[0]?.id === (n.parent?.type === 'assignment' ? n.id : n.parent?.id)
      )
        return null;
      const f = named(n)[0];
      if (!f) return null;
      if (f.type === 'field_expression') {
        const parts = named(f);
        return { callee: f, receiver: parts[0] ?? null, name: parts[parts.length - 1] ?? null };
      }
      return { callee: f };
    },
  },
  imports: {
    using_statement: (n) => juliaImports(n),
    import_statement: (n) => juliaImports(n),
  },
};

function juliaImports(n: Node): SyntaxImport[] {
  return named(n).flatMap((c) => {
    if (c.type === 'selected_import') {
      const [m, ...rest] = named(c);
      return m ? [imp(m.text, n, { names: rest.map((r) => ({ name: r.text })) })] : [];
    }
    return /identifier|scoped|import_path/.test(c.type) ? [imp(c.text, n)] : [];
  });
}

// ---------------------------------------------------------------- OCaml

const ocamlParam = (n: Node): SyntaxParam | null => {
  if (n.type !== 'parameter') return null;
  const pat = field(n, 'pattern');
  if (!pat || pat.type === 'unit') return null;
  const optional = !!field(n, 'default') || n.text.trim().startsWith('?');
  if (pat.type === 'typed_pattern')
    return {
      name: text(field(pat, 'pattern')) ?? '_',
      ...(text(field(pat, 'type')) ? { type: text(field(pat, 'type'))! } : {}),
      ...(optional ? { optional } : {}),
    };
  return { name: text(pat) ?? '_', ...(optional ? { optional } : {}) };
};

export const ocaml: LangSpec = {
  grammar: 'ocaml',
  param: ocamlParam,
  decls: {
    let_binding: {
      kind: (n) =>
        childOfType(n, 'parameter') || field(n, 'body')?.type === 'fun_expression'
          ? 'function'
          : null,
      name: (n) => text(field(n, 'pattern')),
      params: (n) => n,
      returns: fieldText('type'),
    },
    module_binding: {
      kind: 'module',
      name: (n) => text(childOfType(n, 'module_name')),
    },
    type_binding: { kind: 'type', body: () => null },
    class_binding: { kind: 'class' },
  },
  calls: {
    application_expression: (n) => {
      const f = field(n, 'function');
      if (!f) return null;
      const parts = named(f);
      if (f.type === 'value_path' && parts.length > 1)
        return { callee: f, receiver: parts[0] ?? null, name: parts[parts.length - 1] ?? null };
      return { callee: f };
    },
  },
  imports: {
    open_module: (n) => {
      const m = text(field(n, 'module'));
      return m ? [imp(m, n)] : [];
    },
  },
};

// ---------------------------------------------------------------- F#

const fsTypedParams = (n: Node | null): SyntaxParam[] => {
  if (!n) return [];
  if (n.type === 'typed_pattern') {
    const id = text(firstIdentifier(childOfType(n, 'identifier_pattern') ?? n));
    const t = text(named(n).find((c) => /type/.test(c.type) && c.type !== 'typed_pattern'));
    return id ? [{ name: id, ...(t ? { type: t } : {}) }] : [];
  }
  if (n.type === 'identifier_pattern') {
    const id = text(firstIdentifier(n));
    return id && id !== '()' ? [{ name: id }] : [];
  }
  return named(n).flatMap((c) => fsTypedParams(c));
};

/** A member's arguments, and its return type when written as `(args) : T`. */
const fsArgs = (n: Node): { list: Node | null; returns?: string } => {
  const args = field(n, 'args');
  if (args?.type === 'typed_pattern' && named(args)[0]?.type === 'paren_pattern') {
    const [list, ret] = named(args);
    return { list: list ?? null, ...(text(ret) ? { returns: text(ret)! } : {}) };
  }
  return { list: args };
};

export const fsharp: LangSpec = {
  grammar: 'fsharp',
  namespace: { named_module: fieldText('name'), namespace: fieldText('name') },
  param: () => null,
  decls: {
    named_module: { kind: 'module', body: () => null },
    namespace: { kind: 'namespace', body: () => null },
    module_defn: { kind: 'module', name: (n) => text(firstIdentifier(n)), body: () => null },
    anon_type_defn: {
      kind: 'class',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_name'))),
      body: () => null,
    },
    record_type_defn: {
      kind: 'record',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_name'))),
      body: () => null,
    },
    union_type_defn: {
      kind: 'type',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_name'))),
      body: () => null,
    },
    interface_type_defn: {
      kind: 'interface',
      name: (n) => text(firstIdentifier(childOfType(n, 'type_name'))),
      body: () => null,
    },
    method_or_prop_defn: {
      kind: (n) => (field(n, 'args') ? 'function' : 'property'),
      name: (n) => text(field(field(n, 'name'), 'method')) ?? text(field(n, 'name')),
      paramList: (n) => {
        const a = fsArgs(n);
        return a.list ? fsTypedParams(a.list) : undefined;
      },
      returns: (n) => fsArgs(n).returns,
      body: (n) => {
        const args = field(n, 'args');
        return named(n).find((c) => args && c.startIndex > args.endIndex) ?? null;
      },
    },
    function_or_value_defn: {
      kind: (n) => (childOfType(n, 'function_declaration_left') ? 'function' : null),
      name: (n) => text(childOfType(childOfType(n, 'function_declaration_left'), 'identifier')),
      paramList: (n) =>
        fsTypedParams(
          childOfType(childOfType(n, 'function_declaration_left'), 'argument_patterns'),
        ),
      returns: (n) => text(named(n).find((c) => /type/.test(c.type))),
      body: (n) => field(n, 'body'),
    },
  },
  calls: {
    application_expression: (n) => {
      const f = named(n)[0];
      if (!f || f.type === 'application_expression') return null;
      return { callee: f };
    },
  },
  imports: {
    import_decl: (n) => {
      const m = text(named(n)[0]);
      return m ? [imp(m, n)] : [];
    },
  },
  selfNames: ['this', 'self', '__'],
};

// ---------------------------------------------------------------- Zig

const zigContainer = (n: Node): Node | null =>
  named(n).find((c) => /^(struct|enum|union|opaque)_declaration$/.test(c.type)) ?? null;

export const zig: LangSpec = {
  grammar: 'zig',
  decls: {
    variable_declaration: {
      kind: (n) => {
        const c = zigContainer(n);
        if (!c) return null;
        return c.type.startsWith('enum')
          ? 'enum'
          : c.type.startsWith('union')
            ? 'struct'
            : 'struct';
      },
      name: (n) => text(childOfType(n, 'identifier')),
      body: (n) => zigContainer(n),
    },
    function_declaration: {
      kind: 'function',
      returns: fieldText('type'),
      params: (n) => field(n, 'parameters') ?? childOfType(n, 'parameters'),
    },
    test_declaration: { kind: 'function', name: (n) => `test ${text(named(n)[0]) ?? ''}`.trim() },
  },
  calls: { call_expression: (n) => ({ callee: field(n, 'function') }) },
  imports: {
    builtin_function: (n) => {
      if (!/^@import\b/.test(n.text) && !/^@cImport\b/.test(n.text)) return [];
      const s = /"([^"]+)"/.exec(n.text)?.[1];
      return s ? [imp(s, n, { style: s.endsWith('.zig') ? 'path' : 'module' })] : [];
    },
  },
};

// ---------------------------------------------------------------- Solidity

const solParam = (n: Node): SyntaxParam | null =>
  n.type === 'parameter'
    ? {
        name: text(field(n, 'name')) ?? '_',
        ...(text(field(n, 'type'))
          ? { type: [text(field(n, 'type')), text(field(n, 'location'))].filter(Boolean).join(' ') }
          : {}),
      }
    : null;

export const solidity: LangSpec = {
  vars: V.SOLIDITY_VARS,
  grammar: 'solidity',
  param: solParam,
  decls: {
    contract_declaration: {
      kind: 'class',
      bases: (n) =>
        childrenOfType(n, 'inheritance_specifier').flatMap((s) =>
          childrenWithField(s, 'ancestor').map((c) => c.text),
        ),
    },
    interface_declaration: { kind: 'interface' },
    library_declaration: { kind: 'module' },
    struct_declaration: { kind: 'struct' },
    enum_declaration: { kind: 'enum' },
    function_definition: {
      kind: 'function',
      params: (n) => n,
      returns: (n) =>
        text(field(n, 'return_type'))
          ?.replace(/^returns\s*/, '')
          .replace(/^\(([^,()]*)\)$/, '$1'),
    },
    modifier_definition: { kind: 'function', params: (n) => n },
    constructor_definition: { kind: 'constructor', name: () => 'constructor', params: (n) => n },
  },
  calls: {
    call_expression: (n) => {
      const f = field(n, 'function');
      const inner = f && named(f).length === 1 ? named(f)[0]! : f;
      if (inner?.type === 'member_expression')
        return { callee: inner, receiver: field(inner, 'object'), name: field(inner, 'property') };
      return { callee: inner };
    },
  },
  imports: {
    import_directive: (n) => {
      const s = text(field(n, 'source'));
      if (!s) return [];
      const names = childrenWithField(n, 'import_name').map((c) => ({ name: c.text }));
      return [imp(unquote(s), n, { style: 'path', ...(names.length ? { names } : {}) })];
    },
  },
};

// ---------------------------------------------------------------- Bash

const SH_SOURCE = new Set(['source', '.']);

export const bash: LangSpec = {
  grammar: 'bash',
  decls: { function_definition: { kind: 'function', params: () => null } },
  calls: {
    command: (n) => {
      const name = field(n, 'name');
      if (!name || SH_SOURCE.has(name.text)) return null;
      return { callee: name };
    },
  },
  imports: {
    command: (n) => {
      const name = text(field(n, 'name'));
      if (!name || !SH_SOURCE.has(name)) return [];
      const arg = field(n, 'argument');
      return arg ? [imp(unquote(arg.text), n, { style: 'path' })] : [];
    },
  },
};

// ---------------------------------------------------------------- PowerShell

const psType = (n: Node | null): string | undefined =>
  text(n?.descendantsOfType('type_name')[0] ?? null);
const psParam = (n: Node): SyntaxParam | null => {
  if (n.type !== 'script_parameter' && n.type !== 'class_method_parameter') return null;
  const v = text(childOfType(n, 'variable'));
  if (!v) return null;
  const type = psType(childOfType(n, 'attribute_list', 'type_literal'));
  return {
    name: v.replace(/^\$/, ''),
    ...(type ? { type } : {}),
    ...(childOfType(n, 'script_parameter_default') ? { optional: true } : {}),
  };
};
const PS_IMPORT = new Set(['Import-Module', 'using']);

export const powershell: LangSpec = {
  grammar: 'powershell',
  param: psParam,
  decls: {
    class_statement: {
      kind: 'class',
      name: (n) => text(childOfType(n, 'simple_name')),
      body: () => null,
    },
    enum_statement: {
      kind: 'enum',
      name: (n) => text(childOfType(n, 'simple_name')),
      body: () => null,
    },
    class_method_definition: {
      kind: 'function',
      name: (n) => text(childOfType(n, 'simple_name')),
      params: (n) => childOfType(n, 'class_method_parameter_list'),
      returns: (n) => psType(childOfType(n, 'attribute', 'type_literal')),
      body: (n) => childOfType(n, 'script_block'),
    },
    function_statement: {
      kind: 'function',
      name: (n) => text(childOfType(n, 'function_name')),
      params: (n) =>
        childOfType(childOfType(childOfType(n, 'script_block'), 'param_block'), 'parameter_list'),
      body: (n) => childOfType(n, 'script_block'),
    },
  },
  calls: {
    command: (n) => {
      const name = field(n, 'command_name');
      if (!name || name.type !== 'command_name' || PS_IMPORT.has(name.text)) return null;
      return { callee: name };
    },
    invokation_expression: (n) => ({
      receiver: named(n)[0] ?? null,
      name: firstIdentifier(childOfType(n, 'member_name')) ?? childOfType(n, 'member_name'),
    }),
  },
  imports: {
    command: (n) => {
      const name = field(n, 'command_name');
      if (!name) return [];
      if (name.type === 'command_name_expr' && hasToken(n, '.')) {
        return [imp(name.text.trim(), n, { style: 'path' })];
      }
      if (name.type === 'command_name_expr' && childOfType(n, 'command_invokation_operator')) {
        return [imp(name.text.trim(), n, { style: 'path' })];
      }
      if (!PS_IMPORT.has(name.text)) return [];
      const arg = named(field(n, 'command_elements')).find((c) => /token|string/.test(c.type));
      return arg
        ? [imp(unquote(arg.text), n, { style: /[/\\.]/.test(arg.text) ? 'path' : 'module' })]
        : [];
    },
  },
  selfNames: ['$this'],
};

// ---------------------------------------------------------------- Puppet

const ppParam = (n: Node): SyntaxParam | null => {
  if (n.type !== 'parameter') return null;
  const v = text(firstIdentifier(childOfType(n, 'variable')));
  if (!v) return null;
  const type = text(named(n).find((c) => /type/.test(c.type)));
  return { name: v, ...(type ? { type } : {}), ...(hasToken(n, '=') ? { optional: true } : {}) };
};

export const puppet: LangSpec = {
  grammar: 'puppet',
  param: ppParam,
  decls: {
    class_definition: {
      kind: 'class',
      name: (n) => text(childOfType(n, 'class_identifier', 'identifier')),
      params: (n) => childOfType(n, 'parameter_list'),
      bases: (n) => {
        const b = text(childOfType(childOfType(n, 'class_inherits'), 'class_identifier'));
        return b ? [b] : [];
      },
      body: (n) => childOfType(n, 'block'),
    },
    defined_resource_type: {
      kind: 'type',
      name: (n) => text(childOfType(n, 'class_identifier', 'identifier')),
      params: (n) => childOfType(n, 'parameter_list'),
      body: (n) => childOfType(n, 'block'),
    },
    node_definition: {
      kind: 'module',
      name: (n) => `node ${text(named(n)[0]) ?? ''}`.trim(),
      body: (n) => childOfType(n, 'block'),
    },
    function_declaration: {
      kind: 'function',
      name: (n) => text(childOfType(n, 'class_identifier', 'identifier')),
    },
    resource_declaration: {
      kind: 'resource',
      name: (n) => {
        const t = text(field(n, 'type'));
        const title = field(n, 'title');
        return t ? `${t}[${title ? unquote(title.text) : ''}]` : null;
      },
      params: () => null,
      body: () => null,
    },
  },
  calls: {},
  imports: {
    include_statement: (n) =>
      childrenOfType(n, 'class_identifier', 'identifier').map((c) => imp(c.text, n)),
  },
};

// ---------------------------------------------------------------- Bicep

export const bicep: LangSpec = {
  grammar: 'bicep',
  param: () => null,
  decls: {
    parameter_declaration: {
      kind: 'property',
      name: (n) => text(childOfType(n, 'identifier')),
      returns: (n) => text(childOfType(n, 'type')),
      body: () => null,
    },
    output_declaration: {
      kind: 'property',
      name: (n) => text(childOfType(n, 'identifier')),
      returns: (n) => text(childOfType(n, 'type')),
      body: () => null,
    },
    resource_declaration: {
      kind: 'resource',
      name: (n) => text(childOfType(n, 'identifier')),
      returns: (n) => {
        const s = childOfType(n, 'string');
        return s ? unquote(s.text) : undefined;
      },
      body: (n) => childOfType(n, 'object'),
    },
    module_declaration: {
      kind: 'module',
      name: (n) => text(childOfType(n, 'identifier')),
      body: (n) => childOfType(n, 'object'),
    },
    user_defined_function: { kind: 'function', name: (n) => text(childOfType(n, 'identifier')) },
  },
  calls: {
    call_expression: (n) => ({ callee: field(n, 'function') }),
  },
  imports: {
    module_declaration: (n) => {
      const s = childOfType(n, 'string');
      return s ? [imp(unquote(s.text), n, { style: 'path' })] : [];
    },
    import_statement: (n) => {
      const s = childOfType(n, 'string');
      return s ? [imp(unquote(s.text), n, { style: 'path' })] : [];
    },
  },
};

// ---------------------------------------------------------------- HCL / Terraform

const hclLabels = (n: Node): string[] =>
  named(n)
    .filter((c) => c.type === 'string_lit' || (c.type === 'identifier' && c !== named(n)[0]))
    .map((c) => unquote(c.text.trim()));
const HCL_NAMED: Record<string, (labels: string[]) => { kind: DeclKind; name: string } | null> = {
  resource: (l) => (l.length >= 2 ? { kind: 'resource', name: `${l[0]}.${l[1]}` } : null),
  data: (l) => (l.length >= 2 ? { kind: 'resource', name: `data.${l[0]}.${l[1]}` } : null),
  module: (l) => (l[0] ? { kind: 'module', name: `module.${l[0]}` } : null),
  variable: (l) => (l[0] ? { kind: 'property', name: `var.${l[0]}` } : null),
  output: (l) => (l[0] ? { kind: 'property', name: `output.${l[0]}` } : null),
  provider: (l) => (l[0] ? { kind: 'resource', name: `provider.${l[0]}` } : null),
};
const hclTop = (n: Node): boolean => n.parent?.parent?.type === 'config_file';
const hclBlock = (n: Node) => {
  if (!hclTop(n)) return null;
  const head = text(named(n)[0]);
  const f = head ? HCL_NAMED[head] : undefined;
  return f ? f(hclLabels(n)) : null;
};

export const hcl: LangSpec = {
  grammar: 'hcl',
  param: () => null,
  decls: {
    block: {
      kind: (n) => hclBlock(n)?.kind ?? null,
      name: (n) => hclBlock(n)?.name,
      params: () => null,
      returns: (n) => {
        const t = named(childOfType(n, 'body')).find(
          (a) => a.type === 'attribute' && text(named(a)[0]) === 'type',
        );
        return text(named(t)[1]);
      },
      body: (n) => childOfType(n, 'block_start'),
    },
  },
  calls: {
    // References between blocks: module.vpc.x, var.region, data.aws_ami.ubuntu.id, aws_instance.web.ip
    expression: (n) => {
      const v = childOfType(n, 'variable_expr');
      if (!v) return null;
      const root = text(v);
      if (!root || /^(count|each|path|self|terraform)$/.test(root)) return null;
      const segs = [root];
      for (const c of named(n)) {
        if (c.type !== 'get_attr') continue;
        const id = text(firstIdentifier(c));
        if (id) segs.push(id);
        if (segs.length >= (root === 'data' ? 3 : 2)) break;
      }
      if (segs.length < 2) return null;
      return { nameText: segs.join('.') };
    },
  },
  imports: {
    block: (n) => {
      if (!hclTop(n) || text(named(n)[0]) !== 'module') return [];
      const src = named(childOfType(n, 'body')).find(
        (a) => a.type === 'attribute' && text(named(a)[0]) === 'source',
      );
      const v = named(src)[1];
      return v
        ? [
            imp(unquote(v.text.trim()), n, {
              style: /^\.{1,2}\//.test(unquote(v.text.trim())) ? 'path' : 'module',
            }),
          ]
        : [];
    },
  },
};

export { genericParam };
