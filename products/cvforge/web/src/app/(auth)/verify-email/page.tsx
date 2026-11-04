'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

/**
 * Confirmation needs a click, so that mail scanners which open links do not
 * confirm an address on the owner's behalf.
 */
function VerifyForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done)
    return (
      <Alert tone="success" title="Email address confirmed">
        Thank you.{' '}
        <Link href="/dashboard" className="text-brand underline">
          Continue to CVForge
        </Link>
      </Alert>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/api/auth/verify', { method: 'POST', json: { token } });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Confirm your email address</h1>
      {!token && <Alert tone="error">This link is missing its token.</Alert>}
      {error && (
        <Alert tone="error">
          {error} You can send a new link from{' '}
          <Link href="/settings" className="text-brand underline">
            Settings
          </Link>
          .
        </Alert>
      )}
      <Button type="submit" className="w-full" loading={busy} disabled={!token}>
        Confirm email address
      </Button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
