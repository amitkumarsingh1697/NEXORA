'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export default function ExtensionPage() {
  const devices = useApi<{ devices: Device[] }>('/api/extension/devices');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(
      () =>
        setLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(t);
  }, [code]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Browser extension"
        description="Capture job descriptions from LinkedIn, Naukri and company career pages in Chrome or Edge."
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Card
        title="Pair a browser"
        description="Install the CVForge extension, open it, and enter this one-time code. Codes expire after 5 minutes and work once."
      >
        {code && left > 0 ? (
          <div className="flex flex-wrap items-center gap-4">
            <p
              className="rounded-lg bg-canvas px-5 py-3 font-mono text-3xl tracking-[0.3em]"
              aria-live="polite"
            >
              {code.code}
            </p>
            <p className="text-sm text-muted">
              Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </p>
          </div>
        ) : (
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const c = await api<{ code: string; expiresAt: string }>(
                  '/api/extension/pairing-code',
                  { method: 'POST' },
                );
                setCode(c);
                setLeft(300);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Generate pairing code
          </Button>
        )}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>
            The extension only reads a page when you click Extract, and shows you the text before
            anything is sent.
          </li>
          <li>
            It never reads job-site cookies, passwords or other tabs, and never bypasses logins or
            CAPTCHAs.
          </li>
          <li>Manual paste in a new workspace always works as an alternative.</li>
        </ul>
      </Card>
      <Card title="Paired devices">
        {devices.loading ? (
          <Spinner />
        ) : !devices.data?.devices.length ? (
          <p className="text-sm text-muted">No devices paired.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {devices.data.devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted">
                    Paired {new Date(d.createdAt).toLocaleString()} · last used{' '}
                    {new Date(d.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {d.revokedAt ? (
                  <Badge tone="missing">
                    Revoked{d.revokedReason === 'refresh_token_reuse' ? ' (security)' : ''}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await api(`/api/extension/devices/${d.id}`, { method: 'DELETE' });
                      await devices.reload();
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
