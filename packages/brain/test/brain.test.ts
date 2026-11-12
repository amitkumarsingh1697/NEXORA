import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BrainIndex,
  BRAIN_TEMPLATE_PATH,
  SYNAPSE_WORDS,
  classDiagram,
  columnTypeText,
  tableDiagram,
  tableFiles,
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

  it('keeps a coverage summary and bounds it (QA AL-01)', () => {
    const r = validateBrain({
      ...MODEL,
      coverage: {
        partial: true,
        summary: 'Only 1 of 9 code files were analysed.',
        gaps: ['8 .java files not analysed.', 42, 'x'.repeat(900)],
        unreadSchemas: 'Schema sources … 3 Liquibase changelogs.',
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.coverage).toEqual({
      partial: true,
      summary: 'Only 1 of 9 code files were analysed.',
      gaps: ['8 .java files not analysed.', 'x'.repeat(500)],
      unreadSchemas: 'Schema sources … 3 Liquibase changelogs.',
    });
    const none = validateBrain({ ...MODEL, coverage: { partial: true } });
    expect(none.ok && none.model.coverage).toBeUndefined();
  });

  it('refuses oversized models', () => {
    // 100,000 parts and 400,000 connections: large monorepos (Twenty has 46,088 parts) fit.
    const neurons = Array.from({ length: 100_001 }, (_, i) => ({ id: `n${i}`, name: 'x' }));
    expect(validateBrain({ format: 1, neurons, synapses: [] }).ok).toBe(false);
    expect(validateBrain({ format: 1, neurons: neurons.slice(0, 50_000), synapses: [] }).ok).toBe(
      true,
    );
    const two = [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ];
    const synapses = Array.from({ length: 400_001 }, () => ({ source: 'a', target: 'b' }));
    expect(validateBrain({ format: 1, neurons: two, synapses }).ok).toBe(false);
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
    ['README.md', 'docs'],
    ['docs/guide/setup.mdx', 'docs'],
    ['CHANGELOG', 'docs'],
    ['dist/licenses/licenses.xml', 'core'],
    ['tools/LicenseProcessMojo.groovy', 'core'],
    ['LICENSE.txt', 'docs'],
    ['pom.xml', 'devops'],
    ['services/web/build.gradle.kts', 'devops'],
    ['settings.gradle', 'devops'],
    ['package.json', 'devops'],
    ['CMakeLists.txt', 'devops'],
  ])('%s → %s', (path, region) => {
    expect(classifyFile(path).region).toBe(region);
  });

  it('uses imports and kinds when the path says nothing', () => {
    expect(classifyFile('src/lib/x.ts', { imports: ['pg'] })).toEqual({
      region: 'database',
      reason: 'imports pg',
    });
    expect(classifyFile('src/lib/x.ts', { imports: ['express'] }).region).toBe('backend');
    // Services that use the database are still backend code.
    expect(classifyFile('backend/src/services/auth.ts', { imports: ['drizzle-orm'] }).region).toBe(
      'backend',
    );
    expect(classifyFile('src/lib/x.ts', { imports: ['react'] }).region).toBe('frontend');
    expect(classifyFile(undefined, { kind: 'route' }).region).toBe('backend');
    expect(classifyFile(undefined, { kind: 'config' }).region).toBe('devops');
    expect(classifyFile('C:\\repo\\src\\db\\client.ts').region).toBe('database');
  });
  it("keeps a browser app's src/api/ client out of the Backend lobe (QA AL-03)", () => {
    // Keycloak account console: fetch wrappers under src/api/ in a React package.
    expect(classifyFile('js/apps/account-ui/src/api/request.ts', { uiPackage: 'react' })).toEqual({
      region: 'frontend',
      reason: 'API client in a package that depends on react',
    });
    expect(classifyFile('js/apps/account-ui/src/api.ts', { uiPackage: 'react' }).region).toBe(
      'frontend',
    );
    // Without the package hint the old placement is unchanged.
    expect(classifyFile('js/apps/account-ui/src/api/request.ts').region).toBe('backend');
    // Real server code inside a React (e.g. Next.js) package stays backend.
    expect(classifyFile('src/server/api/users.ts', { uiPackage: 'react' }).region).toBe('backend');
    expect(classifyFile('app/api/items/route.ts', { uiPackage: 'react' }).region).toBe('backend');
    expect(classifyFile('pages/api/hello.ts', { uiPackage: 'react' }).region).toBe('backend');
    expect(
      classifyFile('src/api/handlers.ts', { uiPackage: 'react', imports: ['express'] }).region,
    ).toBe('backend');
    expect(classifyFile('src/api/routes/users.ts', { uiPackage: 'react' }).region).toBe('backend');
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

  it('places documentation in the brainstem and accepts the build, configuration and docs kinds', () => {
    const m: BrainModel = {
      ...structuredClone(MODEL),
      neurons: [
        { id: 'readme', name: 'README.md', kind: 'file', file: 'README.md' },
        { id: 'intro', name: 'Intro', kind: 'section', file: 'README.md', parent: 'readme' },
        { id: 'pom', name: 'pom.xml', kind: 'file', file: 'pom.xml' },
        ...(['dependency', 'plugin', 'task', 'module', 'bean', 'key', 'element'] as const).map(
          (kind) => ({ id: kind, name: kind, kind, file: 'pom.xml', parent: 'pom' }),
        ),
      ],
      synapses: [{ source: 'readme', target: 'pom', kind: 'references', confidence: 'inferred' }],
    };
    const v = validateBrain(m);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.warnings).toEqual([]);
    const out = layoutBrain(v.model);
    expect(out.find((n) => n.id === 'intro')?.region).toBe('docs');
    expect(out.find((n) => n.id === 'dependency')?.region).toBe('devops');
    const intro = out.find((n) => n.id === 'intro')!;
    expect(inside(intro.position, LOBES.docs.center, LOBES.docs.radii)).toBeLessThan(1.5);
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

  it('refuses models the page cannot show and flags observed links without evidence (QA AL-08)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brain-'));
    const script = new URL('../scripts/render-brain.mjs', import.meta.url).pathname;
    const run = (model: unknown, ...flags: string[]) => {
      const input = join(dir, 'm.json');
      writeFileSync(input, JSON.stringify(model));
      try {
        const out = execFileSync(process.execPath, [script, input, join(dir, 'o.html'), ...flags], {
          stdio: 'pipe',
          encoding: 'utf8',
        });
        return { code: 0, out };
      } catch (e) {
        const err = e as { status: number; stderr: string };
        return { code: err.status, out: err.stderr };
      }
    };
    expect(run({ ...MODEL, format: 2 })).toMatchObject({ code: 1 });
    const many = Array.from({ length: 20001 }, (_, i) => ({
      id: `n${i}`,
      name: 'n',
      kind: 'function',
    }));
    expect(run({ ...MODEL, neurons: many, synapses: [] }).out).toMatch(/Too many neurons/);
    const unbacked = {
      ...MODEL,
      synapses: [
        {
          source: MODEL.neurons[0]!.id,
          target: MODEL.neurons[1]!.id,
          kind: 'calls',
          confidence: 'observed',
        },
      ],
    };
    expect(run(unbacked).code).toBe(0);
    expect(run(unbacked, '--strict')).toMatchObject({
      code: 1,
      out: expect.stringMatching(/no file and line/),
    });
  });

  it('ships the same template and script inside the ArchLens skill', () => {
    const skill = new URL('../../../skills/archlens/', import.meta.url);
    expect(readFileSync(new URL('assets/brain-template.html', skill), 'utf8')).toBe(template);
    expect(readFileSync(new URL('scripts/render-brain.mjs', skill), 'utf8')).toBe(
      readFileSync(new URL('../scripts/render-brain.mjs', import.meta.url), 'utf8'),
    );
  });
});

describe('tables and diagrams', () => {
  const SHOP: BrainModel = {
    format: 1,
    title: 'Shop',
    source: { producer: 'test', repository: 'shop', generatedAt: '2026-11-08T00:00:00Z' },
    neurons: [
      {
        id: 't.users',
        name: 'users',
        kind: 'table',
        file: 'db/schema.sql',
        columns: [
          { name: 'id', type: 'serial', nullable: false, primaryKey: true },
          { name: 'email', type: 'varchar', length: 255, nullable: false, unique: true },
          {
            name: 'balance',
            type: 'numeric',
            precision: 12,
            scale: 2,
            nullable: true,
            default: '0',
          },
        ],
      },
      {
        id: 't.orders',
        name: 'orders',
        kind: 'table',
        file: 'db/schema.sql',
        columns: [
          { name: 'id', type: 'serial', nullable: false, primaryKey: true },
          { name: 'note', type: 'text', nullable: true },
          {
            name: 'user_id',
            type: 'integer',
            nullable: false,
            references: { table: 'users', column: 'id' },
          },
        ],
      },
      { id: 't.logs', name: 'logs', kind: 'table', file: 'other.sql', columns: [] },
      { id: 'c.base', name: 'Base<T>', kind: 'class', region: 'backend' },
      { id: 'c.svc', name: 'Svc', kind: 'class', region: 'backend' },
      {
        id: 'c.svc.run',
        name: 'Svc.run',
        kind: 'method',
        parent: 'c.svc',
        params: [{ name: 'id', type: 'number' }],
        returns: 'Promise<void>',
      },
      { id: 'i.empty', name: 'Empty', kind: 'interface', region: 'backend' },
      { id: 'i.port', name: 'Port', kind: 'interface', region: 'backend' },
      { id: 'c.ui', name: 'Widget', kind: 'class', region: 'frontend' },
      { id: 'f.list', name: 'listOrders', kind: 'function', file: 'svc/orders.ts' },
    ],
    synapses: [
      { source: 't.orders', target: 't.users', kind: 'references', confidence: 'observed' },
      { source: 'c.svc', target: 'c.base', kind: 'extends', confidence: 'observed' },
      { source: 'c.svc', target: 'i.port', kind: 'implements', confidence: 'observed' },
      { source: 'f.list', target: 't.orders', kind: 'reads_table', confidence: 'observed' },
    ],
  };

  it('validates columns and table links, dropping junk', () => {
    const r = validateBrain({
      ...SHOP,
      neurons: [
        {
          id: 't',
          name: 't',
          kind: 'table',
          columns: [
            { name: 'a', type: 'numeric', precision: 10, scale: 2, nullable: false },
            { name: 'b', length: -1, precision: 'x', primaryKey: 'yes' },
            { type: 'int' },
            'junk',
          ],
        },
      ],
      synapses: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.neurons[0]?.columns).toEqual([
      { name: 'a', type: 'numeric', precision: 10, scale: 2, nullable: false },
      { name: 'b', type: 'unknown', nullable: true },
    ]);
    expect(classifyFile('x.ts', { kind: 'table' }).region).toBe('database');
  });

  it('writes a column type with its size as written', () => {
    expect(columnTypeText({ type: 'varchar', length: 255 })).toBe('varchar(255)');
    expect(columnTypeText({ type: 'numeric', precision: 12, scale: 2 })).toBe('numeric(12, 2)');
    expect(columnTypeText({ type: 'timestamp', precision: 3 })).toBe('timestamp(3)');
    expect(columnTypeText({ type: 'text' })).toBe('text');
  });

  it('lists schema files and filters tables by file', () => {
    expect(tableFiles(SHOP)).toEqual([
      { file: 'db/schema.sql', tables: 2 },
      { file: 'other.sql', tables: 1 },
    ]);
    const d = tableDiagram(SHOP, false, { file: 'db/schema.sql' });
    expect(d).toMatchObject({ kind: 'er', total: 2, shown: 2 });
    expect(d.boxes.map((b) => b.id).sort()).toEqual(['t.orders', 't.users']);
  });

  it('draws an ER diagram with key columns and a crow-foot foreign key', () => {
    const d = tableDiagram(SHOP, false);
    expect(d.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(d.svg).toContain('PK    id');
    expect(d.svg).toContain('FK    user_id');
    expect(d.svg).not.toContain('balance');
    expect(d.svg).toContain('+ 2 other columns');
    expect(d.svg).toContain('marker-start="url(#many)" marker-end="url(#one)"');
    // The referenced table comes first (left), the referencing one after it.
    const users = d.boxes.find((b) => b.id === 't.users')!;
    const orders = d.boxes.find((b) => b.id === 't.orders')!;
    expect(orders.x).toBeGreaterThan(users.x);
  });

  it('draws a schema diagram with every column, type, size, nullability and default', () => {
    const d = tableDiagram(SHOP, true);
    expect(d.svg).toContain('email: varchar(255)  not null unique');
    expect(d.svg).toContain('balance: numeric(12, 2)  null = 0');
    expect(d.svg).toContain('user_id: integer  not null → users.id');
  });

  it('draws a class diagram with methods and inheritance, leaving out empty interfaces', () => {
    const d = classDiagram(SHOP, { region: 'backend' });
    expect(d.boxes.map((b) => b.id).sort()).toEqual(['c.base', 'c.svc', 'i.port']);
    expect(d.svg).toContain('run(id: number): Promise&#60;void&#62;');
    expect(d.svg).toContain('Base&#60;T&#62;');
    expect(d.svg).toContain('«interface»');
    expect(d.svg).toContain('stroke-dasharray="6 4"');
    expect(d.notes).toEqual([
      '1 interfaces with no recorded methods and no inheritance are not drawn.',
    ]);
    // Subclasses sit below what they extend.
    const base = d.boxes.find((b) => b.id === 'c.base')!;
    const svc = d.boxes.find((b) => b.id === 'c.svc')!;
    expect(svc.y).toBeGreaterThan(base.y);
  });

  it('escapes names so a hostile model cannot inject markup', () => {
    const evil = structuredClone(SHOP);
    evil.neurons[0]!.name = '<script>alert(1)</script>';
    evil.neurons[0]!.columns![0]!.name = '"><img src=x onerror=alert(1)>';
    const d = tableDiagram(evil, true);
    expect(d.svg).not.toMatch(/<script|<img/);
    expect(d.svg).toContain('&#60;script&#62;');
  });

  it('says when there is nothing to draw, and caps large diagrams openly', () => {
    expect(tableDiagram({ ...SHOP, neurons: [] }, false).svg).toContain(
      'no database tables were found',
    );
    const many = {
      ...SHOP,
      neurons: Array.from({ length: 30 }, (_, i) => ({
        id: `t${i}`,
        name: `t${i}`,
        kind: 'table' as const,
        columns: [],
      })),
      synapses: [],
    };
    const d = tableDiagram(many, false, { max: 10 });
    expect(d).toMatchObject({ total: 30, shown: 10 });
    expect(d.notes).toEqual(['20 less-connected tables are not drawn.']);
  });

  it('shows table links in plain words', () => {
    const r = new BrainIndex(SHOP).relations('t.orders');
    expect(r.incoming.get('reads_table')?.[0]?.other.id).toBe('f.list');
    expect(SYNAPSE_WORDS.reads_table).toEqual({ out: 'Reads table', in: 'Read by' });
  });
});

describe('coverage inventory', () => {
  const counts = {
    full: 2,
    partial: 3,
    text: 1,
    unsupported: 0,
    failed: 1,
    excluded: 2,
    binary: 1,
  };
  const inventory = {
    producer: 'test',
    total: 10,
    counts,
    analysed: 5,
    readable: 7,
    coverage: 0.714,
    fullCoverage: 0.286,
    languages: [
      {
        language: 'Java',
        category: 'programming',
        files: 4,
        counts: { ...counts, full: 0, text: 0, failed: 0, excluded: 0, binary: 0, partial: 4 },
        analysed: 4,
        coverage: 1,
        status: 'partial',
        method: 'declarations',
      },
    ],
    categories: [{ category: 'programming', label: 'Programming', files: 4, analysed: 4 }],
    fileTypes: [
      {
        role: 'maven',
        label: 'Maven POM',
        group: 'build',
        groupLabel: 'Build',
        files: 1,
        counts,
        analysed: 1,
        coverage: 1,
        examples: ['pom.xml'],
      },
    ],
    directories: [{ path: 'src', files: 10, counts, analysed: 5, coverage: 0.714 }],
    reasons: [
      { status: 'failed', reason: 'XML is not well formed', files: 1, examples: ['bad.xml'] },
      { status: 'bogus', reason: 'x', files: 1, examples: [] },
    ],
    notAnalysed: [
      {
        path: 'bad.xml',
        language: 'XML',
        status: 'failed',
        method: 'xml',
        reason: 'XML is not well formed',
      },
    ],
    notAnalysedTotal: 1,
    ambiguous: [{ language: 'Perl', alternatives: ['Prolog'], files: 1 }],
    unlisted: [{ path: 'vendor/lib', reason: 'git submodule' }],
  };
  const withInv = (inv: unknown) =>
    validateBrain({
      ...MODEL,
      coverage: { partial: true, summary: 'Some files', gaps: [], inventory: inv },
    });

  it('keeps an inventory whose counts add up, and new link synapse kinds', () => {
    const r = validateBrain({
      ...MODEL,
      synapses: [
        ...MODEL.synapses,
        { source: 'page', target: 'svc', kind: 'builds', confidence: 'observed' },
      ],
      coverage: { partial: true, summary: 'Some files', gaps: [], inventory },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inv = r.model.coverage?.inventory;
    expect(inv?.total).toBe(10);
    expect(inv?.analysed).toBe(5);
    expect(inv?.readable).toBe(7);
    expect(inv?.languages[0]?.language).toBe('Java');
    expect(inv?.reasons.map((x) => x.status)).toEqual(['failed']);
    expect(inv?.unlisted?.[0]?.reason).toBe('git submodule');
    expect(r.model.synapses.some((s) => s.kind === 'builds')).toBe(true);
    expect(SYNAPSE_WORDS.builds.out).toBe('Builds');
  });

  it('drops an inventory whose status counts do not add up to the total', () => {
    const r = withInv({ ...inventory, total: 11 });
    expect(r.ok && r.model.coverage?.inventory).toBeFalsy();
    expect(r.ok && r.model.coverage?.summary).toBe('Some files');
  });

  it('bounds untrusted inventory lists and rejects impossible ratios', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      path: `f${i}`,
      language: 'X',
      status: 'text',
      method: 'text',
    }));
    const r = withInv({ ...inventory, coverage: 7, notAnalysed: many, notAnalysedTotal: 2000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.coverage?.inventory?.notAnalysed.length).toBe(500);
    expect(r.model.coverage?.inventory?.notAnalysedTotal).toBe(2000);
    expect(r.model.coverage?.inventory?.coverage).toBeNull();
  });
});
