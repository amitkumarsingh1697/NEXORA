/**
 * Single-file components (Svelte, Vue, Astro) as TypeScript the compiler can check.
 *
 * Each component becomes one virtual module (`X.svelte` → `X.svelte.ts`, the name TypeScript
 * itself tries when it resolves `import X from './X.svelte'`). The virtual text has exactly the
 * same lines as the component, so every line number the indexer records is a line of the real
 * file. Script blocks and Astro frontmatter are copied as written. Markup is replaced by the code
 * it stands for: expressions become statements, Svelte blocks become `if`/`for`/function blocks
 * (so loop variables and snippet parameters have scopes and types), Vue `v-for` and slot props
 * open a scope that closes with their element, and directives become the calls Svelte compiles
 * them to (`use:action={p}` → `action(node, p)`). Everything else (tags, text, styles, comments)
 * is dropped, keeping its line breaks.
 *
 * Component tags (`<Button>`, `<my-button>`) are emitted as a bare reference and their offsets
 * returned in `tags`, so the indexer can record a `renders` link once the compiler resolves them.
 */

export type ComponentKind = 'svelte' | 'vue' | 'astro';

export interface MaskedComponent {
  kind: ComponentKind;
  /** TypeScript text with the component's line structure. */
  code: string;
  /** Extension appended to the component's path to name the virtual module. */
  ext: '.ts' | '.tsx';
  /** Offsets in `code` of each component-tag reference (an identifier or property access). */
  tags: number[];
  scripts: number;
  expressions: number;
}

const COMPONENT_EXT = /\.(svelte|vue|astro)$/i;

export function componentKindOf(path: string): ComponentKind | null {
  const m = COMPONENT_EXT.exec(path);
  return m ? (m[1]!.toLowerCase() as ComponentKind) : null;
}

/** Name of the virtual TypeScript module for a component path. */
export function virtualPathOf(path: string): string {
  const k = componentKindOf(path);
  return k ? path + (k === 'astro' ? '.tsx' : '.ts') : path;
}

const VOID_ELEMENTS = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' '),
);
/** Svelte 5 runes: compiler keywords, declared for the checker in an ambient file. */
export const SVELTE_RUNES = new Set([
  '$state',
  '$derived',
  '$effect',
  '$props',
  '$bindable',
  '$inspect',
  '$host',
]);

/** Ambient declarations for the Svelte runes, served as a file of the `svelte` package. */
export const SVELTE_AMBIENT = `export {};
declare global {
  function $state<T>(initial?: T): T;
  namespace $state {
    function raw<T>(initial?: T): T;
    function snapshot<T>(value: T): T;
  }
  function $derived<T>(expression: T): T;
  namespace $derived {
    function by<T>(fn: () => T): T;
  }
  function $effect(fn: () => void | (() => void)): void;
  namespace $effect {
    function pre(fn: () => void | (() => void)): void;
    function root(fn: () => void | (() => void)): () => void;
    function tracking(): boolean;
    function pending(): number;
  }
  function $props(): any;
  namespace $props {
    function id(): string;
  }
  function $bindable<T>(fallback?: T): T;
  function $inspect(...values: any[]): { with(fn: (type: string, ...values: any[]) => void): void };
  namespace $inspect {
    function trace(name?: string): void;
  }
  function $host<T = HTMLElement>(): T;
  const $$props: Record<string, any>;
  const $$restProps: Record<string, any>;
  const $$slots: Record<string, boolean>;
}
`;

/** Ambient declarations for Vue's compiler macros and template instance properties, served as a file of the `vue` package. */
export const VUE_AMBIENT = `export {};
declare global {
  function defineProps<T = any>(props?: any): T;
  function defineEmits<T = any>(emits?: any): T;
  function defineExpose(exposed?: Record<string, any>): void;
  function defineModel<T = any>(...args: any[]): T;
  function defineOptions(options?: Record<string, any>): void;
  function defineSlots<T = any>(): T;
  function withDefaults<T>(props: T, defaults: any): T;
  const $emit: (event: string, ...args: any[]) => void;
  const $attrs: Record<string, unknown>;
  const $slots: Record<string, any>;
  const $props: Record<string, any>;
  const $el: any;
  const $refs: Record<string, any>;
  const $parent: any;
  const $root: any;
  const $data: Record<string, any>;
  const $options: Record<string, any>;
  const $watch: (...args: any[]) => () => void;
  const $forceUpdate: () => void;
  const $nextTick: (fn?: () => void) => Promise<void>;
}
`;

/** Keeps only the line breaks of a piece of text. */
function breaks(s: string): string {
  return s.replace(/[^\n]/g, '');
}

/** Index just after the brace that closes the one at `open`, skipping strings, template literals and comments. */
function matchBrace(text: string, open: number, end: number): number {
  let depth = 0;
  for (let i = open; i < end; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < end && text[i] !== q; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < end && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      i = j < 0 ? end : j + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

function pascal(tag: string): string {
  return tag
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/** Index of a top-level keyword (` as `, ` then `) outside brackets and strings, or -1. */
function topLevel(expr: string, re: RegExp): number {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < expr.length && expr[i] !== c; i++) if (expr[i] === '\\') i++;
      continue;
    }
    if (depth === 0) {
      re.lastIndex = i;
      const m = re.exec(expr);
      if (m && m.index === i) return i;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  return -1;
}

interface ScriptAttrs {
  isCode: boolean;
}

function scriptAttrs(attrs: string): ScriptAttrs {
  const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
  const lang = /\blang\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
  const typeOk =
    !type || /^(module|text\/javascript|application\/javascript|text\/typescript)$/.test(type);
  const langOk = !lang || /^(ts|js|typescript|javascript|tsx|jsx)$/.test(lang);
  return { isCode: typeOk && langOk };
}

export function maskComponent(path: string, text: string): MaskedComponent | null {
  const kind = componentKindOf(path);
  if (!kind) return null;
  const out: string[] = [];
  const tags: number[] = [];
  let length = 0;
  let scripts = 0;
  let expressions = 0;
  const emit = (s: string) => {
    out.push(s);
    length += s.length;
  };
  const drop = (from: number, to: number) => emit(breaks(text.slice(from, to)));
  const expr = (from: number, to: number) => {
    const spread = /^\s*\.\.\./.exec(text.slice(from, to));
    if (spread) from += spread[0].length;
    const body = text.slice(from, to);
    if (!body.trim()) return emit(breaks(body));
    expressions++;
    emit(';(');
    emit(body);
    emit(');');
  };
  const tag = (name: string) => {
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(name)) return;
    emit(';(');
    tags.push(length);
    emit(name);
    emit(');');
  };

  let i = 0;
  const end = text.length;

  // Astro frontmatter: the code between the first two `---` lines.
  if (kind === 'astro') {
    const m = /^\uFEFF?\s*---[ \t]*\r?\n/.exec(text);
    if (m) {
      const close = /\r?\n---[ \t]*(\r?\n|$)/g;
      close.lastIndex = m[0].length - 1;
      const c = close.exec(text);
      if (c) {
        drop(0, m[0].length);
        emit(text.slice(m[0].length, c.index));
        drop(c.index, c.index + c[0].length);
        scripts++;
        i = c.index + c[0].length;
      }
    }
  }

  // Svelte block stack (for `{:else}`, `{:then}`, `{/each}`), Vue element scopes.
  const blocks: { name: string }[] = [];
  const elements: { name: string; scopes: number }[] = [];

  const svelteMustache = (open: number, close: number) => {
    // open: index of `{`, close: index just after the matching `}`.
    const inner = text.slice(open + 1, close - 1);
    const t = inner.trimStart();
    const lead = inner.length - t.length;
    const at = open + 1 + lead;
    const kw = /^([#:/@])(\w+)/.exec(t);
    if (!kw) {
      expr(at, close - 1);
      return;
    }
    const [whole, sigil, word] = kw;
    const restFrom = at + whole.length;
    const rest = text.slice(restFrom, close - 1);
    expressions++;
    if (sigil === '#') {
      if (word === 'if') {
        blocks.push({ name: 'if' });
        emit(';if (');
        emit(rest);
        emit(') {');
      } else if (word === 'each') {
        blocks.push({ name: 'each' });
        const as = topLevel(rest, /\sas\s/y);
        if (as < 0) {
          emit(';for (const __item of (');
          emit(rest);
          emit(') as any[]) {');
        } else {
          const list = rest.slice(0, as);
          let ctx = rest.slice(as).replace(/^\s+as\s+/, ' ');
          const key = topLevel(ctx, /\(/y);
          let keyExpr = '';
          if (key > 0) {
            keyExpr = ctx.slice(key);
            ctx = ctx.slice(0, key);
          }
          const comma = topLevel(ctx, /,/y);
          const item = comma < 0 ? ctx : ctx.slice(0, comma);
          const index = comma < 0 ? '' : ctx.slice(comma + 1).trim();
          emit(';for (const ');
          emit(item.trim() ? item : '__item');
          emit(' of (');
          emit(list);
          emit(') as any[]) {');
          if (index) emit(` const ${index} = 0;`);
          if (keyExpr) emit(`;${keyExpr};`);
        }
      } else if (word === 'await') {
        // The promise is emitted once; a later `{:then v}` declares `v` without repeating it.
        const then = topLevel(rest, /\s(then|catch)\b/y);
        const promise = then < 0 ? rest : rest.slice(0, then);
        blocks.push({ name: 'await' });
        const m = then < 0 ? null : /^(then|catch)\s*([\s\S]*)$/.exec(rest.slice(then).trim());
        if (m?.[2]) {
          emit(`;{ const ${m[2].replace(/\n/g, ' ')}: any = await (`);
          emit(promise);
          emit(');');
        } else {
          emit(';{ (');
          emit(promise);
          emit(');');
        }
        if (then >= 0) emit(breaks(rest.slice(then)));
      } else if (word === 'key') {
        blocks.push({ name: 'key' });
        emit(';{ (');
        emit(rest);
        emit(');');
      } else if (word === 'snippet') {
        blocks.push({ name: 'snippet' });
        emit(';function ');
        emit(rest);
        emit(' {');
      } else {
        blocks.push({ name: word! });
        emit(';{');
        emit(breaks(rest));
      }
    } else if (sigil === ':') {
      const top = blocks[blocks.length - 1];
      if (word === 'else') {
        const m = /^\s*if\s([\s\S]*)$/.exec(rest);
        if (m) {
          emit('} else if (');
          emit(m[1]!);
          emit(') {');
        } else {
          emit(top?.name === 'if' ? '} else {' : '} {');
          emit(breaks(rest));
        }
      } else if (word === 'then' || word === 'catch') {
        const v = rest.trim();
        emit('} {');
        if (v) emit(` const ${v.replace(/\n/g, ' ')}: any = null;`);
        emit(breaks(rest));
      } else {
        emit('} {');
        emit(breaks(rest));
      }
    } else if (sigil === '/') {
      blocks.pop();
      emit('}');
      emit(breaks(rest));
    } else {
      // @render, @html, @const, @attach, @debug
      if (word === 'const') {
        emit(';const ');
        emit(rest);
        emit(';');
      } else if (word === 'debug') {
        emit(breaks(rest));
      } else {
        emit(';(');
        emit(rest);
        emit(');');
      }
    }
  };

  /** A Svelte directive or attribute value: `on:x`, `bind:x`, `use:a`, `transition:t`, … */
  const svelteAttr = (name: string, open: number, close: number) => {
    const m = /^(use|transition|in|out|animate|attach):([\w$.]+)/.exec(name);
    if (m) {
      expressions++;
      emit(`;${m[2]}(null as any, (`);
      emit(text.slice(open + 1, close - 1));
      emit('));');
      return;
    }
    svelteMustache(open, close);
  };

  /** A Vue directive value between quotes [from, to). */
  const vueDirective = (name: string, from: number, to: number) => {
    const v = text.slice(from, to);
    if (!v.trim()) return emit(breaks(v));
    expressions++;
    if (name === 'v-for') {
      const m = /^\s*([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)$/.exec(v);
      const el = elements[elements.length - 1];
      if (m) {
        let alias = m[1]!.trim();
        if (alias.startsWith('(') && alias.endsWith(')')) alias = alias.slice(1, -1);
        const parts = alias.split(/,(?![^{[]*[}\]])/).map((s) => s.trim());
        emit(';for (const ');
        emit(parts[0] || '__item');
        emit(' of (');
        emit(m[2]!);
        emit(') as any[]) {');
        for (const extra of parts.slice(1)) if (extra) emit(` const ${extra}: any = 0;`);
        emit(breaks(m[1]!));
        if (el) el.scopes++;
        return;
      }
      return emit(breaks(v));
    }
    if (name === 'v-slot' || name.startsWith('v-slot:') || name.startsWith('#')) {
      const el = elements[elements.length - 1];
      emit(`;{ const ${v.replace(/\n/g, ' ')}: any = null;`);
      emit(breaks(v));
      if (el) el.scopes++;
      return;
    }
    if (name.startsWith('@') || name.startsWith('v-on')) {
      emit(';{');
      emit(v);
      emit('};');
      return;
    }
    emit(';(');
    emit(v);
    emit(');');
  };

  /** Parses a tag's attributes from `j`; returns the index just after `>`. */
  const attributes = (j: number, onlyBreaks: boolean): number => {
    while (j < end) {
      const c = text[j]!;
      if (c === '>') return j + 1;
      if (c === '/' && text[j + 1] === '>') return j + 2;
      if (/\s/.test(c)) {
        if (c === '\n') emit('\n');
        j++;
        continue;
      }
      if (c === '{' && kind !== 'vue') {
        const close = matchBrace(text, j, end);
        if (close < 0) return end;
        if (onlyBreaks) drop(j, close);
        else svelteMustacheOrAstro(j, close, '');
        j = close;
        continue;
      }
      const nm = /[^\s=>/"'{]+/y;
      nm.lastIndex = j;
      const n = nm.exec(text);
      if (!n) {
        j++;
        continue;
      }
      const name = n[0];
      j = nm.lastIndex;
      const eq = /\s*=\s*/y;
      eq.lastIndex = j;
      const e = eq.exec(text);
      if (!e) {
        // A Svelte directive without a value still runs: `transition:fade` → fade(node).
        const d =
          kind === 'svelte' &&
          !onlyBreaks &&
          /^(use|transition|in|out|animate):([\w$.]+)/.exec(name);
        if (d) {
          expressions++;
          emit(`;${d[2]}(null as any);`);
        }
        continue;
      }
      emit(breaks(e[0]));
      j = eq.lastIndex;
      const q = text[j];
      if (q === '"' || q === "'") {
        const close = text.indexOf(q, j + 1);
        const stop = close < 0 ? end : close;
        if (onlyBreaks) drop(j, stop + 1);
        else if (kind === 'vue' && /^(v-|:|@|#)/.test(name)) vueDirective(name, j + 1, stop);
        else if (kind === 'svelte') {
          // Quoted Svelte values interpolate: `class="a {b}"`.
          let k = j + 1;
          while (k < stop) {
            const b = text.indexOf('{', k);
            if (b < 0 || b >= stop) break;
            drop(k, b);
            const bc = matchBrace(text, b, stop);
            if (bc < 0) break;
            svelteMustache(b, bc);
            k = bc;
          }
          drop(k, stop);
        } else drop(j, stop + 1);
        j = stop + 1;
      } else if (q === '{' && kind !== 'vue') {
        const close = matchBrace(text, j, end);
        if (close < 0) return end;
        if (onlyBreaks) drop(j, close);
        else svelteMustacheOrAstro(j, close, name);
        j = close;
      } else {
        const v = /[^\s>]+/y;
        v.lastIndex = j;
        const m = v.exec(text);
        j = m ? v.lastIndex : j + 1;
      }
    }
    return end;
  };

  const svelteMustacheOrAstro = (open: number, close: number, attr: string) => {
    if (kind === 'svelte')
      return attr ? svelteAttr(attr, open, close) : svelteMustache(open, close);
    expr(open + 1, close - 1); // Astro: a JSX expression, kept as written.
  };

  const closeElement = (name: string) => {
    for (let k = elements.length - 1; k >= 0; k--) {
      if (elements[k]!.name !== name) continue;
      while (elements.length > k) {
        const el = elements.pop()!;
        if (el.scopes) emit('}'.repeat(el.scopes));
      }
      return;
    }
  };

  while (i < end) {
    const c = text[i]!;
    if (c === '<' && text.startsWith('<!--', i)) {
      const j = text.indexOf('-->', i + 4);
      const stop = j < 0 ? end : j + 3;
      drop(i, stop);
      i = stop;
      continue;
    }
    if (c === '<' && text[i + 1] === '/') {
      const m = /<\/\s*([\w:.-]+)\s*>/y;
      m.lastIndex = i;
      const r = m.exec(text);
      if (r) {
        if (kind === 'vue') closeElement(r[1]!);
        i = m.lastIndex;
        continue;
      }
    }
    if (c === '<' && /[A-Za-z]/.test(text[i + 1] ?? '')) {
      const m = /<([A-Za-z][\w:.-]*)/y;
      m.lastIndex = i;
      const r = m.exec(text)!;
      const name = r[1]!;
      const lower = name.toLowerCase();
      if (lower === 'script' || lower === 'style') {
        const tagEnd = text.indexOf('>', m.lastIndex);
        if (tagEnd < 0) {
          drop(i, end);
          break;
        }
        const attrs = text.slice(m.lastIndex, tagEnd);
        drop(i, tagEnd + 1);
        if (attrs.trimEnd().endsWith('/')) {
          i = tagEnd + 1;
          continue;
        }
        const closeRe = new RegExp(`</${lower}\\s*>`, 'ig');
        closeRe.lastIndex = tagEnd + 1;
        const cl = closeRe.exec(text);
        const bodyEnd = cl ? cl.index : end;
        if (lower === 'script' && scriptAttrs(attrs).isCode) {
          scripts++;
          emit(';');
          emit(text.slice(tagEnd + 1, bodyEnd));
          emit(';');
        } else drop(tagEnd + 1, bodyEnd);
        if (cl) drop(cl.index, cl.index + cl[0].length);
        i = cl ? cl.index + cl[0].length : end;
        continue;
      }
      // Component references: capitalised or dotted tags; in Vue, kebab-case tags too.
      if (/^[A-Z]/.test(name) && !name.includes(':')) tag(name);
      else if (kind === 'vue' && name.includes('-') && !name.includes(':')) tag(pascal(name));
      // Vue: the element is pushed first, so `v-for` and slot scopes attach to it.
      if (kind === 'vue') elements.push({ name, scopes: 0 });
      const after = attributes(m.lastIndex, false);
      const selfClosing = text[after - 2] === '/';
      if (kind === 'vue' && (selfClosing || VOID_ELEMENTS.has(lower))) closeElement(name);
      i = after;
      continue;
    }
    if (c === '{') {
      if (kind === 'vue') {
        if (text[i + 1] === '{') {
          const j = text.indexOf('}}', i + 2);
          const stop = j < 0 ? end : j;
          expr(i + 2, stop);
          i = j < 0 ? end : j + 2;
          continue;
        }
      } else {
        const close = matchBrace(text, i, end);
        if (close > 0) {
          svelteMustacheOrAstro(i, close, '');
          i = close;
          continue;
        }
      }
    }
    // Text: keep its line breaks only.
    let j = i + 1;
    while (j < end && text[j] !== '<' && text[j] !== '{') j++;
    drop(i, j);
    i = j;
  }
  // Close Vue scopes still open at the end, and any unclosed Svelte block.
  while (elements.length) {
    const el = elements.pop()!;
    if (el.scopes) emit('}'.repeat(el.scopes));
  }
  if (blocks.length) emit('}'.repeat(blocks.length));

  // A component is always a module, even when its script has no import or export.
  emit(';export {};');
  let code = out.join('');
  // Svelte store auto-subscriptions: `$name` reads the store `name`.
  if (kind === 'svelte') {
    const r = rewriteStores(code);
    code = r.code;
    for (let k = 0; k < tags.length; k++) tags[k] = r.shift(tags[k]!);
  }
  return { kind, code, ext: kind === 'astro' ? '.tsx' : '.ts', tags, scripts, expressions };
}

/**
 * `$name` → `name` where `name` occurs elsewhere as an identifier and `$name` is not a rune
 * (Svelte forbids declaring `$`-prefixed names, so `$name` can only be a store read).
 * Returns the new text and a function mapping an old offset to its new one.
 */
export function rewriteStores(code: string): { code: string; shift: (offset: number) => number } {
  const names = new Set<string>();
  for (const m of code.matchAll(/(?<![\w$])[A-Za-z_][\w]*/g)) names.add(m[0]);
  const removed: number[] = [];
  const next = code.replace(/(?<![\w$.])\$([A-Za-z_]\w*)/g, (whole, name: string, at: number) => {
    if (SVELTE_RUNES.has(whole) || !names.has(name)) return whole;
    removed.push(at);
    return name;
  });
  const shift = (offset: number) => {
    let n = 0;
    while (n < removed.length && removed[n]! < offset) n++;
    return offset - n;
  };
  return { code: next, shift };
}
