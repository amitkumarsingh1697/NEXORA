import { analysisService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (_req, user, { id }) => {
  const { analysis } = await analysisService.runWorkspaceAnalysis(ctx(), user.id, id);
  return { analysisId: analysis.id };
});
