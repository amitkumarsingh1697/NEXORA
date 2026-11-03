import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Coverage, Job, Repo } from '../types';
import { Button, Card, Empty, ErrorBox, Spinner, Stat, useAsync } from '../components/ui';

interface RepoDetail {
  repo: Repo;
  coverage: Coverage | null;
  runs: {
    id: number;
    startedAt: string;
    status: string;
    error: string | null;
    durationMs: number | null;
  }[];
  job: Job | null;
}

export function Overview({ repoId }: { repoId: number }) {
  const d = useAsync(() => api<RepoDetail>(`/api/repos/${repoId}`), [repoId]);
  const unresolved = useAsync(
    () =>
      api<{
        items: { filePath: string; line: number; kind: string; text: string; reason: string }[];
      }>(`/api/repos/${repoId}/unresolved`),
    [repoId],
  );
  const [cancelError, setCancelError] = useState<unknown>(null);
  const running = d.data?.job?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(d.reload, 1500);
    return () => clearInterval(t);
  }, [running, d.reload]);

  if (d.loading && !d.data) return <Spinner />;
  if (d.error) return <ErrorBox error={d.error} />;
  const c = d.data?.coverage;
  return (
    <div className="space-y-5">
      {running && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Spinner label={`Indexing… ${d.data?.job?.progress.at(-1) ?? ''}`} />
            <Button
              small
              variant="secondary"
              onClick={() =>
                api(`/api/jobs/${d.data!.job!.id}`, { method: 'DELETE' }).then(
                  d.reload,
                  setCancelError,
                )
              }
            >
              Cancel indexing
            </Button>
          </div>
          <ErrorBox error={cancelError} />
        </Card>
      )}
      {!c ? (
        <Empty>
          No successful index yet.
          {d.data?.runs[0]?.error ? ` Last error: ${d.data.runs[0].error}` : ''}
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Files analysed"
              value={`${c.files.structurallyAnalysed} / ${c.files.discovered}`}
              hint="TypeScript/JavaScript files analysed structurally / all files discovered"
            />
            <Stat label="Symbols" value={c.symbols} />
            <Stat label="Routes" value={c.routes} />
            <Stat
              label="In-repo call resolution"
              value={`${Math.round(c.calls.resolutionRate * 100)}%`}
              hint="Share of calls to code in this repository that CodeAtlas linked (observed or inferred)"
            />
          </div>
          <Card
            title="Coverage report"
            actions={
              <Button
                small
                variant="secondary"
                disabled={running}
                onClick={() => api(`/api/repos/${repoId}/index`, { method: 'POST' }).then(d.reload)}
              >
                Re-index
              </Button>
            }
          >
            <div className="grid gap-6 text-sm md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  What was read
                </h3>
                <p>
                  {Object.entries(c.files.byLang)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(' · ')}
                </p>
                <p className="text-muted">
                  Skipped:{' '}
                  {Object.entries(c.files.skipped)
                    .map(([k, v]) => `${v} ${k.replace('_', ' ')}`)
                    .join(' · ') || 'none'}
                </p>
                {c.files.skippedSecretPaths.length > 0 && (
                  <p className="text-xs text-muted">
                    Not read (may contain credentials):{' '}
                    <span className="font-mono">{c.files.skippedSecretPaths.join(', ')}</span>
                  </p>
                )}
                <p className="text-muted">
                  Git:{' '}
                  {c.git.available
                    ? c.git.head
                      ? `${c.git.branch ? `branch ${c.git.branch}` : 'detached HEAD'} at ${c.git.head.slice(0, 10)}${c.git.dirtyFiles ? ` with ${c.git.dirtyFiles} uncommitted changes` : ''} · ${c.git.commitsScanned} commits scanned`
                      : 'no commits yet'
                    : 'not a git repository'}
                </p>
                <p className="text-muted">
                  Indexed {new Date(c.indexedAt).toLocaleString()} in{' '}
                  {(c.durationMs / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  How links were made
                </h3>
                <p>
                  <span className="font-semibold text-observed">
                    {c.edgesByConfidence.observed}
                  </span>{' '}
                  observed ·{' '}
                  <span className="font-semibold text-inferred">
                    {c.edgesByConfidence.inferred}
                  </span>{' '}
                  inferred relationships
                </p>
                <p className="text-muted">
                  Imports: {c.imports.internal} internal · {c.imports.external} external ·{' '}
                  {c.imports.unresolved} unresolved
                </p>
                <p className="text-muted">
                  Calls: {c.calls.observed} resolved by the compiler · {c.calls.inferred} inferred
                  by name · {c.calls.dynamic} dynamic · {c.calls.unresolved} unresolved ·{' '}
                  {c.calls.external + c.calls.builtin} to libraries/runtime
                </p>
              </div>
            </div>
            {!!(c.manifests?.length || c.frameworks?.length) && (
              <div className="mt-4 grid gap-6 text-sm md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Manifests found
                  </h3>
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto font-mono text-xs">
                    {(c.manifests ?? []).map((m) => (
                      <li key={m.path}>
                        <span className="text-muted">{m.kind}</span> {m.path}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Frameworks declared
                  </h3>
                  <p className="text-xs text-muted">
                    Declared in package.json dependencies (observed). Declaration does not prove
                    use.
                  </p>
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">
                    {(c.frameworks ?? []).map((f) => (
                      <li key={`${f.evidence}:${f.package}`}>
                        {f.name} <span className="font-mono text-muted">{f.version}</span>
                        {f.dev ? ' (dev)' : ''}{' '}
                        <span className="font-mono text-muted">{f.evidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {c.limitations.length > 0 && (
              <div className="mt-4 rounded-lg border border-inferred/30 bg-inferred/5 p-3 text-sm">
                <p className="font-semibold">Known gaps in this map</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                  {c.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title={`Unresolved references (${unresolved.data?.items.length ?? 0})`}>
            {unresolved.data && !unresolved.data.items.length ? (
              <Empty>Nothing unresolved.</Empty>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 pr-3">Location</th>
                      <th className="pr-3">Kind</th>
                      <th className="pr-3">Text</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unresolved.data?.items.map((u, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1 pr-3 font-mono">
                          {u.filePath}:{u.line}
                        </td>
                        <td className="pr-3">{u.kind}</td>
                        <td className="pr-3 font-mono">{u.text}</td>
                        <td className="text-muted">{u.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
