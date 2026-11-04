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
  integrationsView,
  repoLanguages,
  treeChildren,
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
  recordEvent,
  analyticsSummary,
  deleteAllLocalData,
  getSetting,
  setSetting,
  type AnalyticsKind,
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
import { JobRunner, type Job } from './jobs';

export interface ServiceContext {
  cfg: ServiceConfig;
  db: Db;
  dbPath: string;
  token: string;
  jobs: JobRunner;
  router: Router;
  log: ReturnType<typeof createLogger>;
}

/**
 * Record a local analytics event (spec §5.11). Recording happens after the user's action has
 * succeeded, so a failure here is logged and does not turn that action into an error.
 */
export function track<K extends AnalyticsKind>(
  ctx: ServiceContext,
  kind: K,
  repoId: number | null,
  data: Parameters<typeof recordEvent<K>>[3],
): void {
  try {
    recordEvent(ctx.db, kind, repoId, data);
  } catch (e) {
    ctx.log.error(
      { kind, err: e instanceof Error ? { name: e.name, message: e.message } : String(e) },
      'analytics event not recorded',
    );
  }
}

function trackJob(ctx: ServiceContext, job: Job): void {
  const durationMs = Math.max(0, Date.parse(job.finishedAt ?? '') - Date.parse(job.startedAt)) || 0;
  if (job.status === 'succeeded' && job.report) {
    const rep = job.report;
    track(ctx, 'index_succeeded', job.repoId, {
      files: rep.files.discovered,
      symbols: rep.symbols,
      relationships: Object.values(rep.edgesByConfidence).reduce((a, b) => a + b, 0),
      durationMs: rep.durationMs,
    });
    const f = riskView(ctx.db, job.repoId, 0).findings;
    track(ctx, 'findings_generated', job.repoId, {
      cycles: f.cycles.length,
      sensitiveConfig: f.sensitiveConfig.length,
    });
  } else if (job.status === 'failed' || job.status === 'cancelled') {
    track(ctx, 'index_failed', job.repoId, { cancelled: job.status === 'cancelled', durationMs });
  }
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

const LANGS = new Set(['typescript', 'javascript', 'markdown', 'json', 'text', 'unsupported']);
/** Optional language filter; only the languages discovery assigns are accepted. */
function langParam(v: string | null): string | undefined {
  if (!v) return undefined;
  if (!LANGS.has(v)) throw new HttpError(400, 'BAD_PARAM', 'Invalid language.');
  return v;
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

  // Settings, first run and local analytics (spec §5.11, §5.12 screens 1 and 19).
  const worktreeDir = ctx.cfg.worktreeDir ?? join(ctx.cfg.home, 'worktrees');
  r.add('GET', '/api/settings', () => ({
    dataLocation: ctx.cfg.home,
    database: ctx.dbPath,
    worktrees: worktreeDir,
    clones: join(ctx.cfg.home, 'clones'),
    firstRun: getSetting(ctx.db, 'welcome_dismissed') !== 'true' && listRepos(ctx.db).length === 0,
    analytics: { storedLocally: true, transmitted: false },
  }));
  r.add('POST', '/api/settings/welcome', () => {
    setSetting(ctx.db, 'welcome_dismissed', 'true');
    return { ok: true };
  });
  r.add('GET', '/api/analytics', (req) => {
    const repo = req.query.get('repo');
    return analyticsSummary(ctx.db, repo ? repoOr404(ctx, repo).id : undefined);
  });
  r.add('POST', '/api/data/delete-all', (req) => {
    z.strictObject({ confirm: z.literal('DELETE') }).parse(req.body);
    if (listRepos(ctx.db).some((repo) => ctx.jobs.activeFor(repo.id)))
      throw new HttpError(409, 'BUSY', 'Cancel or wait for indexing to finish first.');
    const deleted = deleteAllLocalData(ctx.db);
    return {
      deleted,
      note: `CodeAtlas's database was cleared. Your repositories were not touched. Folders CodeAtlas created are kept for you to review and delete: ${join(ctx.cfg.home, 'clones')} and ${worktreeDir}.`,
    };
  });

  r.add('DELETE', '/api/jobs/:id', async (req) => {
    const job = await ctx.jobs.cancel(req.params.id ?? '');
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'Job not found.');
    if (job.status === 'cancelled')
      ctx.db
        .prepare(
          "UPDATE index_runs SET status = 'failed', error = 'Cancelled by the user; the previous index is unchanged.', finished_at = ? WHERE repo_id = ? AND status = 'running'",
        )
        .run(new Date().toISOString(), job.repoId);
    return { job };
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
  r.add('GET', '/api/repos/:id/views/dependencies', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    const module = req.query.get('module') || undefined;
    const view = dependencyView(ctx.db, repo.id, {
      module,
      includeExternal: req.query.get('external') === '1',
      limit: Math.min(Number(req.query.get('limit')) || 250, 1000),
      lang: langParam(req.query.get('lang')),
    });
    if (module) track(ctx, 'module_explored', repo.id, {});
    return view;
  });
  r.add('GET', '/api/repos/:id/languages', (req) => ({
    languages: repoLanguages(ctx.db, repoOr404(ctx, req.params.id).id),
  }));
  r.add('GET', '/api/repos/:id/tree', (req) => {
    const repo = repoOr404(ctx, req.params.id);
    const opt = (k: string) => {
      const v = req.query.get(k);
      if (v !== null && v.length > 2000) throw new HttpError(400, 'BAD_PARAM', `${k} is too long.`);
      return v ?? undefined;
    };
    return {
      items: treeChildren(ctx.db, repo.id, {
        module: opt('module'),
        file: opt('file'),
        symbol: opt('symbol'),
        lang: langParam(req.query.get('lang')),
      }),
    };
  });
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
  r.add('GET', '/api/repos/:id/views/integrations', (req) =>
    integrationsView(ctx.db, repoOr404(ctx, req.params.id).id),
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
    return {
      hits: search(ctx.db, repoOr404(ctx, req.params.id).id, q, {
        limit: 30,
        lang: langParam(req.query.get('lang')),
      }),
    };
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
  // An index run left 'running' by a crash or kill never committed; record it as failed.
  db.prepare(
    "UPDATE index_runs SET status = 'failed', error = 'Interrupted before completion; the previous index is unchanged.', finished_at = ? WHERE status = 'running'",
  ).run(new Date().toISOString());
  const ctx: ServiceContext = {
    cfg,
    db,
    dbPath,
    token: loadOrCreateToken(cfg.home),
    jobs: new JobRunner(dbPath, (job) => trackJob(ctx, job)),
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
