import { auth } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const POST = withUser(async (_req, user) => auth.resendVerification(ctx(), user.id));
