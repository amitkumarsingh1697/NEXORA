import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withPublic } from '@/server/http';

export const POST = withPublic(async (req) => {
  await auth.verifyEmail(ctx(), await jsonBody(req));
  return { ok: true };
});
