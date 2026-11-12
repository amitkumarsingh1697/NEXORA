export * from './types';
export {
  initSyntax,
  isSyntaxReady,
  availableGrammars,
  manifest as grammarManifest,
  setGrammarDir,
} from './engine';
export { extractSource } from './extract';
export { specFor, syntaxLanguages, SPEC_BY_LANGUAGE } from './languages';
export type { LangSpec } from './spec';

import { extractSource } from './extract';
import { specFor } from './languages';
import type { SyntaxResult } from './types';

/** Parses one file. `null` when the language has no syntax spec; an Error when parsing failed. */
export function analyseSyntax(language: string, source: string): SyntaxResult | Error | null {
  const spec = specFor(language);
  if (!spec) return null;
  return extractSource(spec, language, source);
}
export {
  resolveBases,
  resolveCalls,
  type BaseLink,
  type CallLink,
  type DeclRef,
  type ResolveFile,
} from './resolve';

import type { Tree } from 'web-tree-sitter';
import { parserFor } from './engine';
export type { Node as SyntaxNode, Tree as SyntaxTree } from 'web-tree-sitter';

/**
 * Parses source with one grammar and returns the tree-sitter tree, for readers that need more
 * than the declarations (such as ORM schema readers). The caller should `delete()` the tree.
 */
export function parseTree(grammarId: string, source: string): Tree | Error {
  const parser = parserFor(grammarId);
  if (parser instanceof Error) return parser;
  const tree = parser.parse(source);
  return tree ?? new Error('the parser returned no tree');
}
