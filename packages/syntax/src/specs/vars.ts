/**
 * Variable and field declarations per grammar: the name, the declared type when written, and
 * the value node (from which a constructed class can be read). Used to resolve `x.f()` by the
 * type of x. Grammars not listed here contribute no variables, and their calls on variables
 * fall back to the name rules (labelled as such).
 */
import type { Node } from 'web-tree-sitter';
import {
  childOfType,
  childrenOfType,
  childrenWithField,
  declaratorName,
  field,
  named,
  text,
  type VarParts,
} from '../spec';

type VarRules = Record<string, (n: Node) => VarParts[]>;

/** The named child after the `=` token: Kotlin and C# put the value there without a field. */
function afterEquals(n: Node): Node | null {
  let seen = false;
  for (const c of n.children) {
    if (!c) continue;
    if (seen && c.isNamed) return c;
    if (!c.isNamed && c.type === '=') seen = true;
  }
  return null;
}
const noVar = (t: string | undefined) =>
  t && !/^(var|val|let|auto|dynamic)$/.test(t) ? t : undefined;

const javaDecl = (n: Node): VarParts[] =>
  childrenWithField(n, 'declarator').map((d) => ({
    name: text(field(d, 'name')) ?? '',
    type: noVar(text(field(n, 'type'))),
    value: field(d, 'value'),
  }));

export const JAVA_VARS: VarRules = {
  local_variable_declaration: javaDecl,
  field_declaration: javaDecl,
};

export const CSHARP_VARS: VarRules = {
  variable_declaration: (n) => {
    const t = field(n, 'type');
    const type = t && t.type !== 'implicit_type' ? text(t) : undefined;
    return childrenOfType(n, 'variable_declarator').map((d) => ({
      name: text(field(d, 'name')) ?? '',
      type,
      value:
        afterEquals(d) ??
        named(d)
          .filter((x) => x.id !== field(d, 'name')?.id)
          .pop() ??
        null,
    }));
  },
  property_declaration: (n) => [
    { name: text(field(n, 'name')) ?? '', type: text(field(n, 'type')) },
  ],
};

const kotlinVar = (n: Node): VarParts[] => {
  const v = childOfType(n, 'variable_declaration');
  if (!v) return [];
  return [
    {
      name: text(childOfType(v, 'identifier', 'simple_identifier')) ?? '',
      type: text(childOfType(v, 'user_type', 'nullable_type')),
      value: afterEquals(n),
    },
  ];
};
export const KOTLIN_VARS: VarRules = {
  property_declaration: kotlinVar,
  // `class A(private val store: Store)`: a field.
  class_parameter: (n) =>
    n.children.some(
      (c) => c && (c.type === 'val' || c.type === 'var' || c.text === 'val' || c.text === 'var'),
    )
      ? [
          {
            name: text(childOfType(n, 'identifier', 'simple_identifier')) ?? '',
            type: text(childOfType(n, 'user_type', 'nullable_type')),
          },
        ]
      : [],
};

const scalaVal = (n: Node): VarParts[] => [
  { name: text(field(n, 'pattern')) ?? '', type: text(field(n, 'type')), value: field(n, 'value') },
];
export const SCALA_VARS: VarRules = {
  val_definition: scalaVal,
  var_definition: scalaVal,
  class_parameter: (n) => [{ name: text(field(n, 'name')) ?? '', type: text(field(n, 'type')) }],
};

export const GO_VARS: VarRules = {
  var_spec: (n) => {
    const names = childrenWithField(n, 'name');
    const values = named(field(n, 'value'));
    return names.map((nm, i) => ({
      name: nm.text,
      type: text(field(n, 'type')),
      value: values[i],
    }));
  },
  short_var_declaration: (n) => {
    const left = named(field(n, 'left'));
    const right = named(field(n, 'right'));
    return left.map((l, i) => ({ name: l.text, value: right[i] }));
  },
};

export const RUST_VARS: VarRules = {
  let_declaration: (n) => [
    {
      name: (text(field(n, 'pattern')) ?? '').replace(/^mut\s+/, ''),
      type: text(field(n, 'type')),
      value: field(n, 'value'),
    },
  ],
  field_declaration: (n) => [{ name: text(field(n, 'name')) ?? '', type: text(field(n, 'type')) }],
};

const cDecl = (n: Node): VarParts[] =>
  childrenWithField(n, 'declarator')
    // `int add(int);` inside a class is a method prototype, not a field.
    .filter((d) => d.type !== 'function_declarator')
    .map((d) =>
      d.type === 'init_declarator'
        ? {
            name: text(declaratorName(field(d, 'declarator'))) ?? '',
            type: noVar(text(field(n, 'type'))),
            value: field(d, 'value'),
          }
        : { name: text(declaratorName(d)) ?? '', type: noVar(text(field(n, 'type'))) },
    );
export const C_VARS: VarRules = { declaration: cDecl, field_declaration: cDecl };

const leftName = (l: Node | null) =>
  l &&
  /^(identifier|attribute|instance_variable|variable_name|member_access_expression)$/.test(l.type)
    ? l.text.replace(/\s+/g, '')
    : '';
export const PYTHON_VARS: VarRules = {
  assignment: (n) => [
    { name: leftName(field(n, 'left')), type: text(field(n, 'type')), value: field(n, 'right') },
  ],
};
export const RUBY_VARS: VarRules = {
  assignment: (n) => [{ name: leftName(field(n, 'left')), value: field(n, 'right') }],
};
export const PHP_VARS: VarRules = {
  assignment_expression: (n) => [{ name: leftName(field(n, 'left')), value: field(n, 'right') }],
  property_declaration: (n) =>
    childrenOfType(n, 'property_element').map((e) => ({
      name: `$this->${(text(field(e, 'name')) ?? '').replace(/^\$/, '')}`,
      type: text(field(n, 'type')),
    })),
  // public function __construct(private Repo $r): a field.
  property_promotion_parameter: (n) => [
    {
      name: `$this->${(text(field(n, 'name')) ?? '').replace(/^\$/, '')}`,
      type: text(field(n, 'type')),
    },
  ],
};
export const SOLIDITY_VARS: VarRules = {
  state_variable_declaration: (n) => [
    { name: text(field(n, 'name')) ?? '', type: text(field(n, 'type')), value: field(n, 'value') },
  ],
  variable_declaration_statement: (n) => {
    const d = childOfType(n, 'variable_declaration');
    return d
      ? [
          {
            name: text(field(d, 'name')) ?? '',
            type: text(field(d, 'type')),
            value: field(n, 'value'),
          },
        ]
      : [];
  },
};
