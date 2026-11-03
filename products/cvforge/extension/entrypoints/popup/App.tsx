import { useCallback, useEffect, useState } from 'react';
import { ApiError, CvforgeClient, storageArea, type ResumeOption } from '../../src/api/client';
import type { ExtractedJob } from '../../src/extract/types';
import type { ExtractorResult } from '../extractor';
import { restrictStorageToTrustedContexts } from '../../src/storage-access';

const client = new CvforgeClient({
  baseUrl: __CVFORGE_URL__,
  local: storageArea(browser.storage.local),
  session: storageArea(browser.storage.session),
});

type View =
  | { name: 'loading' }
  | { name: 'pair' }
  | { name: 'ready' }
  | { name: 'review'; job: ExtractedJob }
  | { name: 'saved'; url: string };

function message(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export function App() {
  const [view, setView] = useState<View>({ name: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Restrict storage before anything else runs; the background also does this on start.
    void restrictStorageToTrustedContexts(browser.storage as never)
      .catch(() => undefined)
      .then(() => client.isPaired())
      .then((p) => setView(p ? { name: 'ready' } : { name: 'pair' }));
  }, []);

  const onAuthLost = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.code === 'NOT_PAIRED') setView({ name: 'pair' });
    setError(message(e));
  }, []);

  return (
    <>
      <header>
        <div className="brand">
          CVForge
          <small>Nexora Career</small>
        </div>
        {view.name !== 'pair' && view.name !== 'loading' && (
          <button
            className="link"
            onClick={async () => {
              await client.logout();
              setError(null);
              setView({ name: 'pair' });
            }}
          >
            Disconnect
          </button>
        )}
      </header>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {view.name === 'loading' && <div className="muted">Loading…</div>}
        {view.name === 'pair' && (
          <Pair
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onPaired={() => setView({ name: 'ready' })}
          />
        )}
        {view.name === 'ready' && (
          <Extract
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onJob={(job) => setView({ name: 'review', job })}
          />
        )}
        {view.name === 'review' && (
          <Review
            job={view.job}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onAuthLost={onAuthLost}
            onCancel={() => setView({ name: 'ready' })}
            onSaved={(url) => setView({ name: 'saved', url })}
          />
        )}
        {view.name === 'saved' && (
          <div>
            <p className="ok">Saved to CVForge.</p>
            <p>
              <a href={view.url} target="_blank" rel="noreferrer">
                Open the analysis workspace
              </a>
            </p>
            <button onClick={() => setView({ name: 'ready' })}>Capture another job</button>
          </div>
        )}
      </main>
    </>
  );
}

interface StepProps {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
}

function Pair({ busy, setBusy, setError, onPaired }: StepProps & { onPaired: () => void }) {
  const [code, setCode] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await client.pair(
            code,
            navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Google Chrome',
          );
          onPaired();
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <p className="muted" style={{ margin: 0 }}>
        Connect this browser to your CVForge account. In CVForge, open{' '}
        <a href={`${client.serverUrl}/settings/extension`} target="_blank" rel="noreferrer">
          Settings → Browser extension
        </a>
        , generate a pairing code, and enter it here. Codes are single-use and expire after 5
        minutes.
      </p>
      <label>
        Pairing code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. ABCD-2345"
        />
      </label>
      <button className="primary" disabled={busy || code.trim().length < 8}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
    </form>
  );
}

function Extract({
  busy,
  setBusy,
  setError,
  onJob,
}: StepProps & { onJob: (job: ExtractedJob) => void }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="muted" style={{ margin: 0 }}>
        Open a job posting (LinkedIn, Naukri, or a company careers page), then click Extract.
        CVForge reads this tab only when you click, and you review everything before it is saved.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw new Error('No active tab.');
            const [res] = await browser.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['/extractor.js'],
            });
            const out = res?.result as ExtractorResult | undefined;
            if (!out) throw new Error('This page cannot be read by extensions.');
            if (!out.ok) throw new Error(out.message);
            onJob(out.job);
          } catch (err) {
            setError(
              message(err).replace(
                /^Cannot access .*/i,
                'This page cannot be read by extensions (browser or store pages are blocked).',
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Extracting…' : 'Extract job from this tab'}
      </button>
      <p className="muted" style={{ margin: 0 }}>
        Extraction not working?{' '}
        <a href={`${client.serverUrl}/workspaces/new`} target="_blank" rel="noreferrer">
          Paste the description manually
        </a>
        .
      </p>
    </div>
  );
}

function Review({
  job,
  busy,
  setBusy,
  setError,
  onAuthLost,
  onCancel,
  onSaved,
}: StepProps & {
  job: ExtractedJob;
  onAuthLost: (e: unknown) => void;
  onCancel: () => void;
  onSaved: (url: string) => void;
}) {
  const [title, setTitle] = useState(job.title);
  const [company, setCompany] = useState(job.company);
  const [location, setLocation] = useState(job.location);
  const [text, setText] = useState(job.text);
  const [resumes, setResumes] = useState<ResumeOption[] | null>(null);
  const [versionId, setVersionId] = useState('');

  useEffect(() => {
    client
      .resumes()
      .then((r) => {
        setResumes(r);
        setVersionId(r[0]?.versionId ?? '');
      })
      .catch(onAuthLost);
  }, [onAuthLost]);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="muted">Found via {job.method}. Check and edit before saving.</div>
      {job.warnings.length > 0 && (
        <div className="warn">
          Please review:
          <ul>
            {job.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <label>
        Job title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
      </label>
      <div className="row">
        <label>
          Company
          <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={300} />
        </label>
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
        </label>
      </div>
      <label>
        Job description ({text.length.toLocaleString()} characters)
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={50_000} />
      </label>
      <label>
        Compare against resume
        {resumes === null ? (
          <span className="muted">Loading resumes…</span>
        ) : resumes.length === 0 ? (
          <span className="muted">
            No finalized resume yet.{' '}
            <a href={`${client.serverUrl}/resumes/upload`} target="_blank" rel="noreferrer">
              Upload one in CVForge
            </a>{' '}
            first.
          </span>
        ) : (
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
            {resumes.map((r) => (
              <option key={r.versionId} value={r.versionId}>
                {r.title} · v{r.versionNumber}
                {r.label ? ` (${r.label})` : ''}
              </option>
            ))}
          </select>
        )}
      </label>
      <div className="row">
        <button onClick={onCancel} disabled={busy}>
          Discard
        </button>
        <button
          className="primary"
          disabled={busy || !versionId || text.trim().length < 50}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await client.capture({
                resumeVersionId: versionId,
                jobText: text.trim(),
                sourceUrl: job.url,
                sourceSite: job.site,
                title: title.trim() || undefined,
                company: company.trim() || undefined,
                location: location.trim() || undefined,
              });
              onSaved(res.url);
            } catch (err) {
              onAuthLost(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save to CVForge'}
        </button>
      </div>
    </div>
  );
}
