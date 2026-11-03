import { suggestionsService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (_req, user, { id }) => ({
  suggestions: await suggestionsService.generateWorkspaceSuggestions(ctx(), user.id, id),
}));
