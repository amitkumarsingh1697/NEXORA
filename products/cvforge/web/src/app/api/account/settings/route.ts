import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const PUT = withUser(async (req, user) => ({
  user: await auth.updateSettings(ctx(), user.id, await jsonBody(req)),
}));
