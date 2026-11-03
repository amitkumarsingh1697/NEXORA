import { analysisService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => ({
  analyses: await analysisService.analysisHistory(ctx(), user.id, id),
}));
