import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({
  sessions: (await auth.listSessions(ctx(), user.id)).map((s) => ({
    ...s,
    current: s.id === user.sessionId,
  })),
}));
/** Sign out all other sessions. */
export const DELETE = withUser(async (_req, user) => {
  await auth.revokeAllSessions(ctx(), user.id, user.sessionId);
  return { ok: true };
});
