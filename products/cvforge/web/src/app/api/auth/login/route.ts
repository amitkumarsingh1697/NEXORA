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
  const s = await auth.login(ctx(), await jsonBody(req), {
    userAgent: req.headers.get('user-agent') ?? '',
    ip: clientIp(req),
  });
  const res = NextResponse.json({ user: s.user });
  res.cookies.set(SESSION_COOKIE, s.token, sessionCookieOptions(s.expiresAt));
  return res;
});
