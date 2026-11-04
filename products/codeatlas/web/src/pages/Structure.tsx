import { useState } from 'react';
import { api } from '../api';
import { setQuery, useRoute } from '../router';
import { Card, Empty, ErrorBox, Spinner, useAsync } from '../components/ui';

interface TreeItem {
  id: number;
  kind: 'module' | 'file' | 'symbol';
  label: string;
  expand?: { module: string } | { file: string } | { symbol: string };
  childCount: number;
  lang?: string;
  symbolKind?: string;
  exported?: boolean;
  line?: number;
}

const LANG_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  markdown: 'Markdown',
  json: 'JSON',
  text: 'Text',
  unsupported: 'Other (text only)',
};

function childrenUrl(repoId: number, expand: TreeItem['expand'] | undefined, lang: string) {
  const p = new URLSearchParams();
  if (expand) for (const [k, v] of Object.entries(expand)) p.set(k, v);
  if (lang) p.set('lang', lang);
  return `/api/repos/${repoId}/tree?${p.toString()}`;
}

function Level({
  repoId,
  expand,
  lang,
  depth,
  onOpen,
}: {
  repoId: number;
  expand?: TreeItem['expand'];
  lang: string;
  depth: number;
  onOpen: (id: number) => void;
}) {
  const v = useAsync(
    () => api<{ items: TreeItem[] }>(childrenUrl(repoId, expand, lang)),
    [repoId, JSON.stringify(expand ?? null), lang],
  );
  if (v.loading) return <Spinner />;
  if (v.error || !v.data) return <ErrorBox error={v.error} />;
  if (!v.data.items.length) return <Empty>Nothing here for this language.</Empty>;
  return (
    <ul aria-label={depth === 0 ? 'Repository structure' : undefined}>
      {v.data.items.map((it) => (
        <Item key={it.id} item={it} repoId={repoId} lang={lang} depth={depth} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function Item({
  item,
  repoId,
  lang,
  depth,
  onOpen,
}: {
  item: TreeItem;
  repoId: number;
  lang: string;
  depth: number;
  onOpen: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const canExpand = !!item.expand;
  return (
    <li className="text-sm">
      <div className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="w-5 rounded text-center font-mono text-muted hover:bg-accent/10"
          >
            <span aria-hidden="true">{open ? '−' : '+'}</span>
            <span className="sr-only">{`${open ? 'Collapse' : 'Expand'} ${item.label}`}</span>
          </button>
        ) : (
          <span className="w-5" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className={
            item.kind === 'module'
              ? 'font-medium hover:underline'
              : 'font-mono text-xs hover:underline'
          }
        >
          {item.label}
        </button>
        <span className="text-xs text-muted">
          {item.kind === 'module' && `${item.childCount} files`}
          {item.kind === 'file' &&
            [item.lang, item.childCount ? `${item.childCount} symbols` : '']
              .filter(Boolean)
              .join(' · ')}
          {item.kind === 'symbol' &&
            [item.symbolKind, item.exported ? 'exported' : '', item.line ? `line ${item.line}` : '']
              .filter(Boolean)
              .join(' · ')}
        </span>
      </div>
      {open && item.expand && (
        <Level repoId={repoId} expand={item.expand} lang={lang} depth={depth + 1} onOpen={onOpen} />
      )}
    </li>
  );
}

/** Collapsible repository → module → file → symbol tree with a language filter (S3-2). */
export function StructurePage({
  repoId,
  onOpen,
}: {
  repoId: number;
  onOpen: (id: number) => void;
}) {
  const { query } = useRoute();
  const lang = query.get('lang') ?? '';
  const langs = useAsync(
    () => api<{ languages: { lang: string; files: number }[] }>(`/api/repos/${repoId}/languages`),
    [repoId],
  );
  return (
    <Card
      title="Structure"
      actions={<LanguageFilter value={lang} languages={langs.data?.languages ?? []} />}
    >
      <p className="mb-3 text-xs text-muted">
        Modules, their files and the symbols each file declares, nested as written in the code.
        Expand a row to load its children; click a name to see its details and relationships.
      </p>
      <Level key={lang} repoId={repoId} lang={lang} depth={0} onOpen={onOpen} />
    </Card>
  );
}

export function LanguageFilter({
  value,
  languages,
  only,
}: {
  value: string;
  languages: { lang: string; files: number }[];
  only?: string[];
}) {
  return (
    <select
      aria-label="Language"
      value={value}
      onChange={(e) => setQuery('lang', e.target.value || null)}
      className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
    >
      <option value="">All languages</option>
      {languages
        .filter((l) => !only || only.includes(l.lang))
        .map((l) => (
          <option key={l.lang} value={l.lang}>
            {LANG_LABEL[l.lang] ?? l.lang} ({l.files})
          </option>
        ))}
    </select>
  );
}
