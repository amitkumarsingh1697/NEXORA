import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BrainIndex,
  BRAIN_TEMPLATE_PATH,
  LOBES,
  classifyFile,
  layoutBrain,
  renderBrainHtml,
  scriptSafeJson,
  validateBrain,
  type BrainModel,
} from '../src/index';

const MODEL: BrainModel = {
  format: 1,
  title: 'Shop',
  source: { producer: 'test', repository: 'shop', generatedAt: '2026-11-08T00:00:00Z' },
  neurons: [
    { id: 'page', name: 'CartPage', kind: 'component', file: 'web/src/pages/Cart.tsx' },
    { id: 'route', name: 'POST /cart', kind: 'route' },
    { id: 'svc', name: 'CartService', kind: 'class', file: 'server/src/services/cart.ts' },
    {
      id: 'svc.add',
      name: 'CartService.add',
      kind: 'method',
      parent: 'svc',
      file: 'server/src/services/cart.ts',
      line: 12,
      params: [{ name: 'sku', type: 'string' }],
      returns: 'Promise<Cart>',
      returnsDeclared: true,
    },
    { id: 'repo', name: 'saveCart', kind: 'function', file: 'server/src/db/cart-repo.ts' },
    { id: 'ci', name: 'ci.yml', kind: 'file', file: '.github/workflows/ci.yml' },
    { id: 'util', name: 'formatPrice', kind: 'function', file: 'shared/src/money.ts' },
  ],
  synapses: [
    { source: 'page', target: 'route', kind: 'calls', confidence: 'inferred' },
    { source: 'route', target: 'svc.add', kind: 'handles', confidence: 'observed' },
    {
      source: 'svc.add',
      target: 'repo',
      kind: 'calls',
      confidence: 'observed',
      file: 'server/src/services/cart.ts',
      line: 14,
    },
    { source: 'page', target: 'util', kind: 'calls', confidence: 'observed' },
  ],
};

describe('validateBrain', () => {
  it('accepts a valid model unchanged in substance', () => {
    const r = validateBrain(MODEL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.model.neurons).toHaveLength(7);
    expect(r.model.synapses).toHaveLength(4);
    expect(r.model.neurons[3]?.params).toEqual([{ name: 'sku', type: 'string', optional: false }]);
  });

  it('fails on structural problems', () => {
    expect(validateBrain(null).ok).toBe(false);
    expect(validateBrain([]).ok).toBe(false);
    const r = validateBrain({ format: 2, neurons: {}, synapses: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/format.*neurons/s);
  });

  it('drops bad neurons and dangling synapses with warnings instead of failing', () => {
    const r = validateBrain({
      format: 1,
      neurons: [
        { id: 'a', name: 'a', kind: 'mystery', region: 'kitchen', parent: 'ghost' },
        { id: 'a', name: 'dup', kind: 'function' },
        { name: 'no id' },
        { id: 'b', name: 'b', kind: 'function' },
      ],
      synapses: [
        { source: 'a', target: 'b', kind: 'teleports', confidence: 'certain' },
        { source: 'a', target: 'nowhere', kind: 'calls', confidence: 'observed' },
        { source: 'a', target: 'a', kind: 'calls', confidence: 'observed' },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.neurons.map((n) => n.id)).toEqual(['a', 'b']);
    const a = r.model.neurons[0]!;
    expect(a.kind).toBe('function');
    expect(a.region).toBeUndefined();
    expect(a.parent).toBeUndefined();
    expect(r.model.synapses).toEqual([
      expect.objectContaining({ kind: 'calls', confidence: 'unknown' }),
    ]);
    expect(r.warnings.join('\n')).toMatch(/unknown kind/);
    expect(r.warnings.join('\n')).toMatch(/Duplicate/);
    expect(r.warnings.join('\n')).toMatch(/2 synapse\(s\)/);
  });

  it('refuses oversized models', () => {
    const neurons = Array.from({ length: 20_001 }, (_, i) => ({ id: `n${i}`, name: 'x' }));
    expect(validateBrain({ format: 1, neurons, synapses: [] }).ok).toBe(false);
  });
});

describe('classifyFile', () => {
  it.each([
    ['web/src/components/Button.tsx', 'frontend'],
    ['src/styles/site.css', 'frontend'],
    ['server/src/routes/users.ts', 'backend'],
    ['src/server.ts', 'backend'],
    ['app/api/items/route.ts', 'backend'],
    ['src/db/schema.ts', 'database'],
    ['migrations/001_init.sql', 'database'],
    ['.github/workflows/ci.yml', 'devops'],
    ['Dockerfile', 'devops'],
    ['vite.config.ts', 'devops'],
    ['scripts/release.mjs', 'devops'],
    ['packages/logging/src/index.ts', 'core'],
    ['src/lib/math.ts', 'core'],
    ['products/app/web/src/api.ts', 'frontend'],
    ['products/app/server/src/api.ts', 'backend'],
  ])('%s → %s', (path, region) => {
    expect(classifyFile(path).region).toBe(region);
  });

  it('uses imports and kinds when the path says nothing', () => {
    expect(classifyFile('src/lib/x.ts', { imports: ['pg'] })).toEqual({
      region: 'database',
      reason: 'imports pg',
    });
    expect(classifyFile('src/lib/x.ts', { imports: ['express'] }).region).toBe('backend');
    expect(classifyFile('src/lib/x.ts', { imports: ['react'] }).region).toBe('frontend');
    expect(classifyFile(undefined, { kind: 'route' }).region).toBe('backend');
    expect(classifyFile(undefined, { kind: 'config' }).region).toBe('devops');
    expect(classifyFile('C:\\repo\\src\\db\\client.ts').region).toBe('database');
  });
});

describe('layoutBrain', () => {
  const inside = (p: number[], c: number[], r: number[]) =>
    ((p[0]! - c[0]!) / r[0]!) ** 2 +
    ((p[1]! - c[1]!) / r[1]!) ** 2 +
    ((p[2]! - c[2]!) / r[2]!) ** 2;

  it('places every neuron in the expected lobe and inside it', () => {
    const out = layoutBrain(MODEL);
    const region = Object.fromEntries(out.map((n) => [n.id, n.region]));
    expect(region).toEqual({
      page: 'frontend',
      route: 'backend',
      svc: 'backend',
      'svc.add': 'backend',
      repo: 'database',
      ci: 'devops',
      util: 'core',
    });
    for (const n of out) {
      const l = LOBES[n.region];
      // Cluster centre within 0.72, spread at most 0.32 (+0.09 for members), so well inside 1.5.
      expect(inside(n.position, l.center, l.radii)).toBeLessThan(1.5);
      expect(n.regionReason).not.toBe('');
    }
    expect(out.find((n) => n.id === 'page')?.degree).toBe(2);
  });

  it('is deterministic and keeps members next to their class', () => {
    const a = layoutBrain(MODEL);
    const b = layoutBrain(structuredClone(MODEL));
    expect(a.map((n) => n.position)).toEqual(b.map((n) => n.position));
    const svc = a.find((n) => n.id === 'svc')!.position;
    const add = a.find((n) => n.id === 'svc.add')!.position;
    expect(Math.hypot(svc[0] - add[0], svc[1] - add[1], svc[2] - add[2])).toBeLessThanOrEqual(
      0.09 * Math.sqrt(3),
    );
  });

  it('keeps a producer-given region and reason', () => {
    const m = structuredClone(MODEL);
    m.neurons[6] = { ...m.neurons[6]!, region: 'backend', regionReason: 'read by the API' };
    const util = layoutBrain(m).find((n) => n.id === 'util')!;
    expect(util.region).toBe('backend');
    expect(util.regionReason).toBe('read by the API');
  });
});

describe('BrainIndex', () => {
  const index = new BrainIndex(MODEL);

  it('answers where input comes from and where work goes', () => {
    const r = index.relations('svc.add');
    expect(r.parent?.id).toBe('svc');
    expect([...r.incoming.keys()]).toEqual(['handles']);
    expect(r.incoming.get('handles')?.[0]?.other.id).toBe('route');
    const calls = r.outgoing.get('calls');
    expect(calls?.[0]?.other.id).toBe('repo');
    expect(calls?.[0]?.synapse).toMatchObject({ confidence: 'observed', line: 14 });
    expect(index.relations('svc').members.map((m) => m.id)).toEqual(['svc.add']);
    expect(index.relations('missing').incoming.size).toBe(0);
  });

  it('recalls by name, member name and file', () => {
    expect(index.search('add')[0]?.id).toBe('svc.add');
    expect(index.search('CART')[0]?.name).toMatch(/Cart/);
    expect(index.search('cart-repo').map((n) => n.id)).toEqual(['repo']);
    expect(index.search('  ')).toEqual([]);
    expect(index.search('a', 2)).toHaveLength(2);
  });
});

describe('renderBrainHtml', () => {
  const template = readFileSync(BRAIN_TEMPLATE_PATH, 'utf8');

  it('escapes the model so it cannot close its script element', () => {
    const json = scriptSafeJson({ s: '</script><b>&\u2028\u2029' });
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual({ s: '</script><b>&\u2028\u2029' });
  });

  it('builds one self-contained page carrying the model', () => {
    const evil = { ...MODEL, title: 'A $& </title><script>x</script>' };
    const html = renderBrainHtml(evil, template);
    expect(html).not.toContain('__BRAIN_DATA__');
    expect(html).toContain('<title>A $&amp; &lt;/title>&lt;script>x&lt;/script></title>');
    expect(html).not.toMatch(/<script[^>]+src=/);
    const data = /<script id="brain-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    expect(JSON.parse(data![1]!)).toEqual(evil);
  });

  it('refuses a template without the placeholder', () => {
    expect(() => renderBrainHtml(MODEL, '<html></html>')).toThrow(/placeholder/);
  });

  it('matches the standalone script used by the ArchLens skill', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brain-'));
    const input = join(dir, 'model.json');
    const output = join(dir, 'brain.html');
    writeFileSync(input, JSON.stringify({ ...MODEL, title: 'A $& <b>' }));
    const script = new URL('../scripts/render-brain.mjs', import.meta.url).pathname;
    execFileSync(process.execPath, [
      script,
      input,
      output,
      '--template',
      BRAIN_TEMPLATE_PATH.pathname,
    ]);
    expect(readFileSync(output, 'utf8')).toBe(
      renderBrainHtml({ ...MODEL, title: 'A $& <b>' }, template),
    );
  });

  it('ships the same template and script inside the ArchLens skill', () => {
    const skill = new URL('../../../skills/archlens/', import.meta.url);
    expect(readFileSync(new URL('assets/brain-template.html', skill), 'utf8')).toBe(template);
    expect(readFileSync(new URL('scripts/render-brain.mjs', skill), 'utf8')).toBe(
      readFileSync(new URL('../scripts/render-brain.mjs', import.meta.url), 'utf8'),
    );
  });
});
