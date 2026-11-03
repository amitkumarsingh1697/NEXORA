import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withExtension } from '@/server/http';

export const POST = withExtension(async (_req, a) => {
  await extensionService.revokeDevice(ctx(), a.userId, a.deviceId, 'extension_logout');
  return { ok: true };
});
