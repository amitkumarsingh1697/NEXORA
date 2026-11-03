import { Fragment, useState } from 'react';
import { api } from '../api';
import { setQuery, useRoute } from '../router';
import type { GraphView, NodeRow } from '../types';
import { FlowGraph } from '../components/FlowGraph';
import { Graph, PALETTE } from '../components/Graph';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Legend,
  Notes,
  Spinner,
  cn,
  useAsync,
} from '../components/ui';

type Open = (id: number) => void;

interface Cycle {
  level: 'file' | 'module';
  members: string[];
  edges: {
    from: string;
    to: string;
    path: string | null;
    line: number | null;
    typeOnly: boolean;
  }[];
  typeOnly: boolean;
}

function Cycles({ cycles, empty }: { cycles: Cycle[]; empty: string }) {
  if (!cycles.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3 text-sm">
      {cycles.map((c) => (
        <li key={`${c.level}:${c.members.join('|')}`}>
          <p>
            <span className="font-medium">
              {c.level === 'module' ? 'Modules' : 'Files'} in a cycle ({c.members.length})
            </span>
            {c.typeOnly && (
              <span className="ml-2 text-xs text-muted">type-only imports, no runtime effect</span>
            )}
          </p>
          <p className="font-mono text-xs">{c.members.join(' · ')}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {c.edges.slice(0, 8).map((e, i) => (
              <li key={i} className="font-mono">
                {e.from} imports {e.to}
                {e.path ? ` (${e.path}:${e.line ?? ''})` : ''}
                {e.typeOnly ? ' type-only' : ''}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function Modules({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const v = useAsync(
    () => api<GraphView & { cycles: Cycle[] }>(`/api/repos/${repoId}/views/modules`),
    [repoId],
  );
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  return (
    <div className="space-y-4">
      <Card title="Modules and their dependencies" actions={<Legend />}>
        {v.data.nodes.length ? (
          <Graph view={v.data} onSelect={(ref) => ref && onOpen(ref)} />
        ) : (
          <Empty>No modules found.</Empty>
        )}
        <div className="mt-3">
          <Notes notes={v.data.notes} />
        </div>
      </Card>
      <Card title="Module summary">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">Module</th>
              <th>Folder</th>
              <th className="text-right">Files</th>
              <th className="text-right">Symbols</th>
              <th className="text-right">Lines</th>
              <th className="text-right">Test files</th>
            </tr>
          </thead>
          <tbody>
            {v.data.nodes.map((n) => (
              <tr key={n.id} className="border-t border-line">
                <td className="py-1.5">
                  <button
                    className="font-medium text-accent hover:underline"
                    onClick={() => setQuery('module', n.label)}
                  >
                    {n.label}
                  </button>
                </td>
                <td className="font-mono text-xs text-muted">{String(n.metrics?.dir || '.')}</td>
                <td className="text-right tabular-nums">{String(n.metrics?.files)}</td>
                <td className="text-right tabular-nums">{String(n.metrics?.symbols)}</td>
                <td className="text-right tabular-nums">{String(n.metrics?.loc)}</td>
                <td className="text-right tabular-nums">{String(n.metrics?.tests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Select a module name to open its file-level dependencies.
        </p>
      </Card>
      <Card title="Circular module dependencies">
        <Cycles cycles={v.data.cycles} empty="No cycles between modules in the resolved imports." />
      </Card>
    </div>
  );
}

export function Dependencies({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const { query } = useRoute();
  const external = query.get('external') === '1';
  const modules = useAsync(() => api<GraphView>(`/api/repos/${repoId}/views/modules`), [repoId]);
  // Default to the largest module; "*" means all modules.
  const largest = modules.data?.nodes
    .slice()
    .sort((a, b) => Number(b.metrics?.files ?? 0) - Number(a.metrics?.files ?? 0))[0]?.label;
  const module =
    query.get('module') ?? (modules.data && modules.data.nodes.length > 1 ? (largest ?? '*') : '*');
  const v = useAsync(
    () =>
      modules.data
        ? api<GraphView>(
            `/api/repos/${repoId}/views/dependencies?module=${module === '*' ? '' : encodeURIComponent(module)}&external=${external ? 1 : 0}`,
          )
        : new Promise<GraphView>(() => undefined),
    [repoId, module, external, !!modules.data],
  );
  const groups = [
    ...new Set((v.data?.nodes ?? []).map((n) => n.group).filter((g): g is string => !!g)),
  ].sort();
  return (
    <Card
      title="File dependencies"
      actions={
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            aria-label="Module"
            value={module}
            onChange={(e) => setQuery('module', e.target.value)}
            className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
          >
            <option value="*">All modules (most connected)</option>
            {modules.data?.nodes.map((n) => (
              <option key={n.id} value={n.label}>
                {n.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={external}
              onChange={(e) => setQuery('external', e.target.checked ? '1' : null)}
            />{' '}
            external packages
          </label>
          <Legend />
        </div>
      }
    >
      {v.loading ? (
        <Spinner />
      ) : v.error || !v.data ? (
        <ErrorBox error={v.error} />
      ) : v.data.nodes.length ? (
        <Graph view={v.data} onSelect={(ref) => ref && onOpen(ref)} height={620} />
      ) : (
        <Empty>No files in this module.</Empty>
      )}
      {groups.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          {groups.map((g, i) => (
            <span key={g} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              {g}
            </span>
          ))}
        </div>
      )}
      {v.data && (
        <div className="mt-3">
          <Notes notes={v.data.notes} />
        </div>
      )}
    </Card>
  );
}

export function Flows({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const { query } = useRoute();
  const start = Number(query.get('start')) || null;
  const depth = Math.min(Math.max(Number(query.get('depth')) || 3, 1), 8);
  const [filter, setFilter] = useState('');
  const starts = useAsync(() => api<{ starts: NodeRow[] }>(`/api/repos/${repoId}/flows`), [repoId]);
  const flow = useAsync(
    () =>
      start
        ? api<GraphView>(`/api/repos/${repoId}/views/flow?start=${start}&depth=${depth}`)
        : Promise.resolve(null),
    [repoId, start, depth],
  );
  const list = (starts.data?.starts ?? []).filter((s) =>
    s.key.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card title="Entry points">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter routes…"
          aria-label="Filter entry points"
          className="mb-3 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm"
        />
        {starts.loading ? <Spinner /> : <ErrorBox error={starts.error} />}
        {starts.data && !list.length && <Empty>No routes or entry points detected.</Empty>}
        <ul className="max-h-[560px] space-y-0.5 overflow-auto">
          {list.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setQuery('start', String(s.id))}
                className={cn(
                  'w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-canvas',
                  s.id === start && 'bg-accent/10 text-accent',
                )}
              >
                {s.key}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title="Execution flow"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Depth
              <select
                value={depth}
                onChange={(e) => setQuery('depth', e.target.value)}
                className="rounded border border-line bg-canvas px-1 py-0.5 text-xs"
              >
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <Legend />
          </div>
        }
      >
        {!start ? (
          <Empty>Pick a route or entry point to trace what it calls.</Empty>
        ) : flow.loading ? (
          <Spinner />
        ) : flow.error || !flow.data ? (
          <ErrorBox error={flow.error} />
        ) : (
          <FlowGraph view={flow.data} onSelect={(ref) => ref && onOpen(ref)} />
        )}
        {flow.data && (
          <div className="mt-3">
            <Notes notes={flow.data.notes} />
          </div>
        )}
      </Card>
    </div>
  );
}

interface RiskItem {
  nodeId: number;
  path: string;
  module: string | null;
  score: number;
  factors: {
    name: string;
    value: number;
    percentile: number;
    weight: number;
    explanation: string;
  }[];
}

export function Risk({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const v = useAsync(
    () =>
      api<{
        items: RiskItem[];
        notes: string[];
        findings: {
          cycles: Cycle[];
          sensitiveConfig: { path: string; note: string }[];
        };
      }>(`/api/repos/${repoId}/views/risk`),
    [repoId],
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  const { findings } = v.data;
  return (
    <div className="space-y-4">
      <Card title="Findings">
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Circular dependencies
            </h3>
            <Cycles cycles={findings.cycles} empty="No import cycles found." />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Potentially sensitive configuration
            </h3>
            {findings.sensitiveConfig.length ? (
              <>
                <ul className="font-mono text-xs">
                  {findings.sensitiveConfig.map((f) => (
                    <li key={f.path}>{f.path}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">{findings.sensitiveConfig[0]?.note}</p>
              </>
            ) : (
              <p className="text-sm text-muted">No files matched credential patterns.</p>
            )}
          </div>
        </div>
      </Card>
      <Card title="Change risk">
        <Notes notes={v.data.notes} />
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1">File</th>
              <th>Module</th>
              <th className="w-48">Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.data.items.map((it) => (
              <Fragment key={it.nodeId}>
                <tr className="border-t border-line">
                  <td className="py-1.5">
                    <button
                      className="font-mono text-xs text-accent hover:underline"
                      onClick={() => onOpen(it.nodeId)}
                    >
                      {it.path}
                    </button>
                  </td>
                  <td className="text-xs text-muted">{it.module}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded bg-canvas">
                        <div
                          className="h-2 rounded bg-inferred"
                          style={{ width: `${it.score}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs tabular-nums">{it.score}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    <Button
                      small
                      variant="ghost"
                      onClick={() => setExpanded(expanded === it.nodeId ? null : it.nodeId)}
                    >
                      {expanded === it.nodeId ? 'Hide' : 'Why?'}
                    </Button>
                  </td>
                </tr>
                {expanded === it.nodeId && (
                  <tr>
                    <td colSpan={4} className="pb-3">
                      <ul className="space-y-1 rounded-lg bg-canvas p-3 text-xs">
                        {it.factors.map((f) => (
                          <li key={f.name}>
                            <span className="font-semibold">{f.name}</span> · percentile{' '}
                            {f.percentile} × weight {f.weight} →{' '}
                            {Math.round(f.percentile * f.weight)} pts.{' '}
                            <span className="text-muted">{f.explanation}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

interface Ownership {
  modules: {
    module: string;
    files: number;
    authors: { name: string; share: number }[];
    busFactor: number;
    soleOwnerFiles: string[];
    staleFiles: string[];
  }[];
  notes: string[];
}

export function OwnershipPage({ repoId }: { repoId: number }) {
  const v = useAsync(() => api<Ownership>(`/api/repos/${repoId}/views/ownership`), [repoId]);
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  return (
    <Card title="Ownership">
      <Notes notes={v.data.notes} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {v.data.modules.map((m) => (
          <div key={m.module} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{m.module}</p>
              <p
                className={cn(
                  'text-xs',
                  m.busFactor <= 1 && m.authors.length ? 'text-danger' : 'text-muted',
                )}
              >
                bus factor {m.authors.length ? m.busFactor : 'n/a'}
              </p>
            </div>
            <p className="text-xs text-muted">{m.files} files</p>
            {m.authors.length ? (
              <ul className="mt-2 space-y-1">
                {m.authors.map((a) => (
                  <li key={a.name} className="flex items-center gap-2 text-xs">
                    <span className="w-32 truncate">{a.name}</span>
                    <div className="h-1.5 flex-1 rounded bg-canvas">
                      <div
                        className="h-1.5 rounded bg-accent"
                        style={{ width: `${a.share * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">
                      {Math.round(a.share * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">No history.</p>
            )}
            {m.soleOwnerFiles.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Single-owner files:{' '}
                <span className="font-mono">
                  {m.soleOwnerFiles.slice(0, 5).join(', ')}
                  {m.soleOwnerFiles.length > 5 ? '…' : ''}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

interface Knowledge {
  docs: {
    id: number;
    path: string;
    title: string;
    adr: boolean;
    mentions: { key: string; kind: string }[];
  }[];
  modules: { module: string; documented: boolean; docCount: number }[];
  undocumentedHotspots: { path: string; fanIn: number }[];
  notes: string[];
}

export function KnowledgePage({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const v = useAsync(() => api<Knowledge>(`/api/repos/${repoId}/views/knowledge`), [repoId]);
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Documentation (${v.data.docs.length})`}>
        {!v.data.docs.length && <Empty>No markdown documentation found.</Empty>}
        <ul className="space-y-2 text-sm">
          {v.data.docs.map((d) => (
            <li key={d.id}>
              <button
                className="font-medium text-accent hover:underline"
                onClick={() => onOpen(d.id)}
              >
                {d.title}
              </button>{' '}
              {d.adr && (
                <span className="rounded bg-accent/10 px-1 text-[10px] font-semibold text-accent">
                  ADR
                </span>
              )}
              <p className="font-mono text-xs text-muted">{d.path}</p>
              {d.mentions.length > 0 && (
                <p className="text-xs text-muted">
                  Describes:{' '}
                  {d.mentions
                    .slice(0, 6)
                    .map((m) => m.key.split('#').pop())
                    .join(', ')}
                  {d.mentions.length > 6 ? '…' : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="Widely used but undocumented">
          {!v.data.undocumentedHotspots.length ? (
            <Empty>None.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {v.data.undocumentedHotspots.map((h) => (
                <li key={h.path} className="flex justify-between gap-3">
                  <span className="truncate font-mono text-xs">{h.path}</span>
                  <span className="text-xs text-muted">imported by {h.fanIn}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Modules with docs">
          <ul className="space-y-1 text-sm">
            {v.data.modules.map((m) => (
              <li key={m.module} className="flex justify-between">
                <span>{m.module}</span>
                <span className={cn('text-xs', m.documented ? 'text-observed' : 'text-muted')}>
                  {m.documented ? `${m.docCount} docs` : 'none'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Notes notes={v.data.notes} />
      </div>
    </div>
  );
}

interface Hit {
  chunkId: number;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolKey: string | null;
  kind: string;
  body: string;
}

export function SearchPage({ repoId, onOpen }: { repoId: number; onOpen: Open }) {
  const { query } = useRoute();
  const q = query.get('q') ?? '';
  const [text, setText] = useState(q);
  const hits = useAsync(
    () =>
      q
        ? api<{ hits: Hit[] }>(`/api/repos/${repoId}/search?q=${encodeURIComponent(q)}`)
        : Promise.resolve({ hits: [] }),
    [repoId, q],
  );
  const nodes = useAsync(
    () =>
      q
        ? api<{ nodes: { id: number; kind: string; key: string; name: string }[] }>(
            `/api/repos/${repoId}/find?q=${encodeURIComponent(q)}`,
          )
        : Promise.resolve({ nodes: [] }),
    [repoId, q],
  );
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery('q', text.trim() || null);
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search code and docs, e.g. refresh token rotation"
          aria-label="Search"
          className="flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm"
        />
        <Button type="submit">Search</Button>
      </form>
      {nodes.data && nodes.data.nodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nodes.data.nodes.slice(0, 12).map((n) => (
            <button
              key={n.id}
              onClick={() => onOpen(n.id)}
              className="rounded-full border border-line bg-panel px-2.5 py-1 font-mono text-xs hover:border-accent"
            >
              <span className="text-muted">{n.kind}</span> {n.name}
            </button>
          ))}
        </div>
      )}
      {hits.loading ? <Spinner /> : <ErrorBox error={hits.error} />}
      {q && hits.data && !hits.data.hits.length && <Empty>No matches.</Empty>}
      <ul className="space-y-3">
        {hits.data?.hits.map((h) => (
          <li key={h.chunkId} className="rounded-lg border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
              <span className="font-mono">
                {h.filePath}:{h.startLine}-{h.endLine}
              </span>
              <span className="text-muted">
                {h.kind}
                {h.symbolKey ? ` · ${h.symbolKey.split('#').pop()}` : ''}
              </span>
            </div>
            <pre className="max-h-40 overflow-hidden px-3 py-2 text-[12px] leading-5 text-muted">
              {h.body.split('\n').slice(0, 8).join('\n')}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
