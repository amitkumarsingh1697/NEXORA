import { analysisService } from '@nexora/cvforge-backend';
import { ctx } from '@/server/context';
import { jsonBody, withUser } from '@/server/http';

export const POST = withUser<{ id: string }>(async (req, user, { id }) => {
  const { analysis } = await analysisService.answerQuestion(
    ctx(),
    user.id,
    id,
    await jsonBody(req),
  );
  return { analysisId: analysis.id };
});
