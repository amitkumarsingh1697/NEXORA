import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) =>
  resumesService.getResume(ctx(), user.id, id),
);
export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  await resumesService.deleteResume(ctx(), user.id, id);
  return { ok: true };
});
