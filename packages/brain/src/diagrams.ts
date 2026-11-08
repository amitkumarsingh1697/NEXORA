import { columnTypeText } from './columns';
import type { BrainColumn, BrainModel, BrainNeuron, RegionId } from './model';

/**
 * Architecture diagrams drawn from a brain model as standalone SVG (no DOM needed, so the
 * same code runs in the viewer, in tests and in the single-file page):
 *
 * - **ER diagram:** tables with their key columns, and foreign keys as crow's-foot lines
 *   (many on the referencing side, one on the referenced side).
 * - **Schema diagram:** every column with its type, size, nullability, keys and default.
 * - **Class diagram:** classes and interfaces with their methods (inputs and return type),
 *   and inheritance (solid line, hollow triangle) and implementation (dashed line).
 *
 * The layout is layered: referenced tables and base classes come first, so arrows read in
 * one direction. Everything shown comes from the model; nothing is added.
 */

export type DiagramKind = 'er' | 'schema' | 'class';

export interface DiagramBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagram {
  kind: DiagramKind;
  svg: string;
  width: number;
  height: number;
  boxes: DiagramBox[];
  /** How many items exist and how many are drawn, so a cap is never silent. */
  total: number;
  shown: number;
  /** What was left out and why. */
  notes: string[];
}

export interface DiagramOptions {
  /** Class diagram: only this lobe. */
  region?: RegionId;
  /** ER and schema diagrams: only tables defined in this file. */
  file?: string;
  /** Most boxes to draw; the best-connected are kept. */
  max?: number;
}

const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const CHAR_W = 7.2; // 12px monospace
const LINE_H = 18;
const HEAD_H = 26;
const PAD = 10;
const GAP_X = 70;
const GAP_Y = 34;
const MAX_ROWS = 14;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Item {
  id: string;
  title: string;
  stereotype?: string;
  rows: { text: string; strong?: boolean; muted?: boolean }[];
  accent: string;
  w: number;
  h: number;
}

interface Link {
  from: string;
  to: string;
  style: 'fk' | 'extends' | 'implements';
  label?: string;
  /** Row of the `from` box the line leaves from (the foreign key column). */
  fromRow?: number;
}

function measure(item: Omit<Item, 'w' | 'h'>): Item {
  const longest = Math.max(
    item.title.length + 2,
    (item.stereotype?.length ?? 0) + 4,
    ...item.rows.map((r) => r.text.length),
  );
  return {
    ...item,
    w: Math.min(460, Math.max(150, Math.ceil(longest * CHAR_W) + PAD * 2)),
    h: HEAD_H + (item.stereotype ? 14 : 0) + Math.max(1, item.rows.length) * LINE_H + PAD,
  };
}

/**
 * Layers: an item sits one layer after everything it points to (referenced tables, base
 * classes), so links run from later layers back to earlier ones. Cycles are cut.
 */
function layers(items: Item[], links: Link[]): Item[][] {
  const out = new Map<string, string[]>();
  for (const l of links) if (l.from !== l.to) out.set(l.from, [...(out.get(l.from) ?? []), l.to]);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let v = 0;
    for (const t of out.get(id) ?? []) v = Math.max(v, d(t) + 1);
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  const byLayer: Item[][] = [];
  for (const it of items) (byLayer[d(it.id)] ??= []).push(it);
  const result = byLayer.filter(Boolean);
  // Order each layer by the average position of what it links to (fewer crossings).
  const pos = new Map<string, number>();
  result.forEach((layer, li) => {
    if (li > 0)
      layer.sort((a, b) => {
        const avg = (id: string) => {
          const t = (out.get(id) ?? []).map((x) => pos.get(x)).filter((x) => x !== undefined);
          return t.length ? t.reduce((s, x) => s + x, 0) / t.length : Number.MAX_SAFE_INTEGER;
        };
        return avg(a.id) - avg(b.id) || a.title.localeCompare(b.title);
      });
    else layer.sort((a, b) => a.title.localeCompare(b.title));
    layer.forEach((it, i) => pos.set(it.id, i));
  });
  return result;
}

/** Where the line from a box centre towards (tx, ty) leaves the box. */
function edgePoint(b: DiagramBox, tx: number, ty: number): [number, number] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

function render(
  kind: DiagramKind,
  items: Item[],
  links: Link[],
  direction: 'right' | 'down',
  total: number,
  title: string,
  notes: string[] = [],
): Diagram {
  const ls = layers(items, links);
  const boxes = new Map<string, DiagramBox>();
  const MARGIN = 24;
  const TOP = 44;
  // Long layers wrap into several columns (or rows) so the page keeps a sane shape.
  const wrap = direction === 'right' ? 8 : 6;
  let main = direction === 'right' ? MARGIN : TOP;
  for (const layer of ls) {
    const groups: Item[][] = [];
    for (let i = 0; i < layer.length; i += wrap) groups.push(layer.slice(i, i + wrap));
    for (const g of groups) {
      let cross = direction === 'right' ? TOP : MARGIN;
      let thick = 0;
      for (const it of g) {
        const b =
          direction === 'right'
            ? { id: it.id, x: main, y: cross, w: it.w, h: it.h }
            : { id: it.id, x: cross, y: main, w: it.w, h: it.h };
        boxes.set(it.id, b);
        cross += (direction === 'right' ? it.h : it.w) + (direction === 'right' ? GAP_Y : 28);
        thick = Math.max(thick, direction === 'right' ? it.w : it.h);
      }
      main += thick + (direction === 'right' ? GAP_X : GAP_Y + 30);
    }
  }
  const all = [...boxes.values()];
  const width = Math.max(320, ...all.map((b) => b.x + b.w + MARGIN));
  const height = Math.max(160, ...all.map((b) => b.y + b.h + MARGIN));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" font-size="12">`,
    `<title>${esc(title)}</title>`,
    '<defs>',
    '<marker id="tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M1,1 L11,6 L1,11 Z" fill="#ffffff" stroke="#334155"/></marker>',
    '<marker id="one" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto-start-reverse"><path d="M9,2 L9,12 M5,2 L5,12" stroke="#475569" stroke-width="1.4"/></marker>',
    '<marker id="many" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto-start-reverse"><path d="M13,1 L3,7 L13,13 M3,1 L3,13" fill="none" stroke="#475569" stroke-width="1.4"/></marker>',
    '</defs>',
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="24" y="26" font-size="15" font-weight="700" fill="#0f172a" font-family="Inter,system-ui,sans-serif">${esc(title)}</text>`,
  );

  const itemById = new Map(items.map((it) => [it.id, it]));
  for (const l of links) {
    const a = boxes.get(l.from);
    const b = boxes.get(l.to);
    if (!a || !b) continue;
    const dash = l.style === 'implements' ? ' stroke-dasharray="6 4"' : '';
    const markers =
      l.style === 'fk'
        ? ' marker-start="url(#many)" marker-end="url(#one)"'
        : ' marker-end="url(#tri)"';
    const head = HEAD_H + (itemById.get(l.from)?.stereotype ? 14 : 0) + 4;
    const rowY = l.fromRow !== undefined ? a.y + head + l.fromRow * LINE_H + 8 : a.y + a.h / 2;
    let d: string;
    if (direction === 'right' && a.x >= b.x + b.w) {
      // From the referencing column on the left of `a` to the right side of `b`.
      const x1 = a.x;
      const x2 = b.x + b.w;
      const y2 = b.y + Math.min(b.h / 2, HEAD_H / 2 + 4);
      const mid = (x1 - x2) / 2;
      d = `M${x1},${rowY.toFixed(1)} C${(x1 - mid).toFixed(1)},${rowY.toFixed(1)} ${(x2 + mid).toFixed(1)},${y2.toFixed(1)} ${x2},${y2.toFixed(1)}`;
    } else if (direction === 'right' && b.x >= a.x + a.w) {
      const x1 = a.x + a.w;
      const x2 = b.x;
      const y2 = b.y + Math.min(b.h / 2, HEAD_H / 2 + 4);
      const mid = (x2 - x1) / 2;
      d = `M${x1},${rowY.toFixed(1)} C${(x1 + mid).toFixed(1)},${rowY.toFixed(1)} ${(x2 - mid).toFixed(1)},${y2.toFixed(1)} ${x2},${y2.toFixed(1)}`;
    } else if (direction === 'down' && a.y >= b.y + b.h) {
      // From the top of the subclass to the bottom of its parent.
      const x1 = a.x + a.w / 2;
      const y1 = a.y;
      const x2 = b.x + b.w / 2;
      const y2 = b.y + b.h;
      const mid = (y1 - y2) / 2;
      d = `M${x1.toFixed(1)},${y1} C${x1.toFixed(1)},${(y1 - mid).toFixed(1)} ${x2.toFixed(1)},${(y2 + mid).toFixed(1)} ${x2.toFixed(1)},${y2}`;
    } else {
      const [x1, y1] = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
      const [x2, y2] = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
      d = `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="#64748b" stroke-width="1.3"${dash}${markers}><title>${esc(l.label ?? l.style)}</title></path>`,
    );
  }

  for (const it of items) {
    const b = boxes.get(it.id);
    if (!b) continue;
    let y = b.y;
    parts.push(
      `<g data-id="${esc(it.id)}" class="nb-box"><title>${esc(it.title)}</title>`,
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="#ffffff" stroke="#94a3b8"/>`,
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${HEAD_H + (it.stereotype ? 14 : 0)}" rx="6" fill="${it.accent}"/>`,
      `<rect x="${b.x}" y="${b.y + HEAD_H + (it.stereotype ? 14 : 0) - 6}" width="${b.w}" height="6" fill="${it.accent}"/>`,
    );
    if (it.stereotype) {
      parts.push(
        `<text x="${b.x + b.w / 2}" y="${y + 14}" text-anchor="middle" font-size="10" fill="#0f172a">${esc(`«${it.stereotype}»`)}</text>`,
      );
      y += 14;
    }
    parts.push(
      `<text x="${b.x + b.w / 2}" y="${y + 18}" text-anchor="middle" font-weight="700" fill="#0f172a">${esc(clip(it.title, 60))}</text>`,
    );
    y += HEAD_H + 4;
    if (!it.rows.length)
      parts.push(`<text x="${b.x + PAD}" y="${y + 12}" fill="#94a3b8">(none recorded)</text>`);
    for (const r of it.rows) {
      parts.push(
        `<text x="${b.x + PAD}" y="${y + 12}" fill="${r.muted ? '#64748b' : '#0f172a'}"${r.strong ? ' font-weight="700"' : ''}>${esc(clip(r.text, 62))}</text>`,
      );
      y += LINE_H;
    }
    parts.push('</g>');
  }
  if (!items.length)
    parts.push(
      `<text x="24" y="70" fill="#64748b" font-family="Inter,system-ui,sans-serif">Nothing to draw: ${kind === 'class' ? 'no classes or interfaces were found here' : 'no database tables were found'}.</text>`,
    );
  parts.push('</svg>');
  return {
    kind,
    svg: parts.join(''),
    width,
    height,
    boxes: all,
    total,
    shown: items.length,
    notes,
  };
}

/** Best-connected first, so a cap keeps the parts that matter most. */
function topByDegree(ns: BrainNeuron[], model: BrainModel, max: number): BrainNeuron[] {
  if (ns.length <= max) return ns;
  const deg = new Map<string, number>();
  for (const s of model.synapses) {
    deg.set(s.source, (deg.get(s.source) ?? 0) + 1);
    deg.set(s.target, (deg.get(s.target) ?? 0) + 1);
  }
  return [...ns].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0)).slice(0, max);
}

function columnRow(
  c: BrainColumn,
  full: boolean,
): { text: string; strong?: boolean; muted?: boolean } {
  const keys = [c.primaryKey ? 'PK' : '', c.references ? 'FK' : ''].filter(Boolean).join(',');
  const prefix = keys ? `${keys.padEnd(5)}` : '     ';
  if (!full) return { text: `${prefix} ${c.name}`, strong: c.primaryKey };
  const extra = [
    c.nullable ? 'null' : 'not null',
    c.unique && !c.primaryKey ? 'unique' : '',
    c.default !== undefined ? `= ${c.default}` : '',
    c.references
      ? `→ ${c.references.table}${c.references.column ? `.${c.references.column}` : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { text: `${prefix} ${c.name}: ${columnTypeText(c)}  ${extra}`, strong: c.primaryKey };
}

/** Schema files that define tables, largest first: the groups a reader can pick from. */
export function tableFiles(model: BrainModel): { file: string; tables: number }[] {
  const count = new Map<string, number>();
  for (const n of model.neurons)
    if (n.kind === 'table') count.set(n.file ?? '', (count.get(n.file ?? '') ?? 0) + 1);
  return [...count]
    .map(([file, tables]) => ({ file, tables }))
    .sort((a, b) => b.tables - a.tables || a.file.localeCompare(b.file));
}

/** ER diagram (`full` false: key columns) or schema diagram (`full` true: every column). */
export function tableDiagram(model: BrainModel, full: boolean, opts: DiagramOptions = {}): Diagram {
  const all = model.neurons.filter(
    (n) => n.kind === 'table' && (opts.file === undefined || (n.file ?? '') === opts.file),
  );
  const tables = topByDegree(all, model, opts.max ?? 120);
  const ids = new Set(tables.map((t) => t.id));
  const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t.id]));
  const shownCols = new Map<string, BrainColumn[]>();
  const items = tables.map((t) => {
    const cols = t.columns ?? [];
    const limit = full ? 40 : MAX_ROWS;
    const shown = (full ? cols : cols.filter((c) => c.primaryKey || c.references)).slice(0, limit);
    shownCols.set(t.id, shown);
    const rows = shown.map((c) => columnRow(c, full));
    const hidden = cols.length - shown.length;
    if (hidden > 0)
      rows.push({
        text: full ? `… ${hidden} more columns` : `+ ${hidden} other columns`,
        muted: true,
      });
    return measure({ id: t.id, title: t.name, rows, accent: '#bbf7d0' });
  });
  const links: Link[] = model.synapses
    .filter((s) => s.kind === 'references' && ids.has(s.source) && ids.has(s.target))
    .map((s) => {
      const target = tables.find((t) => t.id === s.target);
      const row = (shownCols.get(s.source) ?? []).findIndex(
        (c) => c.references && byName.get(c.references.table.toLowerCase()) === target?.id,
      );
      return {
        from: s.source,
        to: s.target,
        style: 'fk' as const,
        label: s.detail,
        ...(row >= 0 ? { fromRow: row } : {}),
      };
    });
  const scope = opts.file ? ` (${opts.file})` : '';
  const title = `${model.title}: ${full ? 'schema' : 'entity-relationship'} diagram${scope}`;
  const notes =
    tables.length < all.length
      ? [`${all.length - tables.length} less-connected tables are not drawn.`]
      : [];
  return render(full ? 'schema' : 'er', items, links, 'right', all.length, title, notes);
}

/** Class diagram of classes and interfaces, with methods and inheritance. */
export function classDiagram(model: BrainModel, opts: DiagramOptions = {}): Diagram {
  const all = model.neurons.filter(
    (n) =>
      (n.kind === 'class' || n.kind === 'interface') && (!opts.region || n.region === opts.region),
  );
  const members = new Map<string, BrainNeuron[]>();
  for (const n of model.neurons)
    if (n.parent) members.set(n.parent, [...(members.get(n.parent) ?? []), n]);
  const inherits = new Set<string>();
  for (const s of model.synapses)
    if (s.kind === 'extends' || s.kind === 'implements') inherits.add(s.source).add(s.target);
  // An interface with no recorded members and no inheritance would be an empty box.
  const drawable = all.filter((n) => n.kind === 'class' || members.has(n.id) || inherits.has(n.id));
  const shown = topByDegree(drawable, model, opts.max ?? 80);
  const ids = new Set(shown.map((n) => n.id));
  const notes: string[] = [];
  if (drawable.length < all.length)
    notes.push(
      `${all.length - drawable.length} interfaces with no recorded methods and no inheritance are not drawn.`,
    );
  if (shown.length < drawable.length)
    notes.push(`${drawable.length - shown.length} less-connected classes are not drawn.`);
  const items = shown.map((c) => {
    const ms = (members.get(c.id) ?? []).sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    const rows: Item['rows'] = ms.slice(0, MAX_ROWS).map((m) => {
      const short = m.name.split('.').pop() ?? m.name;
      const params = (m.params ?? []).map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`);
      return { text: `${short}(${params.join(', ')})${m.returns ? `: ${m.returns}` : ''}` };
    });
    if (ms.length > MAX_ROWS) rows.push({ text: `+ ${ms.length - MAX_ROWS} more`, muted: true });
    return measure({
      id: c.id,
      title: c.name,
      stereotype: c.kind === 'interface' ? 'interface' : undefined,
      rows,
      accent: c.kind === 'interface' ? '#e9d5ff' : '#bae6fd',
    });
  });
  const links: Link[] = model.synapses
    .filter(
      (s) =>
        (s.kind === 'extends' || s.kind === 'implements') && ids.has(s.source) && ids.has(s.target),
    )
    .map((s) => ({
      from: s.source,
      to: s.target,
      style: s.kind as 'extends' | 'implements',
      label: s.kind,
    }));
  const scope = opts.region ? ` (${opts.region})` : '';
  return render(
    'class',
    items,
    links,
    'down',
    all.length,
    `${model.title}: class diagram${scope}`,
    notes,
  );
}
