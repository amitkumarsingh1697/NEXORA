import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({
  workspaces: await workspacesService.listWorkspaces(ctx(), user.id),
}));
export const POST = withUser(async (req, user) => ({
  workspace: await workspacesService.createWorkspace(ctx(), user.id, await jsonBody(req)),
}));
