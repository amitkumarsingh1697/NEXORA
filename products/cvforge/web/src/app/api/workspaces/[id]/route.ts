import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) =>
  workspacesService.getWorkspace(ctx(), user.id, id),
);
export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  await workspacesService.deleteWorkspace(ctx(), user.id, id);
  return { ok: true };
});
