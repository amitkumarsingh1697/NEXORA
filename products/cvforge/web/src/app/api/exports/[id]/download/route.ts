import { exportsService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (req, user, { id }) => {
  const sp = req.nextUrl.searchParams;
  const f = await exportsService.downloadExport(
    ctx(),
    user.id,
    id,
    sp.get('exp') ?? '',
    sp.get('sig') ?? '',
  );
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      'content-type': f.contentType,
      'content-disposition': `attachment; filename="${f.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
});
