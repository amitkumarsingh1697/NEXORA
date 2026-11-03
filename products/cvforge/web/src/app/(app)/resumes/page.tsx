'use client';

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { ResumeListItem } from '@/lib/types';

export default function ResumesPage() {
  const { data, error, loading } = useApi<{ resumes: ResumeListItem[] }>('/api/resumes');
  return (
    <div>
      <PageHeader
        title="Resume library"
        description="Each resume keeps its original upload untouched. Edits and tailoring create new versions."
        actions={
          <Link
            href="/resumes/upload"
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            <Upload className="h-4 w-4" /> Upload resume
          </Link>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : !data?.resumes.length ? (
        <EmptyState title="No resumes yet">Upload a PDF or DOCX to get started.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.resumes.map((r) => {
            const latest = r.versions[r.versions.length - 1];
            return (
              <Card key={r.id}>
                <Link href={`/resumes/${r.id}`} className="text-lg font-semibold hover:text-brand">
                  {r.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  Uploaded {new Date(r.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{r.versions.length} version(s)</Badge>
                  {latest && (
                    <Badge tone={latest.status === 'draft' ? 'pending' : 'demonstrated'}>
                      Latest: v{latest.versionNumber} {latest.status}
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
