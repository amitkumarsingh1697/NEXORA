import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntaxLanguages } from '@nexora/syntax';
import { analyserOf, SYNTAX_LANGUAGES, languageInfo } from '@nexora/languages';
import { validateBrain, type BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb, type Db } from '../src/index';

/** A repository in three languages with calls inside and across files, and one broken file. */
const FILES: Record<string, string> = {
  'shop/store.py': [
    'class Store:',
    '    def save(self, sku: str) -> bool:',
    '        return True',
    '',
    'def load(path: str) -> "Store":',
    '    return Store()',
    '',
  ].join('\n'),
  'shop/cart.py': [
    'from shop.store import Store, load',
    '',
    'class Base:',
    '    pass',
    '',
    'class Cart(Base):',
    '    def __init__(self, store: Store, owner=None):',
    '        self.store = store',
    '',
    '    def add(self, sku: str, qty: int = 1) -> int:',
    '        self.check(sku)',
    '        self.store.save(sku)',
    '        return qty',
    '',
    '    def check(self, sku):',
    '        return len(sku) > 0',
    '',
    'def main():',
    '    Cart(load("x")).add("a")',
    '',
  ].join('\n'),
  'svc/src/main/java/org/acme/Saver.java':
    'package org.acme;\n\npublic interface Saver {\n  boolean save(String sku);\n}\n',
  'svc/src/main/java/org/acme/Ledger.java': [
    'package org.acme;',
    '',
    'public class Ledger implements Saver {',
    '  public boolean save(String sku) { return audit(sku) > 0; }',
    '  private int audit(String sku) { return sku.length(); }',
    '  public static Ledger create() { return new Ledger(); }',
    '}',
    '',
  ].join('\n'),
  'tools/build.rb': [
    'require_relative "helpers"',
    '',
    'class Builder',
    '  def run(target)',
    '    prepare(target)',
    '    Helpers.log(target)',
    '  end',
    '',
    '  def prepare(target)',
    '  end',
    'end',
    '',
  ].join('\n'),
  'tools/helpers.rb': 'module Helpers\n  def self.log(msg)\n    puts msg\n  end\nend\n',
  // Unbalanced: the grammar recovers, the file is partial with the error line.
  'tools/broken.py': 'def fine():\n    return 1\n\ndef broken(:\n    pass\n',
};

let root: string;
let db: Db;
let repoId: number;
let brain: BrainModel;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-syntax-'));
  for (const [p, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
      { stdio: 'ignore' },
    );
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  db = openDb(':memory:');
  repoId = indexRepository(db, root).repoId;
  const b = buildBrain(db, repoId);
  if (!b) throw new Error('no brain');
  brain = b;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const status = (path: string) =>
  db
    .prepare(
      'SELECT status, method, reason, resolution FROM file_inventory WHERE repo_id = ? AND path = ?',
    )
    .get(repoId, path) as
    | { status: string; method: string; reason: string | null; resolution: string | null }
    | undefined;

const edge = (kind: string, src: string, dst: string) =>
  db
    .prepare(
      `SELECT e.confidence, e.detail, e.evidence_line AS line FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.kind = ? AND s.key = ? AND d.key = ?`,
    )
    .get(repoId, kind, src, dst) as
    { confidence: string; detail: string; line: number } | undefined;

describe('registry and syntax layer agree', () => {
  it('the languages the registry sends to the syntax analyser are exactly those with a grammar spec', () => {
    expect([...SYNTAX_LANGUAGES].sort()).toEqual(syntaxLanguages().sort());
    for (const l of SYNTAX_LANGUAGES) {
      expect(languageInfo(l), l).toBeDefined();
      expect(analyserOf(l), l).toBe('syntax');
    }
  });
});

describe('indexing a mixed repository with the syntax layer', () => {
  it('marks cleanly parsed files full and a file with syntax errors partial, with the line', () => {
    for (const p of ['shop/store.py', 'shop/cart.py', 'tools/build.rb', 'tools/helpers.rb'])
      expect(status(p), p).toMatchObject({ status: 'full', resolution: 'syntax', reason: null });
    expect(status('svc/src/main/java/org/acme/Ledger.java')?.method).toMatch(
      /^Full syntax parse \(tree-sitter tree-sitter-java@0\.23\.5\)$/,
    );
    const broken = status('tools/broken.py');
    expect(broken?.status).toBe('partial');
    expect(broken?.reason).toMatch(/syntax error.*first at line 4/);
    // The declaration before the error is still read.
    expect(
      db
        .prepare("SELECT 1 FROM nodes WHERE repo_id = ? AND key = 'tools/broken.py#fine'")
        .get(repoId),
    ).toBeTruthy();
  });

  it('records parameters, declared returns and signatures on symbols', () => {
    const row = db
      .prepare("SELECT data FROM nodes WHERE repo_id = ? AND key = 'shop/cart.py#Cart.add'")
      .get(repoId) as { data: string };
    const data = JSON.parse(row.data);
    expect(data).toMatchObject({
      extraction: 'syntax',
      language: 'Python',
      declKind: 'method',
      signature: 'def add(self, sku: str, qty: int = 1) -> int',
      returns: 'int',
      returnsDeclared: true,
      params: [
        { name: 'sku', type: 'str', optional: false },
        { name: 'qty', type: 'int', optional: true },
      ],
    });
  });

  it('links calls with their evidence and how they were resolved', () => {
    expect(edge('calls', 'shop/cart.py#Cart.add', 'shop/cart.py#Cart.check')).toEqual({
      confidence: 'observed',
      detail: 'self.check: member of Cart',
      line: 11,
    });
    expect(edge('calls', 'shop/cart.py#main', 'shop/store.py#load')).toEqual({
      confidence: 'inferred',
      detail: 'load: resolved through the import at line 1',
      line: 19,
    });
    expect(edge('instantiates', 'shop/cart.py#main', 'shop/cart.py#Cart')).toMatchObject({
      confidence: 'observed',
    });
    expect(edge('instantiates', 'shop/store.py#load', 'shop/store.py#Store')).toMatchObject({
      confidence: 'observed',
    });
    // self.store = store, where store is a parameter typed Store: save is Store.save.
    expect(edge('calls', 'shop/cart.py#Cart.add', 'shop/store.py#Store.save')).toEqual({
      confidence: 'inferred',
      detail:
        'self.store.save: self.store is declared as Store (field declared at line 8, from parameter store)',
      line: 12,
    });
    // Java: implicit member call, and new.
    expect(
      edge(
        'calls',
        'svc/src/main/java/org/acme/Ledger.java#Ledger.save',
        'svc/src/main/java/org/acme/Ledger.java#Ledger.audit',
      ),
    ).toMatchObject({ confidence: 'observed' });
    expect(
      edge(
        'instantiates',
        'svc/src/main/java/org/acme/Ledger.java#Ledger.create',
        'svc/src/main/java/org/acme/Ledger.java#Ledger',
      ),
    ).toMatchObject({ confidence: 'observed' });
    // Ruby: implicit self call, and a module method through require_relative.
    expect(
      edge('calls', 'tools/build.rb#Builder.run', 'tools/build.rb#Builder.prepare'),
    ).toMatchObject({
      confidence: 'observed',
    });
    expect(
      edge('calls', 'tools/build.rb#Builder.run', 'tools/helpers.rb#Helpers.log'),
    ).toMatchObject({
      confidence: 'inferred',
    });
  });

  it('links base classes and implemented interfaces', () => {
    expect(edge('extends', 'shop/cart.py#Cart', 'shop/cart.py#Base')).toMatchObject({
      confidence: 'observed',
    });
    expect(
      edge(
        'implements',
        'svc/src/main/java/org/acme/Ledger.java#Ledger',
        'svc/src/main/java/org/acme/Saver.java#Saver',
      ),
    ).toMatchObject({ confidence: 'inferred' });
  });

  it('keeps calls it could not resolve on the caller, not as invented links', () => {
    const row = db
      .prepare("SELECT data FROM nodes WHERE repo_id = ? AND key = 'shop/cart.py#Cart.check'")
      .get(repoId) as { data: string };
    expect(JSON.parse(row.data).unresolvedCalls).toEqual(['len']);
  });

  it('draws the parsed code in the brain with members, parameters and labelled synapses', () => {
    const r = validateBrain(JSON.parse(JSON.stringify(brain)));
    expect(r.ok).toBe(true);
    const cart = brain.neurons.find((n) => n.name === 'Cart');
    const add = brain.neurons.find((n) => n.name === 'Cart.add');
    const check = brain.neurons.find((n) => n.name === 'Cart.check');
    expect(add).toMatchObject({
      kind: 'method',
      parent: cart?.id,
      returns: 'int',
      returnsDeclared: true,
    });
    expect(add?.params).toEqual([
      { name: 'sku', type: 'str', optional: false },
      { name: 'qty', type: 'int', optional: true },
    ]);
    expect(check?.params).toEqual([{ name: 'sku', type: '', optional: false }]);
    expect(
      brain.synapses.find((s) => s.source === add?.id && s.target === check?.id),
    ).toMatchObject({ kind: 'calls', confidence: 'observed', line: 11 });
    const ledger = brain.neurons.find((n) => n.name === 'Ledger');
    const saver = brain.neurons.find((n) => n.name === 'Saver');
    expect(
      brain.synapses.find((s) => s.source === ledger?.id && s.target === saver?.id)?.kind,
    ).toBe('implements');
  });
});
