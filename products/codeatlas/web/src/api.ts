const TOKEN_KEY = 'codeatlas.token';

/** The service prints a link with #token=...; keep it for this tab only, then remove it from the URL. */
export function captureToken(): void {
  const m = /(?:^#|&)token=([^&]+)/.exec(location.hash);
  if (m?.[1]) {
    try {
      sessionStorage.setItem(TOKEN_KEY, decodeURIComponent(m[1]));
    } catch {
      memToken = decodeURIComponent(m[1]);
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
}

let memToken: string | null = null;
export function token(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? memToken;
  } catch {
    return memToken;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const t = token();
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(t ? { 'x-codeatlas-token': t } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string };
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'HTTP',
      data?.error?.message ?? `Request failed (${res.status})`,
    );
  return data as T;
}
