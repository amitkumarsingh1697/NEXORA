import { z } from 'zod';
import { workspacesService } from '@nexora/cvforge-backend';
import { parseOrThrow } from '@nexora/validation';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const PUT = withUser<{ id: string }>(async (req, user, { id }) => {
  const { versionId } = parseOrThrow(z.object({ versionId: z.uuid() }), await jsonBody(req));
  await workspacesService.setBaseVersion(ctx(), user.id, id, versionId);
  return { ok: true };
});
