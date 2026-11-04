import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { DocumentRejectedError, extractDocument } from '../resume/extract';
import { PdfUnreadableError, runMammothIsolated, runPdfIsolated } from '../resume/isolate';

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

/** A minimal one-page PDF with the given lines of text (valid xref offsets). */
function pdfWith(lines: string[]): Uint8Array {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = [
    'BT /F1 12 Tf 72 720 Td 14 TL',
    ...lines.map((l) => `(${esc(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe('isolated PDF parsing (Sprint 3, research R8 / K-07)', () => {
  const resumeLines = [
    'Priya Sharma',
    'priya@example.com',
    'Experience',
    'Senior Engineer at Example Corp, 2020 to present',
    'Built a payments service in TypeScript and PostgreSQL used by two million customers.',
    'Skills: TypeScript, PostgreSQL, Kubernetes',
  ];

  it('extracts positioned text in the worker', async () => {
    const pages = await runPdfIsolated(pdfWith(resumeLines));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width).toBe(612);
    expect(pages[0]!.items.map((i) => i.str)).toEqual(expect.arrayContaining(['Priya Sharma']));
    expect(pages[0]!.items[0]).toMatchObject({ x: 72, y: 720 });
  });

  it('extractDocument reads a PDF through the worker', async () => {
    const ex = await extractDocument(pdfWith(resumeLines));
    expect(ex.kind).toBe('pdf');
    expect(ex.text.split('\n')[0]).toBe('Priya Sharma');
    expect(ex.layout.pageCount).toBe(1);
  });

  it('rejects a PDF that takes too long, and one that exceeds the memory cap, as too complex', async () => {
    await expect(
      extractDocument(pdfWith(resumeLines), {
        limits: { timeoutMs: 1, maxOldGenerationSizeMb: 256 },
      }),
    ).rejects.toMatchObject({ reason: 'too_complex' });
    const err = await extractDocument(pdfWith(resumeLines), {
      limits: { timeoutMs: 60_000, maxOldGenerationSizeMb: 8 },
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ reason: 'too_complex' });
  }, 60_000);

  it('reports a damaged PDF as corrupt, with the worker error kept as the cause', async () => {
    const err = (await extractDocument(
      new TextEncoder().encode('%PDF-1.4\nnot really a pdf'),
    ).catch((e: unknown) => e)) as DocumentRejectedError;
    expect(err).toBeInstanceOf(DocumentRejectedError);
    expect(err.reason).toBe('corrupt');
    expect(err.message).toMatch(/damaged or password protected/);
    expect(err.cause).toBeInstanceOf(PdfUnreadableError);
  });
});
