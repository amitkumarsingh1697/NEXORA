import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { DocumentRejectedError, extractDocument } from '../resume/extract';
import { runMammothIsolated } from '../resume/isolate';

async function docxWith(paragraphs: number): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        children: Array.from(
          { length: paragraphs },
          (_, i) => new Paragraph({ children: [new TextRun(`Line ${i} of a long document.`)] }),
        ),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe('isolated Word parsing (S2-4, research R8)', () => {
  it('parses a normal document in the worker', async () => {
    const out = await runMammothIsolated(await docxWith(3), {
      timeoutMs: 20_000,
      maxOldGenerationSizeMb: 256,
    });
    expect(out.raw.value).toContain('Line 2 of a long document.');
    expect(out.html.value).toContain('<p>Line 0');
  });

  it('rejects a document that takes too long, while the main thread stays responsive', async () => {
    const heavy = await docxWith(40_000);
    expect(heavy.length).toBeLessThan(10 * 1024 * 1024);
    let ticks = 0;
    const probe = setInterval(() => ticks++, 10);
    const started = Date.now();
    try {
      await expect(
        extractDocument(heavy, { limits: { timeoutMs: 150, maxOldGenerationSizeMb: 256 } }),
      ).rejects.toMatchObject({ reason: 'too_complex' });
    } finally {
      clearInterval(probe);
    }
    expect(Date.now() - started).toBeLessThan(5_000);
    // The event loop kept running while the worker was busy.
    expect(ticks).toBeGreaterThan(3);
  }, 30_000);

  it('rejects a document that exceeds the memory cap', async () => {
    const heavy = await docxWith(40_000);
    const err = await extractDocument(heavy, {
      limits: { timeoutMs: 60_000, maxOldGenerationSizeMb: 8 },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentRejectedError);
    expect((err as DocumentRejectedError).reason).toBe('too_complex');
  }, 60_000);

  it('a corrupt document is still reported as corrupt', async () => {
    const good = await docxWith(1);
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(good);
    zip.file('word/document.xml', '<not-xml');
    const bad = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
    await expect(extractDocument(bad)).rejects.toMatchObject({ reason: 'corrupt' });
  });
});
