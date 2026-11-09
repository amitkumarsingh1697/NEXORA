import {
  INVENTORY_STATUSES,
  type BrainInventory,
  type BrainModel,
  type InventoryCounts,
  type InventoryStatus,
} from './model';

export interface CoveragePanel {
  open(): void;
  close(): void;
  destroy(): void;
  readonly isOpen: boolean;
}

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  full: 'Fully analysed',
  partial: 'Partially analysed',
  text: 'Text only',
  unsupported: 'Recognised, not readable',
  failed: 'Failed',
  excluded: 'Excluded',
  binary: 'Binary',
};

const STATUS_HELP: Record<InventoryStatus, string> = {
  full: "Parsed completely: by the TypeScript compiler, by the language's grammar (calls linked by name, scope and declared types), or by a parser for the file's format.",
  partial:
    'Structure read by declaration patterns or a format reader, or a grammar parse that found syntax errors; not checked by a compiler.',
  text: 'Searchable as text; no structure was extracted.',
  unsupported: 'Identified, but the content cannot be read (for example a Git LFS pointer).',
  failed: 'An analyser ran and could not read the file.',
  excluded: 'Not read on purpose: generated, vendored, secret, too large or over the file limit.',
  binary: 'Binary content: images, archives, compiled files.',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (x: number | null): string =>
  x === null ? 'n/a' : `${Math.round(x * 1000) / 10}%`;

/** A stacked bar of status counts; widths are the real proportions of `total`. */
function statusBar(counts: InventoryCounts, total: number): HTMLElement {
  const bar = el('span', { class: 'nb-cv-bar', role: 'img' });
  const parts: string[] = [];
  for (const s of INVENTORY_STATUSES) {
    if (!counts[s] || !total) continue;
    const seg = el('i', { class: `nb-cv-${s}` });
    seg.style.width = `${(counts[s] / total) * 100}%`;
    bar.append(seg);
    parts.push(`${fmt(counts[s])} ${INVENTORY_STATUS_LABEL[s].toLowerCase()}`);
  }
  bar.setAttribute('aria-label', parts.join(', ') || 'no files');
  return bar;
}

function table(
  head: string[],
  rows: (string | Node)[][],
  numeric: number[] = [],
): HTMLTableElement {
  const t = el('table', { class: 'nb-cv-table' });
  const thead = el('thead');
  const hr = el('tr');
  head.forEach((h, i) =>
    hr.append(
      el('th', numeric.includes(i) ? { class: 'nb-num', scope: 'col' } : { scope: 'col' }, h),
    ),
  );
  thead.append(hr);
  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    r.forEach((c, i) => {
      const td = el('td', numeric.includes(i) ? { class: 'nb-num' } : {});
      if (typeof c === 'string') td.textContent = c;
      else td.append(c);
      tr.append(td);
    });
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

const statusWord = (s: string) =>
  (INVENTORY_STATUS_LABEL as Record<string, string>)[s] ?? (s === 'mixed' ? 'Mixed' : s);

/** Builds the panel body from an inventory. Exported for tests. */
const producerName = (p?: string) =>
  p === 'codeatlas' ? 'CodeAtlas' : p === 'archlens' ? 'ArchLens' : p ? p : 'the indexer';

export function renderInventory(inv: BrainInventory): HTMLElement {
  const body = el('div', { class: 'nb-cv-body' });

  // D. Coverage summary, first: what share of readable files was analysed.
  const sum = el('section', { 'aria-labelledby': 'nb-cv-sum' });
  sum.append(el('h3', { id: 'nb-cv-sum' }, 'Coverage summary'));
  const tiles = el('div', { class: 'nb-cv-tiles' });
  const tile = (label: string, value: string, hint?: string) => {
    const d = el('div', { class: 'nb-cv-tile' });
    d.append(el('strong', {}, value), el('span', {}, label));
    if (hint) d.title = hint;
    tiles.append(d);
  };
  tile('files found', fmt(inv.total));
  tile('analysed (full or partial)', fmt(inv.analysed));
  tile(
    'of readable files analysed',
    pct(inv.coverage),
    `${fmt(inv.analysed)} of ${fmt(inv.readable)} readable files`,
  );
  tile('of readable files fully analysed', pct(inv.fullCoverage));
  tile('languages and formats', fmt(inv.languages.length));
  sum.append(tiles, statusBar(inv.counts, inv.total));
  sum.append(
    el(
      'p',
      { class: 'nb-cv-note' },
      `Every number here is a count of files ${producerName(inv.producer)} listed and processed in this run; nothing is estimated. Readable means every file except excluded and binary ones. Text-only files are not counted as analysed.`,
    ),
  );
  body.append(sum);

  // C. Status distinctions.
  const st = el('section', { 'aria-labelledby': 'nb-cv-status' });
  st.append(el('h3', { id: 'nb-cv-status' }, 'Status'));
  st.append(
    table(
      ['Status', 'Files', 'Meaning'],
      INVENTORY_STATUSES.map((s) => [
        (() => {
          const w = el('span', { class: 'nb-cv-key' });
          w.append(
            el('i', { class: `nb-cv-${s}` }),
            document.createTextNode(INVENTORY_STATUS_LABEL[s]),
          );
          return w;
        })(),
        fmt(inv.counts[s]),
        STATUS_HELP[s],
      ]),
      [1],
    ),
  );
  if (inv.reasons.length) {
    st.append(el('h4', {}, 'Reasons'));
    st.append(
      table(
        ['Status', 'Reason', 'Files', 'Examples'],
        inv.reasons.map((r) => [
          statusWord(r.status),
          r.reason,
          fmt(r.files),
          r.examples.slice(0, 3).join(', '),
        ]),
        [2],
      ),
    );
  }
  if (inv.unlisted?.length) {
    st.append(el('h4', {}, 'Present but not listed'));
    const ul = el('ul', { class: 'nb-cv-list' });
    for (const u of inv.unlisted) ul.append(el('li', {}, `${u.path}: ${u.reason}`));
    st.append(ul);
  }
  if (inv.ambiguous.length) {
    st.append(el('h4', {}, 'Identified by a heuristic'));
    const ul = el('ul', { class: 'nb-cv-list' });
    for (const a of inv.ambiguous)
      ul.append(
        el(
          'li',
          {},
          `${a.language} (${fmt(a.files)} ${a.files === 1 ? 'file' : 'files'}): could also be ${a.alternatives.join(', ')}`,
        ),
      );
    st.append(ul);
  }
  body.append(st);

  // A. Languages.
  const lg = el('section', { 'aria-labelledby': 'nb-cv-lang' });
  lg.append(el('h3', { id: 'nb-cv-lang' }, `Languages and formats (${fmt(inv.languages.length)})`));
  const filter = el('input', {
    type: 'search',
    class: 'nb-cv-filter',
    placeholder: 'Filter languages…',
    'aria-label': 'Filter languages',
  });
  const langTable = table(
    ['Language', 'Category', 'Files', 'Analysed', 'Coverage', 'Status', 'Method', ''],
    inv.languages.map((l) => [
      l.language,
      l.category,
      fmt(l.files),
      fmt(l.analysed),
      pct(l.coverage),
      statusWord(l.status),
      l.method,
      statusBar(l.counts, l.files),
    ]),
    [2, 3, 4],
  );
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    langTable.querySelectorAll('tbody tr').forEach((tr, i) => {
      const l = inv.languages[i]!;
      (tr as HTMLElement).hidden = !!q && !`${l.language} ${l.category}`.toLowerCase().includes(q);
    });
  });
  lg.append(filter, langTable);
  if (inv.categories.length) {
    lg.append(el('h4', {}, 'By category'));
    lg.append(
      table(
        ['Category', 'Files', 'Analysed'],
        inv.categories.map((c) => [c.label, fmt(c.files), fmt(c.analysed)]),
        [1, 2],
      ),
    );
  }
  body.append(lg);

  // B. File types, grouped.
  const ft = el('section', { 'aria-labelledby': 'nb-cv-types' });
  ft.append(el('h3', { id: 'nb-cv-types' }, 'File types'));
  if (!inv.fileTypes.length)
    ft.append(
      el(
        'p',
        { class: 'nb-cv-note' },
        'No build, infrastructure, database, API or documentation files were recognised.',
      ),
    );
  const groups = new Map<string, typeof inv.fileTypes>();
  for (const r of inv.fileTypes) groups.set(r.groupLabel, [...(groups.get(r.groupLabel) ?? []), r]);
  for (const [g, rows] of groups) {
    ft.append(el('h4', {}, g));
    ft.append(
      table(
        ['Type', 'Files', 'Analysed', 'Coverage', 'Examples'],
        rows.map((r) => [
          r.label,
          fmt(r.files),
          fmt(r.analysed),
          pct(r.coverage),
          r.examples.slice(0, 3).join(', '),
        ]),
        [1, 2, 3],
      ),
    );
  }
  body.append(ft);

  // Folders.
  if (inv.directories.length) {
    const dr = el('section', { 'aria-labelledby': 'nb-cv-dirs' });
    dr.append(el('h3', { id: 'nb-cv-dirs' }, 'Folders'));
    dr.append(
      table(
        ['Folder', 'Files', 'Analysed', 'Coverage', ''],
        inv.directories.map((d) => [
          d.path,
          fmt(d.files),
          fmt(d.analysed),
          pct(d.coverage),
          statusBar(d.counts, d.files),
        ]),
        [1, 2, 3],
      ),
    );
    body.append(dr);
  }

  // Files not fully analysed.
  if (inv.notAnalysedTotal) {
    const na = el('section', { 'aria-labelledby': 'nb-cv-na' });
    na.append(
      el('h3', { id: 'nb-cv-na' }, `Files not fully analysed (${fmt(inv.notAnalysedTotal)})`),
    );
    if (inv.notAnalysed.length < inv.notAnalysedTotal)
      na.append(
        el(
          'p',
          { class: 'nb-cv-note' },
          `The ${fmt(inv.notAnalysed.length)} most severe are listed (failed first); binary files are counted above but not listed.`,
        ),
      );
    const det = el('details');
    det.append(el('summary', {}, 'Show the list'));
    det.append(
      table(
        ['File', 'Language', 'Status', 'Reason'],
        inv.notAnalysed.map((f) => [
          f.path,
          f.language,
          statusWord(f.status),
          f.reason ?? f.method,
        ]),
      ),
    );
    na.append(det);
    body.append(na);
  }
  return body;
}

/**
 * The "Languages & files" overlay: which languages and file types the repository holds, and how
 * each was processed. It shows only the producer's counts, so with no inventory it says so.
 */
export function mountCoveragePanel(
  root: HTMLElement,
  model: BrainModel,
  onClose: () => void,
): CoveragePanel {
  let opened = false;
  const panel = el('section', {
    class: 'nb-cvpanel',
    role: 'dialog',
    'aria-label': 'Languages and files',
    hidden: '',
  });
  const bar = el('div', { class: 'nb-dg-bar' });
  const heading = el('h2', {}, 'Languages & files');
  const close = el(
    'button',
    { type: 'button', class: 'nb-close', 'aria-label': 'Close languages and files' },
    '×',
  );
  bar.append(heading, close);
  const scroller = el('div', { class: 'nb-cv-scroll', tabindex: '0' });
  panel.append(bar, scroller);
  root.append(panel);
  close.addEventListener('click', () => api.close());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    }
  });

  const api: CoveragePanel = {
    get isOpen() {
      return opened;
    },
    open() {
      opened = true;
      panel.hidden = false;
      const inv = model.coverage?.inventory;
      scroller.replaceChildren(
        inv
          ? renderInventory(inv)
          : el(
              'p',
              { class: 'nb-cv-note' },
              'This brain has no file inventory, so no per-language or per-file counts are available. Regenerate it with a producer that records one.',
            ),
      );
      close.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      panel.hidden = true;
      scroller.replaceChildren();
      onClose();
    },
    destroy() {
      panel.remove();
    },
  };
  return api;
}
