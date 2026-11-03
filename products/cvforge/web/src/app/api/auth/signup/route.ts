import { NextResponse } from 'next/server';
import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import {
  SESSION_COOKIE,
  clientIp,
  jsonBody,
  sessionCookieOptions,
  withPublic,
} from '@/server/http';

export const POST = withPublic(async (req) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  await auth.signUp(ctx(), body);
  const s = await auth.login(
    ctx(),
    { email: body.email, password: body.password },
    { userAgent: req.headers.get('user-agent') ?? '', ip: clientIp(req) },
  );
  const res = NextResponse.json({ user: s.user });
  res.cookies.set(SESSION_COOKIE, s.token, sessionCookieOptions(s.expiresAt));
  return res;
});
