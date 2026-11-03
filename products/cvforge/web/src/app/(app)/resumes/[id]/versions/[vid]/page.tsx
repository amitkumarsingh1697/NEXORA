'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, PageHeader, Spinner } from '@/components/ui';
import { ResumeEditor, ResumeView } from '@/components/resume-editor';
import { api, errorMessage, useApi } from '@/lib/api';
import type { ResumeContent } from '@/lib/types';

interface Version {
  id: string;
  resumeId: string;
  versionNumber: number;
  status: 'draft' | 'finalized';
  origin: string;
  label: string;
  content: ResumeContent;
  parentVersionId: string | null;
}

export default function VersionPage({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = use(params);
  const router = useRouter();
  const fresh = useSearchParams().get('fresh');
  const { data, error, loading, reload } = useApi<{ version: Version }>(`/api/versions/${vid}`);
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (data) setContent(data.version.content);
  }, [data]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  if (loading || !content) return error ? <Alert tone="error">{error}</Alert> : <Spinner />;
  const v = data!.version;
  const save = async () => {
    setBusy('save');
    try {
      await api(`/api/versions/${vid}`, { method: 'PUT', json: { content } });
      setDirty(false);
      setMsg({ tone: 'success', text: 'Draft saved.' });
      return true;
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Version {v.versionNumber}{' '}
            <Badge tone={v.status === 'draft' ? 'pending' : 'demonstrated'}>{v.status}</Badge>
          </span>
        }
        description={
          v.status === 'draft'
            ? 'Review what was extracted and fix anything that is wrong or missing. When it is accurate, confirm it to lock this version.'
            : 'Finalized versions are immutable. Create a new version to make changes.'
        }
        actions={
          v.status === 'draft' ? (
            <>
              <Button
                variant="secondary"
                onClick={save}
                loading={busy === 'save'}
                disabled={!dirty}
              >
                Save draft
              </Button>
              <Button
                loading={busy === 'final'}
                onClick={async () => {
                  if (dirty && !(await save())) return;
                  setBusy('final');
                  try {
                    await api(`/api/versions/${vid}/finalize`, { method: 'POST', json: {} });
                    await reload();
                    setMsg({
                      tone: 'success',
                      text: 'Version confirmed. You can now analyse jobs against it.',
                    });
                  } catch (e) {
                    setMsg({ tone: 'error', text: errorMessage(e) });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Confirm version
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/workspaces/new"
                className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm"
              >
                Analyse a job
              </Link>
              <Link
                href={`/exports?version=${v.id}`}
                className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm"
              >
                Export
              </Link>
              <Button
                loading={busy === 'new'}
                onClick={async () => {
                  setBusy('new');
                  try {
                    const r = await api<{ version: { id: string } }>(`/api/versions/${vid}/draft`, {
                      method: 'POST',
                    });
                    router.push(`/resumes/${id}/versions/${r.version.id}`);
                  } catch (e) {
                    setMsg({ tone: 'error', text: errorMessage(e) });
                    setBusy(null);
                  }
                }}
              >
                Create new version
              </Button>
            </>
          )
        }
      />
      {fresh && v.status === 'draft' && (
        <Alert tone="info" title="Extraction complete">
          Check every section below. Parsing is heuristic; names, dates and bullets can be misread.
          Your original file has been stored unchanged.
        </Alert>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <p className="text-sm">
        <Link href={`/resumes/${id}`} className="text-brand">
          ← Back to resume
        </Link>
      </p>
      {v.status === 'draft' ? (
        <ResumeEditor
          value={content}
          onChange={(c) => {
            setContent(c);
            setDirty(true);
          }}
        />
      ) : (
        <ResumeView value={content} />
      )}
    </div>
  );
}
