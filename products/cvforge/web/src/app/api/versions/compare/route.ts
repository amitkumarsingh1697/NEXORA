import { AppError } from '@nexora/validation';
import { resumesService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const GET = withUser(async (req, user) => {
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) throw new AppError('VALIDATION_FAILED', 'Choose two versions to compare.');
  return resumesService.compareVersions(ctx(), user.id, from, to);
});
