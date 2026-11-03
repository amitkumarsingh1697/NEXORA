import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { AppError, isAppError } from '@nexora/validation';
import { auth, extensionService } from '@nexora/cvforge-backend';
import { ctx } from './context';

export const SESSION_COOKIE = 'cvf_session';

export type SessionUser = NonNullable<Awaited<ReturnType<typeof auth.getSessionUser>>>;

export function errorResponse(e: unknown): NextResponse {
  if (isAppError(e)) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, details: e.details ?? null } },
      { status: e.status },
    );
  }
  ctx().log.error(
    { err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e) },
    'unhandled error',
  );
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer)
 * must match the app origin. Combined with SameSite=Lax session cookies.
 */
function assertSameOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const expected = new URL(ctx().cfg.APP_ORIGIN).origin;
  const origin =
    req.headers.get('origin') ??
    (req.headers.get('referer') ? new URL(req.headers.get('referer') as string).origin : null);
  const self = req.nextUrl.origin;
  if (!origin || (origin !== expected && origin !== self))
    throw new AppError('FORBIDDEN', 'Cross-site request blocked.');
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return auth.getSessionUser(ctx(), token);
}

type RouteCtx<P> = { params: Promise<P> };

/** Wrap a cookie-authenticated route handler: CSRF check, session check, error mapping. */
export function withUser<P = Record<string, string>>(
  fn: (req: NextRequest, user: SessionUser, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      assertSameOrigin(req);
      const user = await currentUser();
      if (!user) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
      const out = await fn(req, user, await rc.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Public route (no session), still CSRF-checked for mutations. */
export function withPublic<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      assertSameOrigin(req);
      const out = await fn(req, await rc.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Extension routes authenticate with a short-lived bearer token (no cookies, so no CSRF exposure). */
export function withExtension<P = Record<string, string>>(
  fn: (
    req: NextRequest,
    authn: { userId: string; deviceId: string },
    params: P,
  ) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      const authn = await extensionService.authenticateExtension(
        ctx(),
        req.headers.get('authorization'),
      );
      const out = await fn(req, authn, await rc.params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function jsonBody(req: NextRequest, maxBytes = 200_000): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body must be valid JSON.');
  }
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}
