export * from './types';
export * from './naming';
export { resolveOrm, tableKey } from './resolve';
export { readPython, pythonFrameworks, djangoAppLabel } from './python';
export { readJvm, parseAnnotation } from './jvm';
export { readCsharp } from './csharp';
export { readRuby } from './ruby';
export { readPhp } from './php';
export { readGo, gormTag } from './go';
export { readElixir, readRust } from './elixir-rust';
export { readTs } from './ts';
export { readLiquibaseTree, liquibaseFromYaml, type LbNode } from './liquibase';

import { readPython } from './python';
import { readJvm } from './jvm';
import { readCsharp } from './csharp';
import { readRuby } from './ruby';
import { readPhp } from './php';
import { readGo } from './go';
import { readElixir, readRust } from './elixir-rust';
import { readTs } from './ts';
import type { OrmFile } from './types';

/**
 * Reads one file's ORM models, migrations and table uses. `null` when the file uses no ORM this
 * package reads. The tree-sitter engine must be initialised first (`initSyntax` from @nexora/syntax).
 */
export interface OrmContext {
  /** The repository has an Entity Framework Core DbContext (see `repositoryContext`). */
  efCore?: boolean;
  /** The repository uses GORM. */
  gorm?: boolean;
}

/** What a reader needs to know about the whole repository, from a quick look at every file. */
export function repositoryContext(texts: Iterable<string>): OrmContext {
  const ctx: OrmContext = {};
  for (const t of texts) {
    if (!ctx.efCore && /:\s*(Identity\w*)?DbContext\b|\bDbSet</.test(t)) ctx.efCore = true;
    if (!ctx.gorm && /"gorm\.io\/gorm"|"github\.com\/jinzhu\/gorm"/.test(t)) ctx.gorm = true;
    if (ctx.efCore && ctx.gorm) break;
  }
  return ctx;
}

export function readOrm(
  path: string,
  language: string,
  source: string,
  ctx: OrmContext = {},
): OrmFile | null {
  switch (language) {
    case 'Python':
      return readPython(path, source);
    case 'C#':
      return readCsharp(path, source, { efCore: !!ctx.efCore });
    case 'TypeScript':
    case 'JavaScript':
    case 'TSX':
    case 'JSX':
      return readTs(path, source);
    case 'Elixir':
      return readElixir(path, source);
    case 'Rust':
      return readRust(path, source);
    case 'Go':
      return readGo(path, source, !!ctx.gorm);
    case 'PHP':
      return readPhp(path, source);
    case 'Ruby':
      return readRuby(path, source);
    case 'Java':
    case 'Kotlin':
      return readJvm(path, language, source);
    default:
      return null;
  }
}
