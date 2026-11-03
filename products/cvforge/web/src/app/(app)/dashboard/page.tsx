'use client';

import Link from 'next/link';
import { ArrowRight, Upload } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { ResumeListItem, WorkspaceListItem } from '@/lib/types';

export default function Dashboard() {
  const resumes = useApi<{ resumes: ResumeListItem[] }>('/api/resumes');
  const workspaces = useApi<{ workspaces: WorkspaceListItem[] }>('/api/workspaces');
  const storage = useApi<{ used: number; quota: number; warning: boolean }>('/api/account/storage');
  const ai = useApi<{ available: boolean; reason: string | null; model: string }>('/api/ai/status');
  if (resumes.loading || workspaces.loading) return <Spinner />;
  const rs = resumes.data?.resumes ?? [];
  const ws = workspaces.data?.workspaces ?? [];
  const finalized = rs.some((r) => r.versions.some((v) => v.status === 'finalized'));
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Your resumes, job workspaces and next steps." />
      {resumes.error && <Alert tone="error">{resumes.error}</Alert>}
      {storage.data?.warning && (
        <Alert tone="warning" title="Storage nearly full">
          You are using {Math.round((storage.data.used / storage.data.quota) * 100)}% of your
          storage. Delete old exports or resumes to free space. Nothing is deleted automatically.
        </Alert>
      )}
      {ai.data && !ai.data.available && (
        <Alert tone="info" title="Local AI is not available">
          {ai.data.reason} All analysis, scoring and suggestions still work using deterministic
          methods; optional AI wording suggestions are skipped.
        </Alert>
      )}

      {!rs.length ? (
        <EmptyState
          title="Upload your resume to begin"
          action={
            <Link
              href="/resumes/upload"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              <Upload className="h-4 w-4" /> Upload resume
            </Link>
          }
        >
          CVForge reads your PDF or DOCX, lets you correct what it extracted, and keeps your
          original file untouched.
        </EmptyState>
      ) : !finalized ? (
        <Alert tone="warning" title="Review your parsed resume">
          Confirm the extracted content before analysing jobs.{' '}
          <Link className="text-brand underline" href={`/resumes/${rs[0]!.id}`}>
            Review now
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Resumes"
          actions={
            <Link href="/resumes/upload" className="text-sm text-brand">
              Upload
            </Link>
          }
        >
          {rs.length ? (
            <ul className="divide-y divide-line">
              {rs.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/resumes/${r.id}`} className="font-medium hover:text-brand">
                    {r.title}
                  </Link>
                  <span className="text-xs text-muted">{r.versions.length} version(s)</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No resumes yet.</p>
          )}
        </Card>
        <Card
          title="Recent job workspaces"
          actions={
            finalized ? (
              <Link href="/workspaces/new" className="text-sm text-brand">
                New workspace
              </Link>
            ) : null
          }
        >
          {ws.length ? (
            <ul className="divide-y divide-line">
              {ws.slice(0, 6).map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/workspaces/${w.id}`}
                      className="block truncate font-medium hover:text-brand"
                    >
                      {w.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {[w.job?.company, w.job?.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {w.latestAnalysis ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="brand">Match {w.latestAnalysis.jobMatchValue ?? '—'}</Badge>
                      {w.latestAnalysis.counts.pending > 0 && (
                        <Badge tone="pending">{w.latestAnalysis.counts.pending} pending</Badge>
                      )}
                    </div>
                  ) : (
                    <Badge>Not analysed</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Create a workspace by pasting a job description or capturing one with the browser
              extension.
            </p>
          )}
          {ws.length > 0 && (
            <Link
              href="/workspaces"
              className="mt-3 inline-flex items-center gap-1 text-sm text-brand"
            >
              All workspaces <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
