/**
 * SCIP symbol strings (the grammar in scip.proto, above `message Symbol`):
 *
 *   <scheme> ' ' <manager> ' ' <package-name> ' ' <version> ' ' <descriptor>+   or   'local ' <id>
 *
 * Spaces inside the first four parts are written twice. A descriptor name is a simple identifier
 * or a backtick-quoted one with backticks doubled.
 */

export type Suffix =
  'namespace' | 'type' | 'term' | 'method' | 'type-parameter' | 'parameter' | 'meta' | 'macro';

export interface Descriptor {
  name: string;
  suffix: Suffix;
  /** Method disambiguator (overloads), when written. */
  disambiguator?: string;
}

export interface ParsedSymbol {
  local: boolean;
  scheme: string;
  manager: string;
  packageName: string;
  version: string;
  descriptors: Descriptor[];
}

const IDENT = /[\w+\-$]/;

/** Parses a symbol string; undefined when it does not follow the grammar. */
export function parseSymbol(s: string): ParsedSymbol | undefined {
  if (s.startsWith('local ')) {
    const id = s.slice(6);
    return id
      ? { local: true, scheme: 'local', manager: '', packageName: '', version: id, descriptors: [] }
      : undefined;
  }
  let i = 0;
  const part = (): string | undefined => {
    let out = '';
    while (i < s.length) {
      if (s[i] === ' ') {
        if (s[i + 1] === ' ') {
          out += ' ';
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += s[i++];
    }
    return undefined;
  };
  const scheme = part();
  const manager = part();
  const packageName = part();
  const version = part();
  if (!scheme || manager === undefined || packageName === undefined || version === undefined)
    return undefined;
  const name = (): string | undefined => {
    if (s[i] === '`') {
      let out = '';
      i++;
      while (i < s.length) {
        if (s[i] === '`') {
          if (s[i + 1] === '`') {
            out += '`';
            i += 2;
            continue;
          }
          i++;
          return out;
        }
        out += s[i++];
      }
      return undefined;
    }
    const start = i;
    while (i < s.length && IDENT.test(s[i]!)) i++;
    return i > start ? s.slice(start, i) : undefined;
  };
  const descriptors: Descriptor[] = [];
  while (i < s.length) {
    if (s[i] === '[' || s[i] === '(') {
      const close = s[i] === '[' ? ']' : ')';
      const suffix: Suffix = s[i] === '[' ? 'type-parameter' : 'parameter';
      i++;
      const n = name();
      if (n === undefined || s[i] !== close) return undefined;
      i++;
      descriptors.push({ name: n, suffix });
      continue;
    }
    const n = name();
    if (n === undefined) return undefined;
    const c = s[i++];
    if (c === '/') descriptors.push({ name: n, suffix: 'namespace' });
    else if (c === '#') descriptors.push({ name: n, suffix: 'type' });
    else if (c === '.') descriptors.push({ name: n, suffix: 'term' });
    else if (c === ':') descriptors.push({ name: n, suffix: 'meta' });
    else if (c === '!') descriptors.push({ name: n, suffix: 'macro' });
    else if (c === '(') {
      const start = i;
      while (i < s.length && s[i] !== ')') i++;
      const dis = s.slice(start, i);
      if (s[i] !== ')' || s[i + 1] !== '.') return undefined;
      i += 2;
      descriptors.push({ name: n, suffix: 'method', ...(dis ? { disambiguator: dis } : {}) });
    } else return undefined;
  }
  if (!descriptors.length) return undefined;
  return {
    local: false,
    scheme,
    manager: manager === '.' ? '' : manager,
    packageName: packageName === '.' ? '' : packageName,
    version: version === '.' ? '' : version,
    descriptors,
  };
}

/** The last named descriptor (`get` for `…/Session#get().`), skipping parameters. */
export function symbolName(p: ParsedSymbol): string | undefined {
  for (let k = p.descriptors.length - 1; k >= 0; k--) {
    const d = p.descriptors[k]!;
    if (d.suffix !== 'parameter' && d.suffix !== 'type-parameter') return d.name;
  }
  return undefined;
}
