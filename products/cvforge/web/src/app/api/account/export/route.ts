import { privacyService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => {
  const data = await privacyService.exportAccountData(ctx(), user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename="cvforge-account-export.json"',
      'cache-control': 'private, no-store',
    },
  });
});
