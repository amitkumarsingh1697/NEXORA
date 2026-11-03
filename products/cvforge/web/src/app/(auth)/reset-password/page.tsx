'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done)
    return (
      <Alert tone="success" title="Password updated">
        All other sessions were signed out.{' '}
        <Link href="/login" className="text-brand underline">
          Sign in
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
          await api('/api/auth/reset', { method: 'POST', json: { token, password } });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      {!token && <Alert tone="error">This link is missing its token.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="New password" htmlFor="pw" hint="At least 12 characters.">
        <Input
          id="pw"
          type="password"
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={!token}>
        Update password
      </Button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
