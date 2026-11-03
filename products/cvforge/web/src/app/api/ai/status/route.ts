import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async () => {
  const caps = await ctx().ai.capabilities();
  return {
    available: caps.available,
    reason: caps.reason ?? null,
    provider: caps.provider,
    model: caps.model,
    local: caps.local,
  };
});
