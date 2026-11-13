/**
 * Readers for configuration, build, container, orchestration, CI, IaC, API-definition and
 * documentation formats. Each returns what it found and how completely it read the file:
 *
 * - `full`: a complete parser read the file and the meaning of its file type was extracted.
 * - `partial`: a complete parse with no model of the file's meaning, or pattern extraction.
 * - an `error` means the file could not be parsed; the indexer records it as failed.
 *
 * Values of configuration keys are never kept (they can be credentials): only key names,
 * structure, and references to other repository files.
 */
import { parse as parseToml } from 'smol-toml';
import { parseAllDocuments } from 'yaml';

export interface Link {
  /** builds | runs | includes | references */
  kind: 'builds' | 'runs' | 'includes' | 'references';
  /** Repository-relative target as written, resolved against the file's folder by the caller. */
  target: string;
  line?: number;
  detail?: string;
  /** The target is a folder; the caller picks the conventional file in it (inferred). */
  dir?: boolean;
  /** A conventional file name to look for when `dir` is set (Dockerfile, pom.xml…). */
  defaultFile?: string[];
  /**
   * The target is a fully qualified class name (`com.acme.Svc`), not a path: the caller
   * matches it to the source file whose path ends in that name (`com/acme/Svc.java`).
   */
  classRef?: boolean;
  /** The structured symbol (its full dotted path) the link starts from, instead of the file. */
  fromSymbol?: string;
}

export interface StructSymbol {
  name: string;
  kind: string;
  line: number;
  /** The full dotted path of the parent symbol (`a.b` for the key `c` in `a.b.c`). */
  parent?: string;
}

export interface StructuredResult {
  level: 'full' | 'partial';
  method: string;
  /** Small, value-free facts for the file node (counts, names, kinds). */
  facts: Record<string, unknown>;
  links: Link[];
  symbols: StructSymbol[];
  error?: string;
  /** Not parsed and not a failure (for example a Helm template before rendering). */
  skipReason?: string;
}

const MAX_LIST = 50;
const cap = <T>(a: T[]) => a.slice(0, MAX_LIST);

let lineCache: { text: string; starts: number[] } | undefined;
/** 1-based line of the first occurrence of `needle` at or after `from`. */
function lineOf(text: string, needle: string, from = 0): number | undefined {
  const i = text.indexOf(needle, from);
  if (i < 0) return undefined;
  if (lineCache?.text !== text) {
    const starts = [0];
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) starts.push(k + 1);
    lineCache = { text, starts };
  }
  const s = lineCache.starts;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((s[mid] as number) <= i) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: unknown) => (isObj(v) ? Object.keys(v) : []);
const strs = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string'
      ? [v]
      : [];

/** A path-like reference to a repository file in a shell command: ./scripts/x.sh, bin/run, tools/build.py. */
const SCRIPT_REF =
  /(?:^|[\s;&|(=])((?:\.{1,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:sh|bash|ps1|py|rb|pl|js|mjs|cjs|ts|mts|cmd|bat|mk|gradle|kts|groovy|php|lua|r|R|go|jl))(?=$|[\s;&|)'"])|(?:^|[\s;&|(])(\.\/(?:[\w.-]+\/)*[\w.-]+)(?=$|[\s;&|)'"])/g;

export function scriptRefs(command: string): string[] {
  const out: string[] = [];
  for (const m of command.matchAll(SCRIPT_REF)) {
    const p = (m[1] ?? m[2] ?? '').trim();
    if (p && !p.startsWith('/') && !/^\.\/?$/.test(p) && !p.includes('$')) out.push(p);
  }
  return [...new Set(out)];
}

/** Strips // and /* *\/ comments and trailing commas (JSON with Comments, tsconfig). */
export function stripJsonComments(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i++;
      } else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const chunk = text.slice(i, end < 0 ? text.length : end + 2);
      out += chunk.replace(/[^\n]/g, ' ');
      i = end < 0 ? text.length : end + 1;
    } else out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function result(
  level: StructuredResult['level'],
  method: string,
  extra: Partial<StructuredResult> = {},
): StructuredResult {
  return { level, method, facts: {}, links: [], symbols: [], ...extra };
}

// ---------------------------------------------------------------- key trees

/** Most keys or elements read from one file; past it the file is marked partial. */
export const MAX_TREE_SYMBOLS = 5000;
export const MAX_TREE_DEPTH = 32;
/** Array items descended into, per array. */
const MAX_TREE_ITEMS = 25;

/** Offset → 1-based line, for one text at a time. */
function lineAtOffset(text: string, offset: number): number {
  lineOf(text, '', 0); // fills the line cache for this text
  const s = (lineCache as { starts: number[] }).starts;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((s[mid] as number) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export type KeyStyle = 'json' | 'yaml' | 'toml';

/**
 * Every key of a parsed JSON, YAML or TOML document, nested, as symbols (values are never
 * kept: they can be credentials). Array items that hold objects are named `[0]`, `[1]`…
 * Lines come from finding each key in the text after its parent and previous sibling, so a
 * key written twice can be cited at the first of the two. `kindOf` names special keys
 * (dependencies, scripts…) by their dotted path; others are `key`.
 */
export function keyTree(
  doc: unknown,
  text: string,
  style: KeyStyle,
  kindOf: (path: string[], key: string) => string | undefined = () => undefined,
  parentPath?: string,
): { symbols: StructSymbol[]; complete: boolean } {
  const symbols: StructSymbol[] = [];
  let complete = true;
  const needleOf = (k: string) =>
    style === 'json' ? JSON.stringify(k) : /^[\w.-]+$/.test(k) ? k : JSON.stringify(k);
  const walk = (v: unknown, path: string[], dotted: string | undefined, from: number) => {
    const entries: [string, unknown][] = Array.isArray(v)
      ? v.slice(0, MAX_TREE_ITEMS).map((x, i) => [`[${i}]`, x])
      : isObj(v)
        ? Object.entries(v)
        : [];
    if (
      Array.isArray(v) &&
      v.length > MAX_TREE_ITEMS &&
      v.some((x) => isObj(x) || Array.isArray(x))
    )
      complete = false;
    let cursor = from;
    for (const [k, child] of entries) {
      const nested = isObj(child) || Array.isArray(child);
      // Items of an array are named only when they hold keys of their own.
      if (k.startsWith('[') && !nested) continue;
      if (symbols.length >= MAX_TREE_SYMBOLS) {
        complete = false;
        return;
      }
      // An array item starts at its opening brace (JSON) or dash (YAML).
      const opener = style === 'json' ? (isObj(child) ? '{' : '[') : style === 'yaml' ? '-' : '[';
      let at = text.indexOf(k.startsWith('[') ? opener : needleOf(k), cursor);
      if (at < 0 && !k.startsWith('[')) at = text.indexOf(needleOf(k), from);
      const pos = at < 0 ? cursor : at;
      if (at >= 0) cursor = at + 1;
      symbols.push({
        name: k,
        kind: kindOf(path, k) ?? 'key',
        line: lineAtOffset(text, pos),
        ...(dotted ? { parent: dotted } : {}),
      });
      if (!nested) continue;
      if (path.length + 1 >= MAX_TREE_DEPTH) {
        if (isObj(child) ? Object.keys(child).length : (child as unknown[]).length)
          complete = false;
        continue;
      }
      walk(child, [...path, k], dotted ? `${dotted}.${k}` : k, pos + 1);
    }
  };
  walk(doc, [], parentPath, 0);
  return { symbols, complete };
}

/** Dependency and script sections of package manifests, by top-level key. */
const MANIFEST_SECTIONS: Record<string, string> = {
  dependencies: 'dependency',
  devDependencies: 'dependency',
  peerDependencies: 'dependency',
  optionalDependencies: 'dependency',
  bundledDependencies: 'dependency',
  'dev-dependencies': 'dependency',
  'build-dependencies': 'dependency',
  require: 'dependency',
  'require-dev': 'dependency',
  libraries: 'dependency',
  packages: 'dependency',
  'dev-packages': 'dependency',
  deps: 'dependency',
  plugins: 'plugin',
  scripts: 'task',
  tasks: 'task',
};

/** Names keys one level under a manifest section (`dependencies.zod` is a dependency). */
function manifestKind(path: string[], _key: string): string | undefined {
  const top = path[0];
  if (path.length === 1 && top && MANIFEST_SECTIONS[top]) return MANIFEST_SECTIONS[top];
  // Cargo [target.'cfg(..)'.dependencies], poetry [tool.poetry.dependencies]
  const last = path[path.length - 1];
  if (path.length > 1 && last && /^(dev-|build-)?dependencies$|^group$/.test(last))
    return last === 'group' ? undefined : 'dependency';
  return undefined;
}

/**
 * Adds every key of `doc` to a reader's result, unless the reader already drew the file's
 * meaning as symbols. A reader that only listed top-level keys becomes `full` when every key
 * fit; past MAX_TREE_SYMBOLS the result is `partial` and says how far it got.
 */
function withKeys(
  r: StructuredResult,
  docs: unknown[],
  text: string,
  style: KeyStyle,
  label: string,
): StructuredResult {
  if (r.error || r.skipReason || r.symbols.length || /^Lockfile/.test(r.method)) return r;
  const symbols: StructSymbol[] = [];
  let complete = true;
  docs.forEach((d, i) => {
    let parent: string | undefined;
    if (docs.length > 1) {
      parent = `document ${i + 1}`;
      symbols.push({ name: parent, kind: 'key', line: 1 });
    }
    const t = keyTree(d, text, style, manifestKind, parent);
    const room = MAX_TREE_SYMBOLS - symbols.length;
    if (t.symbols.length > room || !t.complete) complete = false;
    symbols.push(...t.symbols.slice(0, Math.max(0, room)));
  });
  if (!symbols.length) return r;
  const generic = /top-level keys only|tables only|structure only/.test(r.method);
  const templated = /template placeholders not rendered/.test(r.method);
  const what = complete
    ? 'every key, nested'
    : `first ${MAX_TREE_SYMBOLS} keys, ${MAX_TREE_DEPTH} levels deep`;
  const method = generic
    ? `${label} (${what}; values not kept)${templated ? '; template placeholders not rendered' : ''}`
    : r.method.endsWith(')')
      ? `${r.method.slice(0, -1).replace(/: key names( only)?$/, '')}; ${what})`
      : `${r.method} (${what})`;
  const level = !complete || templated ? 'partial' : generic ? 'full' : r.level;
  return { ...r, level, method, symbols };
}

// ---------------------------------------------------------------- JSON

const TEMPLATE_SYNTAX = /(?<!\$)\{\{[-\s]*[^}\s]|\{%-?\s*\w|\$\{[^}\s"]{1,100}\}/;

/** True when a file holds Go, Helm, Jinja, Liquid or `${…}` placeholders. */
export function hasTemplateSyntax(text: string): boolean {
  return TEMPLATE_SYNTAX.test(text);
}

const TAG = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;
const MARK = '\u0000';

/**
 * Replaces template tags so that the document around them can be parsed. Line numbers are kept.
 * A line that holds only tags (`{{- if … }}`, `{% for … %}`, `{{ end }}`) becomes blank; a tag
 * inside a line becomes the word TEMPLATE. The rendered document can differ: conditional
 * sections are all kept, and values are placeholders.
 */
export function neutraliseTemplates(text: string): string {
  const marked = text.replace(TAG, (m) => (m.includes('\n') ? m.replace(/[^\n]/g, '') : MARK));
  return marked
    .split('\n')
    .map((l) =>
      l.includes(MARK) && l.split(MARK).join('').trim() === ''
        ? ''
        : l.split(MARK).join('TEMPLATE'),
    )
    .join('\n');
}

/** neutraliseTemplates for JSON: a placeholder outside a string becomes the string "TEMPLATE". */
export function neutraliseJsonTemplates(text: string): string {
  const t = neutraliseTemplates(text.replace(/\$\{[^}\s"]{1,100}\}/g, '{{x}}'));
  let out = '';
  let inString = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (inString) {
      if (c === '\\') {
        out += c + (t[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === '"') inString = false;
      out += c;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (t.startsWith('TEMPLATE', i)) {
      out += '"TEMPLATE"';
      i += 'TEMPLATE'.length - 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** Splits text holding several JSON values one after another (`{…}{…}` or one per block). */
export function splitConcatenatedJson(text: string): string[] | undefined {
  const parts: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /\s/.test(text[i] as string)) i++;
    if (i >= n) break;
    const open = text[i];
    if (open !== '{' && open !== '[') return undefined;
    let depth = 0;
    let inString = false;
    let j = i;
    for (; j < n; j++) {
      const c = text[j];
      if (inString) {
        if (c === '\\') j++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return undefined;
    parts.push(text.slice(i, j + 1));
    i = j + 1;
  }
  return parts.length >= 2 ? parts : undefined;
}

export function readJson(
  path: string,
  text: string,
  role: string | undefined,
  language: string,
): StructuredResult {
  const out: { docs?: unknown[] } = {};
  const keyed = (r: StructuredResult, t = text) =>
    /Jupyter|JSON Lines/.test(r.method) ? r : withKeys(r, out.docs ?? [], t, 'json', 'JSON parser');
  const r = readJsonDocument(path, text, role, language, out);
  if (!r.error) return keyed(r);
  if (hasTemplateSyntax(text)) {
    const neutral = neutraliseJsonTemplates(text);
    const t = readJsonDocument(path, neutral, role, language, out);
    if (!t.error)
      return keyed(
        {
          ...t,
          level: 'partial',
          method: `${t.method}; template placeholders not rendered`,
          facts: { ...t.facts, template: true },
        },
        neutral,
      );
  }
  const parts = splitConcatenatedJson(text);
  if (parts) {
    try {
      const docs = parts.map((p) => JSON.parse(p) as unknown);
      out.docs = docs;
      return keyed(
        result('partial', `JSON parser (${docs.length} concatenated documents)`, {
          facts: { documents: docs.length, topLevelKeys: cap(keys(docs[0])) },
        }),
      );
    } catch {
      // not a sequence of valid documents either: report the first error
    }
  }
  return r;
}

function readJsonDocument(
  path: string,
  text: string,
  role: string | undefined,
  language: string,
  out: { docs?: unknown[] } = {},
): StructuredResult {
  const method = 'JSON parser';
  let doc: unknown;
  const lenient =
    language !== 'JSON' || /(^|\/)(ts|js)config[^/]*\.json$|\.jsonc$|(^|\/)\.vscode\//.test(path);
  try {
    if (/\.jsonl$|\.ndjson$/.test(path)) {
      const rows = text.split('\n').filter((l) => l.trim());
      rows.forEach((l) => JSON.parse(l));
      return result('full', 'JSON Lines parser', { facts: { records: rows.length } });
    }
    doc = JSON.parse(lenient ? stripJsonComments(text) : text);
  } catch (e) {
    // Many tools accept comments in .json files; retry leniently before calling it a failure.
    try {
      doc = JSON.parse(stripJsonComments(text));
    } catch {
      return result('partial', method, {
        error: `invalid JSON: ${(e as Error).message.slice(0, 160)}`,
      });
    }
  }
  out.docs = [doc];
  const top = keys(doc);
  const facts: Record<string, unknown> = { topLevelKeys: cap(top) };
  const links: Link[] = [];
  if (role === 'npm-package' && isObj(doc)) {
    const deps = { ...(doc.dependencies as object), ...(doc.devDependencies as object) };
    facts.dependencies = Object.keys(deps).length;
    if (isObj(doc.scripts))
      for (const [name, cmd] of Object.entries(doc.scripts))
        if (typeof cmd === 'string')
          for (const ref of scriptRefs(cmd))
            links.push({
              kind: 'runs',
              target: ref,
              line: lineOf(text, `"${name}"`),
              detail: `npm script ${name}`,
            });
    return result('full', 'JSON parser (package.json)', { facts, links });
  }
  if (/(^|\/)(ts|js)config[^/]*\.json$/.test(path) && isObj(doc)) {
    for (const ext of strs(doc.extends))
      if (ext.startsWith('.'))
        links.push({ kind: 'includes', target: ext, line: lineOf(text, ext), detail: 'extends' });
    if (Array.isArray(doc.references))
      for (const r of doc.references)
        if (isObj(r) && typeof r.path === 'string')
          links.push({
            kind: 'includes',
            target: r.path,
            line: lineOf(text, r.path),
            detail: 'project reference',
            dir: !/\.json$/.test(r.path),
            defaultFile: ['tsconfig.json'],
          });
    facts.compilerOptions = cap(keys(doc.compilerOptions));
    return result('full', 'JSON parser (tsconfig)', { facts, links });
  }
  if (role === 'openapi' && isObj(doc)) return openApi(doc, text, 'JSON parser (OpenAPI)');
  if (role === 'json-schema' && isObj(doc)) {
    facts.properties = cap(keys(doc.properties));
    facts.definitions = cap([...keys(doc.definitions), ...keys(doc.$defs)]);
    return result('full', 'JSON parser (JSON Schema)', { facts });
  }
  if (language === 'Jupyter Notebook' && isObj(doc) && Array.isArray(doc.cells)) {
    const cells = doc.cells.filter(isObj);
    const meta = isObj(doc.metadata) ? doc.metadata : {};
    const lang = isObj(meta.kernelspec)
      ? meta.kernelspec.language
      : isObj(meta.language_info)
        ? meta.language_info.name
        : undefined;
    facts.cells = cells.length;
    facts.codeCells = cells.filter((c) => c.cell_type === 'code').length;
    facts.markdownCells = cells.filter((c) => c.cell_type === 'markdown').length;
    if (typeof lang === 'string') facts.kernelLanguage = lang;
    return result('full', 'JSON parser (Jupyter notebook)', { facts });
  }
  if (role === 'php-deps' && isObj(doc)) {
    facts.dependencies = keys(doc.require).length + keys(doc['require-dev']).length;
    return result('full', 'JSON parser (composer.json)', { facts });
  }
  if (role === 'app-config')
    return result('full', 'JSON parser (application settings: key names only)', { facts });
  if (role === 'kubernetes' || role === 'cloudformation')
    return result('full', `JSON parser (${role})`, { facts });
  if (role === 'lockfile' && isObj(doc)) {
    facts.lockedPackages =
      keys(doc.packages).length ||
      keys(doc.dependencies).length ||
      (Array.isArray(doc.pins) ? doc.pins.length : 0);
    return result('partial', 'Lockfile package counter', { facts });
  }
  if (
    /(^|\/)(turbo|nx|lerna|angular|vercel|firebase|app|renovate)\.json5?$|(^|\/)\.devcontainer/.test(
      path,
    )
  )
    return result('full', 'JSON parser (tool configuration: key names)', { facts });
  return result('partial', 'JSON parser (syntax and top-level keys only)', { facts });
}

function openApi(doc: Record<string, unknown>, text: string, method: string): StructuredResult {
  const symbols: StructSymbol[] = [];
  for (const [p, ops] of Object.entries(isObj(doc.paths) ? doc.paths : {}))
    for (const m of keys(ops))
      if (/^(get|put|post|delete|patch|options|head|trace)$/.test(m))
        symbols.push({
          name: `${m.toUpperCase()} ${p}`,
          kind: 'operation',
          line: lineOf(text, p) ?? 1,
        });
  const comps = isObj(doc.components) ? keys(doc.components.schemas) : keys(doc.definitions);
  return result('full', method, {
    facts: {
      version: String(doc.openapi ?? doc.swagger ?? ''),
      operations: symbols.length,
      schemas: cap(comps),
    },
    symbols: symbols.slice(0, 500),
  });
}

// ---------------------------------------------------------------- YAML

export function readYaml(path: string, text: string, role: string | undefined): StructuredResult {
  const out: { docs?: unknown[] } = {};
  const r = readYamlTemplated(path, text, role, out);
  return withKeys(r, out.docs ?? [], text, 'yaml', 'YAML parser');
}

function readYamlTemplated(
  path: string,
  text: string,
  role: string | undefined,
  out: { docs?: unknown[] },
): StructuredResult {
  if (role === 'helm-template' || /(?<!\$)\{\{[-\s]*[^}\s]|\{%-?\s*\w/.test(text)) {
    const r = readYamlDocument(path, neutraliseTemplates(text), role, out);
    if (r.error)
      return result('partial', 'Template (not rendered)', {
        skipReason: `Go/Helm/Jinja template syntax: not valid YAML even with its template tags replaced by placeholders (${r.error.slice(0, 100)}), so it is indexed as text`,
      });
    return {
      ...r,
      level: 'partial',
      method: `${r.method}; template placeholders not rendered`,
      facts: { ...r.facts, template: true },
    };
  }
  return readYamlDocument(path, text, role, out);
}

function readYamlDocument(
  path: string,
  text: string,
  role: string | undefined,
  out: { docs?: unknown[] } = {},
): StructuredResult {
  let docs;
  try {
    docs = parseAllDocuments(text, {
      strict: false,
      uniqueKeys: false,
      logLevel: 'silent',
      prettyErrors: false,
    });
  } catch (e) {
    return result('partial', 'YAML parser', {
      error: `YAML parse error: ${(e as Error).message.slice(0, 160)}`,
    });
  }
  const list = Array.isArray(docs) ? docs : [];
  const errors = list.flatMap((d) => d.errors);
  if (errors.length)
    return result('partial', 'YAML parser', {
      error: `YAML parse error: ${errors[0]?.message.split('\n')[0]?.slice(0, 160)}`,
    });
  const values = list
    .map((d) => d.toJS({ maxAliasCount: 100 }) as unknown)
    .filter((v) => v !== null && v !== undefined);
  out.docs = values;
  const first = values[0];
  const facts: Record<string, unknown> = {
    documents: values.length,
    topLevelKeys: cap(keys(first)),
  };
  const links: Link[] = [];
  const symbols: StructSymbol[] = [];

  if (role === 'docker-compose' && isObj(first) && isObj(first.services)) {
    const services = first.services;
    facts.services = cap(Object.keys(services));
    for (const [name, svcRaw] of Object.entries(services)) {
      const svc = isObj(svcRaw) ? svcRaw : {};
      const line = lineOf(text, `${name}:`);
      symbols.push({ name, kind: 'service', line: line ?? 1 });
      const build = svc.build;
      const ctx =
        typeof build === 'string'
          ? build
          : isObj(build) && typeof build.context === 'string'
            ? build.context
            : undefined;
      const df =
        isObj(build) && typeof build.dockerfile === 'string' ? build.dockerfile : undefined;
      if (ctx !== undefined) {
        if (df)
          links.push({
            kind: 'builds',
            target: `${ctx.replace(/\/$/, '')}/${df}`,
            line,
            detail: `service ${name}`,
          });
        else
          links.push({
            kind: 'builds',
            target: ctx,
            line,
            detail: `service ${name}`,
            dir: true,
            defaultFile: ['Dockerfile', 'Containerfile'],
          });
      }
      for (const f of strs(svc.env_file))
        links.push({
          kind: 'references',
          target: f,
          line: lineOf(text, f),
          detail: `service ${name} env_file`,
        });
    }
    facts.images = cap([
      ...new Set(
        Object.values(services).flatMap((s) =>
          isObj(s) && typeof s.image === 'string' ? [s.image] : [],
        ),
      ),
    ]);
    facts.dependsOn = Object.values(services).reduce<number>(
      (t, s) => t + (isObj(s) ? strs(s.depends_on).length + keys(s.depends_on).length : 0),
      0,
    );
    return result('full', 'YAML parser (Docker Compose)', { facts, links, symbols });
  }
  if (role === 'kubernetes') {
    const objects: string[] = [];
    const images = new Set<string>();
    const refs = new Set<string>();
    const walkImages = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walkImages);
      else if (isObj(v)) {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'image' && typeof x === 'string') images.add(x);
          else if (
            (k === 'configMapRef' ||
              k === 'secretRef' ||
              k === 'configMapKeyRef' ||
              k === 'secretKeyRef' ||
              k === 'configMap' ||
              k === 'secret') &&
            isObj(x)
          ) {
            const n = x.name ?? x.secretName;
            if (typeof n === 'string')
              refs.add(`${k.startsWith('secret') ? 'Secret' : 'ConfigMap'}/${n}`);
          } else walkImages(x);
        }
      }
    };
    for (const d of values) {
      if (!isObj(d) || typeof d.kind !== 'string') continue;
      const name =
        isObj(d.metadata) && typeof d.metadata.name === 'string' ? d.metadata.name : '(unnamed)';
      objects.push(`${d.kind}/${name}`);
      symbols.push({
        name: `${d.kind}/${name}`,
        kind: 'k8s-object',
        line: lineOf(text, `name: ${name}`) ?? 1,
      });
      walkImages(d.spec);
    }
    facts.objects = cap(objects);
    facts.images = cap([...images]);
    facts.references = cap([...refs]);
    return result('full', 'YAML parser (Kubernetes manifest)', { facts, symbols });
  }
  if (role === 'github-actions' && isObj(first)) {
    const jobs = isObj(first.jobs) ? first.jobs : {};
    facts.jobs = cap(Object.keys(jobs));
    facts.triggers = cap(
      typeof first.on === 'string'
        ? [first.on]
        : Array.isArray(first.on)
          ? strs(first.on)
          : keys(first.on ?? first[true as unknown as string]),
    );
    const actions = new Set<string>();
    for (const [jobName, jobRaw] of Object.entries(jobs)) {
      const job = isObj(jobRaw) ? jobRaw : {};
      symbols.push({ name: jobName, kind: 'ci-job', line: lineOf(text, `${jobName}:`) ?? 1 });
      if (typeof job.uses === 'string') {
        actions.add(job.uses);
        if (job.uses.startsWith('./'))
          links.push({
            kind: 'includes',
            target: job.uses.replace(/@.*$/, ''),
            line: lineOf(text, job.uses),
            detail: `job ${jobName}`,
          });
      }
      for (const step of Array.isArray(job.steps) ? job.steps.filter(isObj) : []) {
        if (typeof step.uses === 'string') {
          actions.add(step.uses.replace(/@.*$/, ''));
          if (step.uses.startsWith('./'))
            links.push({
              kind: 'includes',
              target: step.uses,
              line: lineOf(text, step.uses),
              detail: `job ${jobName}`,
              dir: true,
              defaultFile: ['action.yml', 'action.yaml'],
            });
        }
        if (typeof step.run === 'string')
          for (const ref of scriptRefs(step.run))
            links.push({
              kind: 'runs',
              target: ref,
              line: lineOf(text, ref),
              detail: `job ${jobName}`,
            });
      }
    }
    facts.actions = cap([...actions]);
    return result('full', 'YAML parser (GitHub Actions)', { facts, links, symbols });
  }
  if (role === 'gitlab-ci' && isObj(first)) {
    const reserved = new Set([
      'stages',
      'variables',
      'default',
      'include',
      'workflow',
      'image',
      'services',
      'cache',
      'before_script',
      'after_script',
    ]);
    const jobs = Object.keys(first).filter((k) => !reserved.has(k) && !k.startsWith('.'));
    facts.jobs = cap(jobs);
    facts.stages = cap(strs(first.stages));
    for (const inc of Array.isArray(first.include) ? first.include : [first.include]) {
      const local =
        typeof inc === 'string'
          ? inc
          : isObj(inc) && typeof inc.local === 'string'
            ? inc.local
            : undefined;
      if (local && !/^https?:/.test(local))
        links.push({
          kind: 'includes',
          target: local.replace(/^\//, ''),
          line: lineOf(text, local),
          detail: 'include',
        });
    }
    for (const j of jobs) {
      symbols.push({ name: j, kind: 'ci-job', line: lineOf(text, `${j}:`) ?? 1 });
      const job = first[j];
      if (isObj(job))
        for (const cmd of [...strs(job.script), ...strs(job.before_script)])
          for (const ref of scriptRefs(cmd))
            links.push({ kind: 'runs', target: ref, line: lineOf(text, ref), detail: `job ${j}` });
    }
    return result('full', 'YAML parser (GitLab CI)', { facts, links, symbols });
  }
  if (['circleci', 'azure-pipelines', 'bitbucket', 'travis', 'other-ci'].includes(role ?? '')) {
    const all = JSON.stringify(values);
    for (const ref of scriptRefs(all.replace(/\\n/g, '\n').replace(/[",]/g, ' ')))
      links.push({ kind: 'runs', target: ref, line: lineOf(text, ref) });
    return result('full', `YAML parser (${role})`, { facts, links: links.slice(0, MAX_LIST) });
  }
  if ((role === 'openapi' || role === 'asyncapi') && isObj(first))
    return openApi(first, text, `YAML parser (${role === 'openapi' ? 'OpenAPI' : 'AsyncAPI'})`);
  if (role === 'helm' && isObj(first)) {
    facts.chart = typeof first.name === 'string' ? first.name : undefined;
    facts.dependencies = cap(
      Array.isArray(first.dependencies)
        ? first.dependencies.filter(isObj).map((d) => String(d.name))
        : [],
    );
    return result('full', 'YAML parser (Helm chart)', { facts });
  }
  if (role === 'kustomize' && isObj(first)) {
    for (const r of [
      ...strs(first.resources),
      ...strs(first.bases),
      ...strs(first.components),
      ...strs(first.patchesStrategicMerge),
    ])
      if (!/^https?:|^github\.com/.test(r))
        links.push({
          kind: 'includes',
          target: r,
          line: lineOf(text, r),
          dir: !/\.ya?ml$/.test(r),
          defaultFile: ['kustomization.yaml', 'kustomization.yml'],
        });
    return result('full', 'YAML parser (Kustomize)', { facts, links });
  }
  if ((role === 'ansible' || role === 'ansible-play') && Array.isArray(first)) {
    const plays = first.filter(isObj);
    facts.plays = plays.length;
    facts.roles = cap(
      plays.flatMap((p) =>
        Array.isArray(p.roles)
          ? p.roles.map((r) => (isObj(r) ? String(r.role ?? r.name) : String(r)))
          : [],
      ),
    );
    for (const p of plays)
      if (typeof p.import_playbook === 'string')
        links.push({
          kind: 'includes',
          target: p.import_playbook,
          line: lineOf(text, p.import_playbook),
        });
    return result('full', 'YAML parser (Ansible)', { facts, links });
  }
  if (role === 'cloudformation' && isObj(first)) {
    const res = isObj(first.Resources) ? first.Resources : {};
    facts.resourceTypes = cap([
      ...new Set(
        Object.values(res).flatMap((r) => (isObj(r) && typeof r.Type === 'string' ? [r.Type] : [])),
      ),
    ]);
    for (const [n, r] of Object.entries(res))
      symbols.push({
        name: n,
        kind: isObj(r) ? String(r.Type) : 'resource',
        line: lineOf(text, `${n}:`) ?? 1,
      });
    return result('full', 'YAML parser (CloudFormation)', {
      facts,
      symbols: symbols.slice(0, 500),
    });
  }
  if (
    role === 'dbt' ||
    role === 'dart-deps' ||
    role === 'app-config' ||
    role === 'compiler-config' ||
    role === 'repo-meta' ||
    role === 'skaffold' ||
    role === 'serverless' ||
    role === 'pulumi' ||
    role === 'liquibase' ||
    role === 'js-build' ||
    role === 'python-deps' ||
    role === 'haskell-deps'
  )
    return result('full', `YAML parser (${role}: key names)`, { facts });
  if (role === 'lockfile' && isObj(first)) {
    facts.lockedPackages = keys(first.packages).length || keys(first.importers).length;
    return result('partial', 'Lockfile package counter', { facts });
  }
  return result('partial', 'YAML parser (syntax and top-level keys only)', { facts });
}

// ---------------------------------------------------------------- TOML

export function readToml(path: string, text: string): StructuredResult {
  const out: { docs?: unknown[] } = {};
  return withKeys(readTomlDocument(path, text, out), out.docs ?? [], text, 'toml', 'TOML parser');
}

function readTomlDocument(path: string, text: string, out: { docs?: unknown[] }): StructuredResult {
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(text) as Record<string, unknown>;
  } catch (e) {
    return result('partial', 'TOML parser', {
      error: `TOML parse error: ${(e as Error).message.split('\n')[0]?.slice(0, 160)}`,
    });
  }
  out.docs = [doc];
  const facts: Record<string, unknown> = { tables: cap(Object.keys(doc)) };
  const links: Link[] = [];
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base === 'Cargo.toml') {
    facts.dependencies = keys(doc.dependencies).length + keys(doc['dev-dependencies']).length;
    const ws = isObj(doc.workspace) ? doc.workspace : {};
    for (const m of strs(ws.members))
      if (!m.includes('*'))
        links.push({
          kind: 'includes',
          target: m,
          line: lineOf(text, `"${m}"`),
          dir: true,
          defaultFile: ['Cargo.toml'],
          detail: 'workspace member',
        });
    for (const [n, d] of Object.entries(isObj(doc.dependencies) ? doc.dependencies : {}))
      if (isObj(d) && typeof d.path === 'string')
        links.push({
          kind: 'includes',
          target: d.path,
          line: lineOf(text, d.path),
          dir: true,
          defaultFile: ['Cargo.toml'],
          detail: `path dependency ${n}`,
        });
    return result('full', 'TOML parser (Cargo manifest)', { facts, links });
  }
  if (base === 'pyproject.toml') {
    const project = isObj(doc.project) ? doc.project : {};
    const poetry = isObj(doc.tool) && isObj(doc.tool.poetry) ? doc.tool.poetry : {};
    facts.dependencies = strs(project.dependencies).length + keys(poetry.dependencies).length;
    facts.tools = cap(keys(doc.tool));
    return result('full', 'TOML parser (pyproject)', { facts });
  }
  if (
    base === 'Pipfile' ||
    base === 'Project.toml' ||
    base === 'gleam.toml' ||
    base === 'netlify.toml' ||
    base === 'pants.toml' ||
    /(^|\/)gradle\/libs\.versions\.toml$/.test(path)
  ) {
    facts.dependencies =
      keys(doc.packages).length +
      keys(doc.deps).length +
      keys(doc.dependencies).length +
      keys(doc.libraries).length;
    return result('full', `TOML parser (${base})`, { facts });
  }
  if (/(^|\/)(Cargo|poetry|uv|pdm|Manifest)\.lock$|Manifest\.toml$/.test(path)) {
    facts.lockedPackages = Array.isArray(doc.package) ? doc.package.length : keys(doc.deps).length;
    return result('partial', 'Lockfile package counter', { facts });
  }
  return result('partial', 'TOML parser (syntax and tables only)', { facts });
}

// ---------------------------------------------------------------- XML

interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlEl[];
  line: number;
}

/**
 * A bounded XML element scanner: elements, attributes and text, with a well-formedness check
 * (every start tag closed in order). DTDs and entities are skipped, never expanded, so there
 * is no entity-expansion or external-entity risk.
 */
export function scanXml(text: string): { root?: XmlEl; error?: string } {
  const stack: XmlEl[] = [];
  let root: XmlEl | undefined;
  let line = 1;
  let i = 0;
  const n = text.length;
  const adv = (to: number) => {
    for (let k = i; k < to && k < n; k++) if (text.charCodeAt(k) === 10) line++;
    i = to;
  };
  let elements = 0;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      if (stack.length) (stack[stack.length - 1] as XmlEl).text += text.slice(i).trim();
      break;
    }
    if (stack.length && lt > i) {
      const top = stack[stack.length - 1] as XmlEl;
      if (top.text.length < 500) top.text += text.slice(i, lt).trim();
    }
    adv(lt);
    if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i);
      if (e < 0) return { error: `unterminated comment at line ${line}` };
      adv(e + 3);
    } else if (text.startsWith('<![CDATA[', i)) {
      const e = text.indexOf(']]>', i);
      if (e < 0) return { error: `unterminated CDATA at line ${line}` };
      adv(e + 3);
    } else if (text.startsWith('<?', i)) {
      const e = text.indexOf('?>', i);
      if (e < 0) return { error: `unterminated processing instruction at line ${line}` };
      adv(e + 2);
    } else if (text.startsWith('<!', i)) {
      // DOCTYPE (possibly with an internal subset): skipped, never expanded.
      let depth = 0;
      let k = i + 2;
      for (; k < n; k++) {
        const c = text[k];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      adv(k + 1);
    } else if (text[i + 1] === '/') {
      const e = text.indexOf('>', i);
      if (e < 0) return { error: `unterminated end tag at line ${line}` };
      const name = text.slice(i + 2, e).trim();
      const top = stack.pop();
      if (!top || top.name !== name)
        return {
          error: `end tag </${name}> does not match <${top?.name ?? '(none)'}> at line ${line}`,
        };
      adv(e + 1);
    } else {
      // Start tag; attribute values may contain '>' inside quotes.
      let k = i + 1;
      let q = '';
      for (; k < n; k++) {
        const c = text[k] as string;
        if (q) {
          if (c === q) q = '';
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
      }
      if (k >= n) return { error: `unterminated start tag at line ${line}` };
      const raw = text.slice(i + 1, k);
      const selfClose = raw.endsWith('/');
      const body = selfClose ? raw.slice(0, -1) : raw;
      const nm = /^([^\s/>]+)/.exec(body)?.[1];
      if (!nm) return { error: `malformed tag at line ${line}` };
      const attrs: Record<string, string> = {};
      for (const m of body.slice(nm.length).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g))
        attrs[m[1] as string] = (m[3] ?? m[4] ?? '').slice(0, 300);
      const el: XmlEl = { name: nm, attrs, text: '', children: [], line };
      if (++elements > 200_000) return { error: 'more than 200,000 elements' };
      if (stack.length) (stack[stack.length - 1] as XmlEl).children.push(el);
      else if (!root) root = el;
      else return { error: `second root element <${nm}> at line ${line}` };
      if (!selfClose) stack.push(el);
      adv(k + 1);
    }
  }
  if (stack.length) return { error: `<${stack[stack.length - 1]?.name}> is never closed` };
  if (!root) return { error: 'no root element' };
  return { root };
}

const local = (n: string) => n.slice(n.indexOf(':') + 1);
const kids = (el: XmlEl | undefined, name: string) =>
  el ? el.children.filter((c) => local(c.name) === name) : [];
const kid = (el: XmlEl | undefined, name: string) => kids(el, name)[0];

/** Liquibase changes the schema reader applies (packages/orm, readLiquibaseTree). */
const LIQUIBASE_APPLIED = new Set([
  'createTable',
  'addColumn',
  'addForeignKeyConstraint',
  'dropTable',
  'renameTable',
  'dropColumn',
  'renameColumn',
  'addPrimaryKey',
  'addNotNullConstraint',
  'addUniqueConstraint',
]);
/** Liquibase changes that move data or mark the log, not the schema. */
const LIQUIBASE_DATA = new Set([
  'insert',
  'update',
  'delete',
  'loadData',
  'loadUpdateData',
  'tagDatabase',
  'output',
  'empty',
  'stop',
  'comment',
  'rollback',
  'preConditions',
  'validCheckSum',
]);

/** A fully qualified class name: `com.acme.Svc`, `com.acme.Outer$Inner`. */
const CLASS_NAME = /^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*\.[A-Z]\w*(?:\$\w+)?$/;

interface XmlTreeOptions {
  /** Names an element specially (a Maven dependency, a Spring bean…); otherwise `element`. */
  kindOf?: (el: XmlEl) => { kind: string; name?: string } | undefined;
}

/**
 * Every element of an XML document, nested, as symbols named by tag (and `id`, `name` or
 * `key` attribute when there is one), plus a `references` link for every attribute value or
 * text that is a fully qualified class name, so configuration points at the code it names.
 */
function xmlTree(
  root: XmlEl,
  opts: XmlTreeOptions = {},
): { symbols: StructSymbol[]; links: Link[]; complete: boolean } {
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  let complete = true;
  // Past the limit, plain elements are skipped but named ones (dependencies, plugins, beans…)
  // are still read, under their nearest recorded ancestor.
  const visit = (el: XmlEl, name: string, parent: string | undefined, depth: number) => {
    const special = opts.kindOf?.(el);
    const own = special?.name ?? name;
    const room = symbols.length < MAX_TREE_SYMBOLS;
    let dotted = parent;
    if (room || (special && symbols.length < MAX_TREE_SYMBOLS * 2)) {
      symbols.push({
        name: own,
        kind: special?.kind ?? 'element',
        line: el.line,
        ...(parent ? { parent } : {}),
      });
      dotted = parent ? `${parent}.${own}` : own;
    } else complete = false;
    if (!room) complete = false;
    const tag = local(el.name);
    const named = (v: string, where: string) => {
      if (CLASS_NAME.test(v.trim()))
        links.push({
          kind: 'references',
          target: v.trim(),
          classRef: true,
          line: el.line,
          ...(dotted ? { fromSymbol: dotted } : {}),
          detail: `class named in <${tag}${where}>`,
        });
    };
    for (const [a, v] of Object.entries(el.attrs)) named(v, ` ${a}`);
    if (!el.children.length && el.text) named(el.text, '');
    if (depth + 1 >= MAX_TREE_DEPTH) {
      if (el.children.length) complete = false;
      return;
    }
    const seen = new Map<string, number>();
    for (const c of el.children) {
      const ident = c.attrs.id ?? c.attrs.name ?? c.attrs.key ?? c.attrs['android:name'];
      const base = `${local(c.name)}${ident ? `[${ident}]` : ''}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      visit(c, n > 1 ? `${base}[${n}]` : base, dotted, depth + 1);
    }
  };
  visit(root, local(root.name), undefined, 0);
  return { symbols, links, complete };
}

/** The XML reader's method text, with how much of the element tree was read. */
function treeMethod(what: string, complete: boolean): string {
  return `XML element scanner (${what}; ${complete ? 'every element, nested' : `first ${MAX_TREE_SYMBOLS} elements, ${MAX_TREE_DEPTH} levels deep`})`;
}

export function readXml(path: string, text: string, role: string | undefined): StructuredResult {
  const { root, error } = scanXml(text);
  if (error || !root)
    return result('partial', 'XML element scanner', { error: `XML is not well-formed: ${error}` });
  const facts: Record<string, unknown> = { root: root.name };
  const links: Link[] = [];
  const symbols: StructSymbol[] = [];
  const rootName = local(root.name);
  if (rootName === 'project' && (role === 'maven' || kid(root, 'artifactId'))) {
    facts.groupId = kid(root, 'groupId')?.text || kid(kid(root, 'parent'), 'groupId')?.text;
    facts.artifactId = kid(root, 'artifactId')?.text;
    facts.packaging = kid(root, 'packaging')?.text || 'jar';
    const parent = kid(root, 'parent');
    const rel = kid(parent, 'relativePath')?.text;
    if (parent) facts.parent = `${kid(parent, 'groupId')?.text}:${kid(parent, 'artifactId')?.text}`;
    if (rel)
      links.push({
        kind: 'includes',
        target: rel,
        line: kid(parent, 'relativePath')?.line,
        detail: 'parent POM',
        dir: !/\.xml$/.test(rel),
        defaultFile: ['pom.xml'],
      });
    for (const m of kids(kid(root, 'modules'), 'module'))
      links.push({
        kind: 'includes',
        target: m.text,
        line: m.line,
        detail: 'module',
        dir: !/\.xml$/.test(m.text),
        defaultFile: ['pom.xml'],
      });
    const deps = [
      ...kids(kid(root, 'dependencies'), 'dependency'),
      ...kids(kid(kid(root, 'dependencyManagement'), 'dependencies'), 'dependency'),
    ];
    facts.dependencies = deps.length;
    facts.dependencyNames = cap(
      deps.map((d) => `${kid(d, 'groupId')?.text}:${kid(d, 'artifactId')?.text}`),
    );
    facts.modules = kids(kid(root, 'modules'), 'module').length;
    const coord = (el: XmlEl) =>
      [kid(el, 'groupId')?.text, kid(el, 'artifactId')?.text].filter(Boolean).join(':');
    const tree = xmlTree(root, {
      kindOf: (el) => {
        const t = local(el.name);
        if (t === 'dependency' && kid(el, 'artifactId'))
          return { kind: 'dependency', name: coord(el) };
        if ((t === 'plugin' || t === 'extension') && kid(el, 'artifactId'))
          return { kind: 'plugin', name: coord(el) };
        if (t === 'profile')
          return { kind: 'profile', name: `profile[${kid(el, 'id')?.text ?? ''}]` };
        if (t === 'execution' && kid(el, 'id'))
          return { kind: 'task', name: `execution[${kid(el, 'id')?.text}]` };
        return undefined;
      },
    });
    return result(tree.complete ? 'full' : 'partial', treeMethod('Maven POM', tree.complete), {
      facts,
      links: [...links, ...tree.links],
      symbols: tree.symbols,
    });
  }
  if (role === 'dotnet-project' && (rootName === 'Project' || rootName === 'Solution')) {
    const items = root.children
      .filter((c) => local(c.name) === 'ItemGroup')
      .flatMap((g) => g.children);
    const pkgs = items.filter((c) => local(c.name) === 'PackageReference');
    facts.packages = cap(pkgs.map((p) => p.attrs.Include ?? p.attrs.Update ?? ''));
    facts.sdk = root.attrs.Sdk;
    for (const p of items.filter((c) => local(c.name) === 'ProjectReference'))
      if (p.attrs.Include)
        links.push({
          kind: 'includes',
          target: p.attrs.Include.replace(/\\/g, '/'),
          line: p.line,
          detail: 'project reference',
        });
    for (const p of root.children.filter((c) => local(c.name) === 'Import'))
      if (p.attrs.Project && !p.attrs.Project.includes('$('))
        links.push({
          kind: 'includes',
          target: p.attrs.Project.replace(/\\/g, '/'),
          line: p.line,
          detail: 'import',
        });
    const tree = xmlTree(root, {
      kindOf: (el) => {
        const t = local(el.name);
        if (t === 'PackageReference' && (el.attrs.Include ?? el.attrs.Update))
          return { kind: 'dependency', name: el.attrs.Include ?? el.attrs.Update };
        if (t === 'Target' && el.attrs.Name)
          return { kind: 'task', name: `Target[${el.attrs.Name}]` };
        return undefined;
      },
    });
    return result(tree.complete ? 'full' : 'partial', treeMethod('.NET project', tree.complete), {
      facts,
      links: [...links, ...tree.links],
      symbols: tree.symbols,
    });
  }
  if (rootName === 'manifest' && /AndroidManifest\.xml$/.test(path)) {
    const app = kid(root, 'application');
    facts.package = root.attrs.package;
    facts.permissions = kids(root, 'uses-permission').length;
    for (const k of ['activity', 'service', 'receiver', 'provider'])
      for (const c of kids(app, k))
        symbols.push({
          name: c.attrs['android:name'] ?? '(unnamed)',
          kind: `android-${k}`,
          line: c.line,
        });
    return result('full', 'XML element scanner (Android manifest)', { facts, symbols });
  }
  if (rootName === 'databaseChangeLog') {
    const sets = kids(root, 'changeSet');
    facts.changeSets = sets.length;
    for (const inc of kids(root, 'include'))
      if (inc.attrs.file)
        links.push({
          kind: 'includes',
          target: inc.attrs.file,
          line: inc.line,
          detail: 'changelog include',
        });
    for (const inc of kids(root, 'includeAll'))
      if (inc.attrs.path)
        links.push({
          kind: 'includes',
          target: inc.attrs.path,
          line: inc.line,
          detail: 'changelog includeAll',
          dir: true,
          defaultFile: [],
        });
    const changes = sets.flatMap((s) =>
      s.children.flatMap((c) => (local(c.name) === 'changes' ? c.children : [c])),
    );
    facts.tablesCreated = cap(
      changes
        .filter((c) => local(c.name) === 'createTable' && c.attrs.tableName)
        .map((c) => c.attrs.tableName as string),
    );
    const tree = xmlTree(root);
    // The Liquibase schema reader (packages/orm) applies these to the database schema; any
    // other schema change is read as elements here but not applied, so the file is partial.
    const notApplied = [
      ...new Set(
        changes
          .map((c) => local(c.name))
          .filter((n) => !LIQUIBASE_APPLIED.has(n) && !LIQUIBASE_DATA.has(n)),
      ),
    ];
    const what = notApplied.length
      ? `Liquibase changelog; ${notApplied.slice(0, 6).join(', ')}${notApplied.length > 6 ? '…' : ''} not applied to the schema`
      : 'Liquibase changelog; every change applied to the schema';
    return result(
      tree.complete && !notApplied.length ? 'full' : 'partial',
      treeMethod(what, tree.complete),
      {
        facts,
        links: [...links, ...tree.links],
        symbols: tree.symbols,
      },
    );
  }
  if (rootName === 'project' && kids(root, 'target').length) {
    for (const t of kids(root, 'target'))
      symbols.push({ name: t.attrs.name ?? '(unnamed)', kind: 'build-target', line: t.line });
    for (const t of kids(root, 'import'))
      if (t.attrs.file) links.push({ kind: 'includes', target: t.attrs.file, line: t.line });
    return result('full', 'XML element scanner (Ant build)', { facts, links, symbols });
  }
  // Any other XML: every element, with Spring beans, servlets and filters named, and class
  // names linked to their source.
  const SPRING = new Set(['bean', 'servlet', 'filter', 'listener', 'persistence-unit']);
  const tree = xmlTree(root, {
    kindOf: (el) => (SPRING.has(local(el.name)) ? { kind: 'bean' } : undefined),
  });
  facts.elements = tree.symbols.length;
  if (rootName === 'hibernate-mapping')
    // The mapping's elements are read, but its tables and columns are not added to the schema.
    return result(
      'partial',
      `${treeMethod('Hibernate mapping', tree.complete).slice(0, -1)}; tables and columns not read into the database schema)`,
      { facts, links: tree.links, symbols: tree.symbols },
    );
  const known =
    rootName === 'beans' ||
    rootName === 'web-app' ||
    rootName === 'persistence' ||
    rootName === 'configuration' ||
    rootName === 'plist' ||
    rootName === 'svg' ||
    rootName === 'module' ||
    rootName === 'resources';
  return result(
    tree.complete ? 'full' : 'partial',
    treeMethod(known ? rootName : 'generic XML', tree.complete),
    {
      facts,
      links: tree.links,
      symbols: tree.symbols,
    },
  );
}

// ---------------------------------------------------------------- Gradle

/** The bodies of every `name { … }` block, with their offsets (braces in strings ignored). */
function blocksNamed(text: string, name: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = new RegExp(`(^|[^\\w.])${name}\\s*\\{`, 'g');
  for (const m of text.matchAll(re)) {
    const open = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let q = '';
    let k = open;
    for (; k < text.length && depth; k++) {
      const c = text[k];
      if (q) {
        if (c === '\\') k++;
        else if (c === q) q = '';
      } else if (c === '"' || c === "'") q = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    out.push({ start: open, end: k - 1 });
  }
  return out;
}

/** `:a:b` → `a/b`, the conventional folder of a Gradle project path. */
const projectDir = (p: string) => p.replace(/^:/, '').replace(/:/g, '/');
const GRADLE_BUILD = ['build.gradle', 'build.gradle.kts'];

/**
 * Gradle build and settings scripts (Groovy or Kotlin DSL), read by patterns on top of the
 * syntax parse: plugins, dependencies (coordinates, version-catalog aliases and project
 * dependencies, which link to that project's build file), tasks, included projects and
 * applied scripts. A dependency or plugin added by code the patterns do not recognise (a
 * loop, a helper function) is not seen.
 */
export function readGradle(path: string, rawText: string): StructuredResult {
  // Comments blanked (lines kept) so commented-out dependencies are not read.
  const text = rawText
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'])\/\/[^\n]*/g, (c, p: string) => p + ' '.repeat(c.length - p.length));
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  const seen = new Set<string>();
  const lineAt = (i: number) => lineAtOffset(text, i);
  /** Offset of a match's first non-blank character (patterns start with `^\s*`). */
  const startOf = (m: RegExpMatchArray, base = 0) =>
    base + (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
  const add = (name: string, kind: string, at: number) => {
    const k = `${kind}|${name}`;
    if (seen.has(k) || symbols.length >= MAX_TREE_SYMBOLS) return;
    seen.add(k);
    symbols.push({ name, kind, line: lineAt(at) });
  };
  for (const b of blocksNamed(text, 'plugins')) {
    const body = text.slice(b.start, b.end);
    for (const m of body.matchAll(
      /\bid\s*\(?\s*["']([^"']+)["']|\bkotlin\s*\(\s*["']([^"']+)["']\s*\)|\balias\s*\(\s*([\w.]+)\s*\)|`([\w-]+)`|^\s*([a-z][\w-]*)\s*$/gm,
    )) {
      const name = m[1] ?? (m[2] ? `org.jetbrains.kotlin.${m[2]}` : (m[3] ?? m[4] ?? m[5]));
      if (name && name !== 'version' && name !== 'apply') add(name, 'plugin', startOf(m, b.start));
    }
  }
  for (const m of text.matchAll(/\bapply\s*\(?\s*plugin\s*[:=]\s*["']([^"']+)["']/g))
    add(m[1] as string, 'plugin', m.index ?? 0);
  for (const m of text.matchAll(/\bapply\s*\(?\s*from\s*[:=]\s*["']([^"'$]+)["']/g))
    links.push({
      kind: 'includes',
      target: m[1] as string,
      line: lineAt(m.index ?? 0),
      detail: 'applied script',
    });
  for (const b of blocksNamed(text, 'dependencies')) {
    const body = text.slice(b.start, b.end);
    for (const m of body.matchAll(
      /^\s*(\w+)\s*\(?\s*(?:platform\s*\(|enforcedPlatform\s*\()?\s*["']([^"':$]+):([^"':$]+)(?::[^"']*)?["']/gm,
    ))
      add(`${m[2]}:${m[3]}`, 'dependency', startOf(m, b.start));
    for (const m of body.matchAll(
      /^\s*(\w+)\s*\(?\s*group\s*[:=]\s*["']([^"']+)["']\s*,\s*name\s*[:=]\s*["']([^"']+)["']/gm,
    ))
      add(`${m[2]}:${m[3]}`, 'dependency', startOf(m, b.start));
    for (const m of body.matchAll(/^\s*(\w+)\s*\(?\s*(?:platform\s*\()?\s*(libs\.[\w.]+)/gm))
      add(m[2] as string, 'dependency', startOf(m, b.start));
    for (const m of body.matchAll(
      /^\s*(\w+)\s*\(?\s*(?:platform\s*\()?\s*project\s*\(\s*(?:path\s*[:=]\s*)?["'](:[^"']*)["']/gm,
    )) {
      const p = m[2] as string;
      add(`project ${p}`, 'dependency', startOf(m, b.start));
      if (p !== ':')
        links.push({
          kind: 'references',
          target: projectDir(p),
          line: lineAt(startOf(m, b.start)),
          detail: `${m[1]} dependency on project ${p}`,
          dir: true,
          defaultFile: GRADLE_BUILD,
          fromSymbol: `project ${p}`,
        });
    }
  }
  for (const m of text.matchAll(
    /\btask\s+([A-Za-z_][\w-]*)|\btask\s*\(\s*["']([^"']+)["']|\btasks\s*\.\s*(?:register|create)\s*(?:<[^>]*>)?\s*\(\s*["']([^"']+)["']|\bval\s+(\w+)\s+by\s+tasks\s*\.\s*(?:registering|creating)/g,
  ))
    add((m[1] ?? m[2] ?? m[3] ?? m[4]) as string, 'task', m.index ?? 0);
  const facts: Record<string, unknown> = {
    plugins: cap(symbols.filter((x) => x.kind === 'plugin').map((x) => x.name)),
    dependencies: symbols.filter((x) => x.kind === 'dependency').length,
    tasks: cap(symbols.filter((x) => x.kind === 'task').map((x) => x.name)),
  };
  if (/(^|\/)settings\.gradle(\.kts)?$/.test(path)) {
    const projects: string[] = [];
    for (const m of text.matchAll(/\binclude\s*\(?([^\n)]*)/g))
      for (const q of (m[1] ?? '').matchAll(/["'](:?[^"']+)["']/g)) {
        const p = q[1] as string;
        projects.push(p);
        add(`project ${p.startsWith(':') ? p : `:${p}`}`, 'build-module', m.index ?? 0);
        links.push({
          kind: 'includes',
          target: projectDir(p),
          line: lineAt(m.index ?? 0),
          detail: `included project ${p}`,
          dir: true,
          defaultFile: GRADLE_BUILD,
        });
      }
    for (const m of text.matchAll(/\bincludeBuild\s*\(?\s*["']([^"']+)["']/g))
      links.push({
        kind: 'includes',
        target: m[1] as string,
        line: lineAt(m.index ?? 0),
        detail: 'included build',
        dir: true,
        defaultFile: ['settings.gradle', 'settings.gradle.kts', ...GRADLE_BUILD],
      });
    const root = /\brootProject\.name\s*=\s*["']([^"']+)["']/.exec(text);
    if (root) facts.rootProject = root[1];
    facts.projects = cap(projects);
  }
  return result('partial', 'Gradle plugins, dependencies and tasks (patterns)', {
    facts,
    links,
    symbols,
  });
}

// ---------------------------------------------------------------- go.mod / go.work, requirements.txt

/** go.mod and go.work: module path, Go version, requirements, replacements and workspace members. */
export function readGoMod(text: string): StructuredResult {
  const facts: Record<string, unknown> = {};
  const links: Link[] = [];
  const requires: string[] = [];
  let block: string | null = null;
  let unknown = 0;
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) return;
    if (block) {
      if (line === ')') block = null;
      else if (block === 'require') requires.push(line.split(/\s+/)[0] as string);
      else if (block === 'use')
        links.push({
          kind: 'includes',
          target: line.replace(/"/g, ''),
          line: i + 1,
          detail: 'go.work use',
          dir: true,
          defaultFile: ['go.mod'],
        });
      return;
    }
    const m = /^(module|go|toolchain|require|replace|exclude|retract|use|godebug)\b\s*(.*)$/.exec(
      line,
    );
    if (!m) {
      unknown++;
      return;
    }
    const [, kw, rest = ''] = m;
    if (rest === '(') {
      block = kw as string;
      return;
    }
    if (kw === 'module') facts.module = rest.replace(/"/g, '');
    else if (kw === 'go') facts.go = rest;
    else if (kw === 'require') requires.push(rest.split(/\s+/)[0] as string);
    else if (kw === 'use')
      links.push({
        kind: 'includes',
        target: rest.replace(/"/g, ''),
        line: i + 1,
        detail: 'go.work use',
        dir: true,
        defaultFile: ['go.mod'],
      });
    else if (kw === 'replace') {
      const to = /=>\s*(\S+)/.exec(rest)?.[1];
      if (to?.startsWith('.'))
        links.push({
          kind: 'includes',
          target: to,
          line: i + 1,
          detail: 'replace',
          dir: true,
          defaultFile: ['go.mod'],
        });
    }
  });
  facts.requires = requires.length;
  facts.requireNames = cap(requires);
  // Every directive understood: the whole file was read; otherwise only part of it.
  return result(unknown ? 'partial' : 'full', 'go.mod directive reader', { facts, links });
}

/** Visual Studio solution files (a line format, not XML): the projects they include. */
export function readSln(text: string): StructuredResult {
  const links: Link[] = [];
  const projects: string[] = [];
  text.split('\n').forEach((raw, i) => {
    const m = /^Project\("\{[^}]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)"/.exec(raw.trim());
    if (!m) return;
    projects.push(m[1] as string);
    const path = (m[2] as string).replace(/\\/g, '/');
    // Solution folders repeat their name as the path; only real project files are links.
    if (/\.\w+proj$/i.test(path))
      links.push({ kind: 'includes', target: path, line: i + 1, detail: `project ${m[1]}` });
  });
  if (!/Microsoft Visual Studio Solution File/.test(text))
    return result('partial', 'Visual Studio solution reader', {
      error: 'no "Microsoft Visual Studio Solution File" header',
    });
  return result('full', 'Visual Studio solution reader', {
    facts: { projects: projects.length, projectNames: cap(projects) },
    links,
  });
}

/** pip requirements files: one requirement per line, with -r includes. */
export function readRequirements(text: string): StructuredResult {
  const names: string[] = [];
  const links: Link[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) return;
    const inc = /^(?:-r|--requirement|-c|--constraint)\s+(\S+)/.exec(line);
    if (inc?.[1])
      links.push({ kind: 'includes', target: inc[1], line: i + 1, detail: 'requirements include' });
    else if (!line.startsWith('-')) names.push(line.split(/[\s;<>=!~[@]/)[0] as string);
  });
  return result('full', 'pip requirements reader', {
    facts: { requirements: names.length, requirementNames: cap(names) },
    links,
  });
}

// ---------------------------------------------------------------- INI / properties / .env templates

export function readIni(text: string): StructuredResult {
  const sections: string[] = [];
  const keysSeen: string[] = [];
  let bad = 0;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || /^[#;!]/.test(l) || l.startsWith('//')) continue;
    const sec = /^\[([^\]]+)\]$/.exec(l);
    if (sec) sections.push(sec[1] as string);
    else {
      const kv = /^(?:export\s+)?([^=:\s][^=:]*?)\s*[=:]/.exec(l);
      if (kv) keysSeen.push((kv[1] as string).trim());
      else if (!/\\$/.test(l)) bad++;
    }
  }
  return result(
    bad > keysSeen.length && keysSeen.length < 3 ? 'partial' : 'full',
    'Key/value line parser (names only)',
    {
      facts: { sections: cap(sections), keys: keysSeen.length, keyNames: cap(keysSeen) },
    },
  );
}

// ---------------------------------------------------------------- Dockerfile

export function readDockerfile(text: string): StructuredResult {
  const lines = text.split('\n');
  const stages: string[] = [];
  const images: string[] = [];
  const ports: string[] = [];
  const args: string[] = [];
  const links: Link[] = [];
  const symbols: StructSymbol[] = [];
  let entry: string | undefined;
  let unknown = 0;
  for (let i = 0; i < lines.length; i++) {
    let l = (lines[i] ?? '').trim();
    const lineNo = i + 1;
    if (!l || l.startsWith('#')) continue;
    while (l.endsWith('\\') && i + 1 < lines.length)
      l = `${l.slice(0, -1)} ${(lines[++i] ?? '').trim()}`;
    const m = /^(\w+)\s+(.*)$/.exec(l);
    if (!m) continue;
    const ins = (m[1] as string).toUpperCase();
    const rest = m[2] as string;
    if (ins === 'FROM') {
      const f = /^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(rest);
      if (f) {
        images.push(f[1] as string);
        if (f[2]) {
          stages.push(f[2]);
          symbols.push({ name: f[2], kind: 'build-stage', line: lineNo });
        }
      }
    } else if (ins === 'COPY' || ins === 'ADD') {
      if (/--from=/.test(rest)) continue;
      const parts = rest.replace(/--\S+/g, '').trim();
      const arr = parts.startsWith('[') ? (JSON.parse(parts) as string[]) : parts.split(/\s+/);
      for (const src of arr.slice(0, -1))
        if (src && !/^https?:|\$|\*/.test(src) && src !== '.' && src !== './')
          links.push({ kind: 'references', target: src, line: lineNo, detail: ins });
    } else if (ins === 'RUN') {
      for (const ref of scriptRefs(rest))
        links.push({ kind: 'runs', target: ref, line: lineNo, detail: 'RUN' });
    } else if (ins === 'EXPOSE') ports.push(...rest.split(/\s+/));
    else if (ins === 'ARG' || ins === 'ENV')
      args.push(
        ...rest
          .split(/\s+/)
          .map((x) => x.split('=')[0] as string)
          .filter((x) => /^[A-Za-z_]\w*$/.test(x)),
      );
    else if (ins === 'ENTRYPOINT' || ins === 'CMD') {
      entry = rest.slice(0, 200);
      for (const ref of scriptRefs(rest.replace(/[[\]",]/g, ' ')))
        links.push({ kind: 'runs', target: ref, line: lineNo, detail: ins });
    } else if (
      !/^(WORKDIR|USER|LABEL|VOLUME|HEALTHCHECK|SHELL|STOPSIGNAL|ONBUILD|MAINTAINER)$/.test(ins)
    )
      unknown++;
  }
  return result(unknown ? 'partial' : 'full', 'Dockerfile instruction parser', {
    facts: {
      baseImages: cap(images),
      stages: cap(stages),
      exposedPorts: cap(ports),
      argAndEnvNames: cap(args),
      entrypoint: entry,
      unknownInstructions: unknown,
    },
    links: links.slice(0, 200),
    symbols,
  });
}

// ---------------------------------------------------------------- Makefile / CMake / HCL

export function readMakefile(text: string): StructuredResult {
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  const lines = text.split('\n');
  let current: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    const t = /^([A-Za-z0-9_./%-][\w./%-]*(?:\s+[\w./%-]+)*)\s*::?(?!=)\s*(.*)$/.exec(l);
    if (
      t &&
      !l.startsWith('\t') &&
      !/^\s*(ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|override)\b/.test(l)
    ) {
      for (const name of (t[1] as string).split(/\s+/))
        if (!name.startsWith('.') || name === '.PHONY') {
          if (name !== '.PHONY') symbols.push({ name, kind: 'make-target', line: i + 1 });
        }
      current = (t[1] as string).split(/\s+/)[0];
      continue;
    }
    const inc = /^-?(?:include|sinclude)\s+(.+)$/.exec(l);
    if (inc)
      for (const f of (inc[1] as string).split(/\s+/))
        if (f && !f.includes('$')) links.push({ kind: 'includes', target: f, line: i + 1 });
    if (l.startsWith('\t') && current)
      for (const ref of scriptRefs(l))
        links.push({ kind: 'runs', target: ref, line: i + 1, detail: `target ${current}` });
  }
  return result('partial', 'Makefile target extractor', {
    facts: { targets: symbols.length },
    links: links.slice(0, 200),
    symbols: symbols.slice(0, 500),
  });
}

export function readCmake(text: string): StructuredResult {
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  const facts: Record<string, unknown> = {};
  const lines = text.split('\n');
  const packages: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] ?? '').replace(/#.*$/, '');
    const m = /^\s*(\w+)\s*\(\s*([^\s)]+)/.exec(l);
    if (!m) continue;
    const cmd = (m[1] as string).toLowerCase();
    const arg = (m[2] as string).replace(/"/g, '');
    if (cmd === 'project') facts.project = arg;
    else if (cmd === 'add_executable' || cmd === 'add_library' || cmd === 'add_custom_target')
      symbols.push({
        name: arg,
        kind:
          cmd === 'add_executable'
            ? 'executable'
            : cmd === 'add_library'
              ? 'library'
              : 'custom-target',
        line: i + 1,
      });
    else if (cmd === 'add_subdirectory' && !arg.includes('$'))
      links.push({
        kind: 'includes',
        target: arg,
        line: i + 1,
        dir: true,
        defaultFile: ['CMakeLists.txt'],
        detail: 'add_subdirectory',
      });
    else if (cmd === 'include' && /\.cmake$/.test(arg) && !arg.includes('$'))
      links.push({ kind: 'includes', target: arg, line: i + 1 });
    else if (cmd === 'find_package') packages.push(arg);
  }
  facts.packages = cap(packages);
  return result('partial', 'CMake command extractor', { facts, links, symbols });
}

export function readHcl(text: string): StructuredResult {
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  const lines = text.split('\n');
  const counts: Record<string, number> = {};
  let currentModule: { name: string; line: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    const b =
      /^(resource|data|module|variable|output|provider|locals|terraform|job|group|task|source|build|include|dependency|remote_state|inputs)\s*(?:"([^"]+)")?\s*(?:"([^"]+)")?\s*\{/.exec(
        l,
      );
    if (b) {
      const kind = b[1] as string;
      counts[kind] = (counts[kind] ?? 0) + 1;
      const name = b[3] ? `${b[2]}.${b[3]}` : (b[2] ?? kind);
      symbols.push({ name, kind: `hcl-${kind}`, line: i + 1 });
      currentModule =
        kind === 'module' || kind === 'include' || kind === 'dependency'
          ? { name, line: i + 1 }
          : undefined;
      continue;
    }
    const src = /^\s*(?:source|config_path|path)\s*=\s*"([^"]+)"/.exec(l);
    if (src && currentModule && /^\.{1,2}\//.test(src[1] as string))
      links.push({
        kind: 'includes',
        target: (src[1] as string).replace(/\/\/.*$/, ''),
        line: i + 1,
        dir: !/\.(tf|hcl)$/.test(src[1] as string),
        defaultFile: ['main.tf', 'terragrunt.hcl'],
        detail: `module ${currentModule.name}`,
      });
    if (/^\}/.test(l)) currentModule = undefined;
  }
  return result('partial', 'HCL block extractor', {
    facts: { blocks: counts },
    links,
    symbols: symbols.slice(0, 1000),
  });
}

// ---------------------------------------------------------------- Interface definitions

export function readIdl(language: string, text: string): StructuredResult {
  const symbols: StructSymbol[] = [];
  const links: Link[] = [];
  const facts: Record<string, unknown> = {};
  const lines = text.split('\n');
  let parent: string | undefined;
  let depth = 0;
  let parentDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] ?? '').replace(/\/\/.*$|#.*$/, '');
    const lineNo = i + 1;
    let m: RegExpExecArray | null;
    if (language === 'Protocol Buffer') {
      if ((m = /^\s*package\s+([\w.]+)\s*;/.exec(l))) facts.package = m[1];
      if ((m = /^\s*import\s+(?:public\s+|weak\s+)?"([^"]+)"/.exec(l)))
        links.push({
          kind: 'includes',
          target: m[1] as string,
          line: lineNo,
          detail: 'proto import',
        });
      if ((m = /^\s*(message|enum|service|extend)\s+([\w.]+)/.exec(l))) {
        symbols.push({
          name: m[2] as string,
          kind: `proto-${m[1]}`,
          line: lineNo,
          ...(parent ? { parent } : {}),
        });
        if (m[1] === 'service' || m[1] === 'message') {
          parent = m[2];
          parentDepth = depth;
        }
      }
      if (
        (m =
          /^\s*rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)/.exec(
            l,
          ))
      )
        symbols.push({
          name: m[1] as string,
          kind: 'proto-rpc',
          line: lineNo,
          ...(parent ? { parent } : {}),
        });
    } else if (language === 'Thrift') {
      if ((m = /^\s*(?:include|cpp_include)\s+"([^"]+)"/.exec(l)))
        links.push({ kind: 'includes', target: m[1] as string, line: lineNo });
      if ((m = /^\s*namespace\s+\w+\s+([\w.]+)/.exec(l))) facts.namespace = m[1];
      if ((m = /^\s*(struct|union|exception|enum|service|typedef)\s+([\w.]+)/.exec(l))) {
        symbols.push({ name: m[2] as string, kind: `thrift-${m[1]}`, line: lineNo });
        if (m[1] === 'service') {
          parent = m[2];
          parentDepth = depth;
        }
      } else if (parent && (m = /^\s*(?:oneway\s+)?[\w.<>, ]+\s+(\w+)\s*\(/.exec(l)))
        symbols.push({ name: m[1] as string, kind: 'thrift-method', line: lineNo, parent });
    } else if (language === 'GraphQL') {
      if (
        (m =
          /^\s*(?:extend\s+)?(type|interface|input|enum|union|scalar|schema|directive)\s+@?(\w+)?/.exec(
            l,
          ))
      )
        symbols.push({ name: m[2] ?? (m[1] as string), kind: `graphql-${m[1]}`, line: lineNo });
      if ((m = /^\s*(query|mutation|subscription|fragment)\s+(\w+)/.exec(l)))
        symbols.push({ name: m[2] as string, kind: `graphql-${m[1]}`, line: lineNo });
      if ((m = /^\s*#import\s+"([^"]+)"/.exec(lines[i] ?? '')))
        links.push({ kind: 'includes', target: m[1] as string, line: lineNo });
    } else {
      // Cap'n Proto, Avro IDL, Smithy, WebIDL: named declarations.
      if (
        (m =
          /^\s*(?:partial\s+)?(struct|interface|enum|union|record|protocol|error|service|operation|resource|structure|dictionary|namespace|callback|typedef)\s+@?(\w+)/.exec(
            l,
          ))
      )
        symbols.push({ name: m[2] as string, kind: `idl-${m[1]}`, line: lineNo });
      if (
        (m =
          /^\s*(?:using\s+import|import\s+idl|import\s+schema|import\s+protocol|use)\s+"([^"]+)"/.exec(
            l,
          ))
      )
        links.push({ kind: 'includes', target: m[1] as string, line: lineNo });
    }
    for (const ch of l) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth <= parentDepth) {
          parent = undefined;
          parentDepth = -1;
        }
      }
    }
  }
  facts.declarations = symbols.length;
  return result('partial', `Interface definition extractor (${language})`, {
    facts,
    links,
    symbols: symbols.slice(0, 2000),
  });
}

// ---------------------------------------------------------------- Documentation

export function readDocHeadings(language: string, text: string): StructuredResult {
  const lines = text.split('\n');
  const found: { name: string; level: number; line: number }[] = [];
  const rstLevels: string[] = [];
  const TEX = ['part', 'chapter', 'section', 'subsection', 'subsubsection'];
  const links: Link[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    let m: RegExpExecArray | null;
    if (
      language === 'reStructuredText' &&
      l.trim() &&
      (m = /^([=\-~^"'`#*+])\1{2,}\s*$/.exec(next)) &&
      next.trim().length >= l.trim().length - 1
    ) {
      const ch = m[1] as string;
      if (!rstLevels.includes(ch)) rstLevels.push(ch);
      found.push({ name: l.trim(), level: rstLevels.indexOf(ch) + 1, line: i + 1 });
    } else if (language === 'AsciiDoc' && (m = /^(={1,6})\s+(.+)$/.exec(l)))
      found.push({ name: m[2] as string, level: (m[1] as string).length, line: i + 1 });
    else if (language === 'Org' && (m = /^(\*{1,6})\s+(.+)$/.exec(l)))
      found.push({ name: m[2] as string, level: (m[1] as string).length, line: i + 1 });
    else if ((language === 'Pod' || language === 'Pod 6') && (m = /^=head(\d)\s+(.+)$/.exec(l)))
      found.push({ name: m[2] as string, level: Number(m[1]), line: i + 1 });
    else if (
      language === 'TeX' &&
      (m = /^\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]+)\}/.exec(l))
    )
      found.push({ name: m[2] as string, level: TEX.indexOf(m[1] as string) + 1, line: i + 1 });
    // Other files a document pulls in or points at.
    if (language === 'AsciiDoc')
      for (const x of l.matchAll(/\b(include|xref|link)::?([^\s[\]{}]+?)\[/g)) {
        const target = (x[2] as string).replace(/#.*$/, '');
        if (target && !/^[a-z]+:\/\//i.test(target))
          links.push({
            kind: x[1] === 'include' ? 'includes' : 'references',
            target,
            line: i + 1,
            detail: `AsciiDoc ${x[1]}`,
          });
      }
    if (
      language === 'reStructuredText' &&
      (m = /^\.\.\s+(include|literalinclude|image|figure)::\s+(\S+)/.exec(l))
    )
      links.push({
        kind: m[1] === 'include' || m[1] === 'literalinclude' ? 'includes' : 'references',
        target: m[2] as string,
        line: i + 1,
        detail: `reStructuredText ${m[1]}`,
      });
  }
  // Each heading sits under the nearest heading above it with a higher level.
  const headings: StructSymbol[] = [];
  const stack: { level: number; path: string }[] = [];
  const used = new Set<string>();
  for (const h of found.slice(0, MAX_TREE_SYMBOLS)) {
    while (stack.length && (stack[stack.length - 1] as { level: number }).level >= h.level)
      stack.pop();
    const parent = stack[stack.length - 1]?.path;
    let name = h.name;
    if (used.has(parent ? `${parent}.${name}` : name)) name = `${name} (line ${h.line})`;
    const path = parent ? `${parent}.${name}` : name;
    used.add(path);
    headings.push({ name, kind: 'heading', line: h.line, ...(parent ? { parent } : {}) });
    stack.push({ level: h.level, path });
  }
  return result(
    'partial',
    'Documentation heading extractor (nested headings, includes and links)',
    {
      facts: { headings: found.length },
      links,
      symbols: headings,
    },
  );
}

// ---------------------------------------------------------------- Lockfiles (text formats)

export function readTextLockfile(path: string, text: string): StructuredResult {
  const base = path.slice(path.lastIndexOf('/') + 1);
  let n: number;
  if (base === 'yarn.lock') n = (text.match(/^"?[^\s#][^\n]*:\s*$/gm) ?? []).length;
  else if (base === 'go.sum')
    n = new Set(
      text
        .split('\n')
        .map((l) => l.split(' ')[0])
        .filter(Boolean),
    ).size;
  else if (base === 'Gemfile.lock') n = (text.match(/^ {4}[\w.-]+ \(/gm) ?? []).length;
  else if (base === 'mix.lock') n = (text.match(/^\s+"[\w-]+":/gm) ?? []).length;
  else if (base === 'Podfile.lock') n = (text.match(/^ {2}- [\w/-]+ \(/gm) ?? []).length;
  else n = (text.match(/^\[\[package\]\]$/gm) ?? []).length;
  return result('partial', 'Lockfile package counter', { facts: { lockedPackages: n } });
}

// ---------------------------------------------------------------- CSV / TSV

/** Row and column counts of comma- or tab-separated data. Cell values are never kept. */
export function readDelimited(path: string, text: string): StructuredResult {
  const sep = /\.(tsv|tab)$/i.test(path) ? '\t' : ',';
  let rows = 0;
  let cols = 0;
  let minCols = Infinity;
  let maxCols = 0;
  let inQuote = false;
  let fields = 1;
  let any = false;
  const endRow = () => {
    if (!any && fields === 1) return;
    rows++;
    if (rows === 1) cols = fields;
    minCols = Math.min(minCols, fields);
    maxCols = Math.max(maxCols, fields);
    fields = 1;
    any = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') i++;
        else inQuote = false;
      }
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === sep) fields++;
    else if (c === '\n') {
      endRow();
      continue;
    } else if (c === '\r') continue;
    any = true;
  }
  if (inQuote) return result('partial', 'CSV/TSV reader', { error: 'unterminated quoted field' });
  endRow();
  const method = `${sep === '\t' ? 'TSV' : 'CSV'} reader (row and column counts; cell values are not kept)`;
  return result(minCols === maxCols ? 'full' : 'partial', method, {
    facts: {
      rows,
      columns: cols,
      ...(minCols !== maxCols && rows ? { columnsVary: `${minCols}-${maxCols}` } : {}),
    },
  });
}

// ---------------------------------------------------------------- Graphviz DOT

/** Graph name, nodes and edges of a Graphviz file, by pattern. */
export function readDot(text: string): StructuredResult {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*#.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  const head = /^\s*(strict\s+)?(di)?graph\b\s*("[^"]*"|[\w.]+)?\s*\{/im.exec(code);
  if (!head)
    return result('partial', 'Graphviz reader', {
      skipReason: 'no graph statement was found, so it is indexed as text',
    });
  const id = '("(?:[^"\\\\]|\\\\.)*"|[\\w.]+)';
  const edgeRe = new RegExp(`${id}\\s*(->|--)\\s*${id}`, 'g');
  const nodeRe = new RegExp(`^\\s*${id}\\s*\\[`, 'gm');
  const nodes = new Map<string, number>();
  const lineAt = (idx: number) => code.slice(0, idx).split('\n').length;
  const clean = (s: string) => s.replace(/^"|"$/g, '');
  const reserved = new Set(['graph', 'node', 'edge', 'subgraph', 'digraph', 'strict']);
  let edges = 0;
  for (const m of code.matchAll(edgeRe)) {
    edges++;
    for (const n of [m[1], m[3]])
      if (n && !reserved.has(n) && !nodes.has(clean(n))) nodes.set(clean(n), lineAt(m.index));
  }
  for (const m of code.matchAll(nodeRe)) {
    const n = m[1] as string;
    if (!reserved.has(n) && !nodes.has(clean(n))) nodes.set(clean(n), lineAt(m.index));
  }
  const symbols = cap([...nodes].map(([name, line]) => ({ name, kind: 'node', line })));
  return result('partial', 'Graphviz reader (graph, nodes and edges by pattern)', {
    facts: {
      graph: head[3] ? clean(head[3]) : '(unnamed)',
      directed: Boolean(head[2]),
      nodes: nodes.size,
      edges,
    },
    symbols,
  });
}

// ---------------------------------------------------------------- gettext

/** Message count and language of a gettext catalog (.po/.pot). */
export function readGettext(text: string): StructuredResult {
  let messages = 0;
  let plural = 0;
  let unknown = 0;
  let headerSeen = false;
  let language: string | undefined;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] as string).trim();
    if (!l || l.startsWith('#')) continue;
    if (/^msgid\s+"/.test(l)) {
      if (/^msgid\s+""\s*$/.test(l) && !headerSeen && messages === 0) headerSeen = true;
      else messages++;
      continue;
    }
    if (/^msgid_plural\s+"/.test(l)) {
      plural++;
      continue;
    }
    if (/^(msgstr(\[\d+\])?|msgctxt)\s+"/.test(l) || /^"/.test(l)) {
      const lang = /^"Language:\s*([\w@-]+)/.exec(l);
      if (lang && !language) language = lang[1];
      continue;
    }
    unknown++;
  }
  return result(unknown ? 'partial' : 'full', 'gettext catalog reader (message count)', {
    facts: { messages, pluralForms: plural, ...(language ? { language } : {}) },
  });
}
