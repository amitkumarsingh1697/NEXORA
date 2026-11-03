import { z } from 'zod';
import { createProvider, type ModelProvider } from '@nexora/ai';
import { answerQuestion, retrieve } from '@nexora/codeatlas-core';
import type { ServiceContext } from '../server';
import { repoOr404 } from '../server';

/**
 * Source-grounded Q&A. Stateless: questions and answers are not stored.
 * The provider defaults to local Ollama; a remote provider is refused unless
 * the user explicitly consented (AI_REMOTE_CONSENT=true).
 */
export function chatRoutes(provider?: ModelProvider) {
  return (ctx: ServiceContext): void => {
    const p = provider ?? createProvider(ctx.cfg.ai);
    ctx.router.add('GET', '/api/ai/status', async () => ({ capabilities: await p.capabilities() }));
    ctx.router.add('POST', '/api/repos/:id/chat', async (req) => {
      const repo = repoOr404(ctx, req.params.id);
      const { question } = z
        .object({ question: z.string().trim().min(3).max(2000) })
        .parse(req.body);
      const r = retrieve(ctx.db, repo.id, question);
      return answerQuestion(p, r, {
        contextWindowTokens: ctx.cfg.ai.AI_CONTEXT_TOKENS,
        timeoutMs: ctx.cfg.ai.AI_TIMEOUT_MS,
      });
    });
  };
}
