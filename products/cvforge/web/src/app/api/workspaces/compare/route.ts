import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (req, user) => {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 6);
  return { workspaces: await workspacesService.compareWorkspaces(ctx(), user.id, ids) };
});
