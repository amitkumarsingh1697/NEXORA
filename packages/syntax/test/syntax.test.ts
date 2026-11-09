import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyseSyntax,
  availableGrammars,
  grammarManifest,
  initSyntax,
  setGrammarDir,
  SPEC_BY_LANGUAGE,
  type SyntaxResult,
} from '../src/index';
import { FIXTURES } from './fixtures';
import { summarise } from './summary';

const here = new URL('.', import.meta.url).pathname;
const grammarsDir = join(here, '..', 'grammars');
const fixture = (f: string) => readFileSync(join(here, 'fixtures', f), 'utf8');
const parse = (lang: string, src: string): SyntaxResult => {
  const r = analyseSyntax(lang, src);
  if (!r || r instanceof Error) throw r ?? new Error(`no spec for ${lang}`);
  return r;
};
const decl = (r: SyntaxResult, name: string) => {
  const d = r.declarations.find((x) => x.name === name);
  if (!d) throw new Error(`no declaration ${name}`);
  return d;
};

beforeAll(async () => {
  setGrammarDir(grammarsDir);
  await initSyntax();
});

describe('grammars', () => {
  it('every vendored grammar matches its recorded SHA-256 and loads', () => {
    const m = grammarManifest().grammars;
    expect(Object.keys(m).length).toBeGreaterThanOrEqual(31);
    for (const [id, g] of Object.entries(m)) {
      const bytes = gunzipSync(readFileSync(join(grammarsDir, `${id}.wasm.gz`)));
      expect(createHash('sha256').update(bytes).digest('hex'), id).toBe(g.sha256);
      expect(g.license, id).toMatch(/MIT|Apache|BSD|ISC/);
    }
    expect(availableGrammars().sort()).toEqual(Object.keys(m).sort());
  });

  it('every language spec names a vendored grammar', () => {
    const ids = new Set(Object.keys(grammarManifest().grammars));
    for (const [lang, spec] of Object.entries(SPEC_BY_LANGUAGE))
      expect(ids.has(spec.grammar), lang).toBe(true);
  });

  it('refuses a grammar whose bytes do not match the manifest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'syntax-grammars-'));
    for (const f of readdirSync(grammarsDir)) copyFileSync(join(grammarsDir, f), join(dir, f));
    // Replace the Lua grammar with the Python one: valid WebAssembly, wrong hash.
    copyFileSync(join(grammarsDir, 'python.wasm.gz'), join(dir, 'lua.wasm.gz'));
    setGrammarDir(dir);
    try {
      const r = analyseSyntax('Lua', 'local x = 1');
      expect(r).toBeInstanceOf(Error);
      expect((r as Error).message).toMatch(/SHA-256 mismatch/);
    } finally {
      setGrammarDir(grammarsDir);
    }
  });

  it('a missing grammar is an error, not an empty result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'syntax-none-'));
    writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({ grammars: {} }));
    setGrammarDir(dir);
    try {
      expect(analyseSyntax('Python', 'x = 1')).toBeInstanceOf(Error);
    } finally {
      setGrammarDir(grammarsDir);
    }
  });
});

describe('every language fixture', () => {
  it('covers every spec', () => {
    const specs = new Set(Object.values(SPEC_BY_LANGUAGE).map((s) => s.grammar));
    const tested = new Set(FIXTURES.map(([l]) => SPEC_BY_LANGUAGE[l]!.grammar));
    expect([...specs].filter((g) => !tested.has(g))).toEqual([]);
  });

  for (const [lang, file] of FIXTURES) {
    it(`${lang}: parses without errors and matches the reviewed extraction`, async () => {
      const r = parse(lang, fixture(file));
      expect(r.problems).toEqual([]);
      await expect(summarise(r)).toMatchFileSnapshot(`expected/${file}.txt`);
    });
  }
});

describe('facts per language (hand-checked against the fixture source)', () => {
  it('Python: classes, bases, constructor, typed and optional params, returns, relative imports', () => {
    const r = parse('Python', fixture('sample.py'));
    expect(decl(r, 'Cart')).toMatchObject({ kind: 'class', line: 10, bases: ['Base'] });
    expect(decl(r, '__init__')).toMatchObject({ kind: 'constructor', returns: 'None' });
    expect(decl(r, 'add').params).toEqual([
      { name: 'sku', type: 'str' },
      { name: 'qty', type: 'int', optional: true },
    ]);
    expect(decl(r, 'add').returns).toBe('Optional[int]');
    expect(decl(r, 'helper').params?.map((p) => p.variadic ?? false)).toEqual([false, true, true]);
    expect(r.imports[1]).toMatchObject({
      spec: '.store',
      names: [{ name: 'Store' }, { name: 'load', alias: 'load_store' }],
    });
    expect(r.calls.find((c) => c.name === 'save')).toMatchObject({
      receiver: 'self.store',
      line: 20,
    });
  });

  it('Go: package, receiver methods, multiple returns, variadic', () => {
    const r = parse('Go', fixture('sample.go'));
    expect(r.namespace).toBe('cart');
    expect(decl(r, 'Add')).toMatchObject({
      kind: 'method',
      receiver: 'Cart',
      returns: '(int, error)',
    });
    expect(decl(r, 'helper').params?.[1]).toMatchObject({ name: 'rest', variadic: true });
  });

  it('Java: package, constructor, new expressions', () => {
    const r = parse('Java', fixture('sample.java'));
    expect(r.namespace).toBe('com.shop.cart');
    expect(decl(r, 'Cart').bases).toEqual(['Base', 'Saver']);
    expect(r.declarations.find((d) => d.kind === 'constructor')?.params).toEqual([
      { name: 'store', type: 'Store' },
    ]);
    expect(r.calls.some((c) => c.isNew && c.name === 'Counter')).toBe(true);
  });

  it('C and C++: qualifiers and references stay in parameter types; system headers are modules', () => {
    const c = parse('C', fixture('sample.c'));
    expect(decl(c, 'add').params?.[1]).toEqual({ name: 'sku', type: 'const char*' });
    expect(c.imports.map((i) => i.style)).toEqual(['module', 'include']);
    const cpp = parse('C++', fixture('sample.cpp'));
    const outOfClass = cpp.declarations.find((d) => d.name === 'add' && d.receiver === 'Cart');
    expect(outOfClass).toMatchObject({ kind: 'method', line: 15, returns: 'int' });
    expect(outOfClass?.params?.[0]).toEqual({ name: 'sku', type: 'const std::string&' });
  });

  it('Objective-C: selectors, init constructors, protocols, [X alloc], and plain C functions', () => {
    const r = parse('Objective-C', fixture('sample.m'));
    expect(decl(r, 'add:qty:').params).toEqual([
      { name: 'sku', type: 'NSString*' },
      { name: 'qty', type: 'NSInteger' },
    ]);
    expect(decl(r, 'initWithStore:').kind).toBe('constructor');
    expect(decl(r, 'Saver')).toMatchObject({ kind: 'interface', bases: ['NSObject'] });
    expect(r.calls.find((c) => c.name === 'save:')).toMatchObject({
      receiver: 'self.store',
      line: 24,
    });
    expect(r.calls.some((c) => c.isNew && c.name === 'Cart')).toBe(true);
    expect(decl(parse('Objective-C', fixture('sample.c')), 'add').params?.length).toBe(3);
  });

  it('Rust: impl members, mod files, use lists with aliases', () => {
    const r = parse('Rust', fixture('sample.rs'));
    expect(decl(r, 'new')).toMatchObject({ kind: 'method', returns: 'Self' });
    expect(r.imports.find((i) => i.spec === 'util')?.style).toBe('path');
    expect(r.imports.find((i) => i.spec === 'crate::store')?.names).toEqual([
      { name: 'Store' },
      { name: 'load', alias: 'load_store' },
    ]);
  });

  it('Solidity: inheritance and data locations', () => {
    const r = parse('Solidity', fixture('sample.sol'));
    expect(decl(r, 'Cart').bases).toEqual(['Ownable', 'ISaver']);
    expect(decl(r, 'add').params?.[0]).toEqual({ name: 'sku', type: 'string memory' });
  });

  it('Starlark: load() is an import, not a call', () => {
    const r = parse('Starlark', fixture('BUILD.bazel'));
    expect(r.imports).toEqual([
      { spec: '@rules_cc//cc:defs.bzl', line: 1, style: 'path', names: [{ name: 'cc_library' }] },
    ]);
    expect(r.calls.map((c) => c.name)).toEqual(['cc_library', 'make_lib']);
  });

  it('Terraform: blocks are named as Terraform addresses them, references become calls', () => {
    const r = parse('HCL', fixture('sample.tf'));
    expect(r.declarations.map((d) => d.name)).toEqual([
      'var.region',
      'module.vpc',
      'aws_instance.web',
      'data.aws_ami.ubuntu',
      'output.ip',
    ]);
    expect(r.calls.find((c) => c.name === 'data.aws_ami.ubuntu')?.line).toBe(16);
  });
});

describe('broken source', () => {
  it('reports syntax errors with their line instead of hiding them', () => {
    const r = parse('Python', 'def ok():\n    return 1\n\ndef broken(:\n    pass\n');
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.problems[0]!.line).toBe(4);
    expect(r.declarations.some((d) => d.name === 'ok')).toBe(true);
  });

  it('reports missing tokens', () => {
    const r = parse('Java', 'class A { void f() { int x = 1 } }');
    expect(r.problems.some((p) => p.kind === 'missing')).toBe(true);
  });

  it('an unknown language has no spec', () => {
    expect(analyseSyntax('COBOL', 'IDENTIFICATION DIVISION.')).toBeNull();
  });
});
