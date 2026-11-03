import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => resumesService.storageUsage(ctx(), user.id));
