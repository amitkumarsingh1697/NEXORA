'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { WorkspaceListItem } from '@/lib/types';

export default function WorkspacesPage() {
  const { data, error, loading } = useApi<{ workspaces: WorkspaceListItem[] }>('/api/workspaces');
  const [selected, setSelected] = useState<string[]>([]);
  const list = data?.workspaces ?? [];
  const compared = list.filter((w) => selected.includes(w.id));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Job workspaces"
        description="One workspace per job. Your base resume is never modified; tailored versions are created separately."
        actions={
          <Link
            href="/workspaces/new"
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> New workspace
          </Link>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <EmptyState title="No job workspaces yet">
          Paste a job description, or capture one from LinkedIn, Naukri or a careers page with the
          browser extension.
        </EmptyState>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2">
                  <span className="sr-only">Compare</span>
                </th>
                <th>Job</th>
                <th>Source</th>
                <th>Match</th>
                <th>ATS</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((w) => (
                <tr key={w.id}>
                  <td className="py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Compare ${w.name}`}
                      checked={selected.includes(w.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, w.id]
                            : selected.filter((x) => x !== w.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <Link href={`/workspaces/${w.id}`} className="font-medium hover:text-brand">
                      {w.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {[w.job?.location, w.job?.country].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="text-muted">{w.job?.source}</td>
                  <td>{w.latestAnalysis?.jobMatchValue ?? '—'}</td>
                  <td>{w.latestAnalysis?.atsValue ?? '—'}</td>
                  <td>{w.latestAnalysis?.evidenceQualityValue ?? '—'}</td>
                  <td>
                    {w.latestAnalysis ? (
                      w.latestAnalysis.counts.pending ? (
                        <Badge tone="pending">{w.latestAnalysis.counts.pending} pending</Badge>
                      ) : (
                        <Badge tone="demonstrated">Classified</Badge>
                      )
                    ) : (
                      <Badge>Not analysed</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {compared.length >= 2 && (
        <Card
          title="Job comparison"
          description="Latest analysis for each selected job. Scores are only comparable when computed against the same resume version."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2">Metric</th>
                  {compared.map((w) => (
                    <th key={w.id}>{w.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ['Job Match', 'jobMatchValue'],
                    ['ATS Compatibility', 'atsValue'],
                    ['Evidence Quality', 'evidenceQualityValue'],
                  ] as const
                ).map(([label, k]) => (
                  <tr key={k}>
                    <td className="py-2 font-medium">{label}</td>
                    {compared.map((w) => (
                      <td key={w.id}>{w.latestAnalysis?.[k] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
                {(['demonstrated', 'user_confirmed', 'missing', 'pending'] as const).map((k) => (
                  <tr key={k}>
                    <td className="py-2 capitalize">{k.replace('_', ' ')}</td>
                    {compared.map((w) => (
                      <td key={w.id}>{w.latestAnalysis?.counts[k] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
