'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';

export default function PrivacySettings() {
  const router = useRouter();
  const storage = useApi<{ used: number; quota: number; warning: boolean }>('/api/account/storage');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Privacy and data"
        description={
          <>
            See the{' '}
            <Link href="/privacy" className="text-brand underline">
              privacy and data handling notice
            </Link>
            .
          </>
        }
      />
      <Card title="Storage">
        {storage.data && (
          <>
            <div className="h-2 rounded bg-canvas">
              <div
                className="h-2 rounded bg-brand"
                style={{
                  width: `${Math.min(100, (storage.data.used / storage.data.quota) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              {(storage.data.used / 1024 / 1024).toFixed(1)} MB of{' '}
              {(storage.data.quota / 1024 / 1024).toFixed(0)} MB used. When storage is full, new
              uploads are refused; nothing is deleted automatically.
            </p>
          </>
        )}
      </Card>
      <Card title="Retention policy">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Original uploads, versions, workspaces and analyses are kept until you delete them.
          </li>
          <li>Exported files are deleted automatically 30 days after creation.</li>
          <li>
            Password reset links expire after 30 minutes; extension pairing codes after 5 minutes.
          </li>
          <li>
            Security audit events are kept with your account and deleted with it, except an
            anonymous record that a deletion occurred.
          </li>
        </ul>
      </Card>
      <Card
        title="Download your data"
        description="A JSON file with your account, resumes, versions, change history, workspaces, answers, analyses and exports metadata."
      >
        <a
          href="/api/account/export"
          className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-medium"
        >
          Download account export
        </a>
      </Card>
      <Card
        title="Delete account"
        description="Permanently deletes your account, every resume, original file, version, workspace and export. This cannot be undone."
      >
        {error && (
          <div className="mb-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/api/account/delete', { method: 'POST', json: { password: pw, confirm } });
              router.push('/');
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <Field label="Password" htmlFor="dpw">
            <Input
              id="dpw"
              type="password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="dc">
            <Input id="dc" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Button
              type="submit"
              variant="danger"
              loading={busy}
              disabled={confirm !== 'DELETE' || !pw}
            >
              Delete my account permanently
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
