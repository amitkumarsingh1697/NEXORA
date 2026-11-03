import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  body: unknown;
  raw: IncomingMessage;
}

export type Handler = (req: Req) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:(\w+)/g, (_m, k: string) => {
        keys.push(k);
        return '([^/]+)';
      })}$`,
    );
    this.routes.push({ method, pattern, keys, handler });
  }

  match(
    method: string,
    path: string,
  ): { handler: Handler; params: Record<string, string> } | 'method' | null {
    let methodMismatch = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      if (r.method !== method) {
        methodMismatch = true;
        continue;
      }
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')));
      return { handler: r.handler, params };
    }
    return methodMismatch ? 'method' : null;
  }
}

export async function readJson(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return undefined;
  const type = req.headers['content-type'] ?? '';
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'TOO_LARGE', 'Request body too large.');
    chunks.push(c as Buffer);
  }
  if (!size) return undefined;
  if (!type.includes('application/json'))
    throw new HttpError(415, 'UNSUPPORTED_MEDIA', 'Expected application/json.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Malformed JSON body.');
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(data);
}

export function safeEqualStr(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Local-service request guard:
 * - Host must be loopback with our port (defeats DNS rebinding).
 * - Origin, when present, must be our own origin (defeats cross-site requests).
 * - API calls must carry the session token in a custom header, which browsers
 *   cannot send cross-origin without a CORS preflight that we never approve.
 */
export function checkRequest(
  req: IncomingMessage,
  port: number,
  token: string,
  isApi: boolean,
): void {
  const host = (req.headers.host ?? '').toLowerCase();
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!allowedHosts.includes(host))
    throw new HttpError(421, 'BAD_HOST', 'Requests must target 127.0.0.1.');
  const origin = req.headers.origin;
  if (origin && !allowedHosts.some((h) => origin === `http://${h}`))
    throw new HttpError(403, 'BAD_ORIGIN', 'Cross-origin requests are not allowed.');
  if (isApi) {
    const got = req.headers['x-codeatlas-token'];
    if (typeof got !== 'string' || !safeEqualStr(got, token))
      throw new HttpError(
        401,
        'UNAUTHENTICATED',
        'Missing or invalid CodeAtlas session token. Open the link printed when the service started.',
      );
  }
}
