import { useState } from 'react';
import { api } from '../api';
import { navigate } from '../router';
import { Button, Card, ErrorBox, Spinner, Stat, useAsync } from '../components/ui';

export interface SettingsInfo {
  dataLocation: string;
  database: string;
  worktrees: string;
  clones: string;
  firstRun: boolean;
  analytics: { storedLocally: boolean; transmitted: boolean };
}

interface Caps {
  provider: string;
  available: boolean;
  reason?: string;
  model: string;
  local: boolean;
}

interface Summary {
  since: string | null;
  indexing: {
    succeeded: number;
    failed: number;
    cancelled: number;
    averageDurationMs: number | null;
    last: { files: number; symbols: number; relationships: number } | null;
  };
  counts: Record<string, number>;
  questions: { asked: number; averageSources: number | null };
  feedback: {
    up: number;
    down: number;
    recentNotes: { at: string; rating: string; note: string }[];
  };
  findings: { cycles: number; sensitiveConfig: number } | null;
  patches: { proposed: number; approved: number; rejected: number };
  validation: { passed: number; failed: number };
  merges: number;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

export function Settings() {
  const info = useAsync(() => api<SettingsInfo>('/api/settings'), []);
  const caps = useAsync(() => api<{ capabilities: Caps }>('/api/ai/status'), []);
  const stats = useAsync(() => api<Summary>('/api/analytics'), []);
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const c = caps.data?.capabilities;
  const s = stats.data;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-5">
      <div>
        <button className="text-xs text-muted hover:text-ink" onClick={() => navigate('/')}>
          ← Repositories
        </button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <Card title="AI provider">
        {caps.loading && !c ? <Spinner /> : <ErrorBox error={caps.error} />}
        {c && (
          <dl className="divide-y divide-line">
            <Row label="Provider" value={c.provider} />
            <Row label="Model" value={c.model || 'none'} />
            <Row
              label="Status"
              value={c.available ? 'Available' : `Unavailable${c.reason ? `: ${c.reason}` : ''}`}
            />
            <Row
              label="Runs"
              value={c.local ? 'On this machine' : 'Remote (only with your consent)'}
            />
          </dl>
        )}
      </Card>

      <Card title="Data location">
        {info.loading && !info.data ? <Spinner /> : <ErrorBox error={info.error} />}
        {info.data && (
          <dl className="divide-y divide-line">
            <Row label="CodeAtlas home" value={info.data.dataLocation} />
            <Row label="Database" value={info.data.database} />
            <Row label="Investigation worktrees" value={info.data.worktrees} />
            <Row label="Public clones" value={info.data.clones} />
          </dl>
        )}
      </Card>

      <Card title="Local usage analytics">
        <p className="mb-3 text-sm text-muted">
          Kept only in the database above and never sent anywhere. CodeAtlas stores counts,
          durations and outcomes, plus any note you add to answer feedback. It does not store your
          questions, answers or code.
        </p>
        {stats.loading && !s ? <Spinner /> : <ErrorBox error={stats.error} />}
        {s && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Index runs"
                value={`${s.indexing.succeeded} ok / ${s.indexing.failed} failed`}
                hint={`${s.indexing.cancelled} cancelled`}
              />
              <Stat
                label="Average index time"
                value={
                  s.indexing.averageDurationMs === null
                    ? '—'
                    : `${(s.indexing.averageDurationMs / 1000).toFixed(1)} s`
                }
              />
              <Stat
                label="Last index"
                value={
                  s.indexing.last
                    ? `${s.indexing.last.files} files · ${s.indexing.last.symbols} symbols`
                    : '—'
                }
                hint={
                  s.indexing.last ? `${s.indexing.last.relationships} relationships` : undefined
                }
              />
              <Stat label="Modules explored" value={s.counts.module_explored ?? 0} />
              <Stat
                label="Questions asked"
                value={s.questions.asked}
                hint={
                  s.questions.averageSources === null
                    ? undefined
                    : `${s.questions.averageSources} sources retrieved on average`
                }
              />
              <Stat label="Answer feedback" value={`👍 ${s.feedback.up} · 👎 ${s.feedback.down}`} />
              <Stat
                label="Findings (latest index)"
                value={
                  s.findings
                    ? `${s.findings.cycles} cycles · ${s.findings.sensitiveConfig} sensitive`
                    : '—'
                }
              />
              <Stat label="Patches proposed" value={s.patches.proposed} />
              <Stat
                label="Patch decisions"
                value={`${s.patches.approved} approved / ${s.patches.rejected} rejected`}
              />
              <Stat
                label="Checks run"
                value={`${s.validation.passed} passed / ${s.validation.failed} failed`}
              />
              <Stat label="Changes merged" value={s.merges} />
            </div>
            {s.feedback.recentNotes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold">Recent feedback notes</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {s.feedback.recentNotes.map((n) => (
                    <li key={n.at}>
                      {n.rating === 'up' ? '👍' : '👎'} {n.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Delete all local data">
        <p className="text-sm text-muted">
          Clears CodeAtlas&apos;s database: every repository index, investigation record, analytics
          event and setting. Your repositories are not touched. The worktree and clone folders
          listed above are kept for you to review and delete yourself.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Type <code className="font-mono">DELETE</code> to confirm
            </span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 font-mono"
            />
          </label>
          <Button
            variant="danger"
            disabled={confirm !== 'DELETE'}
            onClick={async () => {
              setError(null);
              try {
                const r = await api<{ note: string }>('/api/data/delete-all', {
                  method: 'POST',
                  body: { confirm },
                });
                setResult(r.note);
                setConfirm('');
                stats.reload();
              } catch (e) {
                setError(e);
              }
            }}
          >
            Delete all local data
          </Button>
        </div>
        {result && (
          <p role="status" className="mt-3 text-sm">
            {result}
          </p>
        )}
        <ErrorBox error={error} />
      </Card>
    </div>
  );
}
