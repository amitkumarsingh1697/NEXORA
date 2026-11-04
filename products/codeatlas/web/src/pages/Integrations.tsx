import { api } from '../api';
import type { Confidence } from '../types';
import { Card, ConfidenceBadge, Empty, ErrorBox, Notes, Spinner, useAsync } from '../components/ui';

interface Use {
  nodeId: number;
  key: string;
  kind: string;
  edge: string;
  confidence: Confidence;
  path: string | null;
  line: number | null;
  detail: string | null;
}

interface Target {
  id: number;
  kind: string;
  key: string;
  name: string;
  category: 'environment variable' | 'configuration file' | 'http' | 'database';
  uses: Use[];
}

interface Integrations {
  config: Target[];
  services: Target[];
  notes: string[];
}

const CATEGORY_LABEL: Record<Target['category'], string> = {
  'environment variable': 'Environment variables',
  'configuration file': 'Configuration files',
  http: 'HTTP services',
  database: 'Databases',
};

function Group({
  category,
  targets,
  onOpen,
}: {
  category: Target['category'];
  targets: Target[];
  onOpen: (id: number) => void;
}) {
  const list = targets.filter((t) => t.category === category);
  return (
    <Card title={`${CATEGORY_LABEL[category]} (${list.length})`}>
      {!list.length ? (
        <Empty>None found.</Empty>
      ) : (
        <ul className="space-y-3 text-sm">
          {list.map((t) => (
            <li key={t.id}>
              <button
                className="font-mono font-medium text-accent hover:underline"
                onClick={() => onOpen(t.id)}
              >
                {t.name}
              </button>
              <span className="ml-2 text-xs text-muted">
                used in {t.uses.length} {t.uses.length === 1 ? 'place' : 'places'}
              </span>
              <ul className="mt-1 space-y-1">
                {t.uses.slice(0, 12).map((u, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <ConfidenceBadge c={u.confidence} />
                    {u.edge === 'writes_config' && <span className="text-muted">writes</span>}
                    <button className="font-mono hover:underline" onClick={() => onOpen(u.nodeId)}>
                      {u.key}
                    </button>
                    {u.path && (
                      <span className="text-muted">
                        {u.path}:{u.line ?? ''}
                      </span>
                    )}
                    {u.detail && (
                      <span className="w-full truncate pl-1 font-mono text-muted" title={u.detail}>
                        {u.detail}
                      </span>
                    )}
                  </li>
                ))}
                {t.uses.length > 12 && (
                  <li className="text-xs text-muted">and {t.uses.length - 12} more</li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Configuration and external services the code reaches (S3-3, S3-7). */
export function IntegrationsPage({
  repoId,
  onOpen,
}: {
  repoId: number;
  onOpen: (id: number) => void;
}) {
  const v = useAsync(() => api<Integrations>(`/api/repos/${repoId}/views/integrations`), [repoId]);
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Group category="http" targets={v.data.services} onOpen={onOpen} />
        <Group category="database" targets={v.data.services} onOpen={onOpen} />
      </div>
      <div className="space-y-4">
        <Group category="environment variable" targets={v.data.config} onOpen={onOpen} />
        <Group category="configuration file" targets={v.data.config} onOpen={onOpen} />
        <Notes notes={v.data.notes} />
      </div>
    </div>
  );
}
