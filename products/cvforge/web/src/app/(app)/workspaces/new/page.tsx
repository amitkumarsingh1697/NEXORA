'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import type { ResumeListItem } from '@/lib/types';

export default function NewWorkspace() {
  const router = useRouter();
  const { data, loading } = useApi<{ resumes: ResumeListItem[] }>('/api/resumes');
  const options = useMemo(
    () =>
      (data?.resumes ?? []).flatMap((r) =>
        r.versions
          .filter((v) => v.status === 'finalized')
          .map((v) => ({ id: v.id, label: `${r.title} — v${v.versionNumber} ${v.label}` })),
      ),
    [data],
  );
  const [form, setForm] = useState({
    resumeVersionId: '',
    jobText: '',
    name: '',
    title: '',
    company: '',
    location: '',
    sourceUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner />;
  const versionId = form.resumeVersionId || options[options.length - 1]?.id || '';
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="New job workspace"
        description="Paste the complete job description. CVForge extracts only what is written: it never invents salary, visa or employer requirements."
      />
      {!options.length ? (
        <Alert tone="warning" title="Confirm a resume first">
          You need a confirmed (finalized) resume version.{' '}
          <Link href="/resumes" className="text-brand underline">
            Go to resumes
          </Link>
        </Alert>
      ) : (
        <Card>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const r = await api<{ workspace: { id: string } }>('/api/workspaces', {
                  method: 'POST',
                  json: {
                    ...form,
                    resumeVersionId: versionId,
                    source: 'paste',
                    name: form.name || undefined,
                    title: form.title || undefined,
                    company: form.company || undefined,
                    location: form.location || undefined,
                  },
                });
                await api(`/api/workspaces/${r.workspace.id}/analyze`, { method: 'POST' }).catch(
                  () => undefined,
                );
                router.push(`/workspaces/${r.workspace.id}`);
              } catch (err) {
                setError(errorMessage(err));
                setBusy(false);
              }
            }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Resume version to analyse" htmlFor="rv">
              <select
                id="rv"
                className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                value={versionId}
                onChange={(e) => setForm({ ...form, resumeVersionId: e.target.value })}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Job description"
              htmlFor="jd"
              hint="Include responsibilities and requirements. Manual paste always works, even when extraction is unavailable."
            >
              <Textarea
                id="jd"
                rows={14}
                required
                minLength={50}
                value={form.jobText}
                onChange={(e) => setForm({ ...form, jobText: e.target.value })}
              />
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Optional details (override what is detected)
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Workspace name" htmlFor="nm">
                  <Input
                    id="nm"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Job title" htmlFor="tt">
                  <Input
                    id="tt"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label="Company" htmlFor="co">
                  <Input
                    id="co"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                </Field>
                <Field label="Location" htmlFor="lo">
                  <Input
                    id="lo"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </Field>
                <Field label="Posting URL" htmlFor="url">
                  <Input
                    id="url"
                    type="url"
                    value={form.sourceUrl}
                    onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                  />
                </Field>
              </div>
            </details>
            <Button type="submit" loading={busy}>
              Create workspace and analyse
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
