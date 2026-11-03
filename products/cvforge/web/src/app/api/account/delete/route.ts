import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseOrThrow } from '@nexora/validation';
import { privacyService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { SESSION_COOKIE, jsonBody, withUser } from '@/server/http';

export const POST = withUser(async (req, user) => {
  const { password, confirm } = parseOrThrow(
    z.object({ password: z.string().min(1).max(256), confirm: z.literal('DELETE') }),
    await jsonBody(req),
  );
  void confirm;
  await privacyService.deleteAccount(ctx(), user.id, password);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
