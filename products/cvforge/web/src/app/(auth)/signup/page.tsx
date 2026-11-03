'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    acceptPrivacy: false,
  });
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
          await api('/api/auth/signup', { method: 'POST', json: form });
          router.push('/resumes/upload');
          router.refresh();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Create your CVForge account</h1>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Name" htmlFor="name">
        <Input
          id="name"
          autoComplete="name"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 12 characters. A passphrase works well."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.acceptPrivacy}
          onChange={(e) => setForm({ ...form, acceptPrivacy: e.target.checked })}
          required
        />
        <span>
          I have read the{' '}
          <Link href="/privacy" className="text-brand underline" target="_blank">
            privacy and data handling notice
          </Link>{' '}
          and agree to my resume data being stored to provide this service.
        </span>
      </label>
      <Button type="submit" className="w-full" loading={busy}>
        Create account
      </Button>
      <p className="text-center text-sm">
        Already registered?{' '}
        <Link href="/login" className="text-brand">
          Sign in
        </Link>
      </p>
    </form>
  );
}
