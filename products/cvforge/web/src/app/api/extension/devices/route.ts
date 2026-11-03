import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({
  devices: await extensionService.listDevices(ctx(), user.id),
}));
