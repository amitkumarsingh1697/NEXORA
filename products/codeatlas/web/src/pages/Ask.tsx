import { useState } from 'react';
import { api } from '../api';
import type { Confidence } from '../types';
import { Source } from '../components/Source';
import { Button, Card, ConfidenceBadge, ErrorBox, Spinner, cn, useAsync } from '../components/ui';

interface Caps {
  provider: string;
  available: boolean;
  reason?: string;
  model: string;
  local: boolean;
}

interface Answer {
  mode: 'model' | 'retrieval-only';
  answer: string;
  citations: {
    source: string;
    filePath: string;
    startLine: number;
    endLine: number;
    symbol: string | null;
    revision: string | null;
    note?: string;
  }[];
  revision?: { commit: string | null; branch: string | null; indexedAt: string | null };
  confidence: 'high' | 'medium' | 'low';
  gaps: string[];
  warnings: string[];
  facts: { text: string; confidence: Confidence; evidence: string | null }[];
  provider?: { id: string; model: string; local: boolean };
}

interface Turn {
  question: string;
  answer?: Answer;
  error?: unknown;
}

/** Render answer text, turning [S1] markers into buttons that open the cited source. */
function AnswerText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const parts = text.split(/(\[S\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-6">
      {parts.map((p, i) => {
        const m = /^\[(S\d+)\]$/.exec(p);
        return m ? (
          <button
            key={i}
            onClick={() => onCite(m[1] as string)}
            className="mx-0.5 rounded bg-accent/10 px-1 font-mono text-[11px] text-accent hover:bg-accent/20"
          >
            {m[1]}
          </button>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

function AnswerView({ repoId, a }: { repoId: number; a: Answer }) {
  const [open, setOpen] = useState<string | null>(a.citations[0]?.source ?? null);
  const cited = a.citations.find((c) => c.source === open);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-semibold',
            a.confidence === 'high'
              ? 'bg-observed/10 text-observed'
              : a.confidence === 'medium'
                ? 'bg-inferred/10 text-inferred'
                : 'bg-danger/10 text-danger',
          )}
        >
          {a.confidence} confidence
        </span>
        <span>
          {a.mode === 'model'
            ? `Answered by ${a.provider?.model} (${a.provider?.local ? 'on this machine' : 'remote'})`
            : 'Evidence only (no model)'}
        </span>
        {a.revision?.commit && (
          <span className="font-mono" title="Index revision the citations refer to">
            @ {a.revision.commit.slice(0, 10)}
            {a.revision.branch ? ` (${a.revision.branch})` : ''}
          </span>
        )}
      </div>
      {a.warnings.map((w) => (
        <p key={w} className="rounded border border-inferred/30 bg-inferred/5 px-2 py-1 text-xs">
          {w}
        </p>
      ))}
      <AnswerText text={a.answer} onCite={setOpen} />
      {a.gaps.length > 0 && (
        <div className="text-xs text-muted">
          <p className="font-semibold">Not covered by the evidence:</p>
          <ul className="list-disc pl-5">
            {a.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {a.citations.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {a.citations.map((c) => (
              <button
                key={c.source}
                onClick={() => setOpen(c.source)}
                className={cn(
                  'rounded border px-2 py-0.5 font-mono text-[11px]',
                  open === c.source
                    ? 'border-accent text-accent'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {c.source} · {c.symbol ?? c.filePath.split('/').pop()}
              </button>
            ))}
          </div>
          {cited && (
            <Source
              repoId={repoId}
              path={cited.filePath}
              start={cited.startLine}
              end={cited.endLine}
            />
          )}
        </div>
      )}
      {a.facts.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">
            Relationships used ({a.facts.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {a.facts.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge c={f.confidence} />
                <span className="font-mono">{f.text}</span>
                {f.evidence && <span className="text-muted">{f.evidence}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Ask({ repoId }: { repoId: number }) {
  const caps = useAsync(() => api<{ capabilities: Caps }>('/api/ai/status'), []);
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const c = caps.data?.capabilities;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        {caps.loading ? <Spinner label="Checking AI model…" /> : <ErrorBox error={caps.error} />}
        {c && (
          <p className="text-sm">
            {c.available ? (
              <>
                Using <span className="font-semibold">{c.model}</span> via {c.provider} ·{' '}
                {c.local
                  ? 'runs on this machine; your code is not sent anywhere.'
                  : 'remote provider you explicitly enabled.'}
              </>
            ) : (
              <>
                No AI model available ({(c.reason ?? 'unknown reason').replace(/\.$/, '')}). You
                will get the relevant code and relationships, without an explanation.{' '}
                {c.provider === 'ollama' ? (
                  <>
                    To enable answers, install Ollama and run{' '}
                    <code className="rounded bg-canvas px-1 font-mono">ollama pull {c.model}</code>.
                  </>
                ) : (
                  <>
                    To enable answers, set{' '}
                    <code className="rounded bg-canvas px-1 font-mono">AI_PROVIDER=ollama</code> and
                    install Ollama.
                  </>
                )}
              </>
            )}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          Answers cite the code they rely on. Questions are not stored.
        </p>
      </Card>
      {turns.map((t, i) => (
        <Card key={i} title={<span className="font-normal">{t.question}</span>}>
          {t.answer ? (
            <AnswerView repoId={repoId} a={t.answer} />
          ) : t.error ? (
            <ErrorBox error={t.error} />
          ) : (
            <Spinner label="Reading the code…" />
          )}
        </Card>
      ))}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const question = q.trim();
          if (!question) return;
          setQ('');
          setBusy(true);
          const idx = turns.length;
          setTurns((ts) => [...ts, { question }]);
          try {
            const answer = await api<Answer>(`/api/repos/${repoId}/chat`, {
              method: 'POST',
              body: { question },
            });
            setTurns((ts) => ts.map((t, j) => (j === idx ? { ...t, answer } : t)));
          } catch (error) {
            setTurns((ts) => ts.map((t, j) => (j === idx ? { ...t, error } : t)));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about this codebase, e.g. How does extension pairing work?"
          aria-label="Question"
          className="flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy || q.trim().length < 3}>
          {busy ? 'Thinking…' : 'Ask'}
        </Button>
      </form>
    </div>
  );
}
