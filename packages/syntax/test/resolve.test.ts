import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyseSyntax,
  initSyntax,
  resolveCalls,
  type CallLink,
  type ResolveFile,
} from '../src/index';

beforeAll(() => initSyntax());

function file(
  path: string,
  language: string,
  src: string,
  importTargets: (string | undefined)[] = [],
): ResolveFile {
  const r = analyseSyntax(language, src);
  if (!r || r instanceof Error) throw r ?? new Error('no spec');
  return { path, language, result: r, importTargets };
}
const show = (files: ResolveFile[], links: CallLink[]) =>
  links.map((l) => {
    const t = l.target
      ? files.find((f) => f.path === l.target!.file)!.result.declarations[l.target.decl]!
      : undefined;
    return `${l.name}@${l.line} ${l.kind} ${l.confidence}${t ? ` -> ${l.target!.file}:${t.name}@${t.line}` : ''}`;
  });

describe('call resolution', () => {
  it('Python: same file is observed, through import is inferred, constructor call instantiates', () => {
    const store = file(
      'pkg/store.py',
      'Python',
      'class Store:\n    def save(self, x):\n        pass\n\ndef load():\n    return Store()\n',
    );
    const app = file(
      'pkg/app.py',
      'Python',
      'from .store import Store, load as ld\n\ndef helper():\n    return 1\n\nclass Cart:\n    def add(self):\n        self.check()\n        helper()\n        ld()\n        s = Store()\n        missing()\n    def check(self):\n        pass\n',
      ['pkg/store.py'],
    );
    const files = [store, app];
    const links = resolveCalls(files).filter((l) => l.file === 'pkg/app.py');
    expect(show(files, links)).toEqual([
      'check@8 calls observed -> pkg/app.py:check@13',
      'helper@9 calls observed -> pkg/app.py:helper@3',
      'ld@10 calls inferred -> pkg/store.py:load@5',
      'Store@11 instantiates inferred -> pkg/store.py:Store@1',
      'missing@12 calls unresolved',
    ]);
    expect(links[2]!.detail).toBe('resolved through the import at line 1');
  });

  it('Python: a bare call inside a method never reaches a method (Python needs self.)', () => {
    const f = file(
      'a.py',
      'Python',
      'class A:\n    def run(self):\n        go()\n    def go(self):\n        pass\n',
    );
    const [l] = resolveCalls([f]);
    expect(l).toMatchObject({ name: 'go', confidence: 'unresolved' });
    expect(l!.detail).toBe('no reachable declaration named go in the repository');
  });

  it('a call on something imported from outside the repository is not linked to repository code', () => {
    const jar = file('jar.py', 'Python', 'class Jar:\n    def update(self, x):\n        pass\n');
    const f = file('env.py', 'Python', 'import os\n\ndef reset(v):\n    os.environ.update(v)\n', [
      undefined,
    ]);
    const [l] = resolveCalls([jar, f]);
    expect(l).toMatchObject({ name: 'update', confidence: 'unresolved' });
    expect(l!.detail).toBe('called on os, imported from os (outside the repository)');
  });

  it('module-qualified calls reach functions of a module with that name', () => {
    const s = file('pkg/sessions.py', 'Python', 'def session():\n    pass\n');
    const f = file('app.py', 'Python', 'def run(x):\n    sessions.session()\n    x.session()\n');
    const links = resolveCalls([s, f]);
    expect(links.map((l) => `${l.callee} ${l.confidence}`)).toEqual([
      'sessions.session inferred',
      'x.session unresolved',
    ]);
    expect(links[0]!.detail).toBe('session in the module sessions (pkg/sessions.py)');
  });

  it('Java: implicit member calls, static calls on a class, new, same package', () => {
    const util = file(
      'src/shop/Util.java',
      'Java',
      'package shop;\nclass Util {\n  static int count(int n) { return n; }\n}\n',
    );
    const cart = file(
      'src/shop/Cart.java',
      'Java',
      'package shop;\nclass Cart {\n  int add() {\n    check();\n    Util.count(1);\n    Counter c = new Counter();\n    return new Cart().size();\n  }\n  void check() {}\n}\nclass Counter {}\n',
    );
    const files = [util, cart];
    expect(show(files, resolveCalls(files))).toEqual([
      'check@4 calls observed -> src/shop/Cart.java:check@9',
      'count@5 calls inferred -> src/shop/Util.java:count@3',
      'Counter@6 instantiates observed -> src/shop/Cart.java:Counter@11',
      'size@7 calls unresolved',
      'Cart@7 instantiates observed -> src/shop/Cart.java:Cart@2',
    ]);
  });

  it('Go: receiver methods and functions of the same package folder', () => {
    const a = file(
      'cart/a.go',
      'Go',
      'package cart\ntype Cart struct{}\nfunc (c *Cart) Add() int { c.check(); return helper() }\n',
    );
    const b = file(
      'cart/b.go',
      'Go',
      'package cart\nfunc (c *Cart) check() {}\nfunc helper() int { return 1 }\n',
    );
    const files = [a, b];
    expect(show(files, resolveCalls(files))).toEqual([
      'check@3 calls inferred -> cart/b.go:check@2',
      'helper@3 calls inferred -> cart/b.go:helper@3',
    ]);
  });

  it('C++: a call resolves to the out-of-class definition, not the prototype', () => {
    const f = file(
      'cart.cpp',
      'C++',
      'class Cart {\n public:\n  int add();\n  int run() { return add(); }\n};\nint Cart::add() {\n  return 1;\n}\n',
    );
    const links = resolveCalls([f]);
    expect(show([f], links)).toEqual(['add@4 calls observed -> cart.cpp:add@6']);
  });

  it('never links a built-in method name on an untyped receiver (Ruby length, Python update)', () => {
    const jar = file('jar.rb', 'Ruby', 'class Jar\n  def length\n    0\n  end\nend\n');
    const use = file(
      'use.rb',
      'Ruby',
      'def run(response)\n  response.length\n  Jar.new.length\nend\n',
    );
    const links = resolveCalls([jar, use]);
    const len = links.filter((l) => l.name === 'length');
    expect(len[0]).toMatchObject({ confidence: 'unresolved' });
    expect(len[0]!.detail).toMatch(/also a method of Ruby's built-in types/);
  });

  it('Java: calls on typed parameters, locals and fields resolve to that class, including inherited methods', () => {
    const base = file('src/a/Base.java', 'Java', 'package a;\nclass Base {\n  void ping() {}\n}\n');
    const store = file(
      'src/a/Store.java',
      'Java',
      'package a;\nclass Store extends Base {\n  void save() {}\n}\n',
    );
    const other = file(
      'src/a/Other.java',
      'Java',
      'package a;\nclass Other {\n  void save() {}\n}\n',
    );
    const svc = file(
      'src/a/Svc.java',
      'Java',
      'package a;\nclass Svc {\n  private Store field;\n  void run(Store p, String s) {\n    p.save();\n    Store local = make();\n    local.ping();\n    field.save();\n    s.length();\n  }\n}\n',
    );
    const files = [base, store, other, svc];
    const links = resolveCalls(files).filter((l) => l.file === 'src/a/Svc.java');
    expect(show(files, links)).toEqual([
      'save@5 calls inferred -> src/a/Store.java:save@3',
      'make@6 calls unresolved',
      'ping@7 calls inferred -> src/a/Base.java:ping@3',
      'save@8 calls inferred -> src/a/Store.java:save@3',
      'length@9 calls unresolved',
    ]);
    expect(links[0]!.detail).toBe('p is declared as Store (parameter of run)');
    expect(links[2]!.detail).toBe(
      'local is declared as Store (line 6); ping is inherited from Base',
    );
    expect(links[4]!.detail).toBe(
      's is a String (parameter of run), which is not declared in the repository',
    );
  });

  it('ambiguous names stay unresolved and say why', () => {
    const a = file('a.py', 'Python', 'class A:\n    def save(self):\n        pass\n');
    const b = file('b.py', 'Python', 'class B:\n    def save(self):\n        pass\n');
    const c = file('c.py', 'Python', 'def run(x):\n    x.save()\n');
    const links = resolveCalls([a, b, c]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ confidence: 'unresolved', name: 'save' });
    expect(links[0]!.detail).toBe(
      "2 declarations named save can be reached; the receiver's type is needed to choose",
    );
  });

  it('never links across languages', () => {
    const py = file('a.py', 'Python', 'def save():\n    pass\n');
    const rb = file('b.rb', 'Ruby', 'def run\n  save()\nend\n');
    const [l] = resolveCalls([py, rb]);
    expect(l).toMatchObject({ confidence: 'unresolved' });
  });
});

describe('base resolution', () => {
  it('links bases in the same file, through imports and by unique name; library bases stay unresolved', async () => {
    const { resolveBases } = await import('../src/index');
    const base = file('lib/base.py', 'Python', 'class Base:\n    pass\n\nclass Mixin:\n    pass\n');
    const app = file(
      'app/cart.py',
      'Python',
      'from lib.base import Base\nimport abc\n\nclass Local:\n    pass\n\nclass Cart(Base, Local, Mixin, abc.ABC):\n    pass\n',
      ['lib/base.py', undefined],
    );
    const files = [base, app];
    const links = resolveBases(files);
    expect(
      links.map((l) => `${l.base} ${l.kind} ${l.confidence}${l.target ? ` ${l.target.file}` : ''}`),
    ).toEqual([
      'Base extends inferred lib/base.py',
      'Local extends observed app/cart.py',
      'Mixin extends inferred lib/base.py',
      'abc.ABC extends unresolved',
    ]);
    expect(links[0]!.detail).toBe('resolved through the import at line 1');
  });

  it('a class implementing an interface is "implements"', async () => {
    const { resolveBases } = await import('../src/index');
    const j = file(
      'A.java',
      'Java',
      'interface Saver {}\nclass Base {}\nclass Cart extends Base implements Saver {}\n',
    );
    expect(resolveBases([j]).map((l) => `${l.base} ${l.kind}`)).toEqual([
      'Base extends',
      'Saver implements',
    ]);
  });
});
