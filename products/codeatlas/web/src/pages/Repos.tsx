import { useEffect, useState } from 'react';
import { api } from '../api';
import { navigate } from '../router';
import type { Job, Repo } from '../types';
import { Button, Card, Empty, ErrorBox, Spinner, useAsync } from '../components/ui';

export function Repos() {
  const repos = useAsync(() => api<{ repos: Repo[] }>('/api/repos'), []);
  const [path, setPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const running = repos.data?.repos.some((r) => r.job?.status === 'running');

  useEffect(() => {
    if (!running) return;
    const t = setInterval(repos.reload, 1500);
    return () => clearInterval(t);
  }, [running, repos.reload]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <p className="mt-1 text-sm text-muted">
          CodeAtlas reads a local folder, builds a map of its code, and keeps everything on this
          machine. It never changes your files while indexing.
        </p>
      </div>
      <Card title="Add a repository">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api<{ repo: Repo; job: Job }>('/api/repos', { method: 'POST', body: { path } });
              setPath('');
              repos.reload();
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Folder path</span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/code/my-project"
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm"
            />
          </label>
          <Button type="submit" disabled={busy || !path.trim()}>
            {busy ? 'Adding…' : 'Add and index'}
          </Button>
        </form>
        <form
          className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setCloning(true);
            setError(null);
            try {
              await api('/api/repos/clone', { method: 'POST', body: { url: cloneUrl.trim() } });
              setCloneUrl('');
              repos.reload();
            } catch (err) {
              setError(err);
            } finally {
              setCloning(false);
            }
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Public repository URL</span>
            <input
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/owner/project.git"
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={cloning || !cloneUrl.trim()}>
            {cloning ? 'Cloning…' : 'Clone and index'}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Cloning downloads a public https repository into the CodeAtlas data folder. No credentials
          are used, and local or private network addresses are refused.
        </p>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      </Card>
      <Card title="Indexed repositories">
        {repos.loading && !repos.data ? <Spinner /> : <ErrorBox error={repos.error} />}
        {repos.data && !repos.data.repos.length && (
          <Empty>No repositories yet. Add a folder above.</Empty>
        )}
        <ul className="divide-y divide-line">
          {repos.data?.repos.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <button
                  className="font-semibold text-accent hover:underline"
                  onClick={() => navigate(`/repos/${r.id}/overview`)}
                >
                  {r.name}
                </button>
                <p className="truncate font-mono text-xs text-muted">{r.root}</p>
                <p className="text-xs text-muted">
                  {r.job?.status === 'running'
                    ? `Indexing… ${r.job.progress.at(-1) ?? ''}`
                    : r.job?.status === 'cancelled' || r.job?.status === 'failed'
                      ? (r.job.error ?? 'Indexing stopped.')
                      : r.lastIndexedAt
                        ? `Indexed ${new Date(r.lastIndexedAt).toLocaleString()}`
                        : 'Not indexed yet'}
                </p>
              </div>
              <div className="flex gap-2">
                {r.job?.status === 'running' && (
                  <Button
                    small
                    variant="secondary"
                    onClick={() =>
                      api(`/api/jobs/${r.job!.id}`, { method: 'DELETE' }).then(
                        repos.reload,
                        setError,
                      )
                    }
                  >
                    Cancel indexing
                  </Button>
                )}
                <Button
                  small
                  variant="secondary"
                  disabled={r.job?.status === 'running'}
                  onClick={() =>
                    api(`/api/repos/${r.id}/index`, { method: 'POST' }).then(repos.reload, setError)
                  }
                >
                  Re-index
                </Button>
                <Button
                  small
                  variant="danger"
                  disabled={r.job?.status === 'running'}
                  onClick={() => {
                    if (confirm(`Delete CodeAtlas data for ${r.name}? Your files are not touched.`))
                      api(`/api/repos/${r.id}`, { method: 'DELETE' }).then(repos.reload, setError);
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
