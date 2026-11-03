import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const DELETE = withUser<{ id: string }>(async (_req, user, { id }) => {
  await extensionService.revokeDevice(ctx(), user.id, id);
  return { ok: true };
});
