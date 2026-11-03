import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => ({
  version: await resumesService.ownedVersion(ctx(), user.id, id),
}));
export const PUT = withUser<{ id: string }>(async (req, user, { id }) => {
  const body = (await jsonBody(req, 1_000_000)) as { content?: unknown };
  return { version: await resumesService.updateDraft(ctx(), user.id, id, body.content) };
});
export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  await resumesService.deleteDraft(ctx(), user.id, id);
  return { ok: true };
});
