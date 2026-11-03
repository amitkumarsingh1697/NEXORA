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

export function runMammothIsolated(
  bytes: Uint8Array,
  limits: IsolationLimits = DEFAULT_LIMITS,
): Promise<MammothOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
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
    worker.once('message', (m: { ok: boolean; error?: string } & Partial<MammothOutput>) =>
      finish(() =>
        m.ok
          ? resolve({ raw: m.raw as MammothOutput['raw'], html: m.html as MammothOutput['html'] })
          : reject(new IsolationError('failed', m.error ?? 'Parsing failed.')),
      ),
    );
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
