import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const PUT = withUser<{ id: string }>(async (req, user, { id }) => {
  await workspacesService.updateJobText(ctx(), user.id, id, await jsonBody(req));
  return { ok: true };
});
