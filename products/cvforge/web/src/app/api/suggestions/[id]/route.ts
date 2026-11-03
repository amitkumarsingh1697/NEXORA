import { suggestionsService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const PATCH = withUser<{ id: string }>(async (req, user, { id }) => ({
  suggestion: await suggestionsService.decideSuggestion(ctx(), user.id, id, await jsonBody(req)),
}));
