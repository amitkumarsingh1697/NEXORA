import type { ResumeContent } from '../resume/model';
import { renderLines } from './docx';

export interface ExportVerification {
  ok: boolean;
  checked: number;
  missing: string[];
}

const squash = (s: string) =>
  s
    .replace(/[\s\u00a0\u2022]+/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .toLowerCase();

/**
 * Verify that extracted export text contains every rendered line of the
 * approved version (whitespace-insensitive, since PDF line wrapping differs).
 */
export function verifyExportText(
  content: ResumeContent,
  extractedText: string,
): ExportVerification {
  const hay = squash(extractedText);
  const expected = renderLines(content)
    .filter((l) => l.kind !== 'heading')
    .map((l) => l.text)
    .filter(Boolean);
  const missing = expected.filter((t) => !hay.includes(squash(t)));
  return { ok: missing.length === 0, checked: expected.length, missing };
}
