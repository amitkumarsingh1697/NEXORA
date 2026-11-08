import type { NeuronKind, RegionId } from './model';

export interface Placement {
  region: RegionId;
  /** Human-readable reason; placement is always an inference. */
  reason: string;
}

export interface PlacementHints {
  kind?: NeuronKind;
  /** Package names the file imports (for example "react", "express", "drizzle-orm"). */
  imports?: readonly string[];
  /**
   * The UI framework the file's own workspace package depends on (from its package.json),
   * if any. A browser app keeps its HTTP client in src/api/; that is not server code.
   */
  uiPackage?: string;
}

const FRONTEND_PACKAGES =
  /^(react|react-dom|next\/(link|image|navigation|router|head)|vue|svelte|@angular\/|solid-js|preact|@remix-run\/react|lucide-react|@xyflow\/|cytoscape|three|d3|@tanstack\/react-)/;
const BACKEND_PACKAGES =
  /^(express|fastify|hono|koa|@nestjs\/|@hapi\/|node:http|node:https|http|https|next\/server|@trpc\/server|graphql|apollo-server|ws|socket\.io)$|^(@nestjs\/|@trpc\/server)/;
const DATABASE_PACKAGES =
  /^(pg|postgres|mysql2?|mongodb|mongoose|redis|ioredis|sqlite3|better-sqlite3|node:sqlite|drizzle-orm|drizzle-kit|prisma|@prisma\/client|typeorm|sequelize|knex|kysely|@supabase\/supabase-js|firebase-admin|dynamodb|@aws-sdk\/client-dynamodb)(\/|$)/;

const BACKEND_WORDS =
  'api|apis|server|servers|backend|routes?|controllers?|handlers?|middlewares?|services|resolvers|graphql|rpc|lambdas?|functions|workers?|jobs|cron';
/** Backend words that a browser app also uses for its own client code (src/api/, services/). */
const CLIENT_SIDE_WORDS = /(^|\/)(api|apis|services|rpc|graphql)(\/|\.|$)/i;
/** Words that only server code uses. */
const SERVER_ONLY_WORDS =
  /(^|\/)(server|servers|backend|routes?|controllers?|handlers?|middlewares?|resolvers|lambdas?|functions|workers?|jobs|cron)(\/|\.|$)/i;
/** A backend word as a folder (server/…), not only as a file name (api.ts). */
const BACKEND_FOLDER = new RegExp(`(^|/)(${BACKEND_WORDS})/`, 'i');

const RULES: { region: RegionId; test: RegExp; reason: string }[] = [
  // DevOps first: CI, containers and tool configuration are never application code.
  {
    region: 'devops',
    test: /(^|\/)(\.github|\.gitlab|\.circleci|\.husky|infrastructure|infra|deploy|deployment|k8s|kubernetes|helm|terraform|ansible|docker)(\/|$)/i,
    reason: 'CI, deployment or infrastructure folder',
  },
  {
    region: 'devops',
    test: /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Makefile|Procfile|Jenkinsfile|\.gitlab-ci\.yml|vercel\.json|netlify\.toml)$/i,
    reason: 'build or deployment file',
  },
  {
    region: 'devops',
    test: /(^|\/)[^/]*\.(config|conf)\.(c|m)?(t|j)s$|(^|\/)(vite|vitest|webpack|rollup|playwright|jest|eslint|prettier|babel|tsup|wxt|next|drizzle|tailwind|postcss)\.config\.[^/]+$/i,
    reason: 'tool configuration file',
  },
  {
    region: 'devops',
    test: /(^|\/)(scripts|bin|tools|\.?ci)\/[^/]+\.(sh|bash|ps1|mjs|cjs|js|ts|py)$|\.(sh|bash|ps1)$/i,
    reason: 'script',
  },
  {
    region: 'database',
    test: /(^|\/)(db|database|databases|migrations?|schema|schemas|prisma|drizzle|models|entities|repositories|repository|dao|store|stores|persistence|sql|seeds?)(\/|\.|$)/i,
    reason: 'data access, schema or migration path',
  },
  { region: 'database', test: /\.(sql|prisma)$/i, reason: 'SQL or schema file' },
  {
    region: 'backend',
    test: new RegExp(`(^|/)(${BACKEND_WORDS})(/|\\.|$)`, 'i'),
    reason: 'server, API or service path',
  },
  {
    region: 'backend',
    test: /(^|\/)route\.(t|j)s$|(^|\/)(server|main)\.(c|m)?(t|j)s$/i,
    reason: 'route handler or server entry file',
  },
  {
    region: 'frontend',
    test: /(^|\/)(components?|pages|views|screens|layouts?|hooks|ui|web|client|frontend|public|static|styles?|assets|popup|entrypoints|app)(\/|$)/i,
    reason: 'user-interface path',
  },
  {
    region: 'frontend',
    test: /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html)$/i,
    reason: 'user-interface file type',
  },
];

/**
 * Decides which lobe of the brain a file (and the code in it) belongs to. The rules are
 * heuristics on the path and the packages the file imports; the result is labelled as an
 * inference wherever it is shown.
 */
export function classifyFile(path: string | undefined, hints: PlacementHints = {}): Placement {
  const p = (path ?? '').replace(/\\/g, '/');
  if (hints.kind === 'database') return { region: 'database', reason: 'database client' };
  if (hints.kind === 'table') return { region: 'database', reason: 'database table' };
  if (hints.kind === 'route') return { region: 'backend', reason: 'HTTP route' };
  if (hints.kind === 'config')
    return { region: 'devops', reason: 'configuration value read by the code' };
  if (hints.kind === 'component') return { region: 'frontend', reason: 'UI component' };
  const imports = hints.imports ?? [];
  const firstRule = (region: RegionId) => RULES.find((r) => r.region === region && r.test.test(p));

  // Tool and CI files win over everything else.
  const devops = firstRule('devops');
  if (devops) return { region: 'devops', reason: devops.reason };
  // A Next.js API route lives under app/ but is server code.
  if (/(^|\/)app\/api\//.test(p) || /(^|\/)pages\/api\//.test(p))
    return { region: 'backend', reason: 'Next.js API route' };
  const dbImport = imports.find((i) => DATABASE_PACKAGES.test(i));
  const db = firstRule('database');
  if (db) return { region: 'database', reason: db.reason };
  const be = firstRule('backend');
  const beImport = imports.find((i) => BACKEND_PACKAGES.test(i));
  const fe = firstRule('frontend');
  const feImport = imports.find((i) => FRONTEND_PACKAGES.test(i));
  // A file named like a backend word inside a UI folder (web/src/api.ts) is a browser client.
  const beOnlyByName = be && fe && !BACKEND_FOLDER.test(p) && !beImport;
  // In a package that depends on a UI framework, api/ or services/ alone is the browser's
  // client for a server, not the server (QA AL-03). Real server words and imports still win.
  const clientOnlyWords =
    be &&
    hints.uiPackage &&
    !beImport &&
    CLIENT_SIDE_WORDS.test(p) &&
    !SERVER_ONLY_WORDS.test(p) &&
    !/(^|\/)route\.(t|j)s$|(^|\/)(server|main)\.(c|m)?(t|j)s$/i.test(p);
  if (clientOnlyWords)
    return {
      region: 'frontend',
      reason: `API client in a package that depends on ${hints.uiPackage}`,
    };
  // A server or services folder wins over a database import: that code uses the database.
  if (be && !(fe && feImport) && !beOnlyByName) return { region: 'backend', reason: be.reason };
  if (dbImport) return { region: 'database', reason: `imports ${dbImport}` };
  if (beImport) return { region: 'backend', reason: `imports ${beImport}` };
  if (fe) return { region: 'frontend', reason: fe.reason };
  if (feImport) return { region: 'frontend', reason: `imports ${feImport}` };
  return { region: 'core', reason: 'no frontend, backend, database or DevOps signal' };
}
