import { useState } from 'react';
import { api } from '../api';
import {
  FILE_STATUSES,
  type FileStatus,
  type Inventory,
  type InventoryFile,
  type StatusCounts,
} from '../types';
import { Button, Card, ErrorBox, Stat, useAsync } from './ui';

export const STATUS_LABEL: Record<FileStatus, string> = {
  full: 'Fully analysed',
  partial: 'Partially analysed',
  text: 'Text only',
  unsupported: 'Recognised, not readable',
  failed: 'Failed',
  excluded: 'Excluded',
  binary: 'Binary',
};

const STATUS_HELP: Record<FileStatus, string> = {
  full: "Parsed completely: by the TypeScript compiler, by the language's grammar (calls linked by name, scope and declared types), or by a parser for the file's format.",
  partial:
    'Structure read by declaration patterns or a format reader, or a grammar parse that found syntax errors; not checked by a compiler.',
  text: 'Searchable as text; no structure was extracted.',
  unsupported: 'Identified, but the content cannot be read (for example a Git LFS pointer).',
  failed: 'An analyser ran and could not read the file.',
  excluded:
    'Not read on purpose: generated, vendored, secret, a symbolic link, a submodule, too large or over the file limit.',
  binary: 'Binary content: images, archives, compiled files.',
};

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 1000) / 10}%`);
const word = (s: string) => STATUS_LABEL[s as FileStatus] ?? (s === 'mixed' ? 'Mixed' : s);

function StatusBar({ counts, total }: { counts: StatusCounts; total: number }) {
  const parts = FILE_STATUSES.filter((s) => counts[s] > 0);
  return (
    <span
      role="img"
      aria-label={
        parts.map((s) => `${fmt(counts[s])} ${STATUS_LABEL[s].toLowerCase()}`).join(', ') ||
        'no files'
      }
      className="flex h-2.5 min-w-20 overflow-hidden rounded bg-line"
    >
      {parts.map((s) => (
        <i
          key={s}
          className={`st-${s} block h-full`}
          style={{ width: `${(counts[s] / Math.max(1, total)) * 100}%` }}
        />
      ))}
    </span>
  );
}

const th = 'border-b border-line px-2 py-1.5 text-left text-xs font-semibold text-muted';
const td = 'border-b border-line px-2 py-1 align-middle';
const num = 'text-right tabular-nums';

/** Every file of the latest index, filtered by status, language or file type, 100 at a time. */
function FileBrowser({ repoId, inv }: { repoId: number; inv: Inventory }) {
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const params = new URLSearchParams({ offset: String(offset), limit: '100' });
  if (status) params.set('status', status);
  if (language) params.set('language', language);
  if (q) params.set('q', q);
  const files = useAsync(
    () =>
      api<{ total: number; offset: number; items: InventoryFile[] }>(
        `/api/repos/${repoId}/inventory?${params}`,
      ),
    [repoId, status, language, q, offset],
  );
  const total = files.data?.total ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">
          Status
          <select
            className="rounded border border-line bg-panel px-2 py-1"
            value={status}
            onChange={(e) => (setStatus(e.target.value), setOffset(0))}
          >
            <option value="">All</option>
            {FILE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]} ({fmt(inv.counts[s])})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          Language or format
          <select
            className="max-w-60 rounded border border-line bg-panel px-2 py-1"
            value={language}
            onChange={(e) => (setLanguage(e.target.value), setOffset(0))}
          >
            <option value="">All</option>
            {inv.languages.map((l) => (
              <option key={l.language} value={l.language}>
                {l.language} ({fmt(l.files)})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          Path contains
          <input
            className="rounded border border-line bg-panel px-2 py-1"
            type="search"
            value={q}
            onChange={(e) => (setQ(e.target.value), setOffset(0))}
          />
        </label>
      </div>
      <ErrorBox error={files.error} />
      <div className="max-h-96 overflow-auto rounded border border-line" tabIndex={0}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-panel">
            <tr>
              <th className={th}>File</th>
              <th className={th}>Language</th>
              <th className={th}>Status</th>
              <th className={th}>How</th>
              <th className={th}>Identified by</th>
            </tr>
          </thead>
          <tbody>
            {(files.data?.items ?? []).map((f) => (
              <tr key={f.path}>
                <td className={`${td} font-mono break-all`}>{f.path}</td>
                <td className={td}>{f.language}</td>
                <td className={td}>{STATUS_LABEL[f.status]}</td>
                <td className={`${td} text-muted`}>{f.reason ?? f.method}</td>
                <td className={`${td} text-muted`}>
                  {f.detectedBy ?? ''}
                  {f.confidence === 'inferred' && f.detectedBy !== 'heuristic' ? ' (inferred)' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>
          {total
            ? `${fmt(offset + 1)}–${fmt(Math.min(total, offset + 100))} of ${fmt(total)} files`
            : files.loading
              ? 'Loading…'
              : 'No files match.'}
        </span>
        <Button
          small
          variant="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous
        </Button>
        <Button
          small
          variant="secondary"
          disabled={offset + 100 >= total}
          onClick={() => setOffset(offset + 100)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * Languages & files: which languages and file types the repository holds and how each file was
 * processed. Every number is a count from the index's inventory; nothing is estimated.
 */
export function LanguageCoverage({ repoId, inv }: { repoId: number; inv: Inventory }) {
  const [filter, setFilter] = useState('');
  const langs = inv.languages.filter(
    (l) => !filter || `${l.language} ${l.category}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const groups = new Map<string, Inventory['fileTypes']>();
  for (const r of inv.fileTypes) groups.set(r.groupLabel, [...(groups.get(r.groupLabel) ?? []), r]);
  return (
    <Card title="Languages & files">
      <div className="space-y-6 text-sm">
        <section aria-labelledby="lc-summary" className="space-y-2">
          <h3 id="lc-summary" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Coverage summary
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Files found" value={fmt(inv.total)} />
            <Stat label="Analysed (full or partial)" value={fmt(inv.analysed)} />
            <Stat
              label="Of readable files analysed"
              value={pct(inv.coverage)}
              hint={`${fmt(inv.analysed)} of ${fmt(inv.readable)} readable files`}
            />
            <Stat label="Of readable files fully analysed" value={pct(inv.fullCoverage)} />
            <Stat label="Languages and formats" value={fmt(inv.languages.length)} />
          </div>
          <StatusBar counts={inv.counts} total={inv.total} />
          <p className="text-xs text-muted">
            {inv.summary} Counts come from this index run. Readable means every file except excluded
            and binary ones; text-only files are not counted as analysed.
          </p>
        </section>

        <section aria-labelledby="lc-status">
          <h3 id="lc-status" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Status
          </h3>
          <table className="mt-1 w-full border-collapse text-xs">
            <tbody>
              {FILE_STATUSES.map((s) => (
                <tr key={s}>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5">
                      <i className={`st-${s} inline-block h-2.5 w-2.5 rounded-sm`} />
                      {STATUS_LABEL[s]}
                    </span>
                  </td>
                  <td className={`${td} ${num}`}>{fmt(inv.counts[s])}</td>
                  <td className={`${td} text-muted`}>{STATUS_HELP[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inv.reasons.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-accent">
                Reasons ({inv.reasons.length})
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs">
                {inv.reasons.map((r) => (
                  <li key={`${r.status}:${r.reason}`}>
                    <span className="font-semibold">{STATUS_LABEL[r.status]}</span>, {r.reason}:{' '}
                    {fmt(r.files)}{' '}
                    <span className="font-mono text-muted">
                      {r.examples.slice(0, 3).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {inv.unlisted?.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Present but not listed file by file:{' '}
              {inv.unlisted.map((u) => `${u.path} (${u.reason})`).join(', ')}.
            </p>
          )}
          {inv.ambiguous.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Identified by a heuristic:{' '}
              {inv.ambiguous
                .map(
                  (a) => `${a.language} (${fmt(a.files)}; could be ${a.alternatives.join(', ')})`,
                )
                .join(' · ')}
              .
            </p>
          )}
        </section>

        <section aria-labelledby="lc-langs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="lc-langs" className="text-xs font-semibold uppercase tracking-wide text-muted">
              Languages and formats ({fmt(inv.languages.length)})
            </h3>
            <input
              type="search"
              aria-label="Filter languages"
              placeholder="Filter languages…"
              className="rounded border border-line bg-panel px-2 py-1 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="mt-1 max-h-96 overflow-auto" tabIndex={0}>
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr>
                  <th className={th}>Language</th>
                  <th className={th}>Category</th>
                  <th className={`${th} ${num}`}>Files</th>
                  <th className={`${th} ${num}`}>Analysed</th>
                  <th className={`${th} ${num}`}>Coverage</th>
                  <th className={th}>Status</th>
                  <th className={th}>Method</th>
                  <th className={th}>
                    <span className="sr-only">Status breakdown</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {langs.map((l) => (
                  <tr key={l.language}>
                    <td className={td}>{l.language}</td>
                    <td className={`${td} text-muted`}>{l.category}</td>
                    <td className={`${td} ${num}`}>{fmt(l.files)}</td>
                    <td className={`${td} ${num}`}>{fmt(l.analysed)}</td>
                    <td className={`${td} ${num}`}>{pct(l.coverage)}</td>
                    <td className={td}>{word(l.status)}</td>
                    <td className={`${td} text-muted`}>{l.method}</td>
                    <td className={td}>
                      <StatusBar counts={l.counts} total={l.files} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="lc-types">
          <h3 id="lc-types" className="text-xs font-semibold uppercase tracking-wide text-muted">
            File types
          </h3>
          {groups.size === 0 && (
            <p className="text-xs text-muted">
              No build, infrastructure, database, API or documentation files were recognised.
            </p>
          )}
          <div className="mt-1 grid gap-4 md:grid-cols-2">
            {[...groups].map(([g, rows]) => (
              <div key={g}>
                <h4 className="text-xs font-semibold">{g}</h4>
                <table className="mt-1 w-full border-collapse text-xs">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.role}>
                        <td className={td} title={r.examples.join(', ')}>
                          {r.label}
                        </td>
                        <td className={`${td} ${num}`}>{fmt(r.files)}</td>
                        <td className={`${td} ${num}`}>{pct(r.coverage)} analysed</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="lc-dirs">
          <h3 id="lc-dirs" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Folders
          </h3>
          <div className="mt-1 max-h-72 overflow-auto" tabIndex={0}>
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr>
                  <th className={th}>Folder</th>
                  <th className={`${th} ${num}`}>Files</th>
                  <th className={`${th} ${num}`}>Analysed</th>
                  <th className={`${th} ${num}`}>Coverage</th>
                  <th className={th}>
                    <span className="sr-only">Status breakdown</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {inv.directories.map((d) => (
                  <tr key={d.path}>
                    <td className={`${td} font-mono`}>{d.path}</td>
                    <td className={`${td} ${num}`}>{fmt(d.files)}</td>
                    <td className={`${td} ${num}`}>{fmt(d.analysed)}</td>
                    <td className={`${td} ${num}`}>{pct(d.coverage)}</td>
                    <td className={td}>
                      <StatusBar counts={d.counts} total={d.files} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="lc-files">
          <h3 id="lc-files" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Every file
          </h3>
          <FileBrowser repoId={repoId} inv={inv} />
        </section>
      </div>
    </Card>
  );
}
