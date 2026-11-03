import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  dependencyView,
  findNodes,
  flowStarts,
  flowView,
  getRepo,
  impactOf,
  indexRuns,
  knowledgeView,
  latestCoverage,
  listRepos,
  modulesView,
  nodeDetail,
  openDb,
  ownershipView,
  readSource,
  riskView,
  search,
  unresolvedList,
  upsertRepo,
  cloneRepository,
  CloneError,
  type Db,
} from '@nexora/codeatlas-core';
import { createLogger } from '@nexora/logging';
import type { ServiceConfig } from './config';
import {
  checkRequest,
  HttpError,
  readJson,
  Router,
  send,
  SECURITY_HEADERS,
  type Req,
} from './http';
import { JobRunner } from './jobs';

export interface ServiceContext {
  cfg: ServiceConfig;
  db: Db;
  dbPath: string;
  token: string;
  jobs: JobRunner;
  router: Router;
  log: ReturnType<typeof createLogger>;
}

export function loadOrCreateToken(home: string): string {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const file = join(home, 'token');
  if (existsSync(file)) {
    const t = readFileSync(file, 'utf8').trim();
    if (t.length >= 32) return t;
  }
  const t = randomBytes(32).toString('base64url');
  writeFileSync(file, `${t}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return t;
}

function intParam(v: string | undefined, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'BAD_PARAM', `Invalid ${name}.`);
  return n;
}

export function repoOr404(ctx: ServiceContext, idParam: string | undefined) {
  const repo = getRepo(ctx.db, intParam(idParam, 'repository id'));
  if (!repo) throw new HttpError(404, 'NOT_FOUND', 'Repository not found.');
  return repo;
}

export function validateRepoPath(cfg: ServiceConfig, input: string): string {
  const abs = resolve(input);
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    throw new HttpError(400, 'NOT_FOUND', 'That folder does not exist.');
  }
  if (!statSync(real).isDirectory())
    throw new HttpError(400, 'NOT_DIRECTORY', 'That path is not a folder.');
  if (
    cfg.allowedRoots.length &&
    !cfg.allowedRoots.some((r) => {
      const rr = realpathSync(resolve(r));
      const rel = relative(rr, real);
      return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
    })
  )
    throw new HttpError(
      403,
      'NOT_ALLOWED',
      'That folder is outside the allowed roots configured for CodeAtlas.',
    );
  const home = realpathSync(resolve(cfg.home));
  if (real === home || real.startsWith(`${home}${sep}`))
    throw new HttpError(400, 'NOT_ALLOWED', 'CodeAtlas data folders cannot be indexed.');
  return real;
}

function registerCoreRoutes(ctx: ServiceContext): void {
  const r = ctx.router;
  r.add('GET', '/api/health', () => ({ status: 'ok' }));

  r.add('GET', '/api/repos', () => ({
    repos: listRepos(ctx.db).map((repo) => ({ ...repo, job: ctx.jobs.activeFor(repo.id) ?? null })),
  }));

  r.add('POST', '/api/repos', (req) => {
    const { path } = z.object({ path: z.string().trim().min(1).max(4096) }).parse(req.body);
    const root = validateRepoPath(ctx.cfg, path);
    const repo = upsertRepo(ctx.db, root, new Date());
    const job = ctx.jobs.start(repo.id, repo.root);
    return { repo: getRepo(ctx.db, repo.id), job };
  });

  // Clone a public repository, only on this explicit request (spec §5.2; research R13).
  r.add('POST', '/api/repos/clone', async (req) => {
    const { url } = z.object({ url: z.string().trim().min(1).max(2048) }).parse(req.body);
    let cloned: { path: string; url: string };
    try {
      cloned = await cloneRepository({ url, clonesDir: join(ctx.cfg.home, 'clones') });
    } catch (e) {
      if (e instanceof CloneError) {
        const status = { INVALID_URL: 400, BLOCKED_HOST: 400, CLONE_FAILED: 502, TIMEOUT: 504 }[
          e.code
        ];
        throw new HttpError(status, e.code, e.message);
      }
      throw e;
    }
    const repo = upsertRepo(ctx.db, cloned.path, new Date());
    const job = ctx.jobs.start(repo.id, repo.root);
    return { repo: getRepo(ctx.db, repo.id), job, clonedFrom: cloned.url };
  });

  r.add('POST', '/api/repos/:id/index', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    if (!existsSync(repo.root))
      throw new HttpError(409, 'MISSING', 'The repository folder no longer exists.');
    return { job: ctx.jobs.start(repo.id, repo.root) };
  });

  r.add('DELETE', '/api/repos/:id', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    if (ctx.jobs.activeFor(repo.id))
      throw new HttpError(409, 'BUSY', 'Wait for indexing to finish.');
    ctx.db
      .prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE repo_id = ?)')
      .run(repo.id);
    ctx.db.prepare('DELETE FROM repos WHERE id = ?').run(repo.id);
    return {
      ok: true,
      note: 'CodeAtlas data for this repository was deleted. Your files were not touched.',
    };
  });

  r.add('GET', '/api/jobs/:id', (req) => {
    const job = ctx.jobs.get(req.params.id ?? '');
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'Job not found.');
    return { job };
  });

  r.add('GET', '/api/repos/:id', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    return {
      repo,
      coverage: latestCoverage(ctx.db, repo.id),
      runs: indexRuns(ctx.db, repo.id),
      job: ctx.jobs.activeFor(repo.id) ?? null,
    };
  });

  r.add('GET', '/api/repos/:id/unresolved', (req) => ({
    items: unresolvedList(ctx.db, repoOr404(ctx, req.params.id).id),
  }));
  r.add('GET', '/api/repos/:id/views/modules', (req) =>
    modulesView(ctx.db, repoOr404(ctx, req.params.id).id),
  );
  r.add('GET', '/api/repos/:id/views/dependencies', (req) =>
    dependencyView(ctx.db, repoOr404(ctx, req.params.id).id, {
      module: req.query.get('module') || undefined,
      includeExternal: req.query.get('external') === '1',
      limit: Math.min(Number(req.query.get('limit')) || 250, 1000),
    }),
  );
  r.add('GET', '/api/repos/:id/flows', (req) => ({
    starts: flowStarts(ctx.db, repoOr404(ctx, req.params.id).id),
  }));
  r.add('GET', '/api/repos/:id/views/flow', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    return flowView(ctx.db, repo.id, intParam(req.query.get('start') ?? undefined, 'start'), {
      depth: Math.min(Number(req.query.get('depth')) || 4, 8),
    });
  });
  r.add('GET', '/api/repos/:id/views/risk', (req) =>
    riskView(ctx.db, repoOr404(ctx, req.params.id).id, 100),
  );
  r.add('GET', '/api/repos/:id/views/ownership', (req) =>
    ownershipView(ctx.db, repoOr404(ctx, req.params.id).id),
  );
  r.add('GET', '/api/repos/:id/views/knowledge', (req) =>
    knowledgeView(ctx.db, repoOr404(ctx, req.params.id).id),
  );
  r.add('GET', '/api/repos/:id/nodes/:nodeId', (req) => {
    const d = nodeDetail(
      ctx.db,
      repoOr404(ctx, req.params.id).id,
      intParam(req.params.nodeId, 'node id'),
    );
    if (!d) throw new HttpError(404, 'NOT_FOUND', 'Node not found.');
    return d;
  });
  r.add('GET', '/api/repos/:id/impact/:nodeId', (req) =>
    impactOf(ctx.db, repoOr404(ctx, req.params.id).id, intParam(req.params.nodeId, 'node id')),
  );
  r.add('GET', '/api/repos/:id/search', (req) => {
    const q = (req.query.get('q') ?? '').slice(0, 500);
    return { hits: search(ctx.db, repoOr404(ctx, req.params.id).id, q, { limit: 30 }) };
  });
  r.add('GET', '/api/repos/:id/find', (req) => ({
    nodes: findNodes(
      ctx.db,
      repoOr404(ctx, req.params.id).id,
      (req.query.get('q') ?? '').slice(0, 200),
    ),
  }));
  r.add('GET', '/api/repos/:id/source', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    const path = req.query.get('path') ?? '';
    try {
      return readSource(
        repo.root,
        path,
        Number(req.query.get('start')) || 1,
        Number(req.query.get('end')) || undefined,
      );
    } catch (e) {
      throw new HttpError(
        e instanceof Error && /outside/.test(e.message) ? 403 : 404,
        'SOURCE',
        e instanceof Error && /outside/.test(e.message) ? e.message : 'File not found.',
      );
    }
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(
  webDir: string,
  urlPath: string,
): { status: number; type: string; body: Buffer } | null {
  const root = realpathSync(webDir);
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  let file = join(root, clean);
  const rel = relative(root, file);
  if (rel.startsWith('..')) return null;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // SPA fallback
  if (!existsSync(file)) return null;
  return {
    status: 200,
    type: MIME[extname(file)] ?? 'application/octet-stream',
    body: readFileSync(file),
  };
}

export type RouteRegistrar = (ctx: ServiceContext) => void;

export function createService(
  cfg: ServiceConfig,
  extra: RouteRegistrar[] = [],
): { server: Server; ctx: ServiceContext } {
  mkdirSync(cfg.home, { recursive: true, mode: 0o700 });
  const dbPath = join(cfg.home, 'codeatlas.db');
  const db = openDb(dbPath);
  const ctx: ServiceContext = {
    cfg,
    db,
    dbPath,
    token: loadOrCreateToken(cfg.home),
    jobs: new JobRunner(dbPath),
    router: new Router(),
    log: createLogger({ name: 'codeatlas' }),
  };
  registerCoreRoutes(ctx);
  for (const reg of extra) reg(ctx);

  const server = createServer(async (rawReq, res) => {
    const url = new URL(rawReq.url ?? '/', 'http://127.0.0.1');
    const isApi = url.pathname.startsWith('/api/');
    const port = (server.address() as { port: number } | null)?.port ?? cfg.port;
    try {
      checkRequest(rawReq, port, ctx.token, isApi && url.pathname !== '/api/health');
      if (!isApi) {
        if (rawReq.method !== 'GET' && rawReq.method !== 'HEAD')
          throw new HttpError(405, 'METHOD', 'Method not allowed.');
        const s =
          cfg.webDir && existsSync(cfg.webDir) ? serveStatic(cfg.webDir, url.pathname) : null;
        if (!s) {
          res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain' });
          res.end('CodeAtlas web UI is not built. Run: pnpm --filter @nexora/codeatlas-web build');
          return;
        }
        res.writeHead(s.status, {
          ...SECURITY_HEADERS,
          'content-type': s.type,
          'cache-control': s.type.startsWith('text/html') ? 'no-store' : 'public, max-age=3600',
        });
        res.end(s.body);
        return;
      }
      const m = ctx.router.match(rawReq.method ?? 'GET', url.pathname);
      if (m === null) throw new HttpError(404, 'NOT_FOUND', 'Not found.');
      if (m === 'method') throw new HttpError(405, 'METHOD', 'Method not allowed.');
      const req: Req = {
        method: rawReq.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        params: m.params,
        body: await readJson(rawReq),
        raw: rawReq,
      };
      const out = await m.handler(req);
      send(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError)
        send(res, e.status, { error: { code: e.code, message: e.message } });
      else if (e instanceof z.ZodError)
        send(res, 400, {
          error: {
            code: 'VALIDATION',
            message: 'Invalid request.',
            details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        });
      else {
        ctx.log.error(
          {
            err: e instanceof Error ? { name: e.name, message: e.message } : String(e),
            path: url.pathname,
          },
          'unhandled error',
        );
        send(res, 500, { error: { code: 'INTERNAL', message: 'Something went wrong.' } });
      }
    }
  });
  server.on('close', () => db.close());
  return { server, ctx };
}

export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolveP, reject) => {
    server.once('error', reject);
    // Loopback only. Never 0.0.0.0.
    server.listen(port, '127.0.0.1', () => resolveP((server.address() as { port: number }).port));
  });
}
