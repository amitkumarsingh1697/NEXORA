/**
 * A SQL tokenizer that knows each dialect's quoting and comment rules, so that names inside
 * strings and comments are never read as code.
 */
import type { Dialect } from './types';

export type TokKind = 'word' | 'ident' | 'string' | 'number' | 'var' | 'op';

export interface Tok {
  kind: TokKind;
  /** Text as written. For `ident` the quotes are removed; for `string` the raw literal. */
  text: string;
  /** Upper-case text of a word, for keyword checks. */
  up: string;
  line: number;
  start: number;
  end: number;
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$#\u0080-￿]/;

/** Tokens of `text`. Comments are dropped; positions are character offsets in `text`. */
export function tokenize(text: string, dialect: Dialect): Tok[] {
  const out: Tok[] = [];
  let line = 1;
  let i = 0;
  const n = text.length;
  const push = (kind: TokKind, start: number, end: number, value?: string, startLine = line) => {
    const t = value ?? text.slice(start, end);
    out.push({
      kind,
      text: t,
      up: kind === 'word' ? t.toUpperCase() : t,
      line: startLine,
      start,
      end,
    });
  };
  const advanceTo = (j: number) => {
    for (let k = i; k < j; k++) if (text.charCodeAt(k) === 10) line++;
    i = j;
  };
  while (i < n) {
    const c = text[i]!;
    const d = text[i + 1];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    // Comments.
    if (c === '-' && d === '-') {
      const j = text.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '#' && dialect === 'mysql') {
      const j = text.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && d === '*') {
      // PostgreSQL block comments nest; the others end at the first */.
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (dialect === 'postgresql' && text[j] === '/' && text[j + 1] === '*') {
          depth++;
          j += 2;
        } else if (text[j] === '*' && text[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      advanceTo(Math.min(j, n));
      continue;
    }
    const startLine = line;
    // Oracle alternative quoting q'[...]', and N'...' / E'...' / X'...' / B'...' prefixes.
    if (dialect === 'oracle' && (c === 'q' || c === 'Q') && d === "'" && i + 2 < n) {
      const open = text[i + 2]!;
      const close =
        ({ '[': ']', '{': '}', '(': ')', '<': '>' } as Record<string, string>)[open] ?? open;
      const j = text.indexOf(`${close}'`, i + 3);
      const start = i;
      const end = j < 0 ? n : j + 2;
      advanceTo(end);
      push('string', start, end, undefined, startLine);
      continue;
    }
    if (/[NnEeXxBbUu]/.test(c) && d === "'" && !WORD_PART.test(text[i - 1] ?? ' ')) {
      const start = i;
      i++;
      const end = scanString(text, i, "'", dialect === 'mysql' || c === 'E' || c === 'e');
      advanceTo(end);
      push('string', start, end, undefined, startLine);
      continue;
    }
    if (c === "'") {
      const start = i;
      const end = scanString(text, i, "'", dialect === 'mysql');
      advanceTo(end);
      push('string', start, end, undefined, startLine);
      continue;
    }
    if (c === '"') {
      const start = i;
      const end = scanString(text, i, '"', dialect === 'mysql');
      advanceTo(end);
      // MySQL in its default mode treats "..." as a string; everywhere else it is a name.
      if (dialect === 'mysql') push('string', start, end, undefined, startLine);
      else push('ident', start, end, text.slice(start + 1, end - 1).replace(/""/g, '"'), startLine);
      continue;
    }
    if (c === '`' && (dialect === 'mysql' || dialect === 'sqlite' || dialect === 'generic')) {
      const start = i;
      const end = scanString(text, i, '`', false);
      advanceTo(end);
      push('ident', start, end, text.slice(start + 1, end - 1).replace(/``/g, '`'), startLine);
      continue;
    }
    if (c === '[' && (dialect === 'tsql' || dialect === 'sqlite' || dialect === 'generic')) {
      const j = text.indexOf(']', i + 1);
      if (j > 0 && !text.slice(i + 1, j).includes('\n')) {
        const start = i;
        advanceTo(j + 1);
        push('ident', start, j + 1, text.slice(start + 1, j), startLine);
        continue;
      }
    }
    // PostgreSQL dollar quoting: $$...$$ or $tag$...$tag$.
    if (c === '$' && (dialect === 'postgresql' || dialect === 'generic')) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const j = text.indexOf(tag, i + tag.length);
        const end = j < 0 ? n : j + tag.length;
        const start = i;
        advanceTo(end);
        push('string', start, end, undefined, startLine);
        continue;
      }
    }
    if (WORD_START.test(c)) {
      let j = i + 1;
      while (j < n && WORD_PART.test(text[j]!)) j++;
      push('word', i, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(d ?? ''))) {
      const m = /^(?:0x[0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
      const j = i + (m ? m[0].length : 1);
      push('number', i, j);
      i = j;
      continue;
    }
    // Variables: @name and @@name (T-SQL, MySQL), :name (Oracle bind, triggers' :NEW).
    if ((c === '@' || c === ':') && d && (WORD_START.test(d) || d === '@')) {
      let j = i + 1;
      if (text[j] === '@') j++;
      while (j < n && WORD_PART.test(text[j]!)) j++;
      push('var', i, j);
      i = j;
      continue;
    }
    // Two-character operators that matter for reading: := :: <> != <= >= || => ->
    const two = text.slice(i, i + 2);
    if ([':=', '::', '<>', '!=', '<=', '>=', '||', '=>', '->'].includes(two)) {
      push('op', i, i + 2);
      i += 2;
      continue;
    }
    push('op', i, i + 1);
    i++;
  }
  return out;
}

/** End offset (exclusive) of the quoted literal starting at `i`. Doubled quotes escape. */
function scanString(text: string, i: number, q: string, backslash: boolean): number {
  let j = i + 1;
  while (j < text.length) {
    const ch = text[j]!;
    if (backslash && ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === q) {
      if (text[j + 1] === q) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return text.length;
}

/** The value of a string literal token without its quotes and prefix. */
export function stringValue(t: Tok): string {
  const s = t.text;
  const dollar = /^(\$[A-Za-z_0-9]*\$)([\s\S]*)\1$/.exec(s);
  if (dollar) return dollar[2]!;
  const body = s.replace(/^[NnEeXxBbUu]?'/, "'");
  if (/^q'/i.test(s)) return s.slice(3, -2);
  return body.slice(1, -1).replace(/''/g, "'");
}
