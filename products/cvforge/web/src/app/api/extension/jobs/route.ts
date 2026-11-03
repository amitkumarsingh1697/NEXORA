import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withExtension } from '@/server/http';

export const POST = withExtension(async (req, a) => {
  const ws = await extensionService.captureJob(ctx(), a, await jsonBody(req, 300_000));
  return { workspaceId: ws.id, url: `${ctx().cfg.APP_ORIGIN}/workspaces/${ws.id}` };
});
