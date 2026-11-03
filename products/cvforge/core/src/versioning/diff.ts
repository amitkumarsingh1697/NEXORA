import { diffWordsWithSpace } from 'diff';
import type { ResumeContent, SectionKey } from '../resume/model';

export type ChangeType = 'added' | 'removed' | 'modified' | 'reordered';

export interface WordPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface ResumeChange {
  type: ChangeType;
  section: SectionKey | 'personal';
  label: string;
  before: string | null;
  after: string | null;
  words?: WordPart[];
}

export interface ResumeDiff {
  changes: ResumeChange[];
  counts: Record<ChangeType, number>;
}

function words(a: string, b: string): WordPart[] {
  return diffWordsWithSpace(a, b).map((p) => ({
    value: p.value,
    added: p.added || undefined,
    removed: p.removed || undefined,
  }));
}

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

interface Identified {
  id: string;
}

function describe(section: SectionKey, item: Record<string, unknown>): string {
  switch (section) {
    case 'experience':
      return [item.title, item.company].filter(Boolean).join(' at ') || 'Role';
    case 'projects':
      return text(item.name) || 'Project';
    case 'education':
      return [item.degree, item.institution].filter(Boolean).join(', ') || 'Education';
    case 'certifications':
      return text(item.name);
    case 'skills':
      return text(item.name);
    case 'languages':
      return text(item.name);
    case 'custom':
      return text(item.title);
    default:
      return text(item.text);
  }
}

function flat(section: SectionKey, item: Record<string, unknown>): string {
  const skip = new Set(['id', 'bullets', 'items']);
  return Object.entries(item)
    .filter(([k]) => !skip.has(k))
    .map(([, v]) => text(v))
    .filter(Boolean)
    .join(' · ');
}

function orderChanged(a: string[], b: string[]): boolean {
  const common = new Set(a.filter((x) => b.includes(x)));
  const fa = a.filter((x) => common.has(x));
  const fb = b.filter((x) => common.has(x));
  return fa.join() !== fb.join();
}

function diffList<T extends Identified>(
  section: SectionKey,
  a: T[],
  b: T[],
  out: ResumeChange[],
  nested?: { key: 'bullets' | 'items'; label: string },
) {
  const ma = new Map(a.map((x) => [x.id, x]));
  const mb = new Map(b.map((x) => [x.id, x]));
  for (const x of b) {
    const rec = x as unknown as Record<string, unknown>;
    if (!ma.has(x.id)) {
      out.push({
        type: 'added',
        section,
        label: describe(section, rec),
        before: null,
        after: flat(section, rec),
      });
      continue;
    }
    const prev = ma.get(x.id) as unknown as Record<string, unknown>;
    const before = flat(section, prev);
    const after = flat(section, rec);
    if (before !== after)
      out.push({
        type: 'modified',
        section,
        label: describe(section, rec),
        before,
        after,
        words: words(before, after),
      });
    if (nested) {
      const pa = (prev[nested.key] as { id: string; text: string }[]) ?? [];
      const pb = (rec[nested.key] as { id: string; text: string }[]) ?? [];
      const ia = new Map(pa.map((p) => [p.id, p]));
      const ib = new Map(pb.map((p) => [p.id, p]));
      const where = describe(section, rec);
      for (const p of pb) {
        const old = ia.get(p.id);
        if (!old)
          out.push({
            type: 'added',
            section,
            label: `${nested.label} in ${where}`,
            before: null,
            after: p.text,
          });
        else if (old.text !== p.text)
          out.push({
            type: 'modified',
            section,
            label: `${nested.label} in ${where}`,
            before: old.text,
            after: p.text,
            words: words(old.text, p.text),
          });
      }
      for (const p of pa)
        if (!ib.has(p.id))
          out.push({
            type: 'removed',
            section,
            label: `${nested.label} in ${where}`,
            before: p.text,
            after: null,
          });
      if (
        orderChanged(
          pa.map((p) => p.id),
          pb.map((p) => p.id),
        )
      ) {
        out.push({
          type: 'reordered',
          section,
          label: `${nested.label}s in ${where}`,
          before: pa.map((p) => p.text.slice(0, 40)).join(' | '),
          after: pb.map((p) => p.text.slice(0, 40)).join(' | '),
        });
      }
    }
  }
  for (const x of a) {
    if (!mb.has(x.id)) {
      const rec = x as unknown as Record<string, unknown>;
      out.push({
        type: 'removed',
        section,
        label: describe(section, rec),
        before: flat(section, rec),
        after: null,
      });
    }
  }
  if (
    orderChanged(
      a.map((x) => x.id),
      b.map((x) => x.id),
    )
  ) {
    out.push({
      type: 'reordered',
      section,
      label: `${section} order`,
      before: a.map((x) => describe(section, x as unknown as Record<string, unknown>)).join(', '),
      after: b.map((x) => describe(section, x as unknown as Record<string, unknown>)).join(', '),
    });
  }
}

/** Structured, section-aware diff between two resume contents. */
export function diffResumes(a: ResumeContent, b: ResumeContent): ResumeDiff {
  const out: ResumeChange[] = [];
  for (const k of ['fullName', 'headline', 'email', 'phone', 'location'] as const) {
    if (a.personal[k] !== b.personal[k]) {
      out.push({
        type: !a.personal[k] ? 'added' : !b.personal[k] ? 'removed' : 'modified',
        section: 'personal',
        label: k,
        before: a.personal[k] || null,
        after: b.personal[k] || null,
        words: words(a.personal[k], b.personal[k]),
      });
    }
  }
  diffList('custom', a.personal.links as Identified[], b.personal.links as Identified[], []);
  if (a.summary !== b.summary) {
    out.push({
      type: !a.summary ? 'added' : !b.summary ? 'removed' : 'modified',
      section: 'summary',
      label: 'Summary',
      before: a.summary || null,
      after: b.summary || null,
      words: words(a.summary, b.summary),
    });
  }
  diffList('skills', a.skills, b.skills, out);
  diffList('experience', a.experience, b.experience, out, { key: 'bullets', label: 'Bullet' });
  diffList('projects', a.projects, b.projects, out, { key: 'bullets', label: 'Bullet' });
  diffList('education', a.education, b.education, out);
  diffList('certifications', a.certifications, b.certifications, out);
  diffList('achievements', a.achievements, b.achievements, out);
  diffList('publications', a.publications, b.publications, out);
  diffList('languages', a.languages, b.languages, out);
  diffList('custom', a.custom, b.custom, out, { key: 'items', label: 'Item' });
  if (a.sectionOrder.join() !== b.sectionOrder.join()) {
    out.push({
      type: 'reordered',
      section: 'summary',
      label: 'Section order',
      before: a.sectionOrder.join(', '),
      after: b.sectionOrder.join(', '),
    });
  }
  const counts = { added: 0, removed: 0, modified: 0, reordered: 0 } as Record<ChangeType, number>;
  for (const c of out) counts[c.type]++;
  return { changes: out, counts };
}
