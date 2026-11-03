'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  ScoreDial,
  Spinner,
  StateBadge,
  Textarea,
} from '@/components/ui';
import { ScoreExplainer } from '@/components/score-explainer';
import { api, errorMessage, useApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Question, Requirement, SuggestionRow, WorkspaceDetail } from '@/lib/types';

const TABS = [
  'Analysis',
  'Requirements',
  'Clarify',
  'Scores',
  'Suggestions',
  'Job description',
] as const;
type Tab = (typeof TABS)[number];

const KIND_LABEL: Record<string, string> = {
  required_skill: 'Required skill',
  preferred_skill: 'Preferred skill',
  responsibility: 'Responsibility',
  experience: 'Experience',
  education: 'Education',
  certification: 'Certification',
  domain: 'Domain',
  leadership: 'Leadership',
  language: 'Language',
};
const STAGE_LABEL: Record<string, string> = {
  early: 'Early career',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead / Principal / Architect',
  executive: 'Executive',
};

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error, loading, reload } = useApi<WorkspaceDetail>(`/api/workspaces/${id}`);
  const [tab, setTab] = useState<Tab>('Analysis');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="error">{error ?? 'Not found'}</Alert>;
  const { analysis, job } = data;

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await reload();
      if (success) setMsg({ tone: 'success', text: success });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };
  const analyse = () =>
    run(
      'analyze',
      () => api(`/api/workspaces/${id}/analyze`, { method: 'POST' }),
      'Analysis updated.',
    );
  const pendingQuestions = data.questions.filter((q) => !q.response);

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.workspace.name}
        description={
          <>
            {[job.company, job.location, job.workMode !== 'unspecified' ? job.workMode : null]
              .filter(Boolean)
              .join(' · ')}{' '}
            — analysing{' '}
            <Link
              className="text-brand"
              href={`/resumes/${data.workspace.resumeId}/versions/${data.baseVersion.id}`}
            >
              v{data.baseVersion.versionNumber} {data.baseVersion.label}
            </Link>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={analyse} loading={busy === 'analyze'}>
              <RefreshCw className="h-4 w-4" /> {analysis ? 'Re-run analysis' : 'Run analysis'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete workspace"
            >
              <Trash2 className="h-4 w-4 text-missing" />
            </Button>
          </>
        }
      />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {analysis?.stale && (
        <Alert tone="warning">
          The latest analysis was run on a different resume version. Re-run the analysis for current
          results.
        </Alert>
      )}

      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
              tab === t
                ? 'border-brand font-medium text-brand'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t}
            {t === 'Clarify' && pendingQuestions.length > 0 && (
              <span className="ml-1.5 rounded-full bg-pending-soft px-1.5 text-xs text-pending">
                {pendingQuestions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'Analysis' &&
          (!analysis ? (
            <Card>
              <p className="text-sm text-muted">No analysis yet.</p>
              <Button className="mt-3" onClick={analyse} loading={busy === 'analyze'}>
                Run analysis
              </Button>
            </Card>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <ScoreDial
                    label="Job Match Score"
                    value={analysis.jobMatch.value}
                    range={analysis.jobMatch.range}
                  />
                </Card>
                <Card>
                  <ScoreDial label="ATS Compatibility" value={analysis.ats.value} />
                </Card>
                <Card>
                  <ScoreDial label="Evidence Quality" value={analysis.evidenceQuality.value} />
                </Card>
              </div>
              <p className="text-xs text-muted">
                These scores are deterministic guidance. They are not an employer&apos;s ATS score
                and do not predict interviews. Engine {analysis.engineVersion}.
              </p>
              {analysis.jobMatch.hardRequirementWarnings.length > 0 && (
                <Alert
                  tone="warning"
                  title="Explicit must-have requirements (shown separately from the score)"
                >
                  <ul className="list-disc pl-5">
                    {analysis.jobMatch.hardRequirementWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              <Card
                title="Evidence summary"
                description={`Career stage: ${STAGE_LABEL[analysis.stage]} (${analysis.stageSource === 'user' ? 'set by you' : `computed from ${analysis.totalYears} years of dated roles`}). Change it in Settings.`}
              >
                <div className="flex flex-wrap gap-3">
                  <Badge tone="demonstrated">{analysis.counts.demonstrated} demonstrated</Badge>
                  <Badge tone="confirmed">{analysis.counts.user_confirmed} confirmed by you</Badge>
                  <Badge tone="missing">{analysis.counts.missing} missing</Badge>
                  <Badge tone="pending">{analysis.counts.pending} pending clarification</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {pendingQuestions.length > 0 && (
                    <Button onClick={() => setTab('Clarify')}>
                      Answer {pendingQuestions.length} question(s)
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setTab('Requirements')}>
                    Review requirement matrix
                  </Button>
                  <Button variant="secondary" onClick={() => setTab('Suggestions')}>
                    Improve resume
                  </Button>
                </div>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Strongest evidence">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {analysis.jobMatch.positives.slice(0, 5).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                  {!analysis.jobMatch.positives.length && (
                    <p className="text-sm text-muted">None yet.</p>
                  )}
                </Card>
                <Card title="Recommended next steps">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {analysis.jobMatch.recommendations.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          ))}

        {tab === 'Requirements' && (
          <RequirementsTab data={data} onChanged={reload} busy={busy} run={run} />
        )}
        {tab === 'Clarify' && <ClarifyTab data={data} run={run} busy={busy} />}
        {tab === 'Scores' &&
          (analysis ? (
            <div className="space-y-5">
              <ScoreExplainer score={analysis.jobMatch} />
              <ScoreExplainer score={analysis.ats} />
              <ScoreExplainer score={analysis.evidenceQuality} />
            </div>
          ) : (
            <p className="text-sm text-muted">Run an analysis first.</p>
          ))}
        {tab === 'Suggestions' && (
          <SuggestionsTab
            data={data}
            run={run}
            busy={busy}
            onVersion={(resumeId, versionId) =>
              router.push(
                `/resumes/${resumeId}/compare?from=${data.baseVersion.id}&to=${versionId}`,
              )
            }
          />
        )}
        {tab === 'Job description' && <JobTab data={data} run={run} busy={busy} />}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this workspace?"
        confirmLabel="Delete"
        busy={busy === 'delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          run('delete', async () => {
            await api(`/api/workspaces/${id}`, { method: 'DELETE' });
            router.push('/workspaces');
          })
        }
      >
        The job description, analyses, answers and pending suggestions are deleted. Resume versions
        you already created are kept.
      </ConfirmDialog>
    </div>
  );
}

type Run = (key: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

function RequirementsTab({
  data,
  run,
  busy,
}: {
  data: WorkspaceDetail;
  onChanged: () => void;
  run: Run;
  busy: string | null;
}) {
  const ev = new Map(data.evidence.map((e) => [e.requirementId, e]));
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  return (
    <Card
      title="Requirement and evidence matrix"
      description="Each requirement extracted from the posting, with the exact resume evidence found. Edit, add or remove requirements if extraction got something wrong, then re-run the analysis."
      actions={
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add requirement
        </Button>
      }
    >
      {editing === 'new' && (
        <RequirementForm
          onCancel={() => setEditing(null)}
          busy={busy === 'req'}
          onSave={(v) =>
            run(
              'req',
              async () => {
                await api(`/api/workspaces/${data.workspace.id}/requirements`, {
                  method: 'POST',
                  json: v,
                });
                setEditing(null);
              },
              'Requirement added. Re-run the analysis to classify it.',
            )
          }
        />
      )}
      <div className="divide-y divide-line">
        {data.requirements.map((r) => {
          const e = ev.get(r.id);
          if (editing === r.id)
            return (
              <RequirementForm
                key={r.id}
                initial={r}
                busy={busy === 'req'}
                onCancel={() => setEditing(null)}
                onSave={(v) =>
                  run(
                    'req',
                    async () => {
                      await api(`/api/requirements/${r.id}`, { method: 'PUT', json: v });
                      setEditing(null);
                    },
                    'Requirement updated. Re-run the analysis.',
                  )
                }
              />
            );
          return (
            <div key={r.id} className="grid gap-3 py-4 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{KIND_LABEL[r.kind]}</Badge>
                  {r.importance === 'preferred' && <Badge>Preferred</Badge>}
                  {r.hard && (
                    <Badge tone="missing">
                      <AlertTriangle className="h-3 w-3" /> Must-have
                    </Badge>
                  )}
                  {r.userEdited && <Badge tone="brand">Edited by you</Badge>}
                </div>
                <p className="mt-2 text-sm">{r.text}</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    className="inline-flex items-center gap-1 text-brand"
                    onClick={() => setEditing(r.id)}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    className="inline-flex items-center gap-1 text-missing"
                    onClick={() =>
                      run(
                        'req',
                        () => api(`/api/requirements/${r.id}`, { method: 'DELETE' }),
                        'Requirement removed.',
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
              <div className="text-sm">
                {e ? (
                  <>
                    <StateBadge status={e.status} state={e.state} />
                    <p className="mt-1 text-muted">{e.reasoning}</p>
                    {e.confirmationText && (
                      <blockquote className="mt-2 border-l-2 border-confirmed pl-3 text-sm">
                        “{e.confirmationText}”{' '}
                        <span className="block text-xs text-muted">
                          Your confirmation,{' '}
                          {e.confirmationDate
                            ? new Date(e.confirmationDate).toLocaleDateString()
                            : ''}
                        </span>
                      </blockquote>
                    )}
                    {e.evidence
                      .filter((x) => x.strength !== 'related' || e.status === 'pending')
                      .slice(0, 3)
                      .map((x, i) => (
                        <div key={i} className="mt-2 rounded-md bg-canvas p-2">
                          <p className="text-xs text-muted">
                            {x.context} · {x.location.section}
                            {x.location.bulletId ? ' bullet' : ''} · {x.strength} · confidence{' '}
                            {Math.round(x.confidence * 100)}%
                          </p>
                          <p>“{x.text}”</p>
                        </div>
                      ))}
                  </>
                ) : (
                  <span className="text-muted">Not analysed yet.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RequirementForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial?: Requirement;
  onSave: (v: {
    kind: string;
    text: string;
    importance: string;
    hard: boolean;
    minYears: number | null;
  }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [v, setV] = useState({
    kind: initial?.kind ?? 'required_skill',
    text: initial?.text ?? '',
    importance: initial?.importance ?? 'required',
    hard: initial?.hard ?? false,
    minYears: initial?.minYears ?? (null as number | null),
  });
  return (
    <form
      className="my-3 grid gap-3 rounded-lg border border-brand-soft bg-brand-soft/30 p-4 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <div className="md:col-span-4">
        <Field label="Requirement" htmlFor="rq-text">
          <Textarea
            id="rq-text"
            rows={2}
            required
            minLength={3}
            value={v.text}
            onChange={(e) => setV({ ...v, text: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Type" htmlFor="rq-kind">
        <select
          id="rq-kind"
          className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
          value={v.kind}
          onChange={(e) => setV({ ...v, kind: e.target.value })}
        >
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Importance" htmlFor="rq-imp">
        <select
          id="rq-imp"
          className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
          value={v.importance}
          onChange={(e) => setV({ ...v, importance: e.target.value as 'required' })}
        >
          <option value="required">Required</option>
          <option value="preferred">Preferred</option>
        </select>
      </Field>
      <Field label="Minimum years" htmlFor="rq-yrs">
        <Input
          id="rq-yrs"
          type="number"
          min={0}
          max={40}
          value={v.minYears ?? ''}
          onChange={(e) =>
            setV({ ...v, minYears: e.target.value === '' ? null : Number(e.target.value) })
          }
        />
      </Field>
      <label className="mt-7 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.hard}
          onChange={(e) => setV({ ...v, hard: e.target.checked })}
        />{' '}
        Explicit must-have
      </label>
      <div className="flex gap-2 md:col-span-4">
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ClarifyTab({ data, run, busy }: { data: WorkspaceDetail; run: Run; busy: string | null }) {
  const reqs = new Map(data.requirements.map((r) => [r.id, r]));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!data.questions.length)
    return (
      <Card>
        <p className="text-sm text-muted">
          {data.analysis
            ? 'No clarification needed: every requirement is classified.'
            : 'Run an analysis to generate questions.'}
        </p>
      </Card>
    );
  const answer = (q: Question, response: 'yes' | 'no' | 'skipped' | 'deferred') =>
    run(
      `q-${q.id}`,
      () =>
        api(`/api/questions/${q.id}/answer`, {
          method: 'POST',
          json: { response, text: response === 'yes' ? (drafts[q.id] ?? '') : '' },
        }),
      response === 'deferred' ? 'Saved for later.' : 'Answer recorded and analysis updated.',
    );
  return (
    <div className="space-y-4">
      <Alert tone="info">
        Answer only from your real experience. A “yes” makes the requirement{' '}
        <strong>confirmed by you</strong>, which is tracked separately from evidence already in your
        resume. Skipping explicitly marks it as not established; “Answer later” keeps it pending and
        it is never counted as missing.
      </Alert>
      {data.questions.map((q) => {
        const r = reqs.get(q.requirementId);
        return (
          <Card key={q.id}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {r && <Badge>{KIND_LABEL[r.kind]}</Badge>}
              {r?.hard && <Badge tone="missing">Must-have</Badge>}
              {q.response === 'yes' && <Badge tone="confirmed">Answered: yes</Badge>}
              {q.response === 'no' && <Badge tone="missing">Answered: no</Badge>}
              {q.response === 'skipped' && <Badge tone="missing">Skipped</Badge>}
              {!q.response && <Badge tone="pending">Pending</Badge>}
            </div>
            <p className="mt-2 font-medium">{q.question}</p>
            <p className="mt-1 text-xs text-muted">Why we ask: {q.rationale}</p>
            {q.response ? (
              <div className="mt-3 text-sm">
                {q.responseText && (
                  <blockquote className="border-l-2 border-confirmed pl-3">
                    “{q.responseText}”
                  </blockquote>
                )}
                <Button
                  className="mt-2"
                  size="sm"
                  variant="ghost"
                  onClick={() => answer(q, 'deferred')}
                  loading={busy === `q-${q.id}`}
                >
                  Change answer
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor={`a-${q.id}`} className="sr-only">
                  Your answer
                </label>
                <Textarea
                  id={`a-${q.id}`}
                  rows={3}
                  placeholder="If yes: describe where, what you personally did, and the outcome or scale. Don't estimate numbers you can't support."
                  value={drafts[q.id] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => answer(q, 'yes')}
                    disabled={(drafts[q.id] ?? '').trim().length < 10}
                    loading={busy === `q-${q.id}`}
                  >
                    <Check className="h-4 w-4" /> Yes, I have this
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => answer(q, 'no')}>
                    <X className="h-4 w-4" /> No
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => answer(q, 'skipped')}>
                    Skip
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => answer(q, 'deferred')}>
                    Answer later
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const SUGGESTION_LABEL: Record<string, string> = {
  add_bullet: 'Add bullet',
  modify_bullet: 'Reword bullet',
  add_skill: 'Add skill',
  reorder_skills: 'Reorder skills',
  update_summary: 'Update summary',
  reorder_sections: 'Reorder sections',
};

function SuggestionsTab({
  data,
  run,
  busy,
  onVersion,
}: {
  data: WorkspaceDetail;
  run: Run;
  busy: string | null;
  onVersion: (resumeId: string, versionId: string) => void;
}) {
  const current = data.suggestions.filter(
    (s) => s.baseVersionId === data.baseVersion.id && !s.appliedVersionId,
  );
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const accepted = current.filter((s) => s.decision === 'accepted').length;
  const decide = (s: SuggestionRow, decision: 'accepted' | 'rejected' | 'pending') =>
    run(`s-${s.id}`, () =>
      api(`/api/suggestions/${s.id}`, {
        method: 'PATCH',
        json: {
          decision,
          editedProposed:
            decision === 'accepted' && edit[s.id] !== undefined && edit[s.id] !== s.proposed
              ? edit[s.id]
              : undefined,
        },
      }),
    );
  const preview = (s: SuggestionRow) =>
    s.type === 'reorder_skills' ? 'Job-relevant skills first' : (s.editedProposed ?? s.proposed);
  return (
    <div className="space-y-4">
      <Card
        title="Suggested improvements"
        description="Every suggestion is backed by your resume text or your own answers. Nothing is applied until you accept it, and accepted changes create a new version; your current version stays as it is."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              run(
                'gen',
                () => api(`/api/workspaces/${data.workspace.id}/suggestions`, { method: 'POST' }),
                'Suggestions generated.',
              )
            }
            loading={busy === 'gen'}
            disabled={!data.analysis || data.analysis.stale}
          >
            {current.length ? 'Regenerate' : 'Generate suggestions'}
          </Button>
        }
      >
        {!data.analysis && <p className="text-sm text-muted">Run an analysis first.</p>}
        {data.analysis && !current.length && (
          <p className="text-sm text-muted">
            No suggestions yet. Answer clarification questions first so confirmed experience can be
            documented.
          </p>
        )}
      </Card>
      {current.map((s) => (
        <Card
          key={s.id}
          className={cn(
            s.decision === 'accepted' && 'border-demonstrated',
            s.decision === 'rejected' && 'opacity-60',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{SUGGESTION_LABEL[s.type]}</Badge>
            {s.source === 'ai' && <Badge tone="pending">AI wording — review carefully</Badge>}
            {s.decision !== 'pending' && (
              <Badge tone={s.decision === 'accepted' ? 'demonstrated' : 'missing'}>
                {s.decision}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">{s.reason}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {s.original && s.type !== 'reorder_skills' && (
              <div>
                <p className="text-xs font-medium text-muted">Current</p>
                <p className="mt-1 rounded bg-canvas p-2 text-sm">{s.original || '(empty)'}</p>
              </div>
            )}
            <div className={cn(!s.original || s.type === 'reorder_skills' ? 'md:col-span-2' : '')}>
              <p className="text-xs font-medium text-muted">Proposed</p>
              {s.decision === 'pending' && s.type !== 'reorder_skills' ? (
                <Textarea
                  aria-label="Proposed text (editable)"
                  rows={2}
                  className="mt-1"
                  value={edit[s.id] ?? s.proposed}
                  onChange={(e) => setEdit({ ...edit, [s.id]: e.target.value })}
                />
              ) : (
                <p className="mt-1 rounded bg-demonstrated-soft/60 p-2 text-sm">{preview(s)}</p>
              )}
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {s.evidence.map((e, i) => (
              <p key={i} className="text-xs text-muted">
                Evidence ({e.kind === 'confirmation' ? 'your answer' : e.kind}): “{e.text}”
              </p>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {s.decision === 'pending' ? (
              <>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => decide(s, 'accepted')}
                  loading={busy === `s-${s.id}`}
                >
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button size="sm" variant="secondary" onClick={() => decide(s, 'rejected')}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => decide(s, 'pending')}>
                Undo decision
              </Button>
            )}
          </div>
        </Card>
      ))}
      {current.length > 0 && (
        <Card
          title="Create a new version"
          description={`${accepted} accepted suggestion(s) will be applied. Rejected and undecided suggestions are excluded.`}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Field label="Version label" htmlFor="vl">
                <Input
                  id="vl"
                  placeholder={`Tailored for ${data.workspace.name}`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
            </div>
            <Button
              disabled={!accepted}
              loading={busy === 'version'}
              onClick={() =>
                run('version', async () => {
                  const r = await api<{ versionId: string; resumeId: string }>(
                    `/api/workspaces/${data.workspace.id}/versions`,
                    { method: 'POST', json: { label: label || undefined } },
                  );
                  onVersion(r.resumeId, r.versionId);
                })
              }
            >
              Create version
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function JobTab({ data, run, busy }: { data: WorkspaceDetail; run: Run; busy: string | null }) {
  const j = data.job;
  const [text, setText] = useState(j.rawText);
  const [editing, setEditing] = useState(false);
  const rows: [string, string][] = [
    ['Title', j.title],
    ['Company', j.company],
    ['Location', j.location],
    ['Country', j.country],
    ['Work mode', j.workMode],
    ['Employment type', j.employmentType.replace('_', ' ')],
    ['Minimum years', j.minYearsOverall?.toString() ?? 'Not stated'],
    ['Salary', j.salary ? j.salary.text : 'Not stated in the posting'],
    ['Languages', j.languages.join(', ') || 'Not stated'],
    [
      'Work authorisation',
      j.workAuthorization.length ? j.workAuthorization.join(' ') : 'Not stated',
    ],
    ['Source', `${j.source}${j.sourceSite ? ` (${j.sourceSite})` : ''}`],
  ];
  return (
    <div className="space-y-4">
      <Card
        title="Extracted details"
        description="Only information explicitly present in the posting is shown. Nothing is inferred."
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-40 shrink-0 text-muted">{k}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
        </dl>
        {j.sourceUrl && (
          <p className="mt-3 text-sm">
            <a
              className="text-brand underline"
              href={j.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Open original posting
            </a>
          </p>
        )}
      </Card>
      <Card
        title="Job description text"
        actions={
          !editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )
        }
      >
        {editing ? (
          <div className="space-y-3">
            <Alert tone="warning">
              Saving re-parses the requirements and clears analyses and pending suggestions for this
              workspace.
            </Alert>
            <Textarea
              aria-label="Job description"
              rows={16}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                loading={busy === 'job'}
                onClick={() =>
                  run(
                    'job',
                    async () => {
                      await api(`/api/workspaces/${data.workspace.id}/job`, {
                        method: 'PUT',
                        json: { jobText: text },
                      });
                      await api(`/api/workspaces/${data.workspace.id}/analyze`, { method: 'POST' });
                      setEditing(false);
                    },
                    'Job description updated and re-analysed.',
                  )
                }
              >
                Save and re-analyse
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setText(j.rawText);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-sans text-sm">
            {j.rawText}
          </pre>
        )}
      </Card>
    </div>
  );
}
