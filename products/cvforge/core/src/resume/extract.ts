import JSZip from 'jszip';
import {
  DEFAULT_LIMITS,
  IsolationError,
  PdfUnreadableError,
  runMammothIsolated,
  runPdfIsolated,
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
  for (const page of pages) {
    const viewport = { width: page.width, height: page.height };
    const items = page.items;
    // Group items into visual lines by baseline y (2pt tolerance).
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      fonts.add(it.fontName);
      const y = it.y;
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd: number | null = null;
      let bigGap = false;
      for (const it of row.items) {
        const x = it.x;
        if (prevEnd !== null) {
          const gap = x - prevEnd;
          if (gap > viewport.width * 0.12) bigGap = true;
          line += gap > 1.5 ? ' ' : '';
        }
        line += it.str;
        prevEnd = x + it.width;
      }
      const clean = line.replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      totalLines++;
      if (bigGap) multiColumnLines++;
      const inMargin = row.y > viewport.height * 0.95 || row.y < viewport.height * 0.05;
      if (inMargin) marginTexts.set(clean, (marginTexts.get(clean) ?? 0) + 1);
      allLines.push(clean);
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
    .map((l) => l.replace(/\s+/g, ' ').trim())
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
    .replace(/<li[^>]*>/gi, '\n\u2022 ')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text).split('\n');
}
