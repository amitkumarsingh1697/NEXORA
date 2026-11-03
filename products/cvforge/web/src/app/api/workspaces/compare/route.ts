import { workspacesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (req, user) => {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean);
  return workspacesService.compareWorkspaces(ctx(), user.id, ids);
});
