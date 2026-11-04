/**
 * Run mammoth in a worker thread with a timeout and a heap cap (research R8:
 * mammoth does no sanitisation and crafted documents can use pathological CPU
 * or memory, so its docs recommend isolating untrusted input).
 *
 * The worker runs plain JavaScript (no TypeScript loader needed) and resolves
 * mammoth itself. Resolution must happen inside the worker source: the Next.js
 * bundler rewrites `createRequire(import.meta.url).resolve(...)` in this file
 * into an internal module id, which is not a path. The worker searches from
 * this package's directory (vitest, tsx) and from the process working directory
 * (the Next.js app, which declares mammoth as a dependency for this reason).
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

export interface IsolationLimits {
  timeoutMs: number;
  maxOldGenerationSizeMb: number;
}

export const DEFAULT_LIMITS: IsolationLimits = { timeoutMs: 20_000, maxOldGenerationSizeMb: 256 };

export class IsolationError extends Error {
  constructor(
    readonly kind: 'timeout' | 'memory' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'IsolationError';
  }
}

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const mammoth = require(require.resolve('mammoth', { paths: workerData.searchFrom }));
(async () => {
  try {
    const buffer = Buffer.from(workerData.bytes);
    const raw = await mammoth.extractRawText({ buffer });
    const html = await mammoth.convertToHtml({ buffer });
    parentPort.postMessage({ ok: true, raw: { value: raw.value }, html: { value: html.value, messages: html.messages.map((m) => ({ message: String(m.message) })) } });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
})();
`;

function searchFrom(): string[] {
  const paths = [process.cwd()];
  try {
    if (import.meta.url.startsWith('file:')) paths.unshift(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // import.meta.url is not a file URL in some bundles; the working directory is still searched.
  }
  return paths;
}

export interface MammothOutput {
  raw: { value: string };
  html: { value: string; messages: { message: string }[] };
}

/**
 * pdf.js in a worker (S3 follow-up to R8/K-07): the worker loads the document and returns only
 * positioned text items per page; layout analysis stays in the caller. pdf.js is ESM, so the
 * worker imports it by file URL after resolving it from the same search paths as mammoth.
 */
const PDF_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
(async () => {
  let task;
  try {
    const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs', { paths: workerData.searchFrom });
    const pdfjs = await import(pathToFileURL(entry).href);
    task = pdfjs.getDocument({
      data: new Uint8Array(workerData.bytes),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    let doc;
    try {
      doc = await task.promise;
    } catch (e) {
      parentPort.postMessage({ ok: false, unreadable: true, error: String((e && e.message) || e).slice(0, 200) });
      return;
    }
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = [];
      for (const i of content.items) {
        if (typeof i.str !== 'string' || !Array.isArray(i.transform)) continue;
        items.push({ str: i.str, x: i.transform[4] || 0, y: i.transform[5] || 0, width: i.width || 0, fontName: String(i.fontName || '') });
      }
      pages.push({ width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    parentPort.postMessage({ ok: true, pages });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  } finally {
    if (task) await task.destroy().catch(() => undefined);
  }
})();
`;

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontName: string;
}

export interface PdfPageText {
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** The document could not be opened at all (damaged, encrypted): not a resource problem. */
export class PdfUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfUnreadableError';
  }
}

export async function runPdfIsolated(
  bytes: Uint8Array,
  limits: IsolationLimits = DEFAULT_LIMITS,
): Promise<PdfPageText[]> {
  const m = await runIsolated<{
    ok: boolean;
    unreadable?: boolean;
    error?: string;
    pages?: PdfPageText[];
  }>(PDF_WORKER_SOURCE, bytes, limits);
  if (m.unreadable) throw new PdfUnreadableError(m.error ?? 'The PDF could not be opened.');
  if (!m.ok || !m.pages) throw new IsolationError('failed', m.error ?? 'Parsing failed.');
  return m.pages;
}

export async function runMammothIsolated(
  bytes: Uint8Array,
  limits: IsolationLimits = DEFAULT_LIMITS,
): Promise<MammothOutput> {
  const m = await runIsolated<{ ok: boolean; error?: string } & Partial<MammothOutput>>(
    WORKER_SOURCE,
    bytes,
    limits,
  );
  if (!m.ok) throw new IsolationError('failed', m.error ?? 'Parsing failed.');
  return { raw: m.raw as MammothOutput['raw'], html: m.html as MammothOutput['html'] };
}

/** Run a parser worker over untrusted bytes with a timeout, a heap cap, no environment and no stdin. */
function runIsolated<T>(source: string, bytes: Uint8Array, limits: IsolationLimits): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: { searchFrom: searchFrom(), bytes: new Uint8Array(bytes) },
      resourceLimits: {
        maxOldGenerationSizeMb: limits.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: 32,
      },
      // No environment or stdin for untrusted-document parsing.
      env: {},
      stdin: false,
    });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new IsolationError('timeout', `Parsing took longer than ${limits.timeoutMs} ms.`)),
        ),
      limits.timeoutMs,
    );
    worker.once('message', (m: T) => finish(() => resolve(m)));
    worker.once('error', (e: Error & { code?: string }) =>
      finish(() =>
        reject(
          e.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new IsolationError('memory', 'Parsing exceeded the memory limit.')
            : new IsolationError('failed', 'Parsing failed.'),
        ),
      ),
    );
    worker.once('exit', (code) =>
      finish(() => reject(new IsolationError('failed', `Parser exited with code ${code}.`))),
    );
  });
}
