import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { loadServiceConfig } from '../src/config';
import { createService, listen, type RouteRegistrar, type ServiceContext } from '../src/server';

export interface TestService {
  base: string;
  home: string;
  port: number;
  ctx: ServiceContext;
  server: Server;
  api: <T = unknown>(
    path: string,
    init?: {
      method?: string;
      body?: unknown;
      token?: string | null;
      headers?: Record<string, string>;
    },
  ) => Promise<{ status: number; body: T }>;
  waitForJob: (id: string) => Promise<{ status: string; error?: string }>;
  close: () => Promise<void>;
}

export async function startService(
  registrars: RouteRegistrar[] = [],
  env: Record<string, string> = {},
  /** Reuse an existing CODEATLAS_HOME, e.g. to simulate a restart. */
  existingHome?: string,
): Promise<TestService> {
  const home = existingHome ?? mkdtempSync(join(tmpdir(), 'codeatlas-home-'));
  const cfg = loadServiceConfig(
    { AI_PROVIDER: 'disabled', ...env, CODEATLAS_HOME: home },
    { port: 0 },
  );
  const { server, ctx } = createService(cfg, registrars);
  const port = await listen(server, 0);
  const base = `http://127.0.0.1:${port}`;
  const api: TestService['api'] = async (path, init = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (init.token !== null) headers['x-codeatlas-token'] = init.token ?? ctx.token;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: res.status, body: (await res.json()) as never };
  };
  const waitForJob = async (id: string) => {
    for (let i = 0; i < 600; i++) {
      const { body } = await api<{ job: { status: string; error?: string } }>(`/api/jobs/${id}`);
      if (body.job.status !== 'running') return body.job;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('job timeout');
  };
  return {
    base,
    home,
    port,
    ctx,
    server,
    api,
    waitForJob,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

/** Raw request with an arbitrary Host header (fetch does not allow overriding it). */
export function rawGet(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}
