import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfConversionError';
  }
}

/** Locate LibreOffice. Respects SOFFICE_PATH; otherwise common install paths. */
export function sofficeCandidates(): string[] {
  const env = process.env.SOFFICE_PATH;
  return [
    ...(env ? [env] : []),
    'soffice',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];
}

/**
 * Convert a DOCX buffer to PDF using LibreOffice headless. The PDF is produced
 * from the exact same DOCX, so both formats carry the same approved content.
 * Runs with a private, throwaway profile and a hard timeout.
 */
export async function convertDocxToPdf(docx: Buffer, timeoutMs = 60_000): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'cvforge-pdf-'));
  try {
    const input = join(dir, 'resume.docx');
    await writeFile(input, docx);
    const profile = pathToFileURL(join(dir, 'profile')).href;
    let lastErr: unknown;
    for (const bin of sofficeCandidates()) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(
            bin,
            [
              `-env:UserInstallation=${profile}`,
              '--headless',
              '--norestore',
              '--convert-to',
              'pdf',
              '--outdir',
              dir,
              input,
            ],
            { timeout: timeoutMs, windowsHide: true },
            (err) => (err ? reject(err) : resolve()),
          );
        });
        return await readFile(join(dir, 'resume.pdf'));
      } catch (e) {
        lastErr = e;
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') break;
      }
    }
    throw new PdfConversionError(
      (lastErr as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? 'LibreOffice is not installed. Install it or set SOFFICE_PATH to enable PDF export.'
        : 'PDF conversion failed.',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
