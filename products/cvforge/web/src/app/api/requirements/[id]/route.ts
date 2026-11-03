import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const PUT = withUser<{ id: string }>(async (req, user, { id }) => ({
  requirement: await workspacesService.updateRequirement(ctx(), user.id, id, await jsonBody(req)),
}));
export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  await workspacesService.deleteRequirement(ctx(), user.id, id);
  return { ok: true };
});
