import { NextResponse } from 'next/server';
import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { SESSION_COOKIE, withPublic } from '@/server/http';

export const POST = withPublic(async (req) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await auth.logout(ctx(), token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
