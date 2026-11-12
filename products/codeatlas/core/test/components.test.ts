import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { indexRepository, openDb, type Db } from '../src/index';
import { maskComponent, rewriteStores } from '../src/indexer/sfc';

/** A small app with Svelte, Vue and Astro components that use each other and plain TypeScript. */
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'app', type: 'module' }),
  'src/lib/format.ts': [
    'export function label(n: number): string {',
    '  return `#${n}`;',
    '}',
    'export function tooltip(node: HTMLElement, text: string) {',
    '  node.title = text;',
    '}',
    '',
  ].join('\n'),
  'src/lib/stores.ts': [
    'export const user = { subscribe(run: (v: { name: string }) => void) { run({ name: "a" }); return () => {}; } };',
    '',
  ].join('\n'),
  'src/Button.svelte': [
    '<script lang="ts">',
    '  let { onclick }: { onclick: () => void } = $props();',
    '</script>',
    '<button {onclick}><slot /></button>',
    '',
  ].join('\n'),
  'src/Card.svelte': [
    '<script lang="ts">',
    "  import Button from './Button.svelte';",
    "  import { label, tooltip } from './lib/format';",
    "  import { user } from './lib/stores';",
    '  let { items }: { items: { id: number; name: string }[] } = $props();',
    '  let count = $state(0);',
    '  function pick(id: number) {',
    '    count = id;',
    '  }',
    '</script>',
    '',
    '<!-- {ignored()} -->',
    "<h1 class=\"t {count ? 'on' : ''}\">{$user.name}</h1>",
    '{#each items as item, i (item.id)}',
    '  <Button onclick={() => pick(item.id)}>',
    '    <span use:tooltip={item.name}>{label(i)}</span>',
    '  </Button>',
    '{:else}',
    '  <p>none</p>',
    '{/each}',
    '{#snippet row(n: number)}',
    '  <b>{label(n)}</b>',
    '{/snippet}',
    '{#if count > 1}',
    '  {@render row(count)}',
    '{/if}',
    '<style>',
    '  h1 { color: red; }',
    '</style>',
    '',
  ].join('\n'),
  'src/MyButton.vue': [
    '<template><button @click="$emit(\'press\')"><slot /></button></template>',
    '<script setup lang="ts">',
    "defineEmits(['press']);",
    '</script>',
    '',
  ].join('\n'),
  'src/List.vue': [
    '<template>',
    '  <ul>',
    '    <li v-for="(item, index) in items" :key="item.id" @click="select(item)">',
    '      {{ format(item.name, index) }}',
    '    </li>',
    '  </ul>',
    '  <my-button @press="reset()" />',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import MyButton from './MyButton.vue';",
    "import { label } from './lib/format';",
    'const props = defineProps<{ items: { id: number; name: string }[] }>();',
    'function select(i: { id: number }) {',
    '  return i.id;',
    '}',
    'function format(s: string, n: number) {',
    '  return s + label(n);',
    '}',
    'function reset() {',
    '  return props.items.length;',
    '}',
    '</script>',
    '',
  ].join('\n'),
  'src/pages/index.astro': [
    '---',
    "import Card from '../Card.svelte';",
    "import { label } from '../lib/format';",
    'const items = [{ id: 1, name: "a" }];',
    '---',
    '<html>',
    '  <body>',
    '    <Card items={items} />',
    '    <ul>{items.map((i) => <li>{label(i.id)}</li>)}</ul>',
    '  </body>',
    '</html>',
    '',
  ].join('\n'),
  'bin/tool': [
    '#!/usr/bin/env node',
    "import { label } from '../src/lib/format.js';",
    'function main() {',
    '  console.log(label(1));',
    '}',
    'main();',
    '',
  ].join('\n'),
};

let root: string;
let db: Db;
let repoId: number;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-components-'));
  for (const [p, body] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  db = openDb(':memory:');
  ({ repoId } = indexRepository(db, root));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

type Edge = { kind: string; src: string; dst: string; confidence: string; line: number };
const edges = (from: string): Edge[] =>
  db
    .prepare(
      `SELECT e.kind, s.key AS src, d.key AS dst, e.confidence, e.evidence_line AS line
       FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.evidence_path = ? AND e.kind IN ('calls', 'renders', 'imports')
       ORDER BY e.evidence_line, e.kind, d.key`,
    )
    .all(repoId, from) as Edge[];
const fmt = (e: Edge) => `${e.line} ${e.kind} ${e.src} -> ${e.dst} [${e.confidence}]`;
const symbols = (file: string) =>
  (
    db
      .prepare(
        "SELECT key, symbol_kind AS kind, start_line AS line FROM nodes WHERE repo_id = ? AND kind = 'symbol' AND file_path = ? ORDER BY key",
      )
      .all(repoId, file) as { key: string; kind: string; line: number }[]
  ).map((s) => `${s.key} ${s.kind} ${s.line}`);
const inventory = (path: string) =>
  db
    .prepare('SELECT status, method, reason FROM file_inventory WHERE repo_id = ? AND path = ?')
    .get(repoId, path) as { status: string; method: string; reason: string | null };

describe('component reader', () => {
  it('keeps every line of the component and produces TypeScript that parses', () => {
    for (const p of ['src/Card.svelte', 'src/List.vue', 'src/pages/index.astro']) {
      const m = maskComponent(p, FILES[p]!)!;
      expect(m.code.split('\n').length).toBe(FILES[p]!.split('\n').length);
      const sf = ts.createSourceFile(
        p + m.ext,
        m.code,
        ts.ScriptTarget.ES2022,
        true,
        m.ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      expect((sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics).toEqual([]);
    }
  });

  it('drops comments, styles and text, and reads store values as their stores', () => {
    const m = maskComponent('src/Card.svelte', FILES['src/Card.svelte']!)!;
    expect(m.code).not.toContain('ignored');
    expect(m.code).not.toContain('color: red');
    expect(m.code).not.toContain('none');
    expect(m.code).toContain('(user.name)');
    expect(rewriteStores('$state(1); $count; $$props; a.$b; count').code).toBe(
      '$state(1); count; $$props; a.$b; count',
    );
  });

  it('ignores scripts that are not code', () => {
    const m = maskComponent(
      'x.svelte',
      '<svelte:head><script type="application/ld+json">{"a": f()}</script></svelte:head>\n',
    )!;
    expect(m.scripts).toBe(0);
    expect(m.code).not.toContain('f()');
  });
});

describe('Svelte, Vue and Astro components', () => {
  it('records components as fully analysed by the compiler, with the method named', () => {
    for (const [p, kind] of [
      ['src/Card.svelte', 'Svelte'],
      ['src/List.vue', 'Vue'],
      ['src/pages/index.astro', 'Astro'],
    ] as const) {
      const r = inventory(p);
      expect(r.status, p).toBe('full');
      expect(r.method).toMatch(new RegExp(`^${kind} component: .*TypeScript Compiler API`));
    }
  });

  it('extracts script declarations and snippets with their real lines (destructured props are not symbols, as in .ts files)', () => {
    expect(symbols('src/Card.svelte')).toEqual([
      'src/Card.svelte#count variable 6',
      'src/Card.svelte#pick function 7',
      'src/Card.svelte#row function 21',
    ]);
    expect(symbols('src/List.vue')).toContain('src/List.vue#select function 14');
  });

  it('links template calls, directives and component tags, resolved by the compiler', () => {
    expect(edges('src/Card.svelte').map(fmt)).toEqual([
      '2 imports src/Card.svelte -> src/Button.svelte [observed]',
      '3 imports src/Card.svelte -> src/lib/format.ts [observed]',
      '4 imports src/Card.svelte -> src/lib/stores.ts [observed]',
      '15 calls src/Card.svelte -> src/Card.svelte#pick [observed]',
      '15 renders src/Card.svelte -> src/Button.svelte [observed]',
      '16 calls src/Card.svelte -> src/lib/format.ts#label [observed]',
      '16 calls src/Card.svelte -> src/lib/format.ts#tooltip [observed]',
      '22 calls src/Card.svelte#row -> src/lib/format.ts#label [observed]',
      '25 calls src/Card.svelte -> src/Card.svelte#row [observed]',
    ]);
    expect(edges('src/List.vue').map(fmt)).toEqual([
      '3 calls src/List.vue -> src/List.vue#select [observed]',
      '4 calls src/List.vue -> src/List.vue#format [observed]',
      '7 calls src/List.vue -> src/List.vue#reset [observed]',
      '7 renders src/List.vue -> src/MyButton.vue [observed]',
      '11 imports src/List.vue -> src/MyButton.vue [observed]',
      '12 imports src/List.vue -> src/lib/format.ts [observed]',
      '18 calls src/List.vue#format -> src/lib/format.ts#label [observed]',
    ]);
    expect(edges('src/pages/index.astro').map(fmt)).toEqual([
      '2 imports src/pages/index.astro -> src/Card.svelte [observed]',
      '3 imports src/pages/index.astro -> src/lib/format.ts [observed]',
      '8 renders src/pages/index.astro -> src/Card.svelte [observed]',
      '9 calls src/pages/index.astro -> src/lib/format.ts#label [observed]',
    ]);
  });

  it('analyses a script without an extension that a #! line identifies', () => {
    expect(inventory('bin/tool').status).toBe('full');
    expect(edges('bin/tool').map(fmt)).toEqual([
      '2 imports bin/tool -> src/lib/format.ts [observed]',
      '4 calls bin/tool#main -> src/lib/format.ts#label [observed]',
      '6 calls bin/tool -> bin/tool#main [observed]',
    ]);
  });
});
