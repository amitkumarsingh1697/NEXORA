import { suggestionsService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  const { version, diff } = await suggestionsService.createVersionFromSuggestions(
    ctx(),
    user.id,
    id,
    await jsonBody(req),
  );
  return { versionId: version.id, resumeId: version.resumeId, counts: diff.counts };
});
