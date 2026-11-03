/**
 * Inventory of build, dependency, container and CI manifests, and frameworks
 * declared in package.json dependencies (spec §5.3, AB-5.3-03).
 *
 * Everything here is an observed fact about files: a manifest exists at a path,
 * or a package declares a dependency. That a declared framework is actually
 * used at runtime is not claimed.
 */
import { basename } from 'node:path';

export type ManifestKind =
  'package' | 'workspace' | 'tsconfig' | 'lockfile' | 'container' | 'ci' | 'build' | 'env-example';

export interface Manifest {
  path: string;
  kind: ManifestKind;
  confidence: 'observed';
}

export interface Framework {
  name: string;
  category: 'web' | 'ui' | 'test' | 'build' | 'database' | 'validation' | 'runtime';
  package: string;
  version: string;
  /** package.json that declares it. */
  evidence: string;
  dev: boolean;
  confidence: 'observed';
}

const RULES: [RegExp, ManifestKind][] = [
  [/(^|\/)package\.json$/, 'package'],
  [/(^|\/)(pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/, 'workspace'],
  [/(^|\/)(tsconfig|jsconfig)[^/]*\.json$/, 'tsconfig'],
  [
    /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/,
    'lockfile',
  ],
  [
    /(^|\/)(Dockerfile[^/]*|[^/]*\.Dockerfile|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/,
    'container',
  ],
  [
    /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|bitbucket-pipelines\.yml)$/,
    'ci',
  ],
  [
    /(^|\/)(vite|vitest|webpack|rollup|next|nuxt|svelte|astro|tsup|esbuild|playwright|jest|wxt|drizzle)\.config\.[cm]?[jt]s$/,
    'build',
  ],
  [/(^|\/)\.env\.(example|sample|template)$/, 'env-example'],
];

/** Classify a repository-relative path as a manifest, or null. */
export function manifestKind(path: string): ManifestKind | null {
  for (const [re, kind] of RULES) if (re.test(path)) return kind;
  return null;
}

export function findManifests(paths: Iterable<string>): Manifest[] {
  const out: Manifest[] = [];
  for (const path of paths) {
    const kind = manifestKind(path);
    if (kind) out.push({ path, kind, confidence: 'observed' });
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
}

/** Dependency name (exact, or prefix ending in '/') to framework label. */
const KNOWN: [string, string, Framework['category']][] = [
  ['next', 'Next.js', 'web'],
  ['express', 'Express', 'web'],
  ['fastify', 'Fastify', 'web'],
  ['koa', 'Koa', 'web'],
  ['hono', 'Hono', 'web'],
  ['@nestjs/core', 'NestJS', 'web'],
  ['nuxt', 'Nuxt', 'web'],
  ['@remix-run/', 'Remix', 'web'],
  ['astro', 'Astro', 'web'],
  ['react', 'React', 'ui'],
  ['vue', 'Vue', 'ui'],
  ['svelte', 'Svelte', 'ui'],
  ['@angular/core', 'Angular', 'ui'],
  ['solid-js', 'Solid', 'ui'],
  ['tailwindcss', 'Tailwind CSS', 'ui'],
  ['vitest', 'Vitest', 'test'],
  ['jest', 'Jest', 'test'],
  ['mocha', 'Mocha', 'test'],
  ['@playwright/test', 'Playwright', 'test'],
  ['cypress', 'Cypress', 'test'],
  ['vite', 'Vite', 'build'],
  ['webpack', 'webpack', 'build'],
  ['esbuild', 'esbuild', 'build'],
  ['typescript', 'TypeScript', 'build'],
  ['wxt', 'WXT', 'build'],
  ['prisma', 'Prisma', 'database'],
  ['@prisma/client', 'Prisma', 'database'],
  ['drizzle-orm', 'Drizzle ORM', 'database'],
  ['typeorm', 'TypeORM', 'database'],
  ['sequelize', 'Sequelize', 'database'],
  ['mongoose', 'Mongoose', 'database'],
  ['pg', 'node-postgres', 'database'],
  ['mysql2', 'MySQL2', 'database'],
  ['better-sqlite3', 'better-sqlite3', 'database'],
  ['knex', 'Knex', 'database'],
  ['redis', 'Redis client', 'database'],
  ['ioredis', 'ioredis', 'database'],
  ['zod', 'Zod', 'validation'],
  ['joi', 'Joi', 'validation'],
  ['yup', 'Yup', 'validation'],
  ['electron', 'Electron', 'runtime'],
];

function match(dep: string): [string, Framework['category']] | null {
  for (const [key, name, cat] of KNOWN)
    if (key.endsWith('/') ? dep.startsWith(key) : dep === key) return [name, cat];
  return null;
}

/** Frameworks declared by each package.json (path and parsed text). */
export function detectFrameworks(packageJsons: { path: string; text: string }[]): Framework[] {
  const out: Framework[] = [];
  for (const { path, text } of packageJsons) {
    if (basename(path) !== 'package.json') continue;
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(text) as typeof pkg;
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (const [deps, dev] of [
      [pkg.dependencies ?? {}, false],
      [pkg.devDependencies ?? {}, true],
    ] as const) {
      for (const [dep, version] of Object.entries(deps)) {
        const m = match(dep);
        if (!m || seen.has(m[0])) continue;
        seen.add(m[0]);
        out.push({
          name: m[0],
          category: m[1],
          package: dep,
          version: String(version).slice(0, 50),
          evidence: path,
          dev,
          confidence: 'observed',
        });
      }
    }
  }
  return out.sort((a, b) => a.evidence.localeCompare(b.evidence) || a.name.localeCompare(b.name));
}
