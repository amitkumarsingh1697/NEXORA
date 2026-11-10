import {
  classDiagram,
  routineDiagram,
  tableDiagram,
  tableFiles,
  type Diagram,
  type DiagramKind,
} from './diagrams';
import { DEFAULT_REGIONS, type BrainModel, type RegionId } from './model';

export interface DiagramPanel {
  open(kind?: DiagramKind): void;
  close(): void;
  destroy(): void;
  readonly isOpen: boolean;
}

const TABS: { kind: DiagramKind; label: string }[] = [
  { kind: 'er', label: 'ER diagram' },
  { kind: 'schema', label: 'Schema diagram' },
  { kind: 'class', label: 'Class diagram' },
  { kind: 'routines', label: 'Database objects' },
];

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

/**
 * The diagrams overlay of the brain viewer: ER, schema and class diagrams of the same model,
 * a scope picker, zoom and an SVG download. Clicking a box selects that part in the brain.
 */
export function mountDiagramPanel(
  root: HTMLElement,
  model: BrainModel,
  onSelect: (id: string) => void,
  onClose: () => void,
): DiagramPanel {
  const files = tableFiles(model);
  const regions = (model.regions ?? DEFAULT_REGIONS).filter((r) =>
    model.neurons.some((n) => (n.kind === 'class' || n.kind === 'interface') && n.region === r.id),
  );
  let kind: DiagramKind = files.length ? 'er' : 'class';
  let tableScope = files.length > 1 ? files[0]!.file : '';
  let classScope: RegionId | '' = '';
  let zoom = 1;
  let current: Diagram | null = null;
  let opened = false;

  const panel = el('section', {
    class: 'nb-diagrams',
    role: 'dialog',
    'aria-label': 'Architecture diagrams',
    hidden: '',
  });
  const bar = el('div', { class: 'nb-dg-bar' });
  const tabs = el('div', { role: 'tablist', 'aria-label': 'Diagram type' });
  const tabButtons = TABS.map((t) => {
    const b = el('button', { type: 'button', role: 'tab', 'data-kind': t.kind }, t.label);
    b.addEventListener('click', () => {
      kind = t.kind;
      draw();
    });
    tabs.append(b);
    return b;
  });
  const scopeLabel = el('label', { class: 'nb-dg-scope' });
  const scopeText = el('span');
  const scope = el('select');
  scopeLabel.append(scopeText, scope);
  scope.addEventListener('change', () => {
    if (kind === 'class') classScope = scope.value as RegionId | '';
    else tableScope = scope.value;
    draw();
  });
  const zoomOut = el('button', { type: 'button', 'aria-label': 'Zoom out' }, '−');
  const zoomIn = el('button', { type: 'button', 'aria-label': 'Zoom in' }, '+');
  const fit = el('button', { type: 'button' }, 'Fit');
  const download = el('button', { type: 'button', class: 'nb-dg-download' }, 'Download SVG');
  const close = el(
    'button',
    { type: 'button', class: 'nb-close', 'aria-label': 'Close diagrams' },
    '×',
  );
  bar.append(tabs, scopeLabel, zoomOut, zoomIn, fit, download, close);
  const note = el('p', { class: 'nb-dg-note', role: 'status' });
  const canvas = el('div', { class: 'nb-dg-canvas', tabindex: '0' });
  panel.append(bar, note, canvas);
  root.append(panel);

  const applyZoom = () => {
    const svg = canvas.querySelector('svg');
    if (!svg || !current) return;
    svg.style.width = `${Math.round(current.width * zoom)}px`;
    svg.style.height = `${Math.round(current.height * zoom)}px`;
  };
  zoomIn.addEventListener('click', () => {
    zoom = Math.min(3, zoom * 1.25);
    applyZoom();
  });
  zoomOut.addEventListener('click', () => {
    zoom = Math.max(0.2, zoom / 1.25);
    applyZoom();
  });
  fit.addEventListener('click', () => {
    if (!current) return;
    zoom = Math.min(
      1,
      (canvas.clientWidth - 8) / current.width,
      (canvas.clientHeight - 8) / current.height,
    );
    applyZoom();
  });
  download.addEventListener('click', () => {
    if (!current) return;
    const blob = new Blob([current.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `${model.title.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'architecture'}-${current.kind}.svg`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  close.addEventListener('click', () => api.close());
  canvas.addEventListener('click', (e) => {
    const g = (e.target as Element).closest?.('g[data-id]');
    const id = g?.getAttribute('data-id');
    if (id) {
      api.close();
      onSelect(id);
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    }
  });

  function fillScope() {
    scope.replaceChildren();
    if (kind === 'class') {
      scopeText.textContent = 'Classes in ';
      scope.append(el('option', { value: '' }, 'All lobes'));
      for (const r of regions) scope.append(el('option', { value: r.id }, r.label));
      scope.value = classScope;
    } else {
      scopeText.textContent = 'Tables from ';
      scope.append(
        el(
          'option',
          { value: '' },
          `All schema files (${files.reduce((s, f) => s + f.tables, 0)} tables)`,
        ),
      );
      for (const f of files)
        scope.append(el('option', { value: f.file }, `${f.file || 'unknown file'} (${f.tables})`));
      scope.value = tableScope;
    }
    scopeLabel.hidden =
      kind === 'routines' || (kind === 'class' ? regions.length < 2 : files.length < 2);
  }

  function draw() {
    tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === kind)));
    fillScope();
    current =
      kind === 'class'
        ? classDiagram(model, classScope ? { region: classScope } : {})
        : kind === 'routines'
          ? routineDiagram(model)
          : tableDiagram(model, kind === 'schema', tableScope ? { file: tableScope } : {});
    // The SVG is built from escaped text only (see diagrams.ts), so it is safe to insert.
    canvas.innerHTML = current.svg;
    const what =
      kind === 'class'
        ? 'classes and interfaces'
        : kind === 'routines'
          ? 'views, routines and triggers'
          : 'tables';
    // An empty table diagram must not read as "this system has no database" (QA AL-04).
    const unread =
      kind !== 'class' &&
      kind !== 'routines' &&
      current.total === 0 &&
      model.coverage?.unreadSchemas
        ? [model.coverage.unreadSchemas]
        : [];
    note.textContent = [
      `${current.shown} of ${current.total} ${what} drawn.`,
      ...unread,
      ...current.notes,
      'Click a box to find it in the brain.',
    ].join(' ');
    zoom = 1;
    applyZoom();
  }

  const api: DiagramPanel = {
    get isOpen() {
      return opened;
    },
    open(k) {
      if (k) kind = k;
      opened = true;
      panel.hidden = false;
      draw();
      tabButtons.find((b) => b.dataset.kind === kind)?.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      panel.hidden = true;
      canvas.replaceChildren();
      onClose();
    },
    destroy() {
      panel.remove();
    },
  };
  return api;
}
