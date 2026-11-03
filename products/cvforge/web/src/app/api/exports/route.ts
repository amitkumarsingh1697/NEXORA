import { exportsService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const GET = withUser(async (_req, user) => ({
  exports: await exportsService.listExports(ctx(), user.id),
}));
export const POST = withUser(async (req, user) => {
  const { storageKey: _k, ...row } = await exportsService.createExport(
    ctx(),
    user.id,
    await jsonBody(req),
  );
  return { export: row };
});
