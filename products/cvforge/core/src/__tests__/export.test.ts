import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { parseResumeText } from '../resume/parse';
import { renderDocx } from '../export/docx';
import { verifyExportText } from '../export/verify';
import { extractDocument, sniffDocumentKind, DocumentRejectedError } from '../resume/extract';
import { convertDocxToPdf } from '../export/pdf';
import { computeAtsCompatibility } from '../scoring/ats';
import { SAMPLE_RESUME_TEXT } from './fixtures/samples';

const resume = parseResumeText(SAMPLE_RESUME_TEXT).content;
let hasSoffice = true;
try {
  execFileSync('soffice', ['--version'], { stdio: 'ignore' });
} catch {
  hasSoffice = false;
}

describe('file signature validation', () => {
  it('rejects non-documents regardless of extension', async () => {
    expect(await sniffDocumentKind(new TextEncoder().encode('<html>hi</html>'))).toBeNull();
    await expect(extractDocument(new TextEncoder().encode('MZ executable'))).rejects.toBeInstanceOf(
      DocumentRejectedError,
    );
    await expect(extractDocument(new Uint8Array())).rejects.toMatchObject({ reason: 'empty' });
    await expect(extractDocument(new Uint8Array(11 * 1024 * 1024))).rejects.toMatchObject({
      reason: 'too_large',
    });
  });
  it('rejects a zip that is not a Word document', async () => {
    const JSZip = (await import('jszip')).default;
    const z = new JSZip();
    z.file('hello.txt', 'x');
    const bytes = await z.generateAsync({ type: 'uint8array' });
    expect(await sniffDocumentKind(bytes)).toBeNull();
  });
  it('rejects macro-enabled documents', async () => {
    const JSZip = (await import('jszip')).default;
    const z = new JSZip();
    z.file(
      '[Content_Types].xml',
      '<Types><Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>',
    );
    z.file('word/document.xml', '<w:document/>');
    await expect(
      sniffDocumentKind(await z.generateAsync({ type: 'uint8array' })),
    ).rejects.toMatchObject({ reason: 'macro_enabled' });
  });
});

describe.each(['classic', 'modern'] as const)('DOCX export (%s)', (tpl) => {
  it('round-trips: exported DOCX contains exactly the approved content and parses back', async () => {
    const buf = await renderDocx(resume, tpl);
    expect(await sniffDocumentKind(buf)).toBe('docx');
    const ex = await extractDocument(buf);
    expect(verifyExportText(resume, ex.text)).toMatchObject({ ok: true, missing: [] });
    expect(ex.layout.hasTables).toBe(false);
    expect(ex.layout.headerFooterText).toEqual([]);
    expect(ex.layout.multiColumnRatio).toBe(0);
    const reparsed = parseResumeText(ex.text);
    expect(reparsed.content.experience).toHaveLength(2);
    expect(reparsed.content.personal.email).toBe(resume.personal.email);
    const ats = computeAtsCompatibility({ layout: ex.layout, content: reparsed.content });
    expect(ats.value).toBeGreaterThanOrEqual(90);
  });
  it('verification detects content that is not in the export', async () => {
    const buf = await renderDocx(resume, tpl);
    const ex = await extractDocument(buf);
    const other = structuredClone(resume);
    other.experience[0]!.bullets.push({ id: 'zz', text: 'A bullet that was never exported' });
    expect(verifyExportText(other, ex.text).missing).toEqual(['A bullet that was never exported']);
  });
});

describe.skipIf(!hasSoffice)('PDF export via LibreOffice', () => {
  it('produces a PDF with the same approved content', async () => {
    const pdf = await convertDocxToPdf(await renderDocx(resume, 'modern'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const ex = await extractDocument(pdf);
    expect(ex.kind).toBe('pdf');
    expect(ex.layout.multiColumnRatio).toBeLessThan(0.1);
    expect(verifyExportText(resume, ex.text)).toMatchObject({ ok: true });
    const reparsed = parseResumeText(ex.text);
    expect(reparsed.content.personal.fullName).toBe('Priya Sharma');
    expect(reparsed.content.experience.length).toBe(2);
  }, 90_000);
});
