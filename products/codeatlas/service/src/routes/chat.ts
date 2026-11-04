import { z } from 'zod';
import { createProvider, type ModelProvider } from '@nexora/ai';
import {
  answerQuestion,
  describeModule,
  moduleDoc,
  recordEvent,
  retrieve,
} from '@nexora/codeatlas-core';
import { HttpError } from '../http';
import type { ServiceContext } from '../server';
import { repoOr404, track } from '../server';

/**
 * Source-grounded Q&A. Stateless: questions and answers are not stored. Local analytics keep
 * only counts (sources, citations) and the confidence label; feedback keeps the rating and the
 * optional note the user types.
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
      const answer = await answerQuestion(p, r, {
        contextWindowTokens: ctx.cfg.ai.AI_CONTEXT_TOKENS,
        timeoutMs: ctx.cfg.ai.AI_TIMEOUT_MS,
      });
      track(ctx, 'question_asked', repo.id, {
        sources: r.sources.length,
        citations: answer.citations.length,
        confidence: answer.confidence,
      });
      return answer;
    });
    // Optional model-written module overview (S3-5), grounded like chat answers.
    ctx.router.add('POST', '/api/repos/:id/module-doc/overview', async (req) => {
      const repo = repoOr404(ctx, req.params.id);
      const { module } = z.strictObject({ module: z.string().min(1).max(300) }).parse(req.body);
      const doc = moduleDoc(ctx.db, repo.id, module);
      if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Module not found.');
      return describeModule(p, ctx.db, repo.id, doc, {
        contextWindowTokens: ctx.cfg.ai.AI_CONTEXT_TOKENS,
        timeoutMs: ctx.cfg.ai.AI_TIMEOUT_MS,
      });
    });
    ctx.router.add('POST', '/api/repos/:id/chat/feedback', (req) => {
      const repo = repoOr404(ctx, req.params.id);
      const b = z
        .strictObject({
          rating: z.enum(['up', 'down']),
          note: z.string().trim().max(1000).default(''),
          confidence: z.enum(['high', 'medium', 'low']).optional(),
          citations: z.number().int().nonnegative().max(1000).optional(),
        })
        .parse(req.body);
      recordEvent(ctx.db, 'answer_feedback', repo.id, b);
      return { ok: true };
    });
  };
}
