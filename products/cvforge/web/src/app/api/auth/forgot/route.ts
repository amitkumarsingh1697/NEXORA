import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withPublic } from '@/server/http';

export const POST = withPublic(async (req) => {
  await auth.requestPasswordReset(ctx(), await jsonBody(req));
  return { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
});
