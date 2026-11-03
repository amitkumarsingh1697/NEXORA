import { extensionService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withExtension } from '@/server/http';

export const GET = withExtension(async (_req, a) => ({
  resumes: await extensionService.extensionResumes(ctx(), a.userId),
}));
