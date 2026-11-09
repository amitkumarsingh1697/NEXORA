/**
 * The tree-sitter runtime and grammar loading.
 *
 * `initSyntax()` must run once per process before any parse (the runtime's WebAssembly module
 * loads asynchronously). After that, grammars load synchronously on first use, from the gzipped
 * WebAssembly files in `grammars/` (see grammars/MANIFEST.json for their source and hashes).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Language, Parser } from 'web-tree-sitter';

let ready: Promise<void> | null = null;
let initialised = false;
let grammarDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'grammars');
const loaded = new Map<string, Language | Error>();

/** Where the gzipped grammars are (a bundled copy, such as the ArchLens skill, sets its own). */
export function setGrammarDir(dir: string): void {
  grammarDir = dir;
  loaded.clear();
}

/** Loads the tree-sitter runtime. Safe to call many times; later calls reuse the first. */
export function initSyntax(): Promise<void> {
  ready ??= Parser.init().then(() => {
    initialised = true;
  });
  return ready;
}

export function isSyntaxReady(): boolean {
  return initialised;
}

/** Ids of the grammars present on disk. */
export function availableGrammars(): string[] {
  const m = manifest();
  return Object.keys(m.grammars).filter((id) => existsSync(join(grammarDir, `${id}.wasm.gz`)));
}

export interface GrammarSource {
  package: string;
  version: string;
  integrity: string;
  sha256: string;
  license: string;
  repository: string;
}

let manifestCache: { grammars: Record<string, GrammarSource> } | null = null;
export function manifest(): { grammars: Record<string, GrammarSource> } {
  manifestCache ??= JSON.parse(readFileSync(join(grammarDir, 'MANIFEST.json'), 'utf8')) as {
    grammars: Record<string, GrammarSource>;
  };
  return manifestCache;
}

/** The grammar with this id, or an Error saying why it could not be loaded. */
export function grammar(id: string): Language | Error {
  if (!initialised) return new Error('the syntax engine was not initialised (initSyntax)');
  const hit = loaded.get(id);
  if (hit) return hit;
  let out: Language | Error;
  try {
    const expected = manifest().grammars[id]?.sha256;
    if (!expected) throw new Error('not listed in MANIFEST.json');
    const bytes = gunzipSync(readFileSync(join(grammarDir, `${id}.wasm.gz`)));
    // Only run grammar code whose bytes match the hash recorded when it was vendored.
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected)
      throw new Error(`SHA-256 mismatch (expected ${expected}, got ${actual})`);
    const wasm = (
      globalThis as unknown as { WebAssembly: { Module: new (b: Uint8Array) => unknown } }
    ).WebAssembly;
    out = Language.loadSync(new wasm.Module(bytes) as Parameters<typeof Language.loadSync>[0]);
  } catch (e) {
    out = new Error(`grammar ${id} could not be loaded: ${(e as Error).message}`);
  }
  loaded.set(id, out);
  return out;
}

const parsers = new Map<string, Parser>();
/** A parser bound to the grammar, reused across files. */
export function parserFor(id: string): Parser | Error {
  const p = parsers.get(id);
  if (p) return p;
  const lang = grammar(id);
  if (lang instanceof Error) return lang;
  const parser = new Parser();
  parser.setLanguage(lang);
  parsers.set(id, parser);
  return parser;
}
