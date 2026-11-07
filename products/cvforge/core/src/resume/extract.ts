import JSZip from 'jszip';
import {
  DEFAULT_LIMITS,
  IsolationError,
  PdfUnreadableError,
  runMammothIsolated,
  runPdfIsolated,
  type PdfPageText,
  type PdfTextItem,
  type IsolationLimits,
} from './isolate';

export type DocumentKind = 'pdf' | 'docx';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface LayoutSignals {
  pageCount: number;
  /** Fraction of lines that appear to belong to a multi-column layout (0-1). */
  multiColumnRatio: number;
  hasTables: boolean;
  /** Text found in page headers/footers (DOCX parts or repeated PDF margins). */
  headerFooterText: string[];
  imageCount: number;
  fontCount: number;
  /** Characters of extracted text per page, a proxy for scanned/image-only PDFs. */
  charsPerPage: number;
}

export interface ExtractionResult {
  kind: DocumentKind;
  text: string;
  lines: string[];
  layout: LayoutSignals;
  warnings: string[];
}

export class DocumentRejectedError extends Error {
  readonly reason:
    'too_large' | 'unsupported_type' | 'corrupt' | 'macro_enabled' | 'empty' | 'too_complex';
  constructor(
    reason: DocumentRejectedError['reason'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DocumentRejectedError';
    this.reason = reason;
  }
}

/**
 * Identify a document by its file signature, never by extension or the
 * client-supplied MIME type. Returns null for anything we do not accept.
 */
export async function sniffDocumentKind(bytes: Uint8Array): Promise<DocumentKind | null> {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'pdf';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    try {
      const zip = await JSZip.loadAsync(bytes);
      const types = await zip.file('[Content_Types].xml')?.async('string');
      if (!types || !zip.file('word/document.xml')) return null;
      if (/macroEnabled/i.test(types) || zip.file('word/vbaProject.bin')) {
        throw new DocumentRejectedError(
          'macro_enabled',
          'Macro-enabled Word documents are not accepted.',
        );
      }
      return 'docx';
    } catch (e) {
      if (e instanceof DocumentRejectedError) throw e;
      return null;
    }
  }
  return null;
}

export async function extractDocument(
  bytes: Uint8Array,
  opts: { limits?: IsolationLimits } = {},
): Promise<ExtractionResult> {
  if (bytes.length === 0) throw new DocumentRejectedError('empty', 'The file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new DocumentRejectedError('too_large', 'The file exceeds the 10 MB limit.');
  }
  const kind = await sniffDocumentKind(bytes);
  if (!kind)
    throw new DocumentRejectedError('unsupported_type', 'Only PDF and DOCX files are supported.');
  const limits = opts.limits ?? DEFAULT_LIMITS;
  return kind === 'pdf' ? extractPdf(bytes, limits) : extractDocx(bytes, limits);
}

async function extractPdf(bytes: Uint8Array, limits: IsolationLimits): Promise<ExtractionResult> {
  let pages;
  try {
    pages = await runPdfIsolated(bytes, limits);
  } catch (e) {
    if (e instanceof IsolationError && e.kind !== 'failed')
      throw new DocumentRejectedError(
        'too_complex',
        'This PDF is too complex to read safely. Try exporting it again from the original document.',
        { cause: e },
      );
    throw new DocumentRejectedError(
      'corrupt',
      e instanceof PdfUnreadableError
        ? 'The PDF could not be read. It may be damaged or password protected.'
        : 'The PDF could not be read.',
      { cause: e },
    );
  }
  const fonts = new Set<string>();
  const allLines: string[] = [];
  let multiColumnLines = 0;
  let totalLines = 0;
  const marginTexts = new Map<string, number>();
  let prev: PdfRow | null = null;
  const pageRowsList = pages.map((page) => pageRows(page));
  // The text column's edges, over the whole document: a short last page must not make every
  // one of its lines look as if it reached the right margin.
  const bodyRows = pageRowsList.flat().filter((r) => !r.inMargin);
  const column = {
    left: bodyRows.reduce((m, r) => Math.min(m, r.startX), Infinity),
    right: bodyRows.reduce((m, r) => Math.max(m, r.right), 0),
  };
  for (const [pi, page] of pages.entries()) {
    const rows = pageRowsList[pi] ?? [];
    for (const it of page.items) if (it.str.trim()) fonts.add(it.fontName);
    for (const [idx, row] of rows.entries()) {
      totalLines++;
      if (row.bigGap) multiColumnLines++;
      if (row.inMargin) {
        marginTexts.set(row.text, (marginTexts.get(row.text) ?? 0) + 1);
        // Margin text (page numbers, running headers) never continues a body line.
        allLines.push(row.text);
        prev = null;
        continue;
      }
      if (prev && continuesLine(prev, row, idx === 0, column)) {
        const last = allLines.length - 1;
        allLines[last] = joinWrapped(allLines[last] ?? '', row.text);
        prev = { ...row, textX: prev.textX, startX: prev.startX };
      } else {
        allLines.push(row.text);
        prev = row;
      }
    }
  }
  const pageCount = pages.length;
  const text = allLines.join('\n');
  const headerFooterText =
    pageCount > 1 ? [...marginTexts.entries()].filter(([, n]) => n >= 2).map(([t]) => t) : [];
  const charsPerPage = pageCount ? Math.round(text.length / pageCount) : 0;
  const warnings: string[] = [];
  if (charsPerPage < 200) {
    warnings.push(
      'Very little text could be extracted. The PDF may be scanned or image-based; OCR is not supported in v1.',
    );
  }
  const multiColumnRatio = totalLines ? multiColumnLines / totalLines : 0;
  if (multiColumnRatio > 0.25)
    warnings.push('The layout appears to use multiple columns, which can scramble reading order.');
  return {
    kind: 'pdf',
    text,
    lines: allLines,
    warnings,
    layout: {
      pageCount,
      multiColumnRatio,
      hasTables: false,
      headerFooterText,
      imageCount: 0,
      fontCount: fonts.size,
      charsPerPage,
    },
  };
}

async function extractDocx(bytes: Uint8Array, limits: IsolationLimits): Promise<ExtractionResult> {
  let raw: { value: string };
  let html: { value: string; messages: { message: string }[] };
  let zip: JSZip;
  try {
    ({ raw, html } = await runMammothIsolated(bytes, limits));
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    if (e instanceof IsolationError && e.kind !== 'failed')
      throw new DocumentRejectedError(
        'too_complex',
        'This Word document is too complex to read safely. Try saving it again or exporting it as PDF.',
        { cause: e },
      );
    throw new DocumentRejectedError('corrupt', 'The Word document could not be read.', {
      cause: e,
    });
  }
  const headerFooterText: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
      const xml = (await zip.file(name)?.async('string')) ?? '';
      const t = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map((m) => m[1])
        .join('')
        .trim();
      if (t) headerFooterText.push(t);
    }
  }
  const documentXml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  const colMatch = /<w:cols\b[^>]*w:num="(\d+)"/.exec(documentXml);
  const columns = colMatch ? Number(colMatch[1]) : 1;
  const hasTextBoxes = /<w:txbxContent/.test(documentXml);
  const imageCount = Object.keys(zip.files).filter((n) => n.startsWith('word/media/')).length;
  const hasTables = /<table/i.test(html.value);
  // Word list bullets are numbering metadata, not text; recover them from the HTML so
  // the parser can tell bullets from headings. Fall back to raw text if HTML is empty.
  const fromHtml = htmlToLines(html.value);
  const lines = (fromHtml.length ? fromHtml : raw.value.split(/\r?\n/))
    .map((l) =>
      l
        .split('\t')
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\t'),
    )
    .filter(Boolean);
  const text = lines.join('\n');
  const warnings: string[] = [];
  if (hasTables)
    warnings.push('The document contains tables. Some parsers read table cells out of order.');
  if (columns > 1) warnings.push('The document uses a multi-column section layout.');
  if (hasTextBoxes) warnings.push('The document contains text boxes, which some parsers skip.');
  if (headerFooterText.length)
    warnings.push('Some text is in the page header or footer, which some parsers ignore.');
  const fontCount = new Set([...documentXml.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1])).size;
  return {
    kind: 'docx',
    text,
    lines,
    warnings,
    layout: {
      pageCount: Math.max(1, Math.round(text.length / 3000)),
      multiColumnRatio: columns > 1 || hasTextBoxes ? 1 : 0,
      hasTables,
      headerFooterText,
      imageCount,
      fontCount,
      charsPerPage: text.length,
    },
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Convert mammoth's HTML to text lines, prefixing list items with a bullet. */
export function htmlToLines(html: string): string[] {
  const text = html
    // Keep hyperlink targets whose label does not show them ("LinkedIn" -> profile URL).
    .replace(
      /<a\s[^>]*href="(https?:[^"]+|mailto:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const target = decodeEntities(href).replace(/^mailto:/i, '');
        const shown = label.replace(/<[^>]+>/g, '');
        const bare = target.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
        return shown.toLowerCase().includes(bare.toLowerCase()) ? label : `${label} (${target})`;
      },
    )
    .replace(/<li[^>]*>/gi, '\n\u2022 ')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text).split('\n');
}

// Includes the Symbol/Wingdings private-use bullets that Word writes into PDFs.
const BULLET_GLYPH = /^[•●▪◦‣∙·○■□►▸➢➤✓✔❖\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF06C\uF0A8\-*–]$/;

interface PdfRow {
  y: number;
  text: string;
  /** x of the first item (a bullet glyph, if any). */
  startX: number;
  /** x where the text itself starts (after a bullet glyph). */
  textX: number;
  right: number;
  size: number;
  firstFont: string;
  lastFont: string;
  bullet: boolean;
  /** The row has a gap wide enough to be separate columns (title ... dates). */
  bigGap: boolean;
  /** The row has any tab-separated run (company <gap> location). */
  hasTab: boolean;
  inMargin: boolean;
}

/**
 * Group a page's text items into visual rows (2pt baseline tolerance), in reading order.
 * Runs separated by a gap wider than about half an em are joined with a tab, so that
 * right-aligned dates and locations stay distinguishable from the text before them.
 */
function pageRows(page: PdfPageText): PdfRow[] {
  const groups: { y: number; items: PdfTextItem[] }[] = [];
  for (const it of page.items) {
    if (!it.str.trim()) continue;
    let row = groups.find((r) => Math.abs(r.y - it.y) <= 2);
    if (!row) {
      row = { y: it.y, items: [] };
      groups.push(row);
    }
    row.items.push(it);
  }
  groups.sort((a, b) => b.y - a.y);
  const rows: PdfRow[] = [];
  for (const g of groups) {
    g.items.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    let prevStr = '';
    let bigGap = false;
    let hasTab = false;
    const size = Math.max(...g.items.map((i) => i.size || 0)) || 10;
    for (const it of g.items) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > page.width * 0.12) bigGap = true;
        const afterGlyph = BULLET_GLYPH.test(prevStr.trim());
        if (gap > size * 0.55 && !afterGlyph) {
          line += '\t';
          hasTab = true;
        } else if (gap > 1.5 && !/\s$/.test(line) && !/^\s/.test(it.str)) line += ' ';
      }
      line += it.str;
      prevEnd = it.x + it.width;
      prevStr = it.str;
    }
    // Link targets that the visible text does not spell out are appended, so a "LinkedIn"
    // label still yields the profile address.
    for (const l of page.links ?? []) {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = l.rect;
      if (g.y < Math.min(y1, y2) - 2 || g.y > Math.max(y1, y2) + 2) continue;
      if (!g.items.some((i) => i.x < Math.max(x1, x2) && i.x + i.width > Math.min(x1, x2)))
        continue;
      const target = l.url.replace(/^mailto:/i, '');
      const bare = target.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      if (!line.toLowerCase().includes(bare.toLowerCase())) line += ` | ${target}`;
    }
    const text = line
      .split('\t')
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\t');
    if (!text) continue;
    const first = g.items[0] as PdfTextItem;
    const bullet =
      BULLET_GLYPH.test(first.str.trim()) ||
      /^\s*[•●▪◦‣∙·○■□►▸➢➤✓✔❖\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF06C\uF0A8]\s/.test(first.str);
    const textItem = (BULLET_GLYPH.test(first.str.trim()) ? g.items[1] : first) ?? first;
    const last = g.items[g.items.length - 1] as PdfTextItem;
    rows.push({
      y: g.y,
      text,
      startX: first.x,
      textX: textItem.x,
      right: last.x + last.width,
      size,
      firstFont: textItem.fontName,
      lastFont: last.fontName,
      bullet,
      bigGap,
      hasTab: hasTab && text.includes('\t'),
      inMargin: g.y > page.height * 0.95 || g.y < page.height * 0.05,
    });
  }
  return rows;
}

/**
 * Decide whether `row` is a soft-wrapped continuation of `prev` (the previous row's text
 * reached the right margin and this row carries on in the same font, size and indent).
 * Without this, every wrapped line of a bullet or paragraph reads as a new line, and the
 * parser mistakes the second half of a bullet for a new job title or company.
 */
function continuesLine(
  prev: PdfRow,
  row: PdfRow,
  firstOnPage: boolean,
  column: { left: number; right: number },
) {
  if (row.bullet || prev.hasTab || row.hasTab) return false;
  if (prev.lastFont !== row.firstFont) return false;
  if (Math.abs(prev.size - row.size) > 0.6) return false;
  const gap = prev.y - row.y;
  if (!firstOnPage && (gap <= 0 || gap > row.size * 1.75)) return false;
  // Continuation rows align with the text of the line they continue (hanging indent).
  if (row.startX < Math.min(prev.startX, prev.textX) - 2 || row.startX > prev.textX + 3)
    return false;
  const firstWord = row.text.split(/\s/)[0] ?? '';
  const wordWidth = firstWord.length * row.size * 0.5;
  if (prev.right - column.left < (column.right - column.left) * 0.6) return false;
  return column.right - prev.right < wordWidth + row.size * 1.5;
}

function joinWrapped(a: string, b: string): string {
  if (/[A-Za-z]-$/.test(a) && /^[A-Za-z]/.test(b)) return a + b;
  return `${a} ${b}`;
}
