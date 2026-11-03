import { useState } from 'react';
import { api } from '../api';
import { setQuery, useRoute } from '../router';
import type { Confidence } from '../types';
import { Source } from '../components/Source';
import {
  Button,
  Card,
  ConfidenceBadge,
  Empty,
  ErrorBox,
  Spinner,
  cn,
  useAsync,
} from '../components/ui';

interface Inv {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'patch_proposed' | 'approved' | 'committed' | 'merged' | 'discarded';
  analysis: {
    suspects: {
      filePath: string;
      startLine: number;
      endLine: number;
      symbol: string | null;
      reason: string;
    }[];
    facts: { text: string; confidence: Confidence; evidence: string | null }[];
    testsToRun: string[];
    routesAffected: string[];
  };
  baseCommit: string | null;
  branch: string | null;
  worktreePath: string | null;
  approvedSha: string | null;
  commitSha: string | null;
  createdAt: string;
}

interface Detail {
  investigation: Inv;
  patch: {
    id: number;
    sha256: string;
    diff: string;
    files: { path: string; added: number; deleted: number }[];
    explanation: string;
    source: string;
    status: string;
  } | null;
  runs: {
    id: number;
    patchId: number | null;
    command: string;
    exitCode: number | null;
    timedOut: boolean;
    output: string;
    durationMs: number;
    createdAt: string;
  }[];
  events: { type: string; data: Record<string, unknown>; createdAt: string }[];
  commands: { id: string; label: string; description: string }[];
  instructions: {
    mergeCommand: string;
    cleanupCommands: string[];
    rollbackCommand: string | null;
  } | null;
  approvals: {
    id: number;
    patchId: number;
    sha256: string;
    approver: string;
    decision: 'approved' | 'rejected';
    validation: 'passed' | 'failed' | 'not_run';
    acknowledgedUnvalidated: boolean;
    reason: string;
    createdAt: string;
  }[];
  merges: {
    id: number;
    commitSha: string;
    targetBranch: string;
    mergedBy: string;
    createdAt: string;
  }[];
  validation: 'passed' | 'failed' | 'not_run' | null;
  report: { risks: string[]; rollback: string; rootCause: { label: Confidence; text: string } };
  mergeCheck: { ok: boolean; targetBranch: string | null; problems: string[] } | null;
}

const VALIDATION_LABEL = {
  passed: 'validation passed',
  failed: 'validation failed',
  not_run: 'not validated',
} as const;

const STATUS_LABEL: Record<Inv['status'], string> = {
  open: 'Investigating',
  patch_proposed: 'Patch awaiting review',
  approved: 'Approved, not committed',
  committed: 'Committed to branch',
  merged: 'Merged locally',
  discarded: 'Discarded',
};

function Diff({ diff }: { diff: string }) {
  return (
    <pre className="max-h-[480px] overflow-auto rounded-lg border border-line bg-canvas p-3 text-[12px] leading-5">
      {diff.split('\n').map((l, i) => (
        <div
          key={i}
          className={cn(
            l.startsWith('+') && !l.startsWith('+++') && 'bg-observed/10 text-observed',
            l.startsWith('-') && !l.startsWith('---') && 'bg-danger/10 text-danger',
            l.startsWith('@@') && 'text-accent',
            (l.startsWith('diff ') || l.startsWith('index ')) && 'text-muted',
          )}
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

function List({ repoId }: { repoId: number }) {
  const list = useAsync(
    () => api<{ investigations: Inv[] }>(`/api/repos/${repoId}/investigations`),
    [repoId],
  );
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card title="Investigate a bug">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const d = await api<Detail>(`/api/repos/${repoId}/investigations`, {
                method: 'POST',
                body: { title, description: desc },
              });
              setQuery('inv', String(d.investigation.id));
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">
            Summary
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm font-normal"
              placeholder="Refresh fails after pairing"
            />
          </label>
          <label className="block text-sm font-medium">
            What happens, and what should happen?
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm font-normal"
              placeholder="Steps, error messages, function or route names…"
            />
          </label>
          <ErrorBox error={error} />
          <Button
            type="submit"
            disabled={busy || title.trim().length < 3 || desc.trim().length < 3}
          >
            {busy ? 'Analysing…' : 'Start investigation'}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Fixes are made in a separate git worktree on a{' '}
          <code className="font-mono">codeatlas/</code> branch. Your checkout is never changed,
          nothing is committed without your approval of the exact diff, and a merge into your branch
          happens only when you ask for it and type the approved hash.
        </p>
      </Card>
      <Card title="Investigations">
        {list.loading ? <Spinner /> : <ErrorBox error={list.error} />}
        {list.data && !list.data.investigations.length && <Empty>None yet.</Empty>}
        <ul className="divide-y divide-line">
          {list.data?.investigations.map((i) => (
            <li key={i.id} className="py-2">
              <button
                className="font-medium text-accent hover:underline"
                onClick={() => setQuery('inv', String(i.id))}
              >
                #{i.id} {i.title}
              </button>
              <p className="text-xs text-muted">
                {STATUS_LABEL[i.status]} · {new Date(i.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DetailView({ repoId, invId }: { repoId: number; invId: number }) {
  const base = `/api/repos/${repoId}/investigations/${invId}`;
  const d = useAsync(() => api<Detail>(base), [base]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [diffText, setDiffText] = useState('');
  const [explain, setExplain] = useState('');
  const [suspect, setSuspect] = useState(0);
  const [msg, setMsg] = useState('');
  const [runOpen, setRunOpen] = useState<number | null>(null);
  const [ack, setAck] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const act = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    setError(null);
    try {
      await api(`${base}${path}`, { method: 'POST', body: body ?? {} });
      d.reload();
    } catch (e) {
      setError(e);
      d.reload();
    } finally {
      setBusy(null);
    }
  };

  if (d.loading && !d.data) return <Spinner />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { investigation: inv, patch, runs, events, commands, instructions } = d.data;
  const { approvals, merges, validation, report, mergeCheck } = d.data;
  const s = inv.analysis.suspects[suspect];
  const closed =
    inv.status === 'committed' || inv.status === 'merged' || inv.status === 'discarded';

  return (
    <div className="space-y-4">
      <button className="text-xs text-muted hover:text-ink" onClick={() => setQuery('inv', null)}>
        ← All investigations
      </button>
      <Card
        title={
          <>
            #{inv.id} {inv.title}{' '}
            <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-xs font-normal text-muted">
              {STATUS_LABEL[inv.status]}
            </span>
          </>
        }
      >
        <p className="whitespace-pre-wrap text-sm">{inv.description}</p>
        {inv.branch && (
          <p className="mt-2 font-mono text-xs text-muted">
            branch {inv.branch} · base {inv.baseCommit?.slice(0, 10)}
            {inv.worktreePath ? ` · worktree ${inv.worktreePath}` : ''}
          </p>
        )}
      </Card>
      <ErrorBox error={error} />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="1. Where to look">
          {!inv.analysis.suspects.length && (
            <Empty>No matching code found. Try naming a function, file or route.</Empty>
          )}
          <ul className="space-y-1">
            {inv.analysis.suspects.map((x, i) => (
              <li key={i}>
                <button
                  onClick={() => setSuspect(i)}
                  className={cn(
                    'w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-canvas',
                    i === suspect && 'bg-accent/10 text-accent',
                  )}
                >
                  {x.symbol ?? x.filePath.split('/').pop()}{' '}
                  <span className="text-muted">
                    {x.filePath}:{x.startLine}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {inv.analysis.routesAffected.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Routes that reach this code: {inv.analysis.routesAffected.join(', ')}
            </p>
          )}
          {inv.analysis.testsToRun.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Tests that cover it: {inv.analysis.testsToRun.join(', ')}
            </p>
          )}
          {inv.analysis.facts.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted">
                Relationships ({inv.analysis.facts.length})
              </summary>
              <ul className="mt-1 space-y-1">
                {inv.analysis.facts.slice(0, 20).map((f, i) => (
                  <li key={i} className="flex flex-wrap gap-1">
                    <ConfidenceBadge c={f.confidence} />
                    <span className="font-mono">{f.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        <div>
          {s ? (
            <Source repoId={repoId} path={s.filePath} start={s.startLine} end={s.endLine} />
          ) : null}
        </div>
      </div>

      {!closed && (
        <Card title="2. Propose a fix">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => act('model', '/patches/model')}
              >
                {busy === 'model' ? 'Asking the model…' : 'Draft a fix with the AI model'}
              </Button>
              <span className="text-xs text-muted">or paste a unified diff below</span>
            </div>
            <textarea
              value={diffText}
              onChange={(e) => setDiffText(e.target.value)}
              rows={7}
              placeholder={'--- a/src/file.ts\n+++ b/src/file.ts\n@@ ...'}
              aria-label="Unified diff"
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs"
            />
            <input
              value={explain}
              onChange={(e) => setExplain(e.target.value)}
              placeholder="Why this fixes it (optional)"
              aria-label="Explanation"
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
            <Button
              disabled={!!busy || !diffText.trim()}
              onClick={() =>
                act('manual', '/patches/manual', { diff: diffText, explanation: explain }).then(
                  () => setDiffText(''),
                )
              }
            >
              {busy === 'manual' ? 'Applying…' : 'Apply diff in worktree'}
            </Button>
          </div>
        </Card>
      )}

      {patch && (
        <Card
          title={`3. Review the patch (${patch.source === 'model' ? 'drafted by AI' : 'manual'})`}
        >
          {patch.explanation && <p className="mb-2 text-sm">{patch.explanation}</p>}
          <p className="mb-2 text-xs text-muted">
            {patch.files.map((f) => `${f.path} (+${f.added} −${f.deleted})`).join(' · ')}
          </p>
          <Diff diff={patch.diff} />
          <p className="mt-2 font-mono text-[11px] text-muted">sha256 {patch.sha256}</p>
        </Card>
      )}

      {(inv.worktreePath || patch) && !closed && (
        <Card title="4. Check it">
          {!commands.length ? (
            <Empty>
              No allowlisted commands (no package.json scripts named test, typecheck, lint, build or
              check).
            </Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {commands.map((c) => (
                <span key={c.id} title={c.description}>
                  <Button
                    small
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => act(c.id, '/commands', { commandId: c.id })}
                  >
                    {busy === c.id ? 'Running…' : c.label}
                  </Button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Commands run inside the worktree with credentials removed from the environment. They
            execute your repository's own scripts, so they only run when you click.
          </p>
          <ul className="mt-3 space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded border border-line">
                <button
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs"
                  onClick={() => setRunOpen(runOpen === r.id ? null : r.id)}
                >
                  <span className="font-mono">{r.command}</span>
                  <span className={r.exitCode === 0 ? 'text-observed' : 'text-danger'}>
                    {r.timedOut ? 'timed out' : r.exitCode === 0 ? 'passed' : `exit ${r.exitCode}`}{' '}
                    · {(r.durationMs / 1000).toFixed(1)}s
                  </span>
                </button>
                {runOpen === r.id && (
                  <pre className="max-h-72 overflow-auto border-t border-line bg-canvas p-2 text-[11px]">
                    {r.output}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {patch && (inv.status === 'patch_proposed' || inv.status === 'approved') && (
        <Card title="5. Decide">
          {inv.status === 'patch_proposed' ? (
            <div className="space-y-2">
              {validation === 'not_run' && (
                <p className="text-xs text-inferred">
                  No check has run against this patch yet, so it is not validated.
                </p>
              )}
              {validation === 'failed' && (
                <label className="flex items-start gap-2 text-xs text-unknown">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  The latest checks failed on this patch. I understand it is not validated and still
                  want to approve it.
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!!busy || (validation === 'failed' && !ack)}
                  onClick={() =>
                    confirm(`Approve exactly this diff?\nsha256 ${patch.sha256.slice(0, 16)}…`) &&
                    act('approve', '/approve', {
                      sha256: patch.sha256,
                      acknowledgeFailedValidation: validation === 'failed' && ack,
                    })
                  }
                >
                  Approve this exact diff
                </Button>
                <Button
                  variant="danger"
                  disabled={!!busy}
                  onClick={() => act('reject', '/reject', { reason: '' })}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                Approved <span className="font-mono text-xs">{inv.approvedSha?.slice(0, 16)}…</span>
                . Committing records it on <span className="font-mono text-xs">{inv.branch}</span>{' '}
                only.
              </p>
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder={`fix: ${inv.title}`}
                aria-label="Commit message"
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  disabled={!!busy}
                  onClick={() => act('commit', '/commit', { message: msg || undefined })}
                >
                  Commit to {inv.branch}
                </Button>
                <Button
                  variant="danger"
                  disabled={!!busy}
                  onClick={() => act('reject', '/reject', { reason: 'withdrawn after approval' })}
                >
                  Withdraw approval
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {(inv.status === 'committed' || inv.status === 'merged') && (
        <Card title={inv.status === 'merged' ? '6. Merged' : '6. Merge into your branch'}>
          <div className="space-y-3 text-sm">
            {report.risks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted">Risks to weigh</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {report.risks.map((r, k) => (
                    <li key={k}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {inv.status === 'committed' && mergeCheck && (
              <>
                <p>
                  Commit <span className="font-mono text-xs">{inv.commitSha?.slice(0, 10)}</span> is
                  on <span className="font-mono text-xs">{inv.branch}</span>. Merging fast-forwards{' '}
                  <span className="font-mono text-xs">
                    {mergeCheck.targetBranch ?? 'your branch'}
                  </span>{' '}
                  to it. Nothing else changes, and git hooks do not run.
                </p>
                {mergeCheck.problems.length > 0 ? (
                  <div role="alert" className="rounded-md border border-line p-2 text-xs">
                    <p className="font-medium">Merge is blocked:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {mergeCheck.problems.map((p, k) => (
                        <li key={k}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act('merge', '/merge', { confirm: confirmText.trim() });
                    }}
                  >
                    <label className="text-xs">
                      Type the first 8 characters of the approved hash{' '}
                      <span className="font-mono">{inv.approvedSha?.slice(0, 8)}</span> to confirm
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        aria-label="Approved hash prefix"
                        maxLength={8}
                        autoComplete="off"
                        spellCheck={false}
                        className="mt-1 block w-40 rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-sm"
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={
                        !!busy || confirmText.trim().toLowerCase() !== inv.approvedSha?.slice(0, 8)
                      }
                    >
                      {busy === 'merge' ? 'Merging…' : `Merge into ${mergeCheck.targetBranch}`}
                    </Button>
                  </form>
                )}
                {instructions && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted">
                      Prefer to merge yourself?
                    </summary>
                    <pre className="mt-1 overflow-auto rounded bg-canvas p-2 font-mono">
                      {instructions.mergeCommand}
                    </pre>
                  </details>
                )}
              </>
            )}
            {merges.map((m) => (
              <p key={m.id}>
                Merged into <span className="font-mono text-xs">{m.targetBranch}</span> at{' '}
                <span className="font-mono text-xs">{m.commitSha.slice(0, 10)}</span> by{' '}
                {m.mergedBy}, {new Date(m.createdAt).toLocaleString()}.
              </p>
            ))}
            <p className="text-xs text-muted">Rollback: {report.rollback}</p>
            {instructions && (
              <>
                <p className="text-xs text-muted">Clean up when you are done:</p>
                <pre className="overflow-auto rounded bg-canvas p-2 font-mono text-xs">
                  {instructions.cleanupCommands.join('\n')}
                </pre>
              </>
            )}
          </div>
        </Card>
      )}

      {approvals.length > 0 && (
        <Card title="Decisions">
          <ul className="space-y-1 text-xs">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="font-medium">{a.decision}</span>
                <span className="font-mono">{a.sha256.slice(0, 12)}</span>
                <span>{a.approver}</span>
                <span className={a.validation === 'passed' ? 'text-observed' : 'text-unknown'}>
                  {VALIDATION_LABEL[a.validation]}
                  {a.acknowledgedUnvalidated ? ' (acknowledged)' : ''}
                </span>
                <span className="text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                {a.reason && <span className="text-muted">“{a.reason}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Audit trail"
        actions={
          inv.status !== 'discarded' && inv.worktreePath ? (
            <Button
              small
              variant="danger"
              disabled={!!busy}
              onClick={() =>
                confirm(
                  'Remove the worktree? Uncommitted patch work is lost; a committed branch is kept.',
                ) && act('discard', '/discard')
              }
            >
              Remove worktree
            </Button>
          ) : undefined
        }
      >
        <ol className="space-y-1 text-xs">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-40 shrink-0 text-muted">
                {new Date(e.createdAt).toLocaleString()}
              </span>
              <span className="font-medium">{e.type.replace(/_/g, ' ')}</span>
              <span className="truncate font-mono text-muted">
                {Object.entries(e.data)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`)
                  .join(' ')
                  .slice(0, 160)}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export function Investigate({ repoId }: { repoId: number }) {
  const { query } = useRoute();
  const inv = Number(query.get('inv')) || null;
  return inv ? <DetailView repoId={repoId} invId={inv} /> : <List repoId={repoId} />;
}
