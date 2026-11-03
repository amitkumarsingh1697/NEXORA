import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser<{ id: string }>(async (_req, user, { id }) => {
  const f = await resumesService.getOriginalFile(ctx(), user.id, id);
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      'content-type':
        f.kind === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, '_')}"`,
      'cache-control': 'private, no-store',
    },
  });
});
