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
