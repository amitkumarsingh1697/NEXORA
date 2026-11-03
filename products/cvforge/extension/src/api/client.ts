/**
 * CVForge extension API client.
 *
 * Token handling:
 * - The refresh token is the only long-lived secret. It lives in
 *   `storage.local` because the popup closes constantly; it rotates on every
 *   refresh and the server detects reuse (a replayed token revokes the device).
 * - The short-lived access token lives in `storage.session`, which is held in
 *   memory and cleared when the browser closes.
 * - Tokens are never logged and never sent anywhere except the configured
 *   CVForge origin.
 */

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface PairResult {
  deviceId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface ResumeOption {
  resumeId: string;
  title: string;
  versionId: string;
  versionNumber: number;
  label: string | null;
}

export interface CapturePayload {
  resumeVersionId: string;
  jobText: string;
  sourceUrl: string;
  sourceSite: 'linkedin' | 'naukri' | 'generic';
  title?: string;
  company?: string;
  location?: string;
}

const K_REFRESH = 'cvf.refreshToken';
const K_ACCESS = 'cvf.accessToken';
const K_ACCESS_EXP = 'cvf.accessTokenExpiresAt';
const K_DEVICE = 'cvf.deviceId';

/** Refresh the access token this many ms before it expires. */
const EXPIRY_SKEW_MS = 60_000;

export interface ClientDeps {
  baseUrl: string;
  /** Persistent store (storage.local). */
  local: KeyValueStore;
  /** Ephemeral store (storage.session). */
  session: KeyValueStore;
  fetch?: typeof fetch;
  now?: () => number;
}

export class CvforgeClient {
  private readonly base: string;
  private readonly local: KeyValueStore;
  private readonly session: KeyValueStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private refreshing: Promise<string> | null = null;

  constructor(deps: ClientDeps) {
    this.base = deps.baseUrl.replace(/\/$/, '');
    this.local = deps.local;
    this.session = deps.session;
    this.fetchImpl = deps.fetch ?? ((...args) => fetch(...args));
    this.now = deps.now ?? Date.now;
  }

  get serverUrl(): string {
    return this.base;
  }

  async isPaired(): Promise<boolean> {
    return (await this.local.get(K_REFRESH)) !== undefined;
  }

  async pair(code: string, deviceName: string): Promise<void> {
    const res = await this.request<PairResult>('/api/extension/pair', {
      method: 'POST',
      body: { code: code.trim().toUpperCase(), deviceName },
    });
    await this.store(res);
    await this.local.set(K_DEVICE, res.deviceId);
  }

  async resumes(): Promise<ResumeOption[]> {
    const res = await this.authed<{ resumes: ResumeOption[] }>('/api/extension/resumes', {
      method: 'GET',
    });
    return res.resumes;
  }

  async capture(payload: CapturePayload): Promise<{ workspaceId: string; url: string }> {
    return this.authed('/api/extension/jobs', { method: 'POST', body: payload });
  }

  /** Revoke this device on the server (best effort) and forget all tokens locally. */
  async logout(): Promise<void> {
    try {
      await this.authed('/api/extension/logout', { method: 'POST', body: {} });
    } catch {
      // The device may already be revoked; local tokens are cleared regardless.
    }
    await this.clear();
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.local.remove(K_REFRESH),
      this.local.remove(K_DEVICE),
      this.session.remove(K_ACCESS),
      this.session.remove(K_ACCESS_EXP),
    ]);
  }

  private async store(t: {
    accessToken: string;
    accessTokenExpiresAt: string;
    refreshToken: string;
  }): Promise<void> {
    await this.local.set(K_REFRESH, t.refreshToken);
    await this.session.set(K_ACCESS, t.accessToken);
    await this.session.set(K_ACCESS_EXP, String(new Date(t.accessTokenExpiresAt).getTime()));
  }

  private async accessToken(): Promise<string> {
    const token = await this.session.get(K_ACCESS);
    const exp = Number(await this.session.get(K_ACCESS_EXP));
    if (token && Number.isFinite(exp) && exp - EXPIRY_SKEW_MS > this.now()) return token;
    return this.refresh();
  }

  /** Single-flight refresh so two concurrent calls never spend the same refresh token twice (which the server treats as reuse). */
  private refresh(): Promise<string> {
    this.refreshing ??= (async () => {
      try {
        const refreshToken = await this.local.get(K_REFRESH);
        if (!refreshToken)
          throw new ApiError(401, 'NOT_PAIRED', 'This browser is not connected to CVForge.');
        try {
          const res = await this.request<Omit<PairResult, 'deviceId'>>('/api/extension/refresh', {
            method: 'POST',
            body: { refreshToken },
          });
          await this.store(res);
          return res.accessToken;
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            await this.clear();
            throw new ApiError(
              401,
              'NOT_PAIRED',
              'Your connection to CVForge has expired or was revoked. Pair again from CVForge settings.',
            );
          }
          throw e;
        }
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async authed<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    let token = await this.accessToken();
    try {
      return await this.request<T>(path, init, token);
    } catch (e) {
      // Access token rejected (e.g. server secret rotated): refresh once and retry.
      if (e instanceof ApiError && e.status === 401) {
        await this.session.remove(K_ACCESS);
        token = await this.refresh();
        return this.request<T>(path, init, token);
      }
      throw e;
    }
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown },
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: 'omit',
      });
    } catch {
      throw new ApiError(
        0,
        'NETWORK',
        `Could not reach CVForge at ${this.base}. Check that it is running.`,
      );
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data as ApiErrorBody | null)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? `HTTP_${res.status}`,
        err?.message ?? `Request failed (${res.status}).`,
      );
    }
    return data as T;
  }
}

/** Adapts a WebExtension storage area to KeyValueStore. */
export function storageArea(area: {
  get(k: string): Promise<Record<string, unknown>>;
  set(v: Record<string, unknown>): Promise<void>;
  remove(k: string): Promise<void>;
}): KeyValueStore {
  return {
    async get(key) {
      const v = (await area.get(key))[key];
      return typeof v === 'string' ? v : undefined;
    },
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
  };
}
