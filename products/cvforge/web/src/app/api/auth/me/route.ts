import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({ user }));
