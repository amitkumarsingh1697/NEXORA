import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeIndex,
  fields,
  parseSymbol,
  projectPrefix,
  ScipResolver,
  symbolName,
  SymbolRole,
  WireError,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name));

// A minimal protobuf encoder, only for building test inputs.
const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n < 0 ? 2n ** 64n + BigInt(n) : BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return out;
};
const tag = (no: number, wire: number) => varint(no * 8 + wire);
const vfield = (no: number, v: number) => [...tag(no, 0), ...varint(v)];
const bytes = (no: number, b: number[] | string) => {
  const data = typeof b === 'string' ? [...new TextEncoder().encode(b)] : b;
  return [...tag(no, 2), ...varint(data.length), ...data];
};
const packed = (no: number, vs: number[]) => bytes(no, vs.flatMap(varint));
const u8 = (b: number[]) => Uint8Array.from(b);

const SYM_FOO = 'scip-python python demo 1.0 `demo.mod`/foo().';
const SYM_BAR = 'scip-python python demo 1.0 `demo.mod`/Bar#';
const SYM_LEN = 'scip-python python python-stdlib 3.11 builtins/len().';

/** An index with one document, written the way scip.proto lays it out. */
function demoIndex(): Uint8Array {
  const toolInfo = [...bytes(1, 'demo-indexer'), ...bytes(2, '1.2.3'), ...bytes(3, '--flag')];
  const metadata = [...bytes(2, toolInfo), ...bytes(3, 'file:///work/repo/sub')];
  const doc = [
    ...bytes(1, 'mod.py'),
    ...bytes(4, 'python'),
    // Definition of foo at line 2 (0-based 1), typed single-line range, with an enclosing range.
    ...bytes(2, [
      ...bytes(8, [...vfield(1, 1), ...vfield(2, 4), ...vfield(3, 7)]),
      ...bytes(2, SYM_FOO),
      ...vfield(3, SymbolRole.Definition),
      ...bytes(11, [...vfield(1, 1), ...vfield(2, 0), ...vfield(3, 3), ...vfield(4, 9)]),
    ]),
    // Bar defined at line 6 with the deprecated packed range.
    ...bytes(2, [...packed(1, [5, 6, 9]), ...bytes(2, SYM_BAR), ...vfield(3, 1)]),
    // A call to foo at line 9: deprecated unpacked range (one varint per field).
    ...bytes(2, [...vfield(1, 8), ...vfield(1, 2), ...vfield(1, 5), ...bytes(2, SYM_FOO)]),
    // A call to the builtin len at line 9 too, and a local that must be ignored.
    ...bytes(2, [
      ...packed(1, [8, 6, 9]),
      ...bytes(2, SYM_LEN),
      ...vfield(3, SymbolRole.ReadAccess),
    ]),
    ...bytes(2, [...packed(1, [8, 10, 11]), ...bytes(2, 'local 3')]),
    // An occurrence without a symbol is dropped.
    ...bytes(2, [...packed(1, [8, 0, 1])]),
    // Symbol information: Bar is a class (7) implementing an external base.
    ...bytes(3, [
      ...bytes(1, SYM_BAR),
      ...vfield(5, 7),
      ...bytes(6, 'Bar'),
      ...bytes(4, [...bytes(1, 'scip-python python other 2.0 base/Base#'), ...vfield(3, 1)]),
    ]),
    ...vfield(6, 1),
    // Unknown fields of every wire type are skipped.
    ...tag(15, 1),
    ...[1, 2, 3, 4, 5, 6, 7, 8],
    ...tag(16, 5),
    ...[1, 2, 3, 4],
  ];
  return u8([...bytes(1, metadata), ...bytes(2, doc), ...bytes(3, bytes(1, SYM_LEN))]);
}

describe('protobuf wire format', () => {
  it('reads varints, including negative int32 as 10 bytes', () => {
    const [f] = [...fields(u8(vfield(1, -2)))];
    expect(f!.i32).toBe(-2);
    const idx = decodeIndex(
      u8(
        bytes(2, [
          ...bytes(1, 'a'),
          ...bytes(2, [...packed(1, [0, -1, 2]), ...bytes(2, 'x y z w q.')]),
        ]),
      ),
    );
    expect(idx.documents[0]!.occurrences[0]!.range).toEqual([0, -1, 0, 2]);
  });

  it('rejects truncated and malformed input with the byte offset', () => {
    expect(() => [...fields(u8([0x0a, 0x05, 0x61]))]).toThrow(WireError);
    expect(() => [...fields(u8([0x0a, 0x05, 0x61]))]).toThrow(/length past the end.*at byte 2/);
    expect(() => [...fields(u8([0x08]))]).toThrow(/truncated varint/);
    expect(() => [...fields(u8([0x08, ...Array(11).fill(0xff)]))]).toThrow(/longer than 10/);
    expect(() => [...fields(u8([0x0b]))]).toThrow(/unsupported wire type 3/);
    expect(() => [...fields(u8([0x00, 0x00]))]).toThrow(/field number 0/);
    expect(() => decodeIndex(u8([0x12, 0x03, 0x0a, 0x09, 0x61]))).toThrow(WireError);
  });

  it('refuses an index above the size limit', () => {
    expect(() => decodeIndex(new Uint8Array(100), { maxBytes: 10 })).toThrow(/larger than 10/);
  });
});

describe('decodeIndex', () => {
  const idx = decodeIndex(demoIndex());

  it('reads metadata, documents and external symbols', () => {
    expect(idx.tool).toEqual({ name: 'demo-indexer', version: '1.2.3', arguments: ['--flag'] });
    expect(idx.projectRoot).toBe('file:///work/repo/sub');
    expect(idx.documents).toHaveLength(1);
    expect(idx.externalSymbols.map((s) => s.symbol)).toEqual([SYM_LEN]);
    const d = idx.documents[0]!;
    expect(d.path).toBe('mod.py');
    expect(d.language).toBe('python');
    expect(d.positionEncoding).toBe(1);
  });

  it('reads typed, packed and unpacked ranges, roles and enclosing ranges', () => {
    const o = idx.documents[0]!.occurrences;
    expect(o).toHaveLength(5);
    expect(o[0]).toEqual({
      range: [1, 4, 1, 7],
      symbol: SYM_FOO,
      roles: SymbolRole.Definition,
      enclosing: [1, 0, 3, 9],
    });
    expect(o[1]!.range).toEqual([5, 6, 5, 9]);
    expect(o[2]!.range).toEqual([8, 2, 8, 5]);
    expect(o[2]!.roles).toBe(0);
    expect(o[3]!.roles).toBe(SymbolRole.ReadAccess);
  });

  it('prefers the typed range over the deprecated one', () => {
    const doc = bytes(2, [
      ...bytes(1, 'a.py'),
      ...bytes(2, [
        ...packed(1, [9, 9, 9]),
        ...bytes(9, [...vfield(1, 1), ...vfield(2, 2), ...vfield(3, 3), ...vfield(4, 4)]),
        ...bytes(2, SYM_FOO),
      ]),
    ]);
    expect(decodeIndex(u8(doc)).documents[0]!.occurrences[0]!.range).toEqual([1, 2, 3, 4]);
  });

  it('reads symbol information with kind, display name and relationships', () => {
    const s = idx.documents[0]!.symbols[0]!;
    expect(s.kind).toBe(7);
    expect(s.displayName).toBe('Bar');
    expect(s.relationships).toEqual([
      {
        symbol: 'scip-python python other 2.0 base/Base#',
        isReference: false,
        isImplementation: true,
        isTypeDefinition: false,
        isDefinition: false,
      },
    ]);
  });
});

describe('parseSymbol', () => {
  it('parses package parts and every descriptor suffix', () => {
    const p = parseSymbol(
      'scip-java maven com.example  lib 1.0 com/example/`Odd``Name`#run(+1).[T](x)m:mac!val.',
    );
    expect(p).toMatchObject({
      local: false,
      scheme: 'scip-java',
      manager: 'maven',
      packageName: 'com.example lib',
      version: '1.0',
    });
    expect(p!.descriptors).toEqual([
      { name: 'com', suffix: 'namespace' },
      { name: 'example', suffix: 'namespace' },
      { name: 'Odd`Name', suffix: 'type' },
      { name: 'run', suffix: 'method', disambiguator: '+1' },
      { name: 'T', suffix: 'type-parameter' },
      { name: 'x', suffix: 'parameter' },
      { name: 'm', suffix: 'meta' },
      { name: 'mac', suffix: 'macro' },
      { name: 'val', suffix: 'term' },
    ]);
    expect(symbolName(p!)).toBe('val');
  });

  it('maps "." placeholders to empty and reads local symbols', () => {
    expect(parseSymbol('rust-analyzer cargo . . std/vec/Vec#')).toMatchObject({
      manager: 'cargo',
      packageName: '',
      version: '',
    });
    expect(parseSymbol('local 12')).toMatchObject({ local: true, version: '12' });
  });

  it('skips parameters when naming a symbol', () => {
    expect(symbolName(parseSymbol('s m p v a/B#get().(key)')!)).toBe('get');
  });

  it('rejects strings outside the grammar', () => {
    for (const bad of [
      '',
      'local ',
      'scheme only',
      's m p v',
      's m p v a',
      's m p v a?',
      's m p v run(.',
      's m p v `open',
    ])
      expect(parseSymbol(bad)).toBeUndefined();
  });
});

describe('projectPrefix', () => {
  it('turns the project root into a repository-relative directory', () => {
    expect(projectPrefix('file:///work/repo', '/work/repo')).toBe('');
    expect(projectPrefix('file:///work/repo/sub', '/work/repo/')).toBe('sub');
    expect(projectPrefix('file:///work/my%20repo/a/b', '/work/my repo')).toBe('a/b');
    expect(projectPrefix('file:///elsewhere', '/work/repo')).toBe('');
    expect(projectPrefix(undefined, '/work/repo')).toBe('');
  });
});

describe('ScipResolver on a hand-made index', () => {
  const r = new ScipResolver([{ index: decodeIndex(demoIndex()), prefix: 'sub' }]);

  it('places documents under the prefix and answers by 1-based line and name', () => {
    expect(r.covers('sub/mod.py')).toBe('demo-indexer 1.2.3');
    expect(r.covers('mod.py')).toBeUndefined();
    expect(r.files).toBe(1);
    expect(r.resolve('sub/mod.py', 9, 'foo')).toEqual({
      kind: 'definition',
      tool: 'demo-indexer 1.2.3',
      definition: {
        symbol: SYM_FOO,
        path: 'sub/mod.py',
        line: 2,
        name: 'foo',
        kind: 0,
        sites: [{ path: 'sub/mod.py', line: 2 }],
      },
    });
    expect(r.resolve('sub/mod.py', 9, 'len')).toMatchObject({
      kind: 'external',
      package: 'python python-stdlib',
    });
    expect(r.resolve('sub/mod.py', 9, 'nothing')).toBeUndefined();
    expect(r.resolve('sub/mod.py', 2, 'foo')).toBeUndefined(); // a definition is not a reference
    expect(r.resolve('other.py', 9, 'foo')).toBeUndefined();
  });

  it('reports kinds and implementation relationships', () => {
    expect(r.definition(SYM_BAR)?.kind).toBe(7);
    expect(r.implemented(SYM_BAR)).toEqual(['scip-python python other 2.0 base/Base#']);
    expect(r.definitionsIn('sub/mod.py').map((d) => d.name)).toEqual(['foo', 'Bar']);
    expect([...r.linesOf(SYM_FOO, 'sub/mod.py')]).toEqual([2, 9]);
  });

  it('does not decide between two symbols of one name on one line', () => {
    const doc = bytes(2, [
      ...bytes(1, 'x.py'),
      ...bytes(2, [...packed(1, [0, 0, 1]), ...bytes(2, 's m p v a/get().')]),
      ...bytes(2, [...packed(1, [0, 4, 5]), ...bytes(2, 's m p v b/get().')]),
    ]);
    const amb = new ScipResolver([{ index: decodeIndex(u8(doc)), prefix: '' }]);
    expect(amb.resolve('x.py', 1, 'get')).toEqual({ kind: 'ambiguous', tool: 'SCIP index' });
  });
});

describe('ScipResolver on real indexer output', () => {
  // test/fixtures/py.scip: scip-python 0.6.8 over test/fixtures/py (see test/fixtures/README.md).
  const py = new ScipResolver([{ index: decodeIndex(fixture('py.scip')), prefix: '' }]);

  it('resolves calls and methods through the type checker (scip-python)', () => {
    expect(py.covers('shop/service.py')).toBe('scip-python 0.6.8');
    // order = parse(raw): the first @overload stub is the definition occurrence.
    expect(py.resolve('shop/service.py', 7, 'parse')).toMatchObject({
      kind: 'definition',
      definition: { path: 'shop/models.py', line: 19, name: 'parse' },
    });
    // order.save(): Order inherits save from Base; only types can tell.
    expect(py.resolve('shop/service.py', 8, 'save')).toMatchObject({
      kind: 'definition',
      definition: { path: 'shop/models.py', line: 9, name: 'save' },
    });
    expect(py.resolve('shop/service.py', 9, 'dumps')).toMatchObject({
      kind: 'external',
      package: 'python python-stdlib',
    });
  });

  it('lists the later overloads and the implementation as occurrences of the same symbol', () => {
    const def = py.definition('scip-python python shop 0.0.0 `shop.models`/parse().')!;
    expect(def.sites).toEqual([{ path: 'shop/models.py', line: 19 }]);
    const lines = py.linesOf(def.symbol, 'shop/models.py');
    expect([19, 21, 22].every((l) => lines.has(l))).toBe(true);
  });

  it('reports base classes as implementation relationships', () => {
    expect(py.implemented('scip-python python shop 0.0.0 `shop.models`/Order#')).toEqual([
      'scip-python python shop 0.0.0 `shop.models`/Base#',
    ]);
  });

  it('does not call a repository symbol external when the index lacks its definition', () => {
    // scip-python 0.6.8 records `class ConnectionError(Exception)` as a reference to the
    // builtin, so the repository's ConnectionError has references and no definition.
    expect(py.resolve('shop/service.py', 11, 'ConnectionError')).toEqual({
      kind: 'undefined',
      symbol: 'scip-python python shop 0.0.0 `shop.models`/ConnectionError#',
      tool: 'scip-python 0.6.8',
    });
  });

  // test/fixtures/go.scip: scip-go v0.2.9 over test/fixtures/go.
  const go = new ScipResolver([{ index: decodeIndex(fixture('go.scip')), prefix: '' }]);

  it('resolves method calls on values and package functions (scip-go)', () => {
    expect(go.covers('main.go')).toBe('scip-go 0.2.9');
    expect(go.resolve('main.go', 11, 'Add')).toMatchObject({
      kind: 'definition',
      definition: { path: 'store/store.go', line: 12, name: 'Add', kind: 26 },
    });
    expect(go.resolve('main.go', 12, 'Println')).toMatchObject({ kind: 'external' });
    expect(go.resolve('store/store.go', 13, 'ToUpper')).toMatchObject({ kind: 'external' });
  });
});
