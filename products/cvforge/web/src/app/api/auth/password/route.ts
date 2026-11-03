import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const POST = withUser(async (req, user) => {
  await auth.changePassword(ctx(), user.id, user.sessionId, await jsonBody(req));
  return { ok: true };
});
