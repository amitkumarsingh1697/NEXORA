import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
  type IParagraphOptions,
} from 'docx';
import type { ResumeContent, SectionKey } from '../resume/model';
import { TEMPLATES, type TemplateId } from './templates';

const SECTION_TITLES: Record<Exclude<SectionKey, 'custom'>, string> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  achievements: 'Achievements',
  publications: 'Publications',
  languages: 'Languages',
};

export function formatDate(d: string | null): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y ?? '';
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${names[Number(m) - 1]} ${y}`;
}

export function formatRange(start: string | null, end: string | null, current = false): string {
  const s = formatDate(start);
  const e = current ? 'Present' : formatDate(end);
  return s && e ? `${s} – ${e}` : s || e;
}

/**
 * Plain-text lines in the order they are rendered. Used both to build the DOCX
 * and to verify that an export contains exactly the approved content.
 */
export function renderLines(
  r: ResumeContent,
): { kind: 'name' | 'contact' | 'heading' | 'entry' | 'meta' | 'bullet' | 'text'; text: string }[] {
  const lines: {
    kind: 'name' | 'contact' | 'heading' | 'entry' | 'meta' | 'bullet' | 'text';
    text: string;
  }[] = [];
  if (r.personal.fullName) lines.push({ kind: 'name', text: r.personal.fullName });
  if (r.personal.headline) lines.push({ kind: 'meta', text: r.personal.headline });
  const contact = [
    r.personal.email,
    r.personal.phone,
    r.personal.location,
    ...r.personal.links.map((l) => l.url),
  ]
    .filter(Boolean)
    .join(' | ');
  if (contact) lines.push({ kind: 'contact', text: contact });
  for (const key of r.sectionOrder) {
    switch (key) {
      case 'summary':
        if (r.summary.trim()) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.summary });
          for (const p of r.summary.split(/\n{2,}/)) lines.push({ kind: 'text', text: p.trim() });
        }
        break;
      case 'skills':
        if (r.skills.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.skills });
          const groups = new Map<string, string[]>();
          for (const s of r.skills)
            groups.set(s.category ?? '', [...(groups.get(s.category ?? '') ?? []), s.name]);
          for (const [cat, names] of groups)
            lines.push({
              kind: 'text',
              text: cat ? `${cat}: ${names.join(', ')}` : names.join(', '),
            });
        }
        break;
      case 'experience':
        if (r.experience.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.experience });
          for (const e of r.experience) {
            lines.push({ kind: 'entry', text: [e.title, e.company].filter(Boolean).join(', ') });
            const meta = [formatRange(e.startDate, e.endDate, e.current), e.location]
              .filter(Boolean)
              .join(' | ');
            if (meta) lines.push({ kind: 'meta', text: meta });
            for (const b of e.bullets) lines.push({ kind: 'bullet', text: b.text });
          }
        }
        break;
      case 'projects':
        if (r.projects.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.projects });
          for (const p of r.projects) {
            lines.push({ kind: 'entry', text: [p.name, p.role].filter(Boolean).join(' — ') });
            if (p.url) lines.push({ kind: 'meta', text: p.url });
            for (const b of p.bullets) lines.push({ kind: 'bullet', text: b.text });
          }
        }
        break;
      case 'education':
        if (r.education.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.education });
          for (const ed of r.education) {
            lines.push({
              kind: 'entry',
              text: [[ed.degree, ed.field].filter(Boolean).join(' in '), ed.institution]
                .filter(Boolean)
                .join(', '),
            });
            const meta = [formatRange(ed.startDate, ed.endDate), ed.details]
              .filter(Boolean)
              .join(' | ');
            if (meta) lines.push({ kind: 'meta', text: meta });
          }
        }
        break;
      case 'certifications':
        if (r.certifications.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.certifications });
          for (const c of r.certifications)
            lines.push({
              kind: 'bullet',
              text: [c.name, c.issuer, formatDate(c.date)].filter(Boolean).join(' — '),
            });
        }
        break;
      case 'achievements':
      case 'publications':
        if (r[key].length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES[key] });
          for (const a of r[key]) lines.push({ kind: 'bullet', text: a.text });
        }
        break;
      case 'languages':
        if (r.languages.length) {
          lines.push({ kind: 'heading', text: SECTION_TITLES.languages });
          lines.push({
            kind: 'text',
            text: r.languages
              .map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name))
              .join(', '),
          });
        }
        break;
      case 'custom':
        for (const c of r.custom) {
          if (!c.items.length) continue;
          lines.push({ kind: 'heading', text: c.title });
          for (const it of c.items) lines.push({ kind: 'bullet', text: it.text });
        }
        break;
    }
  }
  return lines;
}

/** Generate an editable, single-column DOCX with no tables, headers, footers or images. */
export async function renderDocx(content: ResumeContent, templateId: TemplateId): Promise<Buffer> {
  const t = TEMPLATES[templateId];
  const paras: Paragraph[] = [];
  for (const line of renderLines(content)) {
    const base: IParagraphOptions = {};
    switch (line.kind) {
      case 'name':
        paras.push(
          new Paragraph({
            ...base,
            alignment: templateId === 'classic' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: line.text,
                bold: true,
                size: t.nameSize,
                font: t.font,
                color: t.accentColor,
              }),
            ],
          }),
        );
        break;
      case 'contact':
        paras.push(
          new Paragraph({
            alignment: templateId === 'classic' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { after: 120 },
            children: [new TextRun({ text: line.text, size: t.bodySize - 2, font: t.font })],
          }),
        );
        break;
      case 'heading':
        paras.push(
          new Paragraph({
            spacing: { before: 200, after: 80 },
            border: t.headingRule
              ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }
              : undefined,
            children: [
              new TextRun({
                text: t.headingUppercase ? line.text.toUpperCase() : line.text,
                bold: true,
                size: t.headingSize,
                font: t.font,
                color: t.headingColor,
              }),
            ],
          }),
        );
        break;
      case 'entry':
        paras.push(
          new Paragraph({
            spacing: { before: 100, after: 20 },
            children: [
              new TextRun({ text: line.text, bold: true, size: t.bodySize + 1, font: t.font }),
            ],
          }),
        );
        break;
      case 'meta':
        paras.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: line.text,
                italics: true,
                size: t.bodySize - 1,
                font: t.font,
                color: templateId === 'modern' ? '555555' : '000000',
              }),
            ],
          }),
        );
        break;
      case 'bullet':
        paras.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 30 },
            children: [new TextRun({ text: line.text, size: t.bodySize, font: t.font })],
          }),
        );
        break;
      case 'text':
        paras.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: line.text, size: t.bodySize, font: t.font })],
          }),
        );
        break;
    }
  }
  const doc = new Document({
    creator: 'CVForge',
    title: content.personal.fullName ? `${content.personal.fullName} — Resume` : 'Resume',
    styles: { default: { document: { run: { font: t.font, size: t.bodySize } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        children: paras,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
