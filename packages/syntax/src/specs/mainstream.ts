/**
 * Specs for Python, Go, Java, C#, C, C++, Rust, PHP, Ruby and Scala. Node types and field names
 * come from each grammar's node-types.json (versions in grammars/MANIFEST.json) and are checked by
 * the fixtures in test/.
 */
import type { Node } from 'web-tree-sitter';
import {
  childrenWithField,
  childOfType,
  childrenOfType,
  declaratorName,
  field,
  fieldText,
  firstIdentifier,
  genericParam,
  line,
  named,
  text,
  unquote,
  type DeclRule,
  type LangSpec,
} from '../spec';
import type { DeclKind, SyntaxImport, SyntaxParam } from '../types';
import * as V from './vars';

const imp = (spec: string, n: Node, extra: Partial<SyntaxImport> = {}): SyntaxImport => ({
  spec,
  line: line(n),
  style: 'module',
  ...extra,
});
const callee = (f: string) => (n: Node) => ({ callee: field(n, f) });
const listTexts = (n: Node | null | undefined): string[] =>
  named(n)
    .map((c) => text(c))
    .filter((s): s is string => !!s);

// ---------------------------------------------------------------- Python (and Starlark)

export const python: LangSpec = {
  vars: V.PYTHON_VARS,
  grammar: 'python',
  decls: {
    class_definition: {
      kind: 'class',
      bases: (n) => listTexts(field(n, 'superclasses')).filter((s) => !s.includes('=')),
    },
    function_definition: { kind: 'function', returns: fieldText('return_type') },
  },
  calls: { call: callee('function') },
  imports: {
    import_statement: (n) =>
      named(n)
        .filter((c) => c.type === 'dotted_name' || c.type === 'aliased_import')
        .map((c) =>
          c.type === 'aliased_import'
            ? imp(text(field(c, 'name'))!, n, { alias: text(field(c, 'alias')) })
            : imp(text(c)!, n),
        ),
    import_from_statement: (n) => {
      const modNode = field(n, 'module_name');
      const mod = text(modNode);
      if (!mod) return [];
      const names = named(n)
        .filter((c) => c.id !== modNode?.id)
        .filter((c) => c.type === 'dotted_name' || c.type === 'aliased_import')
        .map((c) =>
          c.type === 'aliased_import'
            ? { name: text(field(c, 'name'))!, alias: text(field(c, 'alias')) }
            : { name: text(c)! },
        )
        .map((x) => (x.alias ? x : { name: x.name }));
      return [imp(mod, n, names.length ? { names } : {})];
    },
  },
};

/** Starlark: `load("//pkg:file.bzl", "sym", alias = "sym2")` is the import; the rest is Python. */
export const starlark: LangSpec = {
  ...python,
  grammar: 'starlark',
  imports: {
    ...python.imports,
    call: (n) => {
      if (text(field(n, 'function')) !== 'load') return [];
      const args = named(field(n, 'arguments'));
      const first = args[0];
      if (!first || first.type !== 'string') return [];
      const names = args.slice(1).flatMap((a) => {
        if (a.type === 'string') return [{ name: unquote(a.text) }];
        if (a.type === 'keyword_argument') {
          const v = text(field(a, 'value'));
          const k = text(field(a, 'name'));
          return v && k ? [{ name: unquote(v), alias: k }] : [];
        }
        return [];
      });
      return [imp(unquote(first.text), n, { style: 'path', ...(names.length ? { names } : {}) })];
    },
  },
  calls: {
    call: (n) => (text(field(n, 'function')) === 'load' ? null : { callee: field(n, 'function') }),
  },
};

// ---------------------------------------------------------------- Go

const goParam = (n: Node): SyntaxParam[] | null => {
  const type = text(field(n, 'type'));
  const names = n.children.filter((c) => c && c.type === 'identifier') as Node[];
  const variadic = n.type === 'variadic_parameter_declaration';
  if (!names.length) return type ? [{ name: '_', type }] : null;
  return names.map((c) => ({
    name: c.text,
    ...(type ? { type: variadic ? `...${type}` : type } : {}),
    ...(variadic ? { variadic: true } : {}),
  }));
};

export const go: LangSpec = {
  vars: V.GO_VARS,
  grammar: 'go',
  param: goParam,
  namespace: { package_clause: (n) => text(childOfType(n, 'package_identifier')) },
  decls: {
    function_declaration: { kind: 'function', returns: fieldText('result') },
    method_declaration: {
      kind: 'method',
      returns: fieldText('result'),
      receiver: (n) => {
        const t = text(field(childOfType(field(n, 'receiver'), 'parameter_declaration'), 'type'));
        return t?.replace(/^\*/, '').replace(/\[.*$/, '');
      },
      receiverName: (n) =>
        text(field(childOfType(field(n, 'receiver'), 'parameter_declaration'), 'name')),
    },
    type_spec: {
      kind: (n) => {
        const t = field(n, 'type')?.type;
        return t === 'struct_type' ? 'struct' : t === 'interface_type' ? 'interface' : 'type';
      },
      body: (n) => field(n, 'type'),
    },
    method_elem: { kind: 'method', returns: fieldText('result') },
  },
  calls: { call_expression: callee('function') },
  imports: {
    import_spec: (n) => {
      const path = text(field(n, 'path'));
      if (!path) return [];
      const alias = text(field(n, 'name'));
      return [imp(unquote(path), n, alias ? { alias } : {})];
    },
  },
};

// ---------------------------------------------------------------- Java

const javaBases = (n: Node) => [
  ...listTexts(field(n, 'superclass')),
  ...named(field(n, 'interfaces')).flatMap((c) => listTexts(c)),
];

export const java: LangSpec = {
  vars: V.JAVA_VARS,
  grammar: 'java',
  namespace: { package_declaration: (n) => text(named(n).find((c) => /identifier/.test(c.type))) },
  decls: {
    class_declaration: { kind: 'class', bases: javaBases },
    interface_declaration: {
      kind: 'interface',
      bases: (n) => named(childOfType(n, 'extends_interfaces')).flatMap((c) => listTexts(c)),
    },
    enum_declaration: { kind: 'enum', bases: javaBases },
    record_declaration: { kind: 'record', bases: javaBases },
    annotation_type_declaration: { kind: 'interface' },
    method_declaration: { kind: 'function', returns: fieldText('type') },
    constructor_declaration: { kind: 'constructor' },
    compact_constructor_declaration: { kind: 'constructor' },
  },
  calls: {
    method_invocation: (n) => ({ receiver: field(n, 'object'), name: field(n, 'name') }),
    object_creation_expression: (n) => ({ name: field(n, 'type'), isNew: true }),
  },
  imports: {
    import_declaration: (n) => {
      const spec = n.text
        .replace(/^import\s+(static\s+)?/, '')
        .replace(/;\s*$/, '')
        .replace(/\s+/g, '');
      return [imp(spec, n)];
    },
  },
};

// ---------------------------------------------------------------- C#

const csBases = (n: Node) =>
  named(childOfType(n, 'base_list'))
    .map((c) => text(c))
    .filter((s): s is string => !!s);

export const csharp: LangSpec = {
  vars: V.CSHARP_VARS,
  grammar: 'c_sharp',
  namespace: {
    namespace_declaration: fieldText('name'),
    file_scoped_namespace_declaration: fieldText('name'),
  },
  decls: {
    namespace_declaration: { kind: 'namespace' },
    file_scoped_namespace_declaration: { kind: 'namespace' },
    class_declaration: { kind: 'class', bases: csBases },
    interface_declaration: { kind: 'interface', bases: csBases },
    struct_declaration: { kind: 'struct', bases: csBases },
    enum_declaration: { kind: 'enum' },
    record_declaration: { kind: 'record', bases: csBases },
    record_struct_declaration: { kind: 'record', bases: csBases },
    delegate_declaration: { kind: 'type', returns: fieldText('type') },
    method_declaration: { kind: 'function', returns: fieldText('returns') },
    local_function_statement: { kind: 'function', returns: fieldText('type') },
    constructor_declaration: { kind: 'constructor' },
    property_declaration: {
      kind: 'property',
      returns: fieldText('type'),
      body: (n) => field(n, 'accessors') ?? field(n, 'value'),
    },
  },
  calls: {
    invocation_expression: callee('function'),
    object_creation_expression: (n) => ({ name: field(n, 'type'), isNew: true }),
  },
  imports: {
    using_directive: (n) => {
      const spec = n.text
        .replace(/^(global\s+)?using\s+(static\s+)?/, '')
        .replace(/;\s*$/, '')
        .trim();
      const m = /^(\w+)\s*=\s*(.+)$/.exec(spec);
      return [m ? imp(m[2]!.trim(), n, { alias: m[1] }) : imp(spec, n)];
    },
  },
};

// ---------------------------------------------------------------- C and C++

/** The function_declarator under a definition's declarator chain (skipping pointers). */
function functionDeclarator(n: Node): Node | null {
  let cur = field(n, 'declarator');
  for (let i = 0; cur && i < 8; i++) {
    if (cur.type === 'function_declarator') return cur;
    cur = field(cur, 'declarator');
  }
  return null;
}

const cReturn = (n: Node): string | undefined => {
  const t = text(field(n, 'type'));
  if (!t) return undefined;
  const d = field(n, 'declarator');
  const marks = d && /pointer|reference/.test(d.type) ? d.text.match(/^[\s*&]+/)?.[0] : '';
  return `${t}${(marks ?? '').replace(/\s+/g, '')}`;
};

const cFunction: DeclRule = {
  kind: 'function',
  name: (n) => {
    const fd = functionDeclarator(n);
    const inner = field(fd, 'declarator');
    if (inner?.type === 'qualified_identifier')
      return text(field(inner, 'name')) ?? text(inner)?.split('::').pop();
    return text(declaratorName(fd ?? n));
  },
  receiver: (n) => {
    const inner = field(functionDeclarator(n), 'declarator');
    if (inner?.type !== 'qualified_identifier') return undefined;
    const parts = inner.text.replace(/\s+/g, '').split('::');
    return parts.length > 1 ? parts[parts.length - 2] : undefined;
  },
  params: (n) => field(functionDeclarator(n), 'parameters'),
  returns: cReturn,
};

/** A function prototype inside a class or struct body (C++ member declaration). */
const cMemberPrototype: DeclRule = {
  kind: (n) => (functionDeclarator(n) ? 'function' : null),
  name: (n) => text(declaratorName(functionDeclarator(n))),
  params: (n) => field(functionDeclarator(n), 'parameters'),
  returns: cReturn,
};

const withBody =
  (kind: 'struct' | 'enum' | 'class') =>
  (n: Node): 'struct' | 'enum' | 'class' | null =>
    field(n, 'body') ? kind : null;

const cImports = {
  preproc_include: (n: Node) => {
    const pn = field(n, 'path');
    const p = text(pn);
    // #include <x.h> names a system or library header; #include "x.h" a file next to this one.
    const style = pn?.type === 'system_lib_string' ? ('module' as const) : ('include' as const);
    return p ? [imp(unquote(p).replace(/^<|>$/g, ''), n, { style })] : [];
  },
};

export const c: LangSpec = {
  vars: V.C_VARS,
  grammar: 'c',
  decls: {
    function_definition: cFunction,
    struct_specifier: { kind: withBody('struct') },
    union_specifier: { kind: withBody('struct') },
    enum_specifier: { kind: withBody('enum') },
    type_definition: {
      kind: 'type',
      name: (n) => text(declaratorName(n)),
      body: () => null,
    },
  },
  calls: { call_expression: callee('function') },
  imports: cImports,
};

// ---------------------------------------------------------------- Objective-C

/** The selector a method declares: `add:qty:` for `- add:(T)a qty:(U)b`, `empty` for `- empty`. */
function objcSelector(n: Node): string | undefined {
  const keys: string[] = [];
  let params = 0;
  for (const ch of n.namedChildren) {
    if (!ch) continue;
    if (ch.type === 'identifier') keys.push(ch.text);
    else if (ch.type === 'method_parameter') params++;
  }
  if (!keys.length) return undefined;
  return params ? keys.map((k) => `${k}:`).join('') : keys[0];
}
const objcType = (n: Node | null | undefined): string | undefined =>
  n
    ? n.text
        .replace(/^\(\s*|\s*\)$/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\*/g, '*')
    : undefined;

const objcMethod = {
  // -init… methods return the receiver initialised: Objective-C's constructors.
  kind: (n: Node) =>
    (/^init([A-Z:]|$)/.test(objcSelector(n) ?? '') ? 'constructor' : 'method') as DeclKind,
  name: objcSelector,
  paramList: (n: Node): SyntaxParam[] =>
    childrenOfType(n, 'method_parameter').map((p) => {
      const ids = childrenOfType(p, 'identifier');
      const t = objcType(childOfType(p, 'method_type'));
      return { name: ids[ids.length - 1]?.text ?? '_', ...(t ? { type: t } : {}) };
    }),
  returns: (n: Node) => objcType(childOfType(n, 'method_type')),
  body: (n: Node) => childOfType(n, 'compound_statement'),
};

export const objc: LangSpec = {
  vars: V.C_VARS,
  grammar: 'objc',
  decls: {
    ...c.decls,
    class_interface: {
      kind: 'class',
      name: (n) => childOfType(n, 'identifier')?.text,
      bases: (n) => [
        ...(text(field(n, 'superclass')) ? [text(field(n, 'superclass'))!] : []),
        ...named(childOfType(n, 'parameterized_arguments')).map((x) => x.text),
      ],
      body: () => null,
    },
    // @implementation: the class body; its methods belong to the class of that name.
    class_implementation: {
      kind: 'impl',
      name: (n) => childOfType(n, 'identifier')?.text,
      body: () => null,
    },
    protocol_declaration: {
      kind: 'interface',
      name: (n) => childOfType(n, 'identifier')?.text,
      bases: (n) => named(childOfType(n, 'protocol_reference_list')).map((x) => x.text),
      body: () => null,
    },
    method_declaration: objcMethod,
    method_definition: objcMethod,
    property_declaration: {
      kind: 'property',
      name: (n) =>
        text(
          declaratorName(childOfType(childOfType(n, 'struct_declaration'), 'struct_declarator')),
        ),
      returns: (n) =>
        text(
          childOfType(childOfType(n, 'struct_declaration'), 'type_identifier', 'primitive_type'),
        ),
      body: () => null,
    },
  },
  calls: {
    call_expression: callee('function'),
    message_expression: (n) => {
      const keys = childrenWithField(n, 'method');
      if (!keys.length) return null;
      const recv = field(n, 'receiver');
      const skip = new Set([recv?.id, ...keys.map((k) => k.id)]);
      const args = n.namedChildren.some((x) => x && !skip.has(x.id));
      const selector = args ? keys.map((k) => `${k.text}:`).join('') : keys[0]!.text;
      // [Cart alloc] / [Cart new]: an instance of the class named as the receiver.
      if (
        (selector === 'alloc' || selector === 'new') &&
        recv?.type === 'identifier' &&
        /^[A-Z]/.test(recv.text)
      )
        return { name: recv, isNew: true };
      return { receiver: recv, nameString: selector };
    },
  },
  imports: cImports,
};

export const cpp: LangSpec = {
  vars: V.C_VARS,
  grammar: 'cpp',
  namespace: { namespace_definition: fieldText('name') },
  decls: {
    ...c.decls,
    namespace_definition: { kind: 'namespace' },
    class_specifier: {
      kind: withBody('class'),
      bases: (n) =>
        named(childOfType(n, 'base_class_clause'))
          .filter((x) => /type_identifier|qualified_identifier|template_type/.test(x.type))
          .map((x) => x.text),
    },
    struct_specifier: {
      kind: withBody('struct'),
      bases: (n) =>
        named(childOfType(n, 'base_class_clause'))
          .filter((x) => /type_identifier|qualified_identifier|template_type/.test(x.type))
          .map((x) => x.text),
    },
    field_declaration: cMemberPrototype,
    alias_declaration: { kind: 'type', body: () => null },
  },
  calls: {
    call_expression: callee('function'),
    new_expression: (n) => ({ name: field(n, 'type'), isNew: true }),
  },
  imports: cImports,
};

// ---------------------------------------------------------------- Rust

const rustUse = (n: Node): SyntaxImport[] => {
  const arg = field(n, 'argument');
  if (!arg) return [];
  if (arg.type === 'scoped_use_list') {
    const base = text(field(arg, 'path')) ?? '';
    const names = named(field(arg, 'list')).map((c) =>
      c.type === 'use_as_clause'
        ? { name: text(field(c, 'path'))!, alias: text(field(c, 'alias')) }
        : { name: text(c)! },
    );
    return [imp(base, n, { names: names.map((x) => (x.alias ? x : { name: x.name })) })];
  }
  if (arg.type === 'use_as_clause')
    return [imp(text(field(arg, 'path'))!, n, { alias: text(field(arg, 'alias')) })];
  return [imp(text(arg)!, n)];
};

export const rust: LangSpec = {
  vars: V.RUST_VARS,
  grammar: 'rust',
  decls: {
    struct_item: { kind: 'struct' },
    union_item: { kind: 'struct' },
    enum_item: { kind: 'enum' },
    trait_item: { kind: 'trait' },
    type_item: { kind: 'type', body: () => null },
    mod_item: { kind: 'module' },
    impl_item: {
      kind: 'impl',
      name: (n) => text(field(n, 'type'))?.replace(/<.*$/, ''),
      bases: (n) => {
        const t = text(field(n, 'trait'));
        return t ? [t] : [];
      },
    },
    function_item: { kind: 'function', returns: fieldText('return_type') },
    function_signature_item: { kind: 'function', returns: fieldText('return_type') },
  },
  calls: { call_expression: callee('function') },
  imports: {
    use_declaration: rustUse,
    // `mod name;` (no body) loads name.rs or name/mod.rs next to this file.
    mod_item: (n) => {
      const nm = text(field(n, 'name'));
      return nm && !field(n, 'body') ? [imp(nm, n, { style: 'path' })] : [];
    },
  },
};

// ---------------------------------------------------------------- PHP

export const php: LangSpec = {
  vars: V.PHP_VARS,
  grammar: 'php',
  namespace: { namespace_definition: fieldText('name') },
  decls: {
    class_declaration: {
      kind: 'class',
      bases: (n) => [
        ...listTexts(childOfType(n, 'base_clause')),
        ...listTexts(childOfType(n, 'class_interface_clause')),
      ],
    },
    interface_declaration: {
      kind: 'interface',
      bases: (n) => listTexts(childOfType(n, 'base_clause')),
    },
    trait_declaration: { kind: 'trait' },
    enum_declaration: { kind: 'enum' },
    method_declaration: { kind: 'function', returns: fieldText('return_type') },
    function_definition: { kind: 'function', returns: fieldText('return_type') },
  },
  calls: {
    function_call_expression: callee('function'),
    member_call_expression: (n) => ({ receiver: field(n, 'object'), name: field(n, 'name') }),
    nullsafe_member_call_expression: (n) => ({
      receiver: field(n, 'object'),
      name: field(n, 'name'),
    }),
    scoped_call_expression: (n) => ({ receiver: field(n, 'scope'), name: field(n, 'name') }),
    object_creation_expression: (n) => ({
      name: named(n).find((c) => /name|qualified_name/.test(c.type)) ?? null,
      isNew: true,
    }),
  },
  imports: {
    namespace_use_declaration: (n) =>
      childrenOfType(n, 'namespace_use_clause').map((c) => {
        const alias = text(field(c, 'alias'));
        const spec = c.text.replace(/\s+as\s+\w+$/i, '').trim();
        return imp(spec, n, alias ? { alias } : {});
      }),
    require_expression: (n) => phpPath(n),
    require_once_expression: (n) => phpPath(n),
    include_expression: (n) => phpPath(n),
    include_once_expression: (n) => phpPath(n),
  },
};

function phpPath(n: Node): SyntaxImport[] {
  const s = named(n).find((c) => /string/.test(c.type));
  return s ? [imp(unquote(s.text), n, { style: 'path' })] : [];
}

// ---------------------------------------------------------------- Ruby

export const ruby: LangSpec = {
  vars: V.RUBY_VARS,
  grammar: 'ruby',
  decls: {
    class: { kind: 'class', bases: (n) => listTexts(field(n, 'superclass')) },
    module: { kind: 'module' },
    method: { kind: 'function' },
    singleton_method: { kind: 'function' },
  },
  calls: {
    call: (n) => {
      const m = text(field(n, 'method'));
      if (m && /^(require|require_relative|load)$/.test(m) && !field(n, 'receiver')) return null;
      const r = field(n, 'receiver');
      if (m === 'new' && r && /constant|scope_resolution/.test(r.type))
        return { name: r, isNew: true };
      return { receiver: r, name: field(n, 'method') };
    },
  },
  imports: {
    call: (n) => {
      const m = text(field(n, 'method'));
      if (!m || field(n, 'receiver') || !/^(require|require_relative|load)$/.test(m)) return [];
      const s = named(field(n, 'arguments')).find((c) => c.type === 'string');
      if (!s) return [];
      return [imp(unquote(s.text), n, { style: m === 'require' ? 'module' : 'path' })];
    },
  },
  selfNames: ['self'],
};

// ---------------------------------------------------------------- Scala

export const scala: LangSpec = {
  vars: V.SCALA_VARS,
  grammar: 'scala',
  namespace: { package_clause: fieldText('name') },
  decls: {
    class_definition: {
      kind: 'class',
      bases: (n) =>
        named(field(n, 'extend'))
          .map((c) => text(c))
          .filter((s): s is string => !!s && s !== 'with'),
    },
    object_definition: { kind: 'object' },
    trait_definition: { kind: 'trait' },
    enum_definition: { kind: 'enum' },
    function_definition: { kind: 'function', returns: fieldText('return_type') },
    function_declaration: { kind: 'function', returns: fieldText('return_type') },
  },
  calls: {
    call_expression: callee('function'),
    instance_expression: (n) => ({
      name: named(n).find((c) => /type_identifier|generic_type|stable_type/.test(c.type)) ?? null,
      isNew: true,
    }),
  },
  imports: {
    import_declaration: (n) => {
      const spec = n.text.replace(/^import\s+/, '').replace(/\s+/g, '');
      return [imp(spec, n)];
    },
  },
};

export { firstIdentifier, genericParam };
