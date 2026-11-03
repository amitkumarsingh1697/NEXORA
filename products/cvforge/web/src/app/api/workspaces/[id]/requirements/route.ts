import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (req, user, { id }) => ({
  requirement: await workspacesService.addRequirement(ctx(), user.id, id, await jsonBody(req)),
}));
