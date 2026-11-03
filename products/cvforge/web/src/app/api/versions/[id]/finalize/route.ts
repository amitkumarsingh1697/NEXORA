import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  const { label } = resumesService.versionLabelSchema.parse(await jsonBody(req));
  return { version: await resumesService.finalizeVersion(ctx(), user.id, id, label) };
});
