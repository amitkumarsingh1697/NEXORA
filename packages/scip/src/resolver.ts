/**
 * Answers "what does the name at this line refer to?" from one or more SCIP indexes, so that a
 * call or base class the syntax layer found can be linked by the compiler's own resolution.
 *
 * Positions: SCIP lines are 0-based; this API takes and returns 1-based lines, like the syntax
 * layer. Paths are repository-relative with `/` separators.
 */
import { SymbolRole, type ScipIndex, type SymbolInfo } from './scip';
import { parseSymbol, symbolName, type ParsedSymbol } from './symbol';

const packageKey = (p: ParsedSymbol) => `${p.scheme} ${p.manager} ${p.packageName} ${p.version}`;

export interface ScipDefinition {
  symbol: string;
  path: string;
  /** 1-based line of the definition's name (the first definition occurrence). */
  line: number;
  name: string;
  kind: number;
  /**
   * Every definition occurrence of the symbol, in index order: overloads in Python
   * (`@overload` stubs, then the implementation), or partial classes.
   */
  sites: { path: string; line: number }[];
}

export type ScipAnswer =
  /** The name refers to a definition in an indexed file of this repository. */
  | { kind: 'definition'; definition: ScipDefinition; tool: string }
  /** The name refers to a symbol outside the repository (standard library, a dependency). */
  | { kind: 'external'; symbol: string; package: string; tool: string }
  /** Several different symbols of that name on that line: not decided. */
  | { kind: 'ambiguous'; tool: string }
  /**
   * A symbol of this repository's own package that no indexed document defines (scip-python
   * 0.6.8 records `class ConnectionError` in requests as a reference to the builtin of that name,
   * so the repository's class has references and no definition). Not decided.
   */
  | { kind: 'undefined'; symbol: string; tool: string };

interface Ref {
  symbol: string;
  name: string;
}

export interface IndexInput {
  index: ScipIndex;
  /**
   * The index's project root relative to the repository root ('' when the indexer ran at the
   * root). Document paths are relative to it.
   */
  prefix: string;
}

const join = (prefix: string, p: string) =>
  (prefix ? `${prefix.replace(/\/+$/, '')}/${p}` : p).replace(/\\/g, '/').replace(/^\.\//, '');

const EMPTY: ReadonlySet<number> = new Set();

export class ScipResolver {
  /** path → tool that indexed it. */
  private readonly docs = new Map<string, string>();
  /** path → 1-based line → references on that line. */
  private readonly refs = new Map<string, Map<number, Ref[]>>();
  private readonly defs = new Map<string, ScipDefinition>();
  private readonly infos = new Map<string, SymbolInfo>();
  /** `scheme manager package version` of every package the indexed documents define symbols in. */
  private readonly ownPackages = new Set<string>();
  /** symbol → path → 1-based lines where it occurs in any role. */
  private readonly where = new Map<string, Map<string, Set<number>>>();

  constructor(inputs: IndexInput[]) {
    for (const { index, prefix } of inputs) {
      const tool = index.tool ? `${index.tool.name} ${index.tool.version}`.trim() : 'SCIP index';
      for (const s of index.externalSymbols) this.infos.set(s.symbol, s);
      for (const d of index.documents) {
        const path = join(prefix, d.path);
        this.docs.set(path, tool);
        for (const s of d.symbols) this.infos.set(s.symbol, s);
        const byLine = this.refs.get(path) ?? new Map<number, Ref[]>();
        this.refs.set(path, byLine);
        for (const o of d.occurrences) {
          if (o.symbol.startsWith('local ')) continue;
          const p = parseSymbol(o.symbol);
          const name = p ? symbolName(p) : undefined;
          if (!name) continue;
          const line = o.range[0] + 1;
          const byPath = this.where.get(o.symbol) ?? new Map<string, Set<number>>();
          this.where.set(o.symbol, byPath);
          const lines = byPath.get(path) ?? new Set<number>();
          byPath.set(path, lines);
          lines.add(line);
          if (o.roles & SymbolRole.Definition) {
            if (p) this.ownPackages.add(packageKey(p));
            const d = this.defs.get(o.symbol);
            if (d) d.sites.push({ path, line });
            else
              this.defs.set(o.symbol, {
                symbol: o.symbol,
                path,
                line,
                name,
                kind: 0,
                sites: [{ path, line }],
              });
            continue;
          }
          const l = byLine.get(line) ?? [];
          l.push({ symbol: o.symbol, name });
          byLine.set(line, l);
        }
      }
    }
    for (const [sym, d] of this.defs) d.kind = this.infos.get(sym)?.kind ?? 0;
  }

  /** The tool that indexed a file, or undefined when no index covers it. */
  covers(path: string): string | undefined {
    return this.docs.get(path);
  }

  get files(): number {
    return this.docs.size;
  }

  definition(symbol: string): ScipDefinition | undefined {
    return this.defs.get(symbol);
  }

  /**
   * What `name` (the last segment of a callee or base as written) refers to on a 1-based line of
   * an indexed file. Undefined when the index has no reference of that name there.
   */
  resolve(path: string, line: number, name: string): ScipAnswer | undefined {
    const tool = this.docs.get(path);
    if (!tool) return undefined;
    const here = (this.refs.get(path)?.get(line) ?? []).filter((r) => r.name === name);
    if (!here.length) return undefined;
    // `Foo(…)` in Python refers to the class and its __init__; prefer a definition in the
    // repository, then decide only if one symbol remains.
    const symbols = [...new Set(here.map((r) => r.symbol))];
    const local = symbols.filter((s) => this.defs.has(s));
    const pick = local.length ? local : symbols;
    if (pick.length > 1) return { kind: 'ambiguous', tool };
    const sym = pick[0]!;
    const def = this.defs.get(sym);
    if (def) return { kind: 'definition', definition: def, tool };
    const p = parseSymbol(sym);
    if (p && this.ownPackages.has(packageKey(p))) return { kind: 'undefined', symbol: sym, tool };
    return {
      kind: 'external',
      symbol: sym,
      package: p ? [p.manager, p.packageName].filter(Boolean).join(' ') : '',
      tool,
    };
  }

  /**
   * 1-based lines of a file where a symbol occurs in any role. scip-python marks only the first
   * `@overload` stub as the definition and the later stubs and the implementation as references,
   * so a declaration whose name line is listed here is the same symbol declared again.
   */
  linesOf(symbol: string, path: string): ReadonlySet<number> {
    return this.where.get(symbol)?.get(path) ?? EMPTY;
  }

  /** Implementation relationships of a symbol defined in the repository (bases, interfaces). */
  implemented(symbol: string): string[] {
    return (this.infos.get(symbol)?.relationships ?? [])
      .filter((r) => r.isImplementation)
      .map((r) => r.symbol);
  }

  /** Definitions declared in a file, by 1-based line. */
  definitionsIn(path: string): ScipDefinition[] {
    return [...this.defs.values()].filter((d) => d.path === path);
  }
}

/** The repository-relative directory of an index's `project_root` (a file:// URI). */
export function projectPrefix(projectRoot: string | undefined, repoRoot: string): string {
  if (!projectRoot) return '';
  let p = projectRoot;
  try {
    if (p.startsWith('file:')) p = decodeURIComponent(new URL(p).pathname);
  } catch {
    return '';
  }
  const r = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  p = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (p === r) return '';
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : '';
}
