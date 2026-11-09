/**
 * Bridge between the tree-sitter syntax layer (@nexora/syntax) and the CodeAtlas graph: how a
 * syntax import is resolved to a repository file, and how a file's outcome is described.
 *
 * The runtime (WebAssembly) is initialised once when this module loads. If that fails, every
 * syntax language falls back to the declaration patterns and says so in its file status.
 */
import { analyseSyntax, grammarManifest, initSyntax, type SyntaxImport } from '@nexora/syntax';
import { posix } from 'node:path';
import type { ImportRef } from './declarations';

let initError: string | undefined;
try {
  await initSyntax();
} catch (e) {
  initError = `the tree-sitter runtime did not load: ${(e as Error).message.slice(0, 160)}`;
}

export { analyseSyntax };

/** Why the syntax layer cannot run in this process, if it cannot. */
export function syntaxUnavailable(): string | undefined {
  return initError;
}

/** "tree-sitter python 0.25.0": the grammar package and version that parsed a file. */
export function grammarLabel(grammar: string): string {
  const g = grammarManifest().grammars[grammar];
  return g ? `tree-sitter ${g.package}@${g.version}` : `tree-sitter ${grammar}`;
}

/** How a module-style import (not a file path) resolves, per language. */
const MODULE_RESOLVE: Record<string, ImportRef['resolve']> = {
  Python: 'dotted',
  Ruby: 'dotted',
  Lua: 'dotted',
  Go: 'gomod',
  Java: 'qualified',
  Kotlin: 'qualified',
  'Gradle Kotlin DSL': 'qualified',
  Scala: 'qualified',
  Groovy: 'qualified',
  Gradle: 'qualified',
  PHP: 'qualified',
  Elixir: 'qualified',
  Haskell: 'qualified',
  OCaml: 'qualified',
  'F#': 'qualified',
  Puppet: 'qualified',
};

/**
 * The ImportRef the existing resolver understands, or undefined when the import is handled
 * elsewhere (Terraform module sources are folder links read by the HCL reader).
 */
export function importRefOf(
  language: string,
  fromPath: string,
  imp: SyntaxImport,
): ImportRef | undefined {
  if (language === 'HCL') return undefined;
  let spec = imp.spec;
  if (imp.style === 'module') {
    const resolve = MODULE_RESOLVE[language] ?? 'none';
    // Lua and Ruby module names use dots or slashes for folders.
    if (resolve === 'dotted' && language !== 'Python') spec = spec.replace(/\//g, '.');
    return { spec, line: imp.line, resolve };
  }
  // Path-style imports. Anything built from variables cannot be followed.
  if (/[$%]|\{\{/.test(spec)) return { spec, line: imp.line, resolve: 'none' };
  if (language === 'Starlark') {
    // Bazel labels: @repo//… is another repository; //pkg:file is from the workspace root;
    // :file is next to this BUILD file.
    if (spec.startsWith('@')) return { spec, line: imp.line, resolve: 'none' };
    if (spec.startsWith('//')) spec = spec.slice(2).replace(':', '/');
    else if (spec.startsWith(':')) spec = `./${spec.slice(1)}`;
    return { spec, line: imp.line, resolve: 'path' };
  }
  if (language === 'Rust') {
    // `mod name;` in lib.rs, main.rs or mod.rs loads name.rs or name/mod.rs beside it; in
    // other.rs it loads other/name.rs.
    const base = posix.basename(fromPath);
    const stem = base.replace(/\.rs$/, '');
    const dir = /^(lib|main|mod)\.rs$/.test(base) ? '' : `${stem}/`;
    return { spec: `./${dir}${spec}`, line: imp.line, resolve: 'path' };
  }
  return { spec, line: imp.line, resolve: 'path' };
}
