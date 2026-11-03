'use client';

import Link from 'next/link';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { ResumeDiff } from '@/lib/types';

interface Compare {
  from: { versionNumber: number; label: string };
  to: { versionNumber: number; label: string };
  diff: ResumeDiff;
  recordedChanges: {
    id: string;
    label: string;
    reason: string;
    evidence: { kind: string; text: string }[];
    decision: string;
    decidedAt: string;
    original: string | null;
    proposed: string | null;
  }[];
}

const TONE = {
  added: 'demonstrated',
  removed: 'missing',
  modified: 'confirmed',
  reordered: 'neutral',
} as const;

function CompareInner({ id }: { id: string }) {
  const sp = useSearchParams();
  const { data, error, loading } = useApi<Compare>(
    `/api/versions/compare?from=${sp.get('from')}&to=${sp.get('to')}`,
  );
  if (loading) return <Spinner />;
  if (error || !data) return <Alert tone="error">{error ?? 'Not found'}</Alert>;
  const { diff } = data;
  return (
    <div className="space-y-5">
      <PageHeader
        title={`Compare v${data.from.versionNumber} → v${data.to.versionNumber}`}
        description={`${data.from.label} → ${data.to.label}`}
      />
      <p className="text-sm">
        <Link href={`/resumes/${id}`} className="text-brand">
          ← Back to resume
        </Link>
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(diff.counts) as (keyof typeof diff.counts)[]).map((k) => (
          <Badge key={k} tone={TONE[k]}>
            {diff.counts[k]} {k}
          </Badge>
        ))}
      </div>
      {!diff.changes.length && <Alert>These versions have identical content.</Alert>}
      <Card title="Structured changes">
        <ul className="divide-y divide-line">
          {diff.changes.map((c, i) => (
            <li key={i} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[c.type]}>{c.type}</Badge>
                <span className="text-xs uppercase tracking-wider text-muted">{c.section}</span>
                <span className="font-medium">{c.label}</span>
              </div>
              {c.words ? (
                <p className="mt-2 leading-relaxed">
                  {c.words.map((w, j) => (
                    <span key={j} className={w.added ? 'ins' : w.removed ? 'del' : ''}>
                      {w.value}
                    </span>
                  ))}
                </p>
              ) : (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {c.before && (
                    <p className="rounded bg-missing-soft/50 p-2">
                      <span className="sr-only">Before: </span>
                      {c.before}
                    </p>
                  )}
                  {c.after && (
                    <p className="rounded bg-demonstrated-soft/60 p-2">
                      <span className="sr-only">After: </span>
                      {c.after}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {data.recordedChanges.length > 0 && (
        <Card
          title="Decision record"
          description="Why each accepted change was made, and the evidence behind it."
        >
          <ul className="space-y-3 text-sm">
            {data.recordedChanges.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3">
                <p className="font-medium">
                  {r.label} ·{' '}
                  <span className="text-muted">
                    {r.decision} {new Date(r.decidedAt).toLocaleString()}
                  </span>
                </p>
                <p className="mt-1">{r.reason}</p>
                {r.evidence.map((e, i) => (
                  <p key={i} className="mt-1 text-xs text-muted">
                    Evidence ({e.kind}): “{e.text}”
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <CompareInner id={id} />
    </Suspense>
  );
}
