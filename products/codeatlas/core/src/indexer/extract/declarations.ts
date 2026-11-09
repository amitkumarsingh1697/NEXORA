/**
 * Pattern-based declaration and import extraction for languages without a compiler adapter.
 *
 * This is not a parser. Each language has line patterns for the declarations it writes in a
 * regular way (classes, modules, structs, functions, methods) and for its imports. Nesting is
 * tracked by braces, indentation or explicit end keywords. Results are labelled: every file
 * analysed here has status "partial", every symbol carries `extraction: 'pattern'`, and import
 * links resolved here are "inferred". Calls are not extracted.
 */

export type DeclKind =
  | 'class'
  | 'interface'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'module'
  | 'namespace'
  | 'function'
  | 'method'
  | 'procedure'
  | 'paragraph'
  | 'resource'
  | 'type';

export interface Declaration {
  name: string;
  kind: DeclKind;
  line: number;
  endLine?: number;
  /** The declaration as written (trimmed, at most 200 characters). */
  signature: string;
  params?: string;
  returns?: string;
  /** Index of the enclosing declaration in the same list. */
  parent?: number;
  /** For Go methods and Rust impl blocks: the receiver type named in the declaration. */
  receiver?: string;
}

export interface ImportRef {
  spec: string;
  line: number;
  /** How to resolve it to a repository file. */
  resolve: 'path' | 'dotted' | 'qualified' | 'stem' | 'gomod' | 'none';
}

export interface Extraction {
  declarations: Declaration[];
  imports: ImportRef[];
  /** Package or namespace the file declares (Java package, C# namespace, Go package…). */
  namespace?: string;
}

type Scope = 'brace' | 'indent' | 'flat' | 'end';

interface DeclRule {
  re: RegExp;
  kind: DeclKind | ((m: RegExpExecArray) => DeclKind);
  /** Only at the top level / only inside a type. */
  where?: 'top' | 'member' | 'any';
  /** Opens a scope that members attach to. */
  opens?: boolean;
  /** For 'end' scoping: the pattern that closes the scope this rule opens. */
  end?: RegExp;
  /** The declaration line must be followed by a body ('{' on this or the next line), not ';'. */
  needsBody?: boolean;
  /** A keyword-less pattern (type then name): control-flow words are rejected as names. */
  generic?: boolean;
}

interface ImportRule {
  re: RegExp;
  resolve: ImportRef['resolve'];
  /** Split the captured text on commas (Pascal uses, Python import a, b). */
  list?: boolean;
}

interface LangRules {
  scope: Scope;
  decls: DeclRule[];
  imports: ImportRule[];
  namespace?: RegExp;
  lineComment?: string[];
  blockComment?: [string, string];
  caseInsensitive?: boolean;
  /** Import block such as Go's import ( … ). */
  importBlock?: { start: RegExp; end: RegExp; line: RegExp };
  /** Declarations of rules marked `afterOnly` start after this line (COBOL PROCEDURE DIVISION). */
  preprocess?: (line: string) => string;
  /** Names that are never declarations (control-flow keywords caught by generic patterns). */
  reserved?: Set<string>;
  /** Deduplicate repeated clauses of the same function (Erlang, Prolog, Haskell). */
  dedupe?: boolean;
  /** Declarations after the first line matching this pattern only. */
  after?: RegExp;
}

const CONTROL = new Set(
  'if else elif for foreach while do switch case catch try finally return new delete throw sizeof typeof alignof decltype using lock synchronized when match with yield await defer go select assert static_assert import package super this base fixed checked unchecked unsafe goto break continue function func fn def end not and or in is as of print echo'.split(
    ' ',
  ),
);

const MODS =
  '(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|inline|value|partial|export|default|override|readonly|async|unsafe|extern|virtual|const|fileprivate|indirect|annotation|companion|inner|actual|expect|native|transient|volatile|strictfp|synchronized|global|with\\s+sharing|without\\s+sharing|external|factory|lateinit|suspend|tailrec|operator|infix|crossinline|noinline|reified|mutating|nonmutating|dynamic|required|convenience|lazy|weak|unowned|nonisolated|isolated|consteval|constexpr|explicit|friend|noexcept|implicit|new|ref|out|params|this|extension|declare|pure|view|payable|nonpayable|virtual|internal)\\s+)*';
const ANN = '(?:@[\\w.]+(?:\\([^)]*\\))?\\s+)*';

/** Java, C#, Kotlin, Scala, Groovy, Dart, Swift, Apex, Haxe, ActionScript, Vala, D, Solidity, PHP. */
function cFamily(extra: Partial<LangRules> & { types: string; method?: RegExp[] }): LangRules {
  const typeRe = new RegExp(
    `^\\s*${ANN}${MODS}(?:@)?(?<k>${extra.types})\\s+(?<n>[A-Za-z_$][\\w$]*)`,
  );
  const typed = new RegExp(
    `^\\s*${ANN}${MODS}(?:<[^>]+>\\s+)?(?<r>[\\w$.]+(?:<[^()]*>)?(?:\\[\\s*\\])*[?*&]?)\\s+(?<n>[A-Za-z_$][\\w$]*)\\s*\\((?<p>[^)]*)\\)?[^;=]*(?:\\{|$|=>)`,
  );
  const ctor = new RegExp(
    `^\\s*${ANN}${MODS}(?<n>[A-Z][\\w$]*)\\s*\\((?<p>[^)]*)\\)?\\s*(?:throws[^{]*)?(?::[^{]*)?\\{?\\s*$`,
  );
  return {
    scope: 'brace',
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    reserved: CONTROL,
    ...extra,
    imports: extra.imports ?? [],
    decls: [
      { re: typeRe, kind: (m) => typeKind(m.groups?.k ?? 'class'), opens: true },
      ...(extra.method ?? []).map((re) => ({ re, kind: 'method' as const, where: 'any' as const })),
      { re: typed, kind: 'method', where: 'member', generic: true },
      { re: ctor, kind: 'method', where: 'member', generic: true },
      ...(extra.decls ?? []),
    ],
  };
}

function typeKind(k: string): DeclKind {
  const w = k.toLowerCase().replace(/^@/, '');
  if (/^(interface|protocol|trait|mixin)$/.test(w)) return w === 'trait' ? 'trait' : 'interface';
  if (/^(struct|record|union)$/.test(w)) return 'struct';
  if (/^(enum|enum class)$/.test(w)) return 'enum';
  if (/^(namespace)$/.test(w)) return 'namespace';
  if (/^(module|package|library|unit|program)$/.test(w)) return 'module';
  return 'class';
}

const JVM_IMPORT: ImportRule = {
  re: /^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;?/,
  resolve: 'qualified',
};
const C_INCLUDE: ImportRule = { re: /^\s*#\s*(?:include|import)\s*"([^"]+)"/, resolve: 'path' };
const C_SYS_INCLUDE: ImportRule = { re: /^\s*#\s*(?:include|import)\s*<([^>]+)>/, resolve: 'none' };

const C_FUNC = new RegExp(
  '^(?:(?:static|inline|extern|const|unsigned|signed|struct|enum|virtual|constexpr|explicit|friend|__inline|__attribute__\\s*\\(\\([^)]*\\)\\)|template\\s*<[^>]*>|[A-Z_]{3,})\\s+)*(?<r>[A-Za-z_][\\w:<>,\\s*&]*?[\\s*&]+)(?<n>~?[A-Za-z_][\\w:~]*)\\s*\\((?<p>[^;{}]*?)\\)?\\s*(?:const\\s*)?(?:noexcept\\s*)?(?:override\\s*)?\\{?\\s*$',
);
const C_FUNC_KR = /^(?<n>[A-Za-z_]\w*)\s*\((?<p>[^;{}]*)\)?\s*\{?\s*$/;
const C_TYPE =
  /^\s*(?:typedef\s+)?(?:template\s*<[^>]*>\s*)?(?<k>class|struct|union|enum(?:\s+class)?|namespace)\s+(?:[A-Z_]{3,}\s+)?(?<n>[A-Za-z_]\w*)\s*(?:final\s*)?(?::[^{;]*)?\{?\s*$/;

const RULES: Record<string, LangRules> = {};
const def = (names: string[], r: LangRules) => {
  for (const n of names) RULES[n] = r;
};

def(
  ['Java', 'Apex'],
  cFamily({
    types: 'class|interface|@interface|enum|record',
    imports: [JVM_IMPORT],
    namespace: /^\s*package\s+([\w.]+)\s*;/,
  }),
);
def(
  ['C#'],
  cFamily({
    types: 'class|interface|enum|struct|record(?:\\s+struct|\\s+class)?|namespace',
    imports: [
      {
        re: /^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/,
        resolve: 'qualified',
      },
    ],
    namespace: /^\s*namespace\s+([\w.]+)/,
  }),
);
def(
  ['Kotlin', 'Gradle Kotlin DSL'],
  cFamily({
    types:
      'class|interface|object|enum\\s+class|annotation\\s+class|data\\s+class|sealed\\s+class|sealed\\s+interface|value\\s+class|fun\\s+interface',
    method: [
      /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal|override|open|abstract|final|suspend|inline|operator|infix|tailrec|external|actual|expect)\s+)*fun\s+(?:<[^>]+>\s*)?(?:[\w.<>?]+\.)?(?<n>[\w`]+)\s*\((?<p>[^)]*)\)?\s*(?::\s*(?<r>[^={]+))?/,
    ],
    imports: [JVM_IMPORT],
    namespace: /^\s*package\s+([\w.]+)/,
  }),
);
def(
  ['Scala'],
  cFamily({
    types:
      'class|trait|object|case\\s+class|case\\s+object|enum|abstract\\s+class|sealed\\s+trait|sealed\\s+abstract\\s+class|implicit\\s+class|given',
    method: [
      /^\s*(?:(?:override|private|protected|final|implicit|inline|transparent)\s+)*def\s+(?<n>[\w$]+|`[^`]+`)\s*(?:\[[^\]]*\])?\s*(?:\((?<p>[^)]*)\)?)?\s*(?::\s*(?<r>[^=]+))?/,
    ],
    imports: [{ re: /^\s*import\s+([\w.]+)/, resolve: 'qualified' }],
    namespace: /^\s*package\s+([\w.]+)/,
  }),
);
def(
  ['Groovy', 'Gradle'],
  cFamily({
    types: 'class|interface|trait|enum|@interface|record',
    method: [
      /^\s*(?:(?:public|private|protected|static|final|synchronized)\s+)*def\s+(?<n>\w+)\s*\((?<p>[^)]*)\)?/,
    ],
    imports: [JVM_IMPORT, { re: /^\s*apply\s+from:\s*['"]([^'"]+)['"]/, resolve: 'path' }],
    namespace: /^\s*package\s+([\w.]+)/,
  }),
);
def(
  ['Dart'],
  cFamily({
    types:
      'class|abstract\\s+class|mixin|enum|extension|extension\\s+type|sealed\\s+class|base\\s+class|interface\\s+class|final\\s+class',
    imports: [{ re: /^\s*(?:import|export|part)\s+'([^']+)'/, resolve: 'path' }],
  }),
);
def(
  ['Swift'],
  cFamily({
    types: 'class|struct|protocol|enum|extension|actor',
    method: [
      /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|private|internal|fileprivate|open|static|class|final|override|mutating|nonmutating|convenience|required|@objc|async|nonisolated)\s+)*(?:func\s+(?<n>[\w`]+|[^\s(]+)\s*(?:<[^>]+>)?\s*\((?<p>[^)]*)\)?\s*(?:(?:async|throws|rethrows)\s*)*(?:->\s*(?<r>[^{]+))?|(?<n2>init|deinit)[?!]?\s*(?:\((?<p2>[^)]*)\))?)/,
    ],
    imports: [
      {
        re: /^\s*(?:@\w+\s+)?import\s+(?:class\s+|struct\s+|func\s+|enum\s+|protocol\s+)?([\w.]+)/,
        resolve: 'none',
      },
    ],
  }),
);
def(
  ['Haxe', 'ActionScript'],
  cFamily({
    types: 'class|interface|enum|typedef|abstract',
    method: [
      /^\s*(?:(?:public|private|protected|static|override|inline|final|dynamic|extern|internal)\s+)*function\s+(?<n>\w+)\s*(?:<[^>]*>)?\s*\((?<p>[^)]*)\)?\s*(?::\s*(?<r>[\w.<>]+))?/,
    ],
    imports: [JVM_IMPORT],
    namespace: /^\s*package\s+([\w.]+)/,
  }),
);
def(
  ['Vala'],
  cFamily({
    types: 'class|interface|struct|enum|namespace',
    imports: [{ re: /^\s*using\s+([\w.]+)\s*;/, resolve: 'none' }],
  }),
);
def(
  ['D'],
  cFamily({
    types: 'class|interface|struct|enum|union|template|mixin\\s+template',
    imports: [{ re: /^\s*(?:public\s+|static\s+)?import\s+([\w.]+)/, resolve: 'qualified' }],
    namespace: /^\s*module\s+([\w.]+)\s*;/,
  }),
);
def(
  ['Solidity'],
  cFamily({
    types: 'contract|abstract\\s+contract|interface|library|struct|enum',
    method: [
      /^\s*(?:function\s+(?<n>\w+)|(?<n2>constructor|modifier\s+\w+|fallback|receive))\s*\((?<p>[^)]*)\)?/,
    ],
    imports: [{ re: /^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/, resolve: 'path' }],
  }),
);
def(['PHP', 'Hack'], {
  scope: 'brace',
  lineComment: ['//', '#'],
  blockComment: ['/*', '*/'],
  decls: [
    {
      re: /^\s*(?:(?:abstract|final|readonly)\s+)*(?<k>class|interface|trait|enum)\s+(?<n>\w+)/,
      kind: (m) => typeKind(m.groups?.k ?? 'class'),
      opens: true,
    },
    {
      re: /^\s*(?:#\[[^\]]*\]\s*)*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(?<n>\w+)\s*\((?<p>[^)]*)\)?\s*(?::\s*(?<r>[?\w\\|]+))?/,
      kind: 'method',
      where: 'any',
    },
  ],
  imports: [
    { re: /^\s*use\s+(?:function\s+|const\s+)?([\w\\]+)/, resolve: 'qualified' },
    {
      re: /^\s*(?:require|require_once|include|include_once)\s*\(?\s*(?:__DIR__\s*\.\s*)?['"]([^'"]+\.php)['"]/,
      resolve: 'path',
    },
  ],
  namespace: /^\s*namespace\s+([\w\\]+)/,
});
def(['C', 'C++', 'Cuda', 'Objective-C', 'Objective-C++'], {
  scope: 'brace',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  reserved: CONTROL,
  decls: [
    {
      re: /^\s*@(?<k>interface|implementation|protocol)\s+(?<n>\w+)/,
      kind: (m) => (m.groups?.k === 'protocol' ? 'interface' : 'class'),
      opens: true,
      end: /^\s*@end\b/,
    },
    { re: /^\s*[-+]\s*\((?<r>[^)]*)\)\s*(?<n>\w+)(?<p>[^{;]*)/, kind: 'method', where: 'any' },
    {
      re: C_TYPE,
      kind: (m) => typeKind(m.groups?.k?.split(/\s+/)[0] ?? 'struct'),
      opens: true,
      needsBody: true,
    },
    { re: C_FUNC, kind: 'function', where: 'top', needsBody: true, generic: true },
    { re: C_FUNC_KR, kind: 'function', where: 'top', needsBody: true, generic: true },
    {
      re: new RegExp(
        `^\\s*(?:(?:virtual|static|inline|explicit|constexpr|friend)\\s+)*(?<r>[\\w:<>,*&\\s]+?[\\s*&]+)(?<n>~?[A-Za-z_]\\w*)\\s*\\((?<p>[^;{}]*)\\)?\\s*(?:const\\s*)?(?:override\\s*|final\\s*|noexcept\\s*)*(?:=\\s*(?:0|default|delete)\\s*)?[;{]?\\s*$`,
      ),
      kind: 'method',
      where: 'member',
    },
  ],
  imports: [C_INCLUDE, C_SYS_INCLUDE],
});
def(['Go'], {
  scope: 'brace',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  decls: [
    {
      re: /^type\s+(?<n>\w+)(?:\[[^\]]*\])?\s+(?<k>struct|interface)\b/,
      kind: (m) => (m.groups?.k === 'interface' ? 'interface' : 'struct'),
    },
    {
      re: /^func\s*\((?<recv>[^)]*)\)\s*(?<n>\w+)\s*(?:\[[^\]]*\])?\((?<p>[^)]*)\)?\s*(?<r>[^{]*)/,
      kind: 'method',
      where: 'top',
    },
    {
      re: /^func\s+(?<n>\w+)\s*(?:\[[^\]]*\])?\((?<p>[^)]*)\)?\s*(?<r>[^{]*)/,
      kind: 'function',
      where: 'top',
    },
  ],
  imports: [{ re: /^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/, resolve: 'gomod' }],
  importBlock: {
    start: /^\s*import\s*\(\s*$/,
    end: /^\s*\)\s*$/,
    line: /^\s*(?:[\w.]+\s+)?"([^"]+)"/,
  },
  namespace: /^package\s+(\w+)/,
});
def(['Rust'], {
  scope: 'brace',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  decls: [
    {
      re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?<k>struct|enum|trait|union)\s+(?<n>\w+)/,
      kind: (m) => typeKind(m.groups?.k ?? 'struct'),
      opens: true,
    },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(?<n>\w+)\s*\{/, kind: 'module', opens: true },
    {
      re: /^\s*(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(?:(?<trait>[\w:]+)(?:<[^>]*>)?\s+for\s+)?(?<n>[\w:]+)/,
      kind: 'type',
      opens: true,
    },
    {
      re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:(?:default|async|const|unsafe|extern\s+"\w+")\s+)*fn\s+(?<n>\w+)\s*(?:<[^>]*>)?\s*\((?<p>[^)]*)\)?\s*(?:->\s*(?<r>[^{;]+))?/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/, resolve: 'none' },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/, resolve: 'path' },
  ],
});
def(['Python', 'Cython', 'Starlark', 'Mojo'], {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    { re: /^\s*class\s+(?<n>\w+)\s*(?:\((?<p>[^)]*)\))?\s*:/, kind: 'class', opens: true },
    {
      re: /^\s*(?:async\s+)?(?:def|cdef|cpdef|fn)\s+(?:[\w\s*]+\s+)?(?<n>\w+)\s*\((?<p>[^)]*)\)?\s*(?:->\s*(?<r>[^:]+))?:?/,
      kind: 'function',
      where: 'any',
      opens: true,
    },
  ],
  imports: [
    { re: /^\s*from\s+(\.*[\w.]*)\s+import\b/, resolve: 'dotted' },
    {
      re: /^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/,
      resolve: 'dotted',
      list: true,
    },
    { re: /^\s*load\(\s*"([^"]+)"/, resolve: 'path' },
  ],
});
def(['GDScript'], {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    { re: /^\s*class(?:_name)?\s+(?<n>\w+)/, kind: 'class', opens: true },
    {
      re: /^\s*(?:static\s+)?func\s+(?<n>\w+)\s*\((?<p>[^)]*)\)?\s*(?:->\s*(?<r>[^:]+))?/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [
    {
      re: /(?:preload|load)\("res:\/\/([^"]+)"\)|^\s*extends\s+"res:\/\/([^"]+)"/,
      resolve: 'path',
    },
  ],
});
def(['Nim'], {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    {
      re: /^\s*(?<n>\w+)\*?\s*(?:\[[^\]]*\])?\s*=\s*(?:ref\s+|ptr\s+)?(?<k>object|enum|tuple|concept)/,
      kind: (m) => (m.groups?.k === 'enum' ? 'enum' : 'class'),
    },
    {
      re: /^\s*(?:proc|func|method|iterator|template|macro|converter)\s+`?(?<n>\w+)`?\*?\s*(?:\[[^\]]*\])?\s*\((?<p>[^)]*)\)?\s*(?::\s*(?<r>[^={]+))?/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [{ re: /^\s*(?:import|include)\s+([\w/.,\s"]+)/, resolve: 'path', list: true }],
});
const RUBY: LangRules = {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    {
      re: /^\s*(?<k>class|module|struct)\s+(?<n>[A-Z][\w:]*)/,
      kind: (m) =>
        m.groups?.k === 'module' ? 'module' : m.groups?.k === 'struct' ? 'struct' : 'class',
      opens: true,
    },
    {
      re: /^\s*(?:private\s+|protected\s+|public\s+)?def\s+(?:self\.)?(?<n>[\w?!=[\]<>+\-*/%~]+)\s*(?:\((?<p>[^)]*)\))?(?:\s*:\s*(?<r>\S+))?/,
      kind: 'method',
      where: 'any',
    },
  ],
  imports: [
    { re: /^\s*require_relative\s*\(?\s*['"]([^'"]+)['"]/, resolve: 'path' },
    { re: /^\s*require\s*\(?\s*['"]([^'"]+)['"]/, resolve: 'dotted' },
  ],
};
def(['Ruby', 'Crystal'], RUBY);
def(['Perl'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [
    { re: /^\s*package\s+(?<n>[\w:]+)/, kind: 'module' },
    { re: /^\s*sub\s+(?<n>\w+)/, kind: 'function' },
  ],
  imports: [
    {
      re: /^\s*(?:use|require)\s+(?!strict\b|warnings\b|utf8\b|vars\b|constant\b|parent\b|base\b|lib\b|v?\d)([\w:]+)/,
      resolve: 'qualified',
    },
  ],
});
def(['Raku'], {
  scope: 'brace',
  lineComment: ['#'],
  decls: [
    {
      re: /^\s*(?:unit\s+)?(?:my\s+|our\s+)?(?<k>class|role|grammar|module|package)\s+(?<n>[\w:]+)/,
      kind: (m) =>
        m.groups?.k === 'role'
          ? 'interface'
          : m.groups?.k === 'module' || m.groups?.k === 'package'
            ? 'module'
            : 'class',
      opens: true,
    },
    {
      re: /^\s*(?:multi\s+|proto\s+|our\s+|my\s+)?(?:sub|method|submethod|token|rule|regex)\s+(?<n>[\w-]+)\s*(?:\((?<p>[^)]*)\))?/,
      kind: 'method',
      where: 'any',
    },
  ],
  imports: [{ re: /^\s*(?:use|need|require)\s+([\w:]+)/, resolve: 'qualified' }],
});
def(['Lua', 'Luau'], {
  scope: 'flat',
  lineComment: ['--'],
  decls: [
    { re: /^\s*(?:local\s+)?function\s+(?<n>[\w.:]+)\s*\((?<p>[^)]*)\)?/, kind: 'function' },
    { re: /^\s*(?:local\s+)?(?<n>[\w.]+)\s*=\s*function\s*\((?<p>[^)]*)\)?/, kind: 'function' },
  ],
  imports: [{ re: /\brequire\s*\(?\s*['"]([^'"]+)['"]/, resolve: 'dotted' }],
});
def(['Elixir'], {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    {
      re: /^\s*(?<k>defmodule|defprotocol)\s+(?<n>[\w.]+)/,
      kind: (m) => (m.groups?.k === 'defprotocol' ? 'interface' : 'module'),
      opens: true,
    },
    {
      re: /^\s*(?:def|defp|defmacro|defmacrop|defguard|defdelegate)\s+(?<n>[\w?!]+)\s*(?:\((?<p>[^)]*)\))?/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [{ re: /^\s*(?:alias|import|use|require)\s+([A-Z][\w.]*)/, resolve: 'qualified' }],
  dedupe: true,
});
def(['Erlang'], {
  scope: 'flat',
  lineComment: ['%'],
  decls: [
    { re: /^-module\((?<n>\w+)\)/, kind: 'module' },
    { re: /^(?<n>[a-z]\w*)\((?<p>[^)]*)\)?\s*(?:when\s.*)?->/, kind: 'function' },
  ],
  imports: [
    { re: /^-include(?:_lib)?\("([^"]+)"\)/, resolve: 'path' },
    { re: /^-(?:import|behaviou?r)\((\w+)/, resolve: 'qualified' },
  ],
  dedupe: true,
});
const HASKELL: LangRules = {
  scope: 'flat',
  lineComment: ['--'],
  blockComment: ['{-', '-}'],
  decls: [
    { re: /^module\s+(?<n>[\w.]+)/, kind: 'module' },
    { re: /^(?:data|newtype)\s+(?:\([^)]*\)\s*=>\s*)?(?<n>[A-Z]\w*)/, kind: 'class' },
    { re: /^(?:type\s+)?class\s+(?:\([^)]*\)\s*=>\s*)?(?<n>[A-Z]\w*)/, kind: 'interface' },
    { re: /^(?<n>[a-z_][\w']*)\s*::\s*(?<r>.+)/, kind: 'function' },
  ],
  imports: [{ re: /^import\s+(?:qualified\s+)?([\w.]+)/, resolve: 'qualified' }],
  dedupe: true,
};
def(['Haskell', 'Elm', 'PureScript'], HASKELL);
def(['Clojure'], {
  scope: 'flat',
  lineComment: [';'],
  decls: [
    { re: /^\s*\(ns\s+(?<n>[\w.*+!?-]+)/, kind: 'module' },
    { re: /^\s*\((?:defn-?|defmacro|defmulti)\s+(?<n>[\w*+!?<>=/-]+)/, kind: 'function' },
    { re: /^\s*\(defprotocol\s+(?<n>[\w*+!?-]+)/, kind: 'interface' },
    { re: /^\s*\((?:defrecord|deftype)\s+(?<n>[\w*+!?-]+)/, kind: 'class' },
  ],
  imports: [
    { re: /^\s*(?:\(:require\s+)?\[([a-z][\w.-]+)(?:\s+:as|\s+:refer|\])/, resolve: 'qualified' },
  ],
});
def(['Common Lisp', 'Emacs Lisp', 'Scheme', 'Racket'], {
  scope: 'flat',
  lineComment: [';'],
  decls: [
    {
      re: /^\s*\((?:defun|defmacro|cl-defun|defgeneric|defmethod|define-syntax)\s+\(?(?<n>[^\s()]+)/,
      kind: 'function',
    },
    { re: /^\s*\(define\s+\((?<n>[^\s()]+)/, kind: 'function' },
    {
      re: /^\s*\((?:defclass|defstruct|cl-defstruct|define-record-type|struct)\s+\(?(?<n>[^\s()]+)/,
      kind: 'class',
    },
    { re: /^\s*\((?:defpackage|define-module|module)\s+(?<n>[^\s()]+)/, kind: 'module' },
  ],
  imports: [
    { re: /^\s*\((?:require|load|use-modules|provide)\s+['"(]?([^\s()'"]+)/, resolve: 'none' },
  ],
});
def(['R'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [
    { re: /^\s*(?<n>[\w.]+)\s*(?:<-|=)\s*function\s*\((?<p>[^)]*)\)?/, kind: 'function' },
    { re: /^\s*(?<n>\w+)\s*(?:<-|=)\s*(?:R6::)?R6Class\s*\(/, kind: 'class' },
    { re: /^\s*setClass\s*\(\s*['"](?<n>\w+)['"]/, kind: 'class' },
  ],
  imports: [
    { re: /\b(?:library|require|requireNamespace)\(\s*['"]?([\w.]+)/, resolve: 'none' },
    { re: /\bsource\(\s*['"]([^'"]+)['"]/, resolve: 'path' },
  ],
});
def(['Julia'], {
  scope: 'indent',
  lineComment: ['#'],
  decls: [
    { re: /^\s*(?:mutable\s+)?struct\s+(?<n>\w+)/, kind: 'struct', opens: true },
    { re: /^\s*abstract\s+type\s+(?<n>\w+)/, kind: 'interface' },
    { re: /^\s*(?:bare)?module\s+(?<n>\w+)/, kind: 'module' },
    {
      re: /^\s*function\s+(?<n>[\w.!]+)\s*(?:\{[^}]*\})?\((?<p>[^)]*)\)?/,
      kind: 'function',
      where: 'any',
    },
    { re: /^(?<n>[a-z_][\w!]*)\((?<p>[^)]*)\)\s*=\s*[^=]/, kind: 'function', where: 'top' },
  ],
  imports: [
    { re: /^\s*(?:using|import)\s+([\w.]+)/, resolve: 'none' },
    { re: /^\s*include\("([^"]+)"\)/, resolve: 'path' },
  ],
});
def(['Fortran', 'Fortran Free Form'], {
  scope: 'end',
  lineComment: ['!'],
  caseInsensitive: true,
  preprocess: (l) =>
    /^[cC*]/.test(l) &&
    !/^\s/.test(l) &&
    !/^(call|common|character|complex|contains|close|continue)\b/i.test(l)
      ? ''
      : l,
  decls: [
    {
      re: /^\s*(?<k>program|module|submodule)\s+(?!procedure\b)(?:\([^)]*\)\s*)?(?<n>\w+)\s*$/i,
      kind: 'module',
      opens: true,
      end: /^\s*end\s*(program|module|submodule)\b/i,
    },
    {
      re: /^\s*type\s*(?:,[^:]*)?::\s*(?<n>\w+)|^\s*type\s+(?!is\b)(?<n2>\w+)\s*$/i,
      kind: 'class',
      opens: true,
      end: /^\s*end\s*type\b/i,
    },
    {
      re: /^\s*(?:(?:pure|elemental|recursive|impure|module|non_recursive)\s+)*(?:(?:integer|real|logical|character|complex|double\s+precision|type\s*\([^)]*\)|class\s*\([^)]*\))(?:\s*\([^)]*\)|\*\d+)?\s+)?(?<k>function|subroutine)\s+(?<n>\w+)\s*(?:\((?<p>[^)]*)\)?)?/i,
      kind: 'procedure',
      where: 'any',
    },
  ],
  imports: [
    { re: /^\s*use\s*(?:,\s*\w+\s*::\s*)?(\w+)/i, resolve: 'qualified' },
    { re: /^\s*include\s+['"]([^'"]+)['"]/i, resolve: 'path' },
  ],
});
def(['COBOL'], {
  scope: 'flat',
  caseInsensitive: true,
  preprocess: (l) => {
    // Fixed format: columns 1-6 sequence area, column 7 indicator, code in 8-72.
    if (/^[\d ]{6}[*/]/.test(l)) return '';
    if (/^[\d A-Z]{6}[ -D]/i.test(l) && l.length > 7 && /^[\d ]{6}/.test(l)) return l.slice(7, 72);
    if (/^\s*\*>/.test(l)) return '';
    return l;
  },
  decls: [
    { re: /^\s*PROGRAM-ID\.?\s+(?<n>[\w-]+)/i, kind: 'module' },
    { re: /^\s*(?<n>[A-Z0-9][\w-]*)\s+SECTION\s*\.\s*$/i, kind: 'procedure' },
    { re: /^\s{0,4}(?<n>[A-Z0-9][\w-]*[A-Z][\w-]*)\s*\.\s*$/i, kind: 'paragraph' },
  ],
  after: /PROCEDURE\s+DIVISION/i,
  imports: [
    { re: /^\s*COPY\s+['"]?([\w-]+)/i, resolve: 'stem' },
    { re: /\bCALL\s+['"]([\w-]+)['"]/i, resolve: 'stem' },
  ],
});
def(['JCL'], {
  scope: 'flat',
  decls: [
    { re: /^\/\/(?<n>[A-Z@#$][\w@#$]{0,7})\s+JOB\b/, kind: 'module' },
    { re: /^\/\/(?<n>[A-Z@#$][\w@#$]{0,7})\s+EXEC\s+(?:PGM=)?(?<p>[\w.@#$]+)/, kind: 'procedure' },
  ],
  imports: [{ re: /\bPGM=([A-Z@#$][\w@#$]*)/, resolve: 'stem' }],
});
def(['Assembly', 'Unix Assembly', 'Motorola 68K Assembly'], {
  scope: 'flat',
  lineComment: [';', '#', '//'],
  decls: [
    { re: /^(?<n>[A-Za-z_$][\w$]*):/, kind: 'function' },
    { re: /^(?<n>[A-Za-z_]\w*)\s+(?:PROC|proc)\b/, kind: 'procedure' },
  ],
  imports: [
    { re: /^\s*(?:%include|\.include|INCLUDE|include)\s+['"<]?([^'">\s]+)/, resolve: 'path' },
  ],
});
def(['PowerShell'], {
  scope: 'brace',
  lineComment: ['#'],
  blockComment: ['<#', '#>'],
  caseInsensitive: true,
  decls: [
    {
      re: /^\s*(?<k>class|enum)\s+(?<n>\w+)/i,
      kind: (m) => (m.groups?.k?.toLowerCase() === 'enum' ? 'enum' : 'class'),
      opens: true,
    },
    {
      re: /^\s*(?:function|filter|workflow)\s+(?:global:|script:|private:)?(?<n>[\w-]+)\s*(?:\((?<p>[^)]*)\))?/i,
      kind: 'function',
      where: 'any',
    },
    {
      re: /^\s*(?:static\s+|hidden\s+)*\[(?<r>[\w.[\]]+)\]\s*(?<n>\w+)\s*\((?<p>[^)]*)\)\s*(?:\{.*)?$/i,
      kind: 'method',
      where: 'member',
    },
  ],
  imports: [
    { re: /\bImport-Module\s+(?:-Name\s+)?['"]?([\w./\\$-]+)/i, resolve: 'path' },
    { re: /^\s*\.\s+['"]?(?:\$PSScriptRoot[\\/])?([^'"\s]+\.ps[dm]?1)/i, resolve: 'path' },
    { re: /^\s*using\s+module\s+['"]?([^'"\s]+)/i, resolve: 'path' },
  ],
});
def(['Shell', 'fish'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [
    { re: /^\s*function\s+(?<n>[\w.:@-]+)/, kind: 'function' },
    { re: /^\s*(?<n>[A-Za-z_][\w.:-]*)\s*\(\)\s*\{?/, kind: 'function' },
  ],
  imports: [{ re: /^\s*(?:source|\.)\s+['"]?(?:\$\{?\w+\}?\/)?([^'"\s;$]+)/, resolve: 'path' }],
});
def(['Batchfile'], {
  scope: 'flat',
  lineComment: ['::', 'REM ', 'rem '],
  decls: [{ re: /^:(?<n>[A-Za-z_]\w*)\s*$/, kind: 'procedure' }],
  imports: [{ re: /\bcall\s+"?(?:%~dp0)?([\w\\./:-]+\.(?:bat|cmd))/i, resolve: 'path' }],
});
def(['Tcl'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [
    { re: /^\s*proc\s+(?<n>[\w:]+)\s*\{(?<p>[^}]*)\}?/, kind: 'procedure' },
    { re: /^\s*(?:oo::|itcl::)?class\s+create\s+(?<n>[\w:]+)/, kind: 'class' },
    { re: /^\s*namespace\s+eval\s+(?<n>[\w:]+)/, kind: 'namespace' },
  ],
  imports: [
    { re: /^\s*source\s+(?:\[file\s+join[^\]]*\]\s*)?["']?([\w./-]+\.tcl)/, resolve: 'path' },
    { re: /^\s*package\s+require\s+([\w:]+)/, resolve: 'none' },
  ],
});
def(['Vim script'], {
  scope: 'flat',
  lineComment: ['"'],
  decls: [
    { re: /^\s*fu(?:nction)?!?\s+(?<n>[\w:#.<>]+)\s*\((?<p>[^)]*)\)/, kind: 'function' },
    { re: /^\s*(?:export\s+)?def\s+(?<n>\w+)\s*\((?<p>[^)]*)\)/, kind: 'function' },
  ],
  imports: [
    {
      re: /^\s*(?:runtime!?|source|so|import)\s+(?:autoload\s+)?['"]?([\w./~$<>-]+)/,
      resolve: 'path',
    },
  ],
});
def(['Pascal'], {
  scope: 'flat',
  lineComment: ['//'],
  caseInsensitive: true,
  decls: [
    { re: /^\s*(?:unit|program|library)\s+(?<n>[\w.]+)/i, kind: 'module' },
    {
      re: /^\s*(?<n>T?\w+)\s*=\s*(?:packed\s+)?(?<k>class|record|interface|object)\b/i,
      kind: (m) => (m.groups?.k?.toLowerCase() === 'interface' ? 'interface' : 'class'),
    },
    {
      re: /^\s*(?:class\s+)?(?<k>procedure|function|constructor|destructor)\s+(?<n>[\w.]+)\s*(?:\((?<p>[^)]*)\)?)?\s*(?::\s*(?<r>[\w.]+))?/i,
      kind: 'procedure',
    },
  ],
  imports: [{ re: /^\s*uses\s+([^;]+);?/i, resolve: 'qualified', list: true }],
});
def(['Ada'], {
  scope: 'flat',
  lineComment: ['--'],
  caseInsensitive: true,
  decls: [
    { re: /^\s*(?:generic\s+)?package\s+(?:body\s+)?(?<n>[\w.]+)\s+is\b/i, kind: 'module' },
    {
      re: /^\s*type\s+(?<n>\w+)\s+is\s+(?:abstract\s+)?(?:tagged\s+)?(?:limited\s+)?(?:record|new\b|interface)/i,
      kind: 'class',
    },
    {
      re: /^\s*(?:overriding\s+|not\s+overriding\s+)?(?<k>procedure|function)\s+(?<n>[\w."]+)\s*(?:\((?<p>[^)]*)\)?)?(?:\s*return\s+(?<r>[\w.]+))?/i,
      kind: 'procedure',
    },
  ],
  imports: [
    { re: /^\s*(?:limited\s+|private\s+)*with\s+([\w.,\s]+);/i, resolve: 'qualified', list: true },
  ],
});
def(['Visual Basic .NET', 'VBA', 'VBScript', 'Visual Basic 6.0'], {
  scope: 'end',
  lineComment: ["'", 'REM '],
  caseInsensitive: true,
  decls: [
    {
      re: /^\s*(?:(?:Public|Private|Friend|Partial|MustInherit|NotInheritable|Shadows|Protected)\s+)*(?<k>Class|Module|Interface|Structure|Enum|Namespace)\s+(?<n>\w+)/i,
      kind: (m) => typeKind(m.groups?.k === 'Structure' ? 'struct' : (m.groups?.k ?? 'class')),
      opens: true,
      end: /^\s*End\s+(Class|Module|Interface|Structure|Enum|Namespace)\b/i,
    },
    {
      re: /^\s*(?:(?:Public|Private|Friend|Protected|Shared|Overrides|Overridable|MustOverride|NotOverridable|Overloads|Static|Async|Partial|Iterator|Default|ReadOnly|WriteOnly)\s+)*(?<k>Sub|Function|Property)\s+(?:Get\s+|Let\s+|Set\s+)?(?<n>\w+)\s*(?:\((?<p>[^)]*)\)?)?(?:\s+As\s+(?<r>[\w.()]+))?/i,
      kind: 'method',
      where: 'any',
    },
  ],
  imports: [{ re: /^\s*Imports\s+([\w.]+)/i, resolve: 'qualified' }],
});
const ML: LangRules = {
  scope: 'flat',
  lineComment: ['//'],
  blockComment: ['(*', '*)'],
  decls: [
    { re: /^\s*(?:module|namespace)\s+(?:rec\s+)?(?<n>[\w.]+)/, kind: 'module' },
    {
      re: /^\s*(?:type|and)\s+(?:\[<[^>]*>\]\s*)?(?:private\s+)?(?<n>[\w']+)(?:<[^>]*>)?(?:\s*\([^)]*\))?\s*=/,
      kind: 'class',
    },
    {
      re: /^\s*(?:let|and)\s+(?:rec\s+|inline\s+|private\s+|mutable\s+)*(?<n>[a-z_][\w']*)\s+(?<p>[^=:]+?)\s*(?::\s*(?<r>[^=]+))?=/,
      kind: 'function',
    },
    {
      re: /^\s*(?:member|override|abstract\s+member|static\s+member|default)\s+(?:\w+\.)?(?<n>\w+)/,
      kind: 'method',
    },
  ],
  imports: [{ re: /^\s*open\s+(?:type\s+)?([\w.]+)/, resolve: 'qualified' }],
};
def(['F#', 'OCaml'], ML);
def(['Zig'], {
  scope: 'brace',
  lineComment: ['//'],
  decls: [
    {
      re: /^\s*(?:pub\s+)?const\s+(?<n>\w+)\s*=\s*(?:packed\s+|extern\s+)?(?<k>struct|enum|union|opaque)\b/,
      kind: (m) => (m.groups?.k === 'enum' ? 'enum' : 'struct'),
      opens: true,
    },
    {
      re: /^\s*(?:pub\s+)?(?:export\s+|extern\s+|inline\s+|noinline\s+)*fn\s+(?<n>\w+)\s*\((?<p>[^)]*)\)?\s*(?<r>[^{]*)/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [{ re: /@import\("([^"]+)"\)/, resolve: 'path' }],
});
def(['Prolog'], {
  scope: 'flat',
  lineComment: ['%'],
  decls: [
    { re: /^:-\s*module\((?<n>\w+)/, kind: 'module' },
    { re: /^(?<n>[a-z]\w*)(?:\((?<p>[^)]*)\))?\s*:-/, kind: 'function' },
  ],
  imports: [{ re: /use_module\(\s*(?:library\()?([\w/.]+)/, resolve: 'none' }],
  dedupe: true,
});
def(['ABAP'], {
  scope: 'flat',
  lineComment: ['"', '*'],
  caseInsensitive: true,
  decls: [
    { re: /^\s*(?:REPORT|PROGRAM|FUNCTION-POOL)\s+(?<n>\w+)/i, kind: 'module' },
    {
      re: /^\s*(?<k>CLASS|INTERFACE)\s+(?<n>\w+)\s+DEFINITION/i,
      kind: (m) => (m.groups?.k?.toUpperCase() === 'INTERFACE' ? 'interface' : 'class'),
    },
    { re: /^\s*METHOD\s+(?<n>[\w~]+)\s*\./i, kind: 'method' },
    { re: /^\s*(?:FORM|FUNCTION)\s+(?<n>\w+)/i, kind: 'procedure' },
  ],
  imports: [{ re: /^\s*INCLUDE\s+(\w+)/i, resolve: 'stem' }],
});
def(['Gleam'], {
  scope: 'brace',
  lineComment: ['//'],
  decls: [
    { re: /^\s*(?:pub\s+)?(?:opaque\s+)?type\s+(?<n>[A-Z]\w*)/, kind: 'type' },
    {
      re: /^\s*(?:pub\s+)?fn\s+(?<n>\w+)\s*\((?<p>[^)]*)\)?(?:\s*->\s*(?<r>[^{]+))?/,
      kind: 'function',
      where: 'any',
    },
  ],
  imports: [{ re: /^\s*import\s+([\w/]+)/, resolve: 'none' }],
});
def(['V'], {
  scope: 'brace',
  lineComment: ['//'],
  decls: [
    {
      re: /^\s*(?:pub\s+)?(?<k>struct|interface|enum)\s+(?<n>\w+)/,
      kind: (m) => typeKind(m.groups?.k ?? 'struct'),
    },
    {
      re: /^\s*(?:pub\s+)?fn\s+(?:\([^)]*\)\s*)?(?<n>\w+)\s*\((?<p>[^)]*)\)?\s*(?<r>[^{]*)/,
      kind: 'function',
    },
  ],
  imports: [{ re: /^\s*import\s+([\w.]+)/, resolve: 'none' }],
});
def(['Odin'], {
  scope: 'flat',
  lineComment: ['//'],
  decls: [
    {
      re: /^\s*(?<n>\w+)\s*::\s*(?:#\w+\s+)*proc\s*(?:"[^"]*"\s*)?\((?<p>[^)]*)\)?\s*(?:->\s*(?<r>[^{]+))?/,
      kind: 'function',
    },
    {
      re: /^\s*(?<n>\w+)\s*::\s*(?<k>struct|enum|union)\b/,
      kind: (m) => typeKind(m.groups?.k ?? 'struct'),
    },
  ],
  imports: [{ re: /^\s*import\s+(?:\w+\s+)?"([^"]+)"/, resolve: 'none' }],
});
def(['Awk'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [{ re: /^\s*func(?:tion)?\s+(?<n>\w+)\s*\((?<p>[^)]*)\)/, kind: 'function' }],
  imports: [{ re: /^\s*@include\s+"([^"]+)"/, resolve: 'path' }],
});
def(['RPGLE'], {
  scope: 'flat',
  lineComment: ['//'],
  caseInsensitive: true,
  decls: [{ re: /^\s*dcl-proc\s+(?<n>\w+)/i, kind: 'procedure' }],
  imports: [{ re: /^\s*\/(?:copy|include)\s+(\S+)/i, resolve: 'stem' }],
});
def(['Smalltalk'], {
  scope: 'flat',
  lineComment: [],
  decls: [{ re: /\bsubclass:\s*#(?<n>\w+)/, kind: 'class' }],
  imports: [],
});
def(['Verilog', 'SystemVerilog'], {
  scope: 'flat',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  decls: [
    { re: /^\s*(?:macro)?module\s+(?:automatic\s+)?(?<n>\w+)/, kind: 'module' },
    {
      re: /^\s*(?:virtual\s+)?(?<k>class|interface|package|program)\s+(?<n>\w+)/,
      kind: (m) => typeKind(m.groups?.k ?? 'class'),
    },
    {
      re: /^\s*(?:virtual\s+|static\s+|protected\s+|local\s+|extern\s+)*(?:function|task)\s+(?:automatic\s+|static\s+)?(?:[\w[\]:$]+\s+)?(?<n>\w+)\s*[(;]/,
      kind: 'function',
    },
  ],
  imports: [
    { re: /^\s*`include\s+"([^"]+)"/, resolve: 'path' },
    { re: /^\s*import\s+(\w+)::/, resolve: 'qualified' },
  ],
});
def(['VHDL'], {
  scope: 'flat',
  lineComment: ['--'],
  caseInsensitive: true,
  decls: [
    { re: /^\s*entity\s+(?<n>\w+)\s+is\b/i, kind: 'module' },
    { re: /^\s*architecture\s+(?<n>\w+)\s+of\s+\w+/i, kind: 'class' },
    { re: /^\s*package\s+(?:body\s+)?(?<n>\w+)\s+is\b/i, kind: 'module' },
    { re: /^\s*(?:pure\s+|impure\s+)?(?:procedure|function)\s+(?<n>\w+)/i, kind: 'procedure' },
  ],
  imports: [{ re: /^\s*use\s+([\w.]+)/i, resolve: 'none' }],
});
def(['MATLAB'], {
  scope: 'flat',
  lineComment: ['%'],
  decls: [
    { re: /^\s*classdef\s+(?:\([^)]*\)\s*)?(?<n>\w+)/, kind: 'class' },
    {
      re: /^\s*function\s+(?:\[?[\w,\s~]*\]?\s*=\s*)?(?<n>[\w.]+)\s*(?:\((?<p>[^)]*)\))?/,
      kind: 'function',
    },
  ],
  imports: [],
});
def(['Nix'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [],
  imports: [{ re: /\b(?:import|callPackage)\s+(\.{1,2}\/[\w./-]+)/, resolve: 'path' }],
});
def(['Puppet'], {
  scope: 'flat',
  lineComment: ['#'],
  decls: [
    { re: /^\s*class\s+(?<n>[\w:]+)/, kind: 'class' },
    { re: /^\s*define\s+(?<n>[\w:]+)/, kind: 'resource' },
  ],
  imports: [{ re: /^\s*(?:include|require|contain)\s+([\w:]+)/, resolve: 'none' }],
});
def(['Bicep'], {
  scope: 'flat',
  lineComment: ['//'],
  decls: [{ re: /^\s*resource\s+(?<n>\w+)\s+'(?<r>[^']+)'/, kind: 'resource' }],
  imports: [{ re: /^\s*module\s+\w+\s+'([^']+\.bicep)'/, resolve: 'path' }],
});
def(['Jsonnet'], {
  scope: 'flat',
  lineComment: ['//', '#'],
  decls: [{ re: /^\s*local\s+(?<n>\w+)\s*\((?<p>[^)]*)\)\s*=/, kind: 'function' }],
  imports: [{ re: /\bimport(?:str|bin)?\s+['"]([^'"]+)['"]/, resolve: 'path' }],
});

export function hasDeclarationRules(language: string): boolean {
  return language in RULES;
}

export function declarationLanguages(): string[] {
  return Object.keys(RULES);
}

/** Strips strings and comments from a line for brace counting. Returns the stripped text. */
/** Per-language set of characters that can start a string or comment (fast path for plain lines). */
const SPECIAL = new WeakMap<LangRules, RegExp>();
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
function specialOf(rules: LangRules): RegExp {
  let re = SPECIAL.get(rules);
  if (!re) {
    const starts = new Set(['"', '`', "'"]);
    for (const c of rules.lineComment ?? []) if (c) starts.add(c[0] as string);
    if (rules.blockComment) starts.add(rules.blockComment[0][0] as string);
    re = new RegExp(`[${[...starts].map(escapeRe).join('')}]`);
    SPECIAL.set(rules, re);
  }
  return re;
}

function stripForBraces(line: string, st: { inBlock: boolean }, rules: LangRules): string {
  // Most lines hold no string or comment: return them unchanged without a character loop.
  if (!st.inBlock && !specialOf(rules).test(line)) return line;
  let out = '';
  const [bs, be] = rules.blockComment ?? ['\u0000', '\u0000'];
  for (let i = 0; i < line.length; i++) {
    if (st.inBlock) {
      const j = line.indexOf(be, i);
      if (j < 0) break;
      st.inBlock = false;
      i = j + be.length - 1;
      continue;
    }
    if (rules.blockComment && line.startsWith(bs, i)) {
      st.inBlock = true;
      i += bs.length - 1;
      continue;
    }
    if (rules.lineComment?.some((c) => c && line.startsWith(c, i))) break;
    const ch = line[i] as string;
    if (ch === '"' || ch === '`') {
      const j = line.indexOf(ch, i + 1);
      if (j < 0) break;
      i = j;
      out += ' ';
      continue;
    }
    if (ch === "'") {
      // Char literal or string; Rust lifetimes ('a) have no closing quote within 3 characters.
      const j = line.indexOf("'", i + 1);
      if (j > 0 && (j - i <= 3 || rules.lineComment?.[0] !== '//')) {
        i = j;
        out += ' ';
        continue;
      }
    }
    out += ch;
  }
  return out;
}

const indentOf = (l: string) => {
  let n = 0;
  for (const ch of l) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
};

/** Extracts declarations and imports. Returns null when the language has no rules. */
export function extractDeclarations(language: string, text: string): Extraction | null {
  const rules = RULES[language];
  if (!rules) return null;
  const raw = text.split('\n');
  const lines = rules.preprocess ? raw.map(rules.preprocess) : raw;
  const out: Extraction = { declarations: [], imports: [] };
  const st = { inBlock: false };
  let depth = 0;
  // Open scopes: index of the declaration, and the depth/indent it opened at.
  const scopes: { decl: number; at: number; end?: RegExp; pending?: boolean; isType: boolean }[] =
    [];
  const typeScope = () => {
    const top = scopes[scopes.length - 1];
    return top?.isType ? top : undefined;
  };
  let inImportBlock = false;
  let started = !rules.after;
  const seen = new Set<string>();
  const reserved = rules.reserved ?? CONTROL;

  const nextNonBlank = (i: number) => {
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const t = (lines[j] ?? '').trim();
      if (t) return t;
    }
    return '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').replace(/\r$/, '');
    const trimmed = line.trim();
    const lineNo = i + 1;
    const wasInBlock = st.inBlock;
    const code = rules.scope === 'brace' ? stripForBraces(line, st, rules) : line;
    if (!trimmed) continue;
    const isComment =
      wasInBlock ||
      (rules.lineComment ?? []).some((c) => c && trimmed.startsWith(c.trim())) ||
      (rules.blockComment && trimmed.startsWith(rules.blockComment[0]));

    // Scope bookkeeping before matching this line.
    if (rules.scope === 'indent' && !isComment) {
      const ind = indentOf(line);
      while (scopes.length && ind <= (scopes[scopes.length - 1]?.at ?? -1)) {
        const s = scopes.pop();
        const d = s ? out.declarations[s.decl] : undefined;
        if (d) d.endLine = lineNo - 1;
      }
    }
    if (rules.scope === 'end' && !isComment) {
      const top = scopes[scopes.length - 1];
      if (top?.end?.test(line)) {
        scopes.pop();
        const d = out.declarations[top.decl];
        if (d) d.endLine = lineNo;
        continue;
      }
    }
    if (rules.scope === 'brace' && !isComment) {
      const top = scopes[scopes.length - 1];
      if (top?.end?.test(line)) {
        scopes.pop();
        const d = out.declarations[top.decl];
        if (d) d.endLine = lineNo;
      }
    }

    if (!isComment) {
      if (rules.namespace && !out.namespace) {
        const m = rules.namespace.exec(line);
        if (m?.[1]) out.namespace = m[1].replace(/\\/g, '.');
      }
      // Imports.
      if (rules.importBlock) {
        if (inImportBlock) {
          if (rules.importBlock.end.test(line)) inImportBlock = false;
          else {
            const m = rules.importBlock.line.exec(line);
            if (m?.[1])
              out.imports.push({
                spec: m[1],
                line: lineNo,
                resolve: rules.imports?.[0]?.resolve ?? 'none',
              });
          }
          continue;
        }
        if (rules.importBlock.start.test(line)) {
          inImportBlock = true;
          continue;
        }
      }
      for (const ir of rules.imports) {
        const m = ir.re.exec(line);
        const cap = m?.slice(1).find(Boolean);
        if (!cap) continue;
        const specs = ir.list
          ? cap.split(',').map((s) =>
              s
                .trim()
                .replace(/\s+as\s+\w+$/, '')
                .replace(/^"|"$/g, ''),
            )
          : [cap.trim()];
        for (const spec of specs)
          if (spec) out.imports.push({ spec, line: lineNo, resolve: ir.resolve });
        break;
      }
      if (!started && rules.after?.test(line)) started = true;

      // Declarations.
      const topScope = typeScope();
      const inType = !!topScope;
      const inBody = scopes.length > 0 && !topScope;
      const atMemberLevel =
        rules.scope === 'brace'
          ? !!topScope && depth === topScope.at + 1
          : rules.scope === 'indent' || rules.scope === 'end'
            ? inType
            : false;
      const atTop =
        rules.scope === 'brace'
          ? depth === 0 ||
            (topScope &&
              out.declarations[topScope.decl]?.kind === 'namespace' &&
              depth === topScope.at + 1)
          : !inType;
      for (const rule of rules.decls) {
        if (rule.kind !== 'module' && !started && rules.after) continue;
        const where = rule.where ?? 'any';
        if (where === 'member' && !atMemberLevel) continue;
        if (where === 'top' && !atTop) continue;
        if (
          rules.scope === 'brace' &&
          where === 'any' &&
          depth > 0 &&
          !atMemberLevel &&
          !atTop &&
          !rule.opens
        )
          continue;
        if (inBody && rules.scope === 'brace') continue;
        const m = rule.re.exec(line);
        if (!m) continue;
        const g = m.groups ?? {};
        const name = (g.n ?? g.n2 ?? '').replace(/`/g, '');
        if (!name || (rule.generic && reserved.has(name.toLowerCase()))) continue;
        if (rule.needsBody && !/\{\s*$/.test(code) && !nextNonBlank(i).startsWith('{')) continue;
        if (rule.needsBody && /;\s*$/.test(code)) continue;
        // A typed-member pattern also matches "return foo(x)" style lines; the return type must not be a keyword.
        if (g.r && reserved.has(g.r.trim().split(/\s+/)[0]?.toLowerCase() ?? '')) continue;
        let kind = typeof rule.kind === 'function' ? rule.kind(m) : rule.kind;
        const parentKind = topScope ? out.declarations[topScope.decl]?.kind : undefined;
        if (
          kind === 'function' &&
          atMemberLevel &&
          inType &&
          rules.scope !== 'flat' &&
          /^(class|struct|interface|trait|type|enum)$/.test(parentKind ?? '')
        )
          kind = 'method';
        if (kind === 'method' && !inType && !g.recv) kind = 'function';
        if (rules.dedupe) {
          const k = `${kind}:${name}`;
          if (seen.has(k)) break;
          seen.add(k);
        }
        const d: Declaration = {
          name,
          kind,
          line: lineNo,
          signature: trimmed.slice(0, 200),
        };
        const params = g.p ?? g.p2;
        if (params !== undefined) d.params = params.trim().slice(0, 300);
        if (g.r?.trim())
          d.returns = g.r
            .trim()
            .replace(/[{:]\s*$/, '')
            .trim()
            .slice(0, 120);
        if (g.recv)
          d.receiver = g.recv.trim().split(/\s+/).pop()?.replace(/^\*/, '').replace(/\[.*$/, '');
        if (kind === 'type' && language === 'Rust') d.receiver = name.split('::').pop();
        if (inType && topScope && (atMemberLevel || rules.scope !== 'brace'))
          d.parent = topScope.decl;
        const idx = out.declarations.push(d) - 1;
        if (
          rules.scope === 'brace' &&
          (rule.opens || /\{/.test(code) || nextNonBlank(i).startsWith('{'))
        )
          scopes.push({ decl: idx, at: depth, end: rule.end, pending: true, isType: !!rule.opens });
        else if (rule.opens && rules.scope === 'indent')
          scopes.push({ decl: idx, at: indentOf(line), isType: true });
        else if (rule.opens && rules.scope === 'end' && rule.end)
          scopes.push({ decl: idx, at: 0, end: rule.end, isType: true });
        break;
      }
    }

    // Brace depth after this line; close scopes whose block ended.
    if (rules.scope === 'brace') {
      for (const ch of code) {
        if (ch === '{') {
          depth++;
          const top = scopes[scopes.length - 1];
          if (top?.pending && depth === top.at + 1) top.pending = false;
        } else if (ch === '}') {
          depth = Math.max(0, depth - 1);
          while (scopes.length) {
            const top = scopes[scopes.length - 1] as (typeof scopes)[number];
            if (!top.pending && !top.end && depth <= top.at) {
              scopes.pop();
              const d = out.declarations[top.decl];
              if (d) d.endLine = lineNo;
            } else break;
          }
        }
      }
      // A type declaration with no brace on its line or the next (forward declaration) opens nothing.
      const top = scopes[scopes.length - 1];
      if (top?.pending && !top.end && out.declarations[top.decl]?.line !== lineNo) {
        const d = out.declarations[top.decl];
        if (d && lineNo - d.line >= 2) scopes.pop();
      }
    }
  }
  return out;
}
