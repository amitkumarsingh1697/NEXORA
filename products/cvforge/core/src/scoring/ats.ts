import type { LayoutSignals } from '../resume/extract';
import type { ResumeContent } from '../resume/model';
import { clamp100, normaliseWeights, type ExplainedScore } from './types';

export interface AtsInput {
  layout: LayoutSignals | null;
  content: ResumeContent;
  /** Section headings detected in the original document, with whether each was recognised. */
  headings?: { title: string; recognised: boolean }[];
}

interface Check {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  explanation: string;
  fix?: string;
}

/**
 * ATS Compatibility: how parseable the document is. This measures structure
 * and readability only; it is not any employer's actual ATS result.
 */
export function computeAtsCompatibility(input: AtsInput): ExplainedScore {
  const { layout, content } = input;
  const checks: Check[] = [];
  const headings = input.headings ?? [];
  const rec = headings.filter((h) => h.recognised).length;
  checks.push({
    key: 'headings',
    label: 'Standard section headings',
    weight: 0.15,
    score: headings.length ? (rec / headings.length) * 100 : null,
    explanation: headings.length
      ? `${rec} of ${headings.length} headings use standard names.`
      : 'Headings were not captured for this document.',
    fix: 'Use conventional headings such as Summary, Skills, Experience, Education.',
  });
  checks.push({
    key: 'extraction',
    label: 'Text extraction quality',
    weight: 0.2,
    score: layout ? (layout.charsPerPage >= 800 ? 100 : layout.charsPerPage >= 200 ? 60 : 0) : null,
    explanation: layout
      ? `About ${layout.charsPerPage} characters of text per page were extractable.`
      : 'No source document.',
    fix: 'Avoid scanned or image-based PDFs; export directly from a word processor.',
  });
  checks.push({
    key: 'reading_order',
    label: 'Reading order and columns',
    weight: 0.15,
    score: layout
      ? layout.multiColumnRatio < 0.1
        ? 100
        : layout.multiColumnRatio < 0.3
          ? 60
          : 20
      : null,
    explanation: layout
      ? layout.multiColumnRatio < 0.1
        ? 'Single-column reading order.'
        : 'Multi-column layout detected; text may be read out of order.'
      : 'No source document.',
    fix: 'Use a single-column layout.',
  });
  checks.push({
    key: 'tables',
    label: 'Tables',
    weight: 0.1,
    score: layout ? (layout.hasTables ? 40 : 100) : null,
    explanation: layout
      ? layout.hasTables
        ? 'Tables detected.'
        : 'No layout tables detected (tables in PDFs cannot be reliably detected).'
      : 'No source document.',
    fix: 'Replace layout tables with plain paragraphs and bullets.',
  });
  const hf = layout?.headerFooterText ?? [];
  const contactInHf = hf.some((t) => /@|\+?\d[\d\s-]{7,}/.test(t));
  checks.push({
    key: 'header_footer',
    label: 'Header and footer placement',
    weight: 0.1,
    score: layout ? (contactInHf ? 20 : hf.length ? 70 : 100) : null,
    explanation: layout
      ? contactInHf
        ? 'Contact details are in the page header/footer, which some parsers skip.'
        : hf.length
          ? 'Some text is in headers/footers.'
          : 'No important content in headers or footers.'
      : 'No source document.',
    fix: 'Move contact details into the main body.',
  });
  const contacts = [
    content.personal.email,
    content.personal.phone,
    content.personal.fullName,
  ].filter(Boolean).length;
  checks.push({
    key: 'contact',
    label: 'Contact information extraction',
    weight: 0.15,
    score: (contacts / 3) * 100,
    explanation: `${contacts} of 3 (name, email, phone) were recognised.`,
    fix: 'Put your name, email and phone as plain text at the top.',
  });
  const present = ['experience', 'education', 'skills'].filter(
    (k) => (content[k as 'experience' | 'education' | 'skills'] as unknown[]).length > 0,
  );
  checks.push({
    key: 'sections',
    label: 'Section recognition',
    weight: 0.1,
    score: (present.length / 3) * 100,
    explanation: `${present.length} of 3 core sections (experience, education, skills) were recognised.`,
    fix: 'Make sure Experience, Education and Skills each have a clear heading.',
  });
  checks.push({
    key: 'formatting',
    label: 'Fonts and formatting complexity',
    weight: 0.05,
    score: layout
      ? Math.max(0, 100 - Math.max(0, layout.fontCount - 4) * 15 - layout.imageCount * 20)
      : null,
    explanation: layout
      ? `${layout.fontCount} font(s), ${layout.imageCount} image(s).`
      : 'No source document.',
    fix: 'Use one or two standard fonts and avoid images or icons for important text.',
  });

  const normalised = normaliseWeights(checks);
  const assessed = normalised.filter((c) => c.score !== null);
  const value = assessed.length
    ? clamp100(normalised.reduce((n, c) => n + (c.score ?? 0) * c.effectiveWeight, 0))
    : null;
  return {
    name: 'ATS Compatibility',
    value,
    range: null,
    components: normalised.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      effectiveWeight: Math.round(c.effectiveWeight * 1000) / 1000,
      score: c.score === null ? null : clamp100(c.score),
      explanation: c.explanation,
    })),
    basis:
      'Weighted checks of document structure and parser readability. This is not an employer ATS score and does not predict screening outcomes.',
    positives: normalised
      .filter((c) => (c.score ?? 0) >= 90)
      .map((c) => `${c.label}: ${c.explanation}`),
    gaps: normalised
      .filter((c) => c.score !== null && c.score < 70)
      .map((c) => `${c.label}: ${c.explanation}`),
    uncertainty: [
      ...normalised.filter((c) => c.score === null).map((c) => `${c.label} could not be assessed.`),
      'Real applicant tracking systems differ; these checks reflect common parsing failure modes.',
    ],
    recommendations: normalised
      .filter((c) => c.score !== null && c.score < 70 && c.fix)
      .map((c) => c.fix as string),
  };
}
