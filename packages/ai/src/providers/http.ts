import { AiError } from '../types';

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Retries for network errors and 5xx only. Bounded to 0-3. */
  retries?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchJson(url: string, opts: FetchJsonOptions): Promise<unknown> {
  const retries = Math.min(Math.max(opts.retries ?? 1, 0), 3);
  const f = opts.fetchImpl ?? fetch;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const signals = [AbortSignal.timeout(opts.timeoutMs)];
    if (opts.signal) signals.push(opts.signal);
    try {
      const res = await f(url, {
        method: opts.method ?? 'GET',
        headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.any(signals),
      });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new AiError('provider_error', `Provider returned HTTP ${res.status}`);
        await delay(250 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new AiError('provider_error', `Provider returned HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof AiError) throw e;
      const name = (e as Error).name;
      if (name === 'TimeoutError') throw new AiError('timeout', 'Model request timed out.');
      if (name === 'AbortError') throw new AiError('timeout', 'Model request was cancelled.');
      lastErr = e;
      if (attempt < retries) {
        await delay(250 * 2 ** attempt);
        continue;
      }
    }
  }
  throw new AiError(
    'unavailable',
    `Model provider is not reachable${lastErr instanceof Error ? `: ${lastErr.message}` : ''}`,
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
