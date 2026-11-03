'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ message: string }>('/api/auth/forgot', {
            method: 'POST',
            json: { email },
          });
          setMsg(r.message);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {msg && (
        <Alert tone="success">
          {msg} In local development, reset emails are written to the outbox folder (.data/outbox).
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-brand">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
