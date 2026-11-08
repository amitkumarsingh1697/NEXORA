import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const FIXTURE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'fixture-app',
    main: 'src/server.ts',
    bin: { fixture: 'src/cli.ts' },
    dependencies: { express: '^4.19.2' },
    devDependencies: { vitest: '^3.0.0', typescript: '^5.6.0' },
  }),
  Dockerfile: 'FROM node:22-alpine\nCOPY . /app\nCMD ["node", "src/server.ts"]\n',
  '.github/workflows/ci.yml':
    'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, baseUrl: '.', paths: { '@/*': ['src/*'] } },
  }),
  'src/lib/types.ts': 'export interface Op {\n  run(): number;\n}\n',
  'src/lib/math.ts': [
    "import type { Op } from './types';",
    '',
    '/** Adds two positive numbers. */',
    'export function add(a: number, b: number): number {',
    '  if (a > 0 && b > 0) return a + b;',
    '  return 0;',
    '}',
    '',
    'export class Calculator implements Op {',
    '  run(): number {',
    '    return add(1, 2);',
    '  }',
    '}',
    '',
  ].join('\n'),
  'src/handlers.ts': [
    'export function handleUsers(_req: unknown, res: { json(x: unknown): void }) {',
    '  res.json(listUsers());',
    '}',
    '',
    'function listUsers(): string[] {',
    '  return [];',
    '}',
    '',
    'export function each(cb: () => void) {',
    '  cb();',
    '}',
    '',
  ].join('\n'),
  'src/server.ts': [
    "import express from 'express';",
    "import { add, Calculator } from '@/lib/math';",
    "import { handleUsers } from './handlers';",
    '',
    'const app = express();',
    "app.get('/users', handleUsers);",
    "app.post('/sum', (_req: unknown, res: { json(x: unknown): void }) => {",
    '  res.json(add(1, 2));',
    '});',
    '',
    'export async function start() {',
    '  const calc = new Calculator();',
    '  calc.run();',
    "  await import('./missing');",
    '  const fns = [add];',
    '  fns[0]!(1, 2);',
    '}',
    '',
  ].join('\n'),
  // A deliberate import cycle (S1-4).
  'src/ring/a.ts': "import { b } from './b';\nexport const a = (): number => b() + 1;\n",
  'src/ring/b.ts':
    "import { a } from './a';\nexport function b(): number {\n  return 0;\n}\nexport const viaA = () => a();\n",
  'src/cli.ts': "import { start } from './server';\nvoid start();\n",
  'src/legacy.js': 'export function legacy(o) {\n  return o.computeTotal();\n}\n',
  'src/cart.ts': 'export class Cart {\n  computeTotal(): number {\n    return 1;\n  }\n}\n',
  'app/api/items/[id]/route.ts': "export async function GET() {\n  return new Response('ok');\n}\n",
  'src/math.test.ts':
    "import { add } from '@/lib/math';\nif (add(1, 1) !== 2) throw new Error('bad');\n",
  'migrations/001_users.sql':
    'CREATE TABLE users (\n  id integer PRIMARY KEY,\n  name varchar(80) NOT NULL\n);\n',
  'src/repo.ts':
    "declare const sql: { prepare(q: string): { all(): unknown[] } };\nexport function allUsers() {\n  return sql.prepare('SELECT id, name FROM users').all();\n}\n",
  'tools/report.py': 'def report():\n    print("quarterly report generator")\n',
  '.env': 'SECRET_TOKEN=supersecretvalue123\n',
  'docs/README.md':
    '# Fixture App\n\n## Math\n\nThe `add` function lives in `src/lib/math.ts`.\n\n## Unrelated\n\nNothing here.\n',
};

export function makeFixtureRepo(withGit = true): string {
  const root = mkdtempSync(join(tmpdir(), 'codeatlas-fixture-'));
  for (const [p, content] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
  if (withGit) {
    const git = (args: string[], author = 'Asha Rao <asha@example.com>') => {
      const [name, email] = author.replace('>', '').split(' <');
      execFileSync(
        'git',
        ['-C', root, '-c', `user.name=${name}`, '-c', `user.email=${email}`, ...args],
        {
          stdio: 'ignore',
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
            GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
          },
        },
      );
    };
    git(['init', '-q', '-b', 'main']);
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'initial']);
    writeFileSync(
      join(root, 'src/lib/math.ts'),
      `${FIXTURE['src/lib/math.ts']}\nexport const PI = 3.14;\n`,
    );
    git(['commit', '-q', '-am', 'add PI'], 'Ben Ortiz <ben@example.com>');
  }
  return root;
}
