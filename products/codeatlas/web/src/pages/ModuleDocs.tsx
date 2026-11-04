import { useState } from 'react';
import { api } from '../api';
import type { GraphView } from '../types';
import { Button, Card, Empty, ErrorBox, Notes, Spinner, useAsync } from '../components/ui';
import { AnswerView, type Answer } from './Ask';

interface Cite {
  path: string;
  line: number | null;
}

interface ModuleDoc {
  module: string;
  files: { total: number; source: number; tests: number; loc: number };
  exports: { key: string; name: string; kind: string; doc: string | null; at: Cite }[];
  dependsOn: { module: string; imports: number; at: Cite }[];
  usedBy: { module: string; imports: number; at: Cite }[];
  externals: { name: string; files: number }[];
  routes: { name: string; at: Cite }[];
  entrypoints: { name: string; target: string | null }[];
  integrations: { name: string; category: string; uses: number; at: Cite }[];
  docs: { path: string; title: string }[];
  notes: string[];
}

const loc = (c: Cite) => (c.path ? `${c.path}${c.line ? `:${c.line}` : ''}` : '');

function List({ title, rows, empty }: { title: string; rows: React.ReactNode[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {rows.length ? (
        <ul tabIndex={0} className="mt-1 max-h-56 space-y-0.5 overflow-auto text-sm">
          {rows}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

/** Module documentation generated from the index, with an optional grounded AI overview (S3-5). */
export function ModuleDocs({ repoId }: { repoId: number }) {
  const modules = useAsync(() => api<GraphView>(`/api/repos/${repoId}/views/modules`), [repoId]);
  const [picked, setPicked] = useState('');
  const module = picked || modules.data?.nodes[0]?.label || '';
  const doc = useAsync(
    () =>
      module
        ? api<{ doc: ModuleDoc; markdown: string }>(
            `/api/repos/${repoId}/module-doc?module=${encodeURIComponent(module)}`,
          )
        : new Promise<{ doc: ModuleDoc; markdown: string }>(() => undefined),
    [repoId, module],
  );
  const [overview, setOverview] = useState<{
    module: string;
    answer?: Answer;
    error?: unknown;
    busy?: boolean;
  }>({
    module: '',
  });
  const download = () => {
    if (!doc.data) return;
    const url = URL.createObjectURL(new Blob([doc.data.markdown], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${module.replace(/[^\w.-]+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const d = doc.data?.doc;
  return (
    <Card
      title="Module documentation"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Module to document"
            value={module}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
          >
            {modules.data?.nodes.map((n) => (
              <option key={n.id} value={n.label}>
                {n.label}
              </option>
            ))}
          </select>
          <Button small variant="secondary" disabled={!doc.data} onClick={download}>
            Download Markdown
          </Button>
          <Button
            small
            disabled={!d}
            onClick={() => {
              if (overview.busy) return;
              setOverview({ module, busy: true });
              api<Answer>(`/api/repos/${repoId}/module-doc/overview`, {
                method: 'POST',
                body: { module },
              }).then(
                (answer) => setOverview({ module, answer }),
                (error) => setOverview({ module, error }),
              );
            }}
          >
            Write overview with AI
          </Button>
        </div>
      }
    >
      {modules.error ? (
        <ErrorBox error={modules.error} />
      ) : doc.loading || !module ? (
        <Spinner />
      ) : doc.error || !d ? (
        <ErrorBox error={doc.error} />
      ) : (
        <div className="space-y-4">
          {overview.module === module && overview.busy && <Spinner label="Writing overview…" />}
          {overview.module === module && <ErrorBox error={overview.error} />}
          {overview.module === module && overview.answer && (
            <div className="rounded-lg border border-line p-3">
              <AnswerView repoId={repoId} a={overview.answer} feedback={false} />
            </div>
          )}
          <p className="text-sm text-muted">
            {d.files.source} source files · {d.files.tests} test files · {d.files.loc} lines of code
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <List
              title={`Exports (${d.exports.length})`}
              empty="No exported symbols."
              rows={d.exports.map((e) => (
                <li key={e.key}>
                  <span className="font-mono text-xs">{e.name}</span>{' '}
                  <span className="text-xs text-muted">
                    {e.kind} · {loc(e.at)}
                  </span>
                  {e.doc && <p className="text-xs text-muted">{e.doc}</p>}
                </li>
              ))}
            />
            <div className="space-y-4">
              <List
                title="Depends on"
                empty="No other modules."
                rows={d.dependsOn.map((x) => (
                  <li key={x.module}>
                    {x.module}{' '}
                    <span className="text-xs text-muted">
                      {x.imports} imports · e.g. {loc(x.at)}
                    </span>
                  </li>
                ))}
              />
              <List
                title="Used by"
                empty="No other modules."
                rows={d.usedBy.map((x) => (
                  <li key={x.module}>
                    {x.module}{' '}
                    <span className="text-xs text-muted">
                      {x.imports} imports · e.g. {loc(x.at)}
                    </span>
                  </li>
                ))}
              />
            </div>
            <List
              title="Routes and entry points"
              empty="None."
              rows={[
                ...d.routes.map((r) => (
                  <li key={r.name}>
                    <span className="font-mono text-xs">{r.name}</span>{' '}
                    <span className="text-xs text-muted">{loc(r.at)}</span>
                  </li>
                )),
                ...d.entrypoints.map((e) => (
                  <li key={e.name}>
                    {e.name}{' '}
                    {e.target && <span className="font-mono text-xs text-muted">→ {e.target}</span>}
                  </li>
                )),
              ]}
            />
            <List
              title="Configuration, services and packages"
              empty="None found."
              rows={[
                ...d.integrations.map((i) => (
                  <li key={`${i.category}:${i.name}`}>
                    <span className="font-mono text-xs">{i.name}</span>{' '}
                    <span className="text-xs text-muted">
                      {i.category} · {i.uses} uses · e.g. {loc(i.at)}
                    </span>
                  </li>
                )),
                ...d.externals.map((x) => (
                  <li key={`pkg:${x.name}`}>
                    <span className="font-mono text-xs">{x.name}</span>{' '}
                    <span className="text-xs text-muted">package · {x.files} files</span>
                  </li>
                )),
              ]}
            />
          </div>
          {!d.docs.length ? (
            <Empty>No documents in this module.</Empty>
          ) : (
            <p className="text-sm">Documents: {d.docs.map((x) => x.title).join(', ')}</p>
          )}
          <Notes notes={d.notes} />
        </div>
      )}
    </Card>
  );
}
