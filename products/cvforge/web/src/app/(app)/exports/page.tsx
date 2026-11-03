'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';
import type { ResumeListItem } from '@/lib/types';

interface ExportRow {
  id: string;
  resumeVersionId: string;
  template: string;
  format: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  downloadUrl: string;
  verification: { ok: boolean; checked: number };
}

function ExportsInner() {
  const preselect = useSearchParams().get('version') ?? '';
  const resumes = useApi<{ resumes: ResumeListItem[] }>('/api/resumes');
  const exportsList = useApi<{ exports: ExportRow[] }>('/api/exports');
  const versions = useMemo(
    () =>
      (resumes.data?.resumes ?? []).flatMap((r) =>
        r.versions
          .filter((v) => v.status === 'finalized')
          .map((v) => ({
            id: v.id,
            label: `${r.title} — v${v.versionNumber} ${v.label}`,
            template: v.template ?? null,
          })),
      ),
    [resumes.data],
  );
  const [form, setForm] = useState({ versionId: preselect, template: '', format: 'docx' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (resumes.loading) return <Spinner />;
  const versionId = form.versionId || versions[versions.length - 1]?.id || '';
  // An explicit choice here wins; otherwise use the template saved on the version.
  const template = form.template || versions.find((v) => v.id === versionId)?.template || 'classic';
  const label = (id: string) => versions.find((v) => v.id === id)?.label ?? 'Deleted version';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Export center"
        description="Export any finalized version. Each file is checked against the approved version before it is saved. Exports are kept for 30 days."
      />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card title="New export">
        {!versions.length ? (
          <p className="text-sm text-muted">Confirm a resume version first.</p>
        ) : (
          <form
            className="grid gap-4 md:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMsg(null);
              try {
                const r = await api<{ export: ExportRow }>('/api/exports', {
                  method: 'POST',
                  json: { ...form, versionId, template },
                });
                await exportsList.reload();
                setMsg({
                  tone: 'success',
                  text: `Export ready and verified (${r.export.verification.checked} content lines checked).`,
                });
                window.location.href = r.export.downloadUrl;
              } catch (err) {
                setMsg({ tone: 'error', text: errorMessage(err) });
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="md:col-span-2">
              <Field label="Version" htmlFor="ev">
                <select
                  id="ev"
                  className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
                  value={versionId}
                  onChange={(e) => setForm({ ...form, versionId: e.target.value })}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Template" htmlFor="et">
              <select
                id="et"
                className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
                value={template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
              >
                <option value="classic">Classic Professional</option>
                <option value="modern">Modern Professional</option>
              </select>
            </Field>
            <Field label="Format" htmlFor="ef">
              <select
                id="ef"
                className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
              >
                <option value="docx">DOCX (editable)</option>
                <option value="pdf">PDF</option>
              </select>
            </Field>
            <div className="md:col-span-4">
              <Button type="submit" loading={busy}>
                <Download className="h-4 w-4" /> Generate and download
              </Button>
            </div>
          </form>
        )}
        <p className="mt-3 text-xs text-muted">
          Both templates are single-column, with no tables, images, headers or footers, using
          standard fonts. PDF export requires LibreOffice on the server.
        </p>
      </Card>
      <Card title="Previous exports">
        {exportsList.loading ? (
          <Spinner />
        ) : !exportsList.data?.exports.length ? (
          <p className="text-sm text-muted">No exports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2">Version</th>
                <th>Template</th>
                <th>Format</th>
                <th>Verified</th>
                <th>Created</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exportsList.data.exports.map((x) => (
                <tr key={x.id}>
                  <td className="py-2">{label(x.resumeVersionId)}</td>
                  <td className="capitalize">{x.template}</td>
                  <td className="uppercase">{x.format}</td>
                  <td>
                    {x.verification.ok ? (
                      <Badge tone="demonstrated">Matches version</Badge>
                    ) : (
                      <Badge tone="missing">Mismatch</Badge>
                    )}
                  </td>
                  <td className="text-muted">{new Date(x.createdAt).toLocaleString()}</td>
                  <td className="text-muted">{new Date(x.expiresAt).toLocaleDateString()}</td>
                  <td className="flex justify-end gap-2 py-2">
                    <a href={x.downloadUrl} className="inline-flex items-center gap-1 text-brand">
                      <Download className="h-4 w-4" /> Download
                    </a>
                    <button
                      aria-label="Delete export"
                      className="text-missing"
                      onClick={async () => {
                        await api(`/api/exports/${x.id}`, { method: 'DELETE' });
                        await exportsList.reload();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function ExportsPage() {
  return (
    <Suspense>
      <ExportsInner />
    </Suspense>
  );
}
