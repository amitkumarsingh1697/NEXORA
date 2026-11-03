'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, GitCompare, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, ConfirmDialog, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import type { VersionSummary } from '@/lib/types';

interface Detail {
  resume: { id: string; title: string; createdAt: string };
  document: {
    originalFilename: string;
    kind: string;
    sizeBytes: number;
    sha256: string;
    parseConfidence: {
      overall: number;
      sections: { section: string; confidence: number; note: string }[];
    };
    parseWarnings: string[];
    unassignedLines: string[];
    createdAt: string;
  } | null;
  versions: VersionSummary[];
}

const ORIGIN: Record<string, string> = {
  original_parse: 'Parsed from upload',
  edit: 'Manual edits',
  tailored: 'Tailored',
};

export default function ResumeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error, loading } = useApi<Detail>(`/api/resumes/${id}`);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cmp, setCmp] = useState<{ from?: string; to?: string }>({});
  if (loading) return <Spinner />;
  if (error || !data) return <Alert tone="error">{error ?? 'Not found'}</Alert>;
  const doc = data.document;
  return (
    <div className="space-y-6">
      <PageHeader
        title={data.resume.title}
        description="Your original upload is stored unchanged. Each version is a separate snapshot."
        actions={
          <>
            <a
              href={`/api/resumes/${id}/original`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm"
            >
              <Download className="h-4 w-4" /> Original file
            </a>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        }
      />
      {err && <Alert tone="error">{err}</Alert>}
      {doc && (
        <Card
          title="Extraction report"
          description={`${doc.originalFilename} · ${doc.kind.toUpperCase()} · ${(doc.sizeBytes / 1024).toFixed(0)} KB · SHA-256 ${doc.sha256.slice(0, 12)}…`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                doc.parseConfidence.overall >= 0.75
                  ? 'demonstrated'
                  : doc.parseConfidence.overall >= 0.5
                    ? 'pending'
                    : 'missing'
              }
            >
              Parsing confidence {Math.round(doc.parseConfidence.overall * 100)}%
            </Badge>
            {doc.parseConfidence.sections.map((s) => (
              <Badge key={s.section + s.note}>
                {s.section}: {Math.round(s.confidence * 100)}%
              </Badge>
            ))}
          </div>
          {doc.parseWarnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {doc.parseWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {doc.unassignedLines.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {doc.unassignedLines.length} line(s) could not be placed
              </summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {doc.unassignedLines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
      <Card
        title="Versions"
        actions={
          cmp.from && cmp.to ? (
            <Link
              href={`/resumes/${id}/compare?from=${cmp.from}&to=${cmp.to}`}
              className="inline-flex items-center gap-1 text-sm text-brand"
            >
              <GitCompare className="h-4 w-4" /> Compare selected
            </Link>
          ) : (
            <span className="text-xs text-muted">Select two versions to compare</span>
          )
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2">From</th>
              <th>To</th>
              <th>Version</th>
              <th>Origin</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.versions.map((v) => (
              <tr key={v.id}>
                <td className="py-2">
                  <input
                    type="radio"
                    name="from"
                    aria-label={`Compare from v${v.versionNumber}`}
                    onChange={() => setCmp({ ...cmp, from: v.id })}
                  />
                </td>
                <td>
                  <input
                    type="radio"
                    name="to"
                    aria-label={`Compare to v${v.versionNumber}`}
                    onChange={() => setCmp({ ...cmp, to: v.id })}
                  />
                </td>
                <td className="font-medium">
                  v{v.versionNumber} <span className="font-normal text-muted">{v.label}</span>
                </td>
                <td>{ORIGIN[v.origin]}</td>
                <td>
                  <Badge tone={v.status === 'draft' ? 'pending' : 'demonstrated'}>{v.status}</Badge>
                </td>
                <td className="text-muted">{new Date(v.createdAt).toLocaleString()}</td>
                <td className="text-right">
                  <Link href={`/resumes/${id}/versions/${v.id}`} className="text-brand underline">
                    {v.status === 'draft' ? 'Review & edit' : 'View'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Delete this resume?"
        confirmLabel="Delete permanently"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/resumes/${id}`, { method: 'DELETE' });
            router.push('/resumes');
          } catch (e) {
            setErr(errorMessage(e));
            setConfirm(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        This permanently deletes the original file, every version, every job workspace using it, and
        its exports.
      </ConfirmDialog>
    </div>
  );
}
