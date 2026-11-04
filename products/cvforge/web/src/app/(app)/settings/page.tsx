'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { api, errorMessage, useApi } from '@/lib/api';

interface Me {
  user: {
    email: string;
    displayName: string;
    country: string;
    careerStageOverride: string | null;
    aiAssistEnabled: boolean;
    emailVerified: boolean;
  };
}
interface Sess {
  sessions: {
    id: string;
    userAgent: string;
    createdAt: string;
    lastSeenAt: string;
    current: boolean;
  }[];
}

export default function SettingsPage() {
  const me = useApi<Me>('/api/auth/me');
  const sessions = useApi<Sess>('/api/auth/sessions');
  const ai = useApi<{
    available: boolean;
    reason: string | null;
    provider: string;
    model: string;
    local: boolean;
  }>('/api/ai/status');
  const [form, setForm] = useState({
    displayName: '',
    country: '',
    careerStageOverride: '',
    aiAssistEnabled: true,
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (me.data)
      setForm({
        displayName: me.data.user.displayName,
        country: me.data.user.country,
        careerStageOverride: me.data.user.careerStageOverride ?? '',
        aiAssistEnabled: me.data.user.aiAssistEnabled,
      });
  }, [me.data]);
  if (me.loading) return <Spinner />;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description={me.data?.user.email} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {me.data && !me.data.user.emailVerified && (
        <Alert tone="warning" title="Email address not confirmed">
          <p>We sent a confirmation link to {me.data.user.email} when you signed up.</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            loading={busy === 'verify'}
            onClick={() =>
              void act(
                'verify',
                () => api('/api/auth/verify/resend', { method: 'POST' }),
                'A new confirmation link is on its way.',
              )
            }
          >
            Send a new link
          </Button>
        </Alert>
      )}
      <Card title="Profile and analysis">
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              'profile',
              () =>
                api('/api/account/settings', {
                  method: 'PUT',
                  json: { ...form, careerStageOverride: form.careerStageOverride || null },
                }),
              'Settings saved. Re-run analyses to apply a stage change.',
            );
          }}
        >
          <Field label="Display name" htmlFor="dn">
            <Input
              id="dn"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </Field>
          <Field
            label="Country (optional)"
            htmlFor="ct"
            hint="Used only for future country-specific conventions."
          >
            <Input
              id="ct"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </Field>
          <Field
            label="Career stage"
            htmlFor="cs"
            hint="Leave on automatic to compute it from your dated roles."
          >
            <select
              id="cs"
              className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
              value={form.careerStageOverride}
              onChange={(e) => setForm({ ...form, careerStageOverride: e.target.value })}
            >
              <option value="">Automatic (from employment dates)</option>
              <option value="early">Early career (2–5 years)</option>
              <option value="mid">Mid-level (6–10 years)</option>
              <option value="senior">Senior (11–15 years)</option>
              <option value="lead">Lead / Principal / Architect (16–20 years)</option>
              <option value="executive">Executive / Highly experienced (21–30 years)</option>
            </select>
          </Field>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.aiAssistEnabled}
                onChange={(e) => setForm({ ...form, aiAssistEnabled: e.target.checked })}
              />{' '}
              Optional AI wording suggestions
            </label>
            <p className="text-xs text-muted">
              {ai.data
                ? ai.data.available
                  ? `Available: ${ai.data.provider} · ${ai.data.model} (${ai.data.local ? 'runs locally' : 'hosted'})`
                  : `Unavailable: ${ai.data.reason}`
                : ''}{' '}
              Scores never use AI.
            </p>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" loading={busy === 'profile'}>
              Save
            </Button>
          </div>
        </form>
      </Card>
      <Card
        title="Change password"
        description="Changing your password signs out all other sessions."
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              'pw',
              async () => {
                await api('/api/auth/password', { method: 'POST', json: pw });
                setPw({ currentPassword: '', newPassword: '' });
                await sessions.reload();
              },
              'Password changed.',
            );
          }}
        >
          <Field label="Current password" htmlFor="cp">
            <Input
              id="cp"
              type="password"
              autoComplete="current-password"
              required
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </Field>
          <Field label="New password" htmlFor="np" hint="At least 12 characters.">
            <Input
              id="np"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" loading={busy === 'pw'}>
              Change password
            </Button>
          </div>
        </form>
      </Card>
      <Card
        title="Active sessions"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'revoke'}
            onClick={() =>
              act(
                'revoke',
                async () => {
                  await api('/api/auth/sessions', { method: 'DELETE' });
                  await sessions.reload();
                },
                'Other sessions signed out.',
              )
            }
          >
            Sign out other sessions
          </Button>
        }
      >
        <ul className="divide-y divide-line text-sm">
          {sessions.data?.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <div>
                <p className="max-w-md truncate">{s.userAgent || 'Unknown browser'}</p>
                <p className="text-xs text-muted">
                  Last active {new Date(s.lastSeenAt).toLocaleString()}
                </p>
              </div>
              {s.current ? (
                <span className="text-xs text-demonstrated">This session</span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    act(
                      'revoke',
                      async () => {
                        await api(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                        await sessions.reload();
                      },
                      'Session revoked.',
                    )
                  }
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
