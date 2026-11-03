import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (_req, user, { id }) => ({
  version: await resumesService.createDraftFrom(ctx(), user.id, id),
}));
