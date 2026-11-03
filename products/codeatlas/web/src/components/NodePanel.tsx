import { useState } from 'react';
import { api } from '../api';
import type { EdgeWithOther, NodeDetail, NodeRow } from '../types';
import { Source } from './Source';
import { Button, ConfidenceBadge, ErrorBox, Spinner, useAsync } from './ui';

interface Impact {
  affected: (NodeRow & { distance: number; via: string })[];
  routes: NodeRow[];
  tests: NodeRow[];
  truncated: boolean;
}

function label(n: NodeRow): string {
  return n.kind === 'symbol' ? n.name : n.key;
}

function EdgeList({
  title,
  edges,
  onOpen,
  onEvidence,
}: {
  title: string;
  edges: EdgeWithOther[];
  onOpen: (id: number) => void;
  onEvidence: (path: string, line: number) => void;
}) {
  if (!edges.length) return null;
  const byKind = new Map<string, EdgeWithOther[]>();
  for (const e of edges) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {[...byKind].map(([kind, list]) => (
        <div key={kind}>
          <p className="mb-1 text-xs text-muted">
            {kind} ({list.length})
          </p>
          <ul className="space-y-1">
            {list.slice(0, 40).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                <ConfidenceBadge c={e.confidence} />
                <button
                  className="truncate font-mono text-accent hover:underline"
                  onClick={() => onOpen(e.other.id)}
                >
                  {label(e.other)}
                </button>
                {e.evidencePath && e.evidenceLine && (
                  <button
                    className="font-mono text-muted hover:text-ink"
                    onClick={() => onEvidence(e.evidencePath as string, e.evidenceLine as number)}
                  >
                    {e.evidencePath}:{e.evidenceLine}
                  </button>
                )}
                {e.detail && <span className="text-muted">{e.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Details for any graph node: metadata, source, evidence-linked edges, and change impact. */
export function NodePanel({
  repoId,
  nodeId,
  onOpen,
  onClose,
}: {
  repoId: number;
  nodeId: number;
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const { data, error, loading } = useAsync(
    () => api<NodeDetail>(`/api/repos/${repoId}/nodes/${nodeId}`),
    [repoId, nodeId],
  );
  const [evidence, setEvidence] = useState<{ path: string; line: number } | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactErr, setImpactErr] = useState<unknown>(null);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[640px] flex-col border-l border-line bg-panel shadow-2xl"
      aria-label="Node details"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          {data && (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">
                {data.node.kind}
                {data.node.symbolKind ? ` · ${data.node.symbolKind}` : ''}
                {data.node.exported ? ' · exported' : ''}
              </p>
              <h2 className="truncate font-mono text-sm font-semibold">{label(data.node)}</h2>
              {data.node.filePath && (
                <p className="truncate font-mono text-xs text-muted">
                  {data.node.filePath}
                  {data.node.startLine ? `:${data.node.startLine}` : ''}
                </p>
              )}
            </>
          )}
        </div>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {loading && <Spinner />}
        <ErrorBox error={error} />
        {data && (
          <>
            {data.node.data.signature || data.node.data.doc ? (
              <div className="space-y-1 text-sm">
                {typeof data.node.data.signature === 'string' && (
                  <code className="block break-all rounded bg-canvas px-2 py-1 font-mono text-xs">
                    {data.node.data.signature}
                  </code>
                )}
                {typeof data.node.data.doc === 'string' && (
                  <p className="text-muted">{data.node.data.doc}</p>
                )}
              </div>
            ) : null}
            <dl className="grid grid-cols-3 gap-2 text-xs">
              {(
                [
                  'complexity',
                  'loc',
                  'commits',
                  'churn',
                  'authorCount',
                  'resolvedCalls',
                  'unresolvedCalls',
                ] as const
              )
                .filter((k) => data.node.data[k] !== undefined)
                .map((k) => (
                  <div key={k} className="rounded border border-line px-2 py-1.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-semibold tabular-nums">{String(data.node.data[k])}</dd>
                  </div>
                ))}
            </dl>
            {Array.isArray(data.node.data.authors) && (
              <p className="text-xs text-muted">
                Changed most by:{' '}
                {(data.node.data.authors as { name: string; share: number }[])
                  .map((a) => `${a.name} (${Math.round(a.share * 100)}%)`)
                  .join(', ')}
              </p>
            )}
            {evidence ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">Evidence</p>
                  <Button small variant="ghost" onClick={() => setEvidence(null)}>
                    Show node source
                  </Button>
                </div>
                <Source
                  repoId={repoId}
                  path={evidence.path}
                  start={Math.max(1, evidence.line - 6)}
                  end={evidence.line + 10}
                  highlight={[evidence.line, evidence.line]}
                />
              </div>
            ) : data.node.filePath && data.node.startLine && data.node.kind !== 'module' ? (
              <Source
                repoId={repoId}
                path={data.node.filePath}
                start={data.node.startLine}
                end={Math.min(
                  data.node.endLine ?? data.node.startLine + 40,
                  data.node.startLine + 80,
                )}
              />
            ) : null}
            <EdgeList
              title="Outgoing"
              edges={data.outgoing}
              onOpen={onOpen}
              onEvidence={(path, line) => setEvidence({ path, line })}
            />
            <EdgeList
              title="Incoming"
              edges={data.incoming}
              onOpen={onOpen}
              onEvidence={(path, line) => setEvidence({ path, line })}
            />
            <div className="space-y-2 border-t border-line pt-4">
              <Button
                small
                variant="secondary"
                onClick={() =>
                  api<Impact>(`/api/repos/${repoId}/impact/${nodeId}`).then(setImpact, setImpactErr)
                }
              >
                What could a change here affect?
              </Button>
              <ErrorBox error={impactErr} />
              {impact && (
                <div className="space-y-2 text-xs">
                  <p>
                    {impact.affected.length} dependent nodes{impact.truncated ? ' (truncated)' : ''}
                    , {impact.routes.length} routes, {impact.tests.length} test files.
                  </p>
                  {impact.routes.length > 0 && (
                    <p className="text-muted">
                      Routes: {impact.routes.map((r) => r.key).join(', ')}
                    </p>
                  )}
                  {impact.tests.length > 0 && (
                    <p className="text-muted">
                      Tests to run: {impact.tests.map((t) => t.key).join(', ')}
                    </p>
                  )}
                  <ul className="max-h-48 space-y-0.5 overflow-auto">
                    {impact.affected.slice(0, 60).map((n) => (
                      <li key={n.id}>
                        <button
                          className="font-mono text-accent hover:underline"
                          onClick={() => onOpen(n.id)}
                        >
                          {label(n)}
                        </button>{' '}
                        <span className="text-muted">
                          · distance {n.distance} via {n.via}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
