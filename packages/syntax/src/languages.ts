/**
 * Which registry languages (GitHub Linguist names, as in @nexora/languages) the syntax layer
 * parses, and with which spec.
 */
import type { LangSpec } from './spec';
import * as m from './specs/mainstream';
import * as x from './specs/more';
import * as l5 from './specs/l5';

export const SPEC_BY_LANGUAGE: Record<string, LangSpec> = {
  Python: m.python,
  Starlark: m.starlark,
  Go: m.go,
  Java: m.java,
  'C#': m.csharp,
  C: m.c,
  'C++': m.cpp,
  'Objective-C': m.objc,
  Cuda: m.cpp,
  Rust: m.rust,
  PHP: m.php,
  Ruby: m.ruby,
  Scala: m.scala,
  Kotlin: x.kotlin,
  'Gradle Kotlin DSL': x.kotlin,
  Groovy: x.groovy,
  Gradle: x.groovy,
  Lua: x.lua,
  Elixir: x.elixir,
  Haskell: x.haskell,
  Julia: x.julia,
  OCaml: x.ocaml,
  'F#': x.fsharp,
  Zig: x.zig,
  Solidity: x.solidity,
  Shell: x.bash,
  PowerShell: x.powershell,
  Puppet: x.puppet,
  Bicep: x.bicep,
  HCL: x.hcl,
  Dart: l5.dart,
  Swift: l5.swift,
  Perl: l5.perl,
  R: l5.r,
  Erlang: l5.erlang,
  Clojure: l5.clojure,
  Scheme: l5.scheme,
  Racket: l5.racket,
  'Common Lisp': l5.commonlisp,
  'Emacs Lisp': l5.elisp,
  Luau: l5.luau,
  Crystal: l5.crystal,
  GLSL: { ...m.c, grammar: 'glsl' },
  HLSL: { ...m.cpp, grammar: 'hlsl' },
  Apex: { ...m.java, grammar: 'apex' },
};

export function specFor(language: string): LangSpec | undefined {
  return SPEC_BY_LANGUAGE[language];
}

/** Registry languages the syntax layer fully parses. */
export function syntaxLanguages(): string[] {
  return Object.keys(SPEC_BY_LANGUAGE);
}
