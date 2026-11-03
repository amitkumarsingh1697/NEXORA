import { api, token } from './api';
import { navigate, setQuery, useRoute } from './router';
import { TABS } from './tabs';
import type { Repo } from './types';
import { NodePanel } from './components/NodePanel';
import { ErrorBox, cn, useAsync } from './components/ui';
import { Repos } from './pages/Repos';

function Brand() {
  return (
    <button onClick={() => navigate('/')} className="flex items-center gap-3 text-left">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeWidth="2" />
        <circle cx="16" cy="9" r="2.5" fill="var(--accent)" />
        <circle cx="9" cy="20" r="2.5" fill="var(--accent)" />
        <circle cx="23" cy="20" r="2.5" fill="var(--accent)" />
        <path d="M16 9 L9 20 L23 20 Z" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      </svg>
      <span>
        <span className="block text-sm font-semibold leading-tight">CodeAtlas</span>
        <span className="block text-[11px] leading-tight text-muted">
          Nexora Engineering · Understand every layer. See how everything connects.
        </span>
      </span>
    </button>
  );
}

function NoToken() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Open CodeAtlas from your terminal</h1>
      <p className="mt-3 text-sm text-muted">
        For your safety, CodeAtlas only answers requests that carry the session link printed when
        the service started. Run{' '}
        <code className="rounded bg-panel px-1 font-mono">
          pnpm --filter @nexora/codeatlas-service start
        </code>{' '}
        and open the link it shows.
      </p>
    </div>
  );
}

function RepoPage({ repoId, tab }: { repoId: number; tab: string }) {
  const { query } = useRoute();
  const repo = useAsync(() => api<{ repo: Repo }>(`/api/repos/${repoId}`), [repoId]);
  const node = Number(query.get('node')) || null;
  const def = TABS.find((t) => t.id === tab) ?? TABS[0];
  const open = (id: number) => setQuery('node', String(id));
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button className="text-xs text-muted hover:text-ink" onClick={() => navigate('/')}>
            ← Repositories
          </button>
          <h1 className="text-xl font-semibold">{repo.data?.repo.name ?? '…'}</h1>
          <p className="font-mono text-xs text-muted">{repo.data?.repo.root}</p>
        </div>
      </div>
      <ErrorBox error={repo.error} />
      <nav
        className="mb-5 flex gap-1 overflow-x-auto border-b border-line"
        aria-label="Repository views"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/repos/${repoId}/${t.id}`)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              t.id === def?.id
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
            aria-current={t.id === def?.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {def?.render({ repoId, onOpen: open })}
      {node && (
        <NodePanel
          repoId={repoId}
          nodeId={node}
          onOpen={open}
          onClose={() => setQuery('node', null)}
        />
      )}
    </div>
  );
}

export function App() {
  const { path } = useRoute();
  if (!token()) return <NoToken />;
  const m = /^\/repos\/(\d+)(?:\/([\w-]+))?/.exec(path);
  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <Brand />
          <span className="text-xs text-muted">Local only · 127.0.0.1</span>
        </div>
      </header>
      {m ? <RepoPage repoId={Number(m[1])} tab={m[2] ?? 'overview'} /> : <Repos />}
    </div>
  );
}
