import { join } from 'node:path';
import { z } from 'zod';
import { createProvider, type ModelProvider } from '@nexora/ai';
import { InvestigationWorkflow, WorkflowError } from '@nexora/codeatlas-core';
import { HttpError, type Req } from '../http';
import { repoOr404, track, type ServiceContext } from '../server';

const STATUS: Record<WorkflowError['code'], number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  HASH_MISMATCH: 409,
  BAD_PATCH: 422,
  NO_GIT: 422,
  UNAVAILABLE: 503,
  NOT_ALLOWED: 403,
  VALIDATION_FAILED: 409,
  MERGE_REFUSED: 409,
};

export function investigationRoutes(provider?: ModelProvider) {
  return (ctx: ServiceContext): void => {
    const p = provider ?? createProvider(ctx.cfg.ai);
    const wf = new InvestigationWorkflow({
      db: ctx.db,
      worktreeRoot: ctx.cfg.worktreeDir ?? join(ctx.cfg.home, 'worktrees'),
    });
    const r = ctx.router;
    const wrap = (fn: (req: Req, repoId: number, invId: number) => unknown) => async (req: Req) => {
      const repo = repoOr404(ctx, req.params.id);
      const invId = Number(req.params.inv);
      try {
        return await fn(req, repo.id, invId);
      } catch (e) {
        if (e instanceof WorkflowError) throw new HttpError(STATUS[e.code], e.code, e.message);
        throw e;
      }
    };
    const detail = (repoId: number, invId: number) => {
      const inv = wf.get(repoId, invId);
      return {
        investigation: inv,
        patch: wf.currentPatch(inv),
        patches: wf.patches(invId).map(({ diff: _d, ...rest }) => rest),
        runs: wf.runs(invId),
        events: wf.events(invId),
        commands: wf.commands(repoId, invId),
        approvals: wf.approvals(invId),
        merges: wf.merges(invId),
        validation: inv.currentPatchId ? wf.validationOf(inv.currentPatchId).validation : null,
        report: wf.report(repoId, invId),
        mergeCheck: inv.status === 'committed' ? wf.mergeCheck(repoId, invId) : null,
        instructions:
          inv.status === 'committed' || inv.status === 'merged'
            ? wf.instructions(repoId, invId)
            : null,
      };
    };

    r.add(
      'GET',
      '/api/repos/:id/investigations',
      wrap((_q, repoId) => ({ investigations: wf.list(repoId) })),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations',
      wrap((req, repoId) => {
        const b = z
          .object({
            title: z.string().trim().min(3).max(200),
            description: z.string().trim().min(3).max(10000),
          })
          .parse(req.body);
        return detail(repoId, wf.create(repoId, b.title, b.description).id);
      }),
    );
    r.add(
      'GET',
      '/api/repos/:id/investigations/:inv',
      wrap((_q, repoId, invId) => detail(repoId, invId)),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/worktree',
      wrap((_q, repoId, invId) => {
        wf.ensureWorktree(repoId, invId);
        return detail(repoId, invId);
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/patches/manual',
      wrap((req, repoId, invId) => {
        const b = z
          .object({
            diff: z.string().min(1).max(2_000_000),
            explanation: z.string().max(4000).default(''),
          })
          .parse(req.body);
        wf.proposeManualPatch(repoId, invId, b.diff, b.explanation);
        track(ctx, 'change_request_proposed', repoId, { source: 'manual' });
        return detail(repoId, invId);
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/patches/model',
      wrap(async (_q, repoId, invId) => {
        await wf.proposeModelPatch(repoId, invId, p, {
          contextWindowTokens: ctx.cfg.ai.AI_CONTEXT_TOKENS,
          timeoutMs: ctx.cfg.ai.AI_TIMEOUT_MS,
        });
        track(ctx, 'change_request_proposed', repoId, { source: 'model' });
        return detail(repoId, invId);
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/commands',
      wrap(async (req, repoId, invId) => {
        const { commandId } = z.object({ commandId: z.string().min(1).max(100) }).parse(req.body);
        const run = await wf.runCommand(repoId, invId, commandId);
        track(ctx, 'validation_ran', repoId, {
          outcome: run.exitCode === 0 && !run.timedOut ? 'passed' : 'failed',
        });
        return { run, ...detail(repoId, invId) };
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/approve',
      wrap((req, repoId, invId) => {
        const { sha256, acknowledgeFailedValidation } = z
          .object({
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            acknowledgeFailedValidation: z.boolean().default(false),
          })
          .parse(req.body);
        wf.approve(repoId, invId, sha256, { acknowledgeFailedValidation });
        track(ctx, 'patch_decided', repoId, { decision: 'approved' });
        return detail(repoId, invId);
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/reject',
      wrap((req, repoId, invId) => {
        const { reason } = z
          .object({ reason: z.string().max(500).default('') })
          .parse(req.body ?? {});
        wf.reject(repoId, invId, reason);
        track(ctx, 'patch_decided', repoId, { decision: 'rejected' });
        return detail(repoId, invId);
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/commit',
      wrap((req, repoId, invId) => {
        const { message } = z
          .object({ message: z.string().max(2000).optional() })
          .parse(req.body ?? {});
        wf.commit(repoId, invId, message);
        return detail(repoId, invId);
      }),
    );
    // Local merge: only on this explicit request, with the approved hash prefix typed back (ADR 0010).
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/merge',
      wrap((req, repoId, invId) => {
        const { confirm } = z
          .object({ confirm: z.string().regex(/^[0-9a-fA-F]{8}$/) })
          .parse(req.body);
        const out = wf.merge(repoId, invId, confirm);
        track(ctx, 'change_merged', repoId, {});
        return { merge: out.merge, rollback: out.rollback, ...detail(repoId, invId) };
      }),
    );
    r.add(
      'POST',
      '/api/repos/:id/investigations/:inv/discard',
      wrap((_q, repoId, invId) => {
        wf.discard(repoId, invId);
        return detail(repoId, invId);
      }),
    );
    r.add(
      'GET',
      '/api/repos/:id/investigations/:inv/patches/:patch',
      wrap((req, _repoId, invId) => {
        const patch = wf.patches(invId).find((x) => x.id === Number(req.params.patch));
        if (!patch) throw new HttpError(404, 'NOT_FOUND', 'Patch not found.');
        return { patch };
      }),
    );
  };
}
