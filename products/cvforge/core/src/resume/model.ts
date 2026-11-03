import { z } from 'zod';
import { TEMPLATE_IDS } from '../export/templates';

/**
 * Structured resume representation. Every list item carries a stable `id` so
 * suggestions, diffs and evidence references can point at exact content.
 */
const id = z.string().min(1).max(64);
const text = (max = 2000) => z.string().max(max);

export const linkSchema = z.object({ id, label: text(100), url: text(500) });
export const bulletSchema = z.object({ id, text: text(1500) });
export const skillSchema = z.object({ id, name: text(120), category: text(80).optional() });

/** Dates are "YYYY-MM" or "YYYY" strings as written by the user; null when absent. */
export const partialDate = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use YYYY or YYYY-MM')
  .nullable();

export const experienceSchema = z.object({
  id,
  title: text(200),
  company: text(200),
  location: text(200).default(''),
  startDate: partialDate.default(null),
  endDate: partialDate.default(null),
  current: z.boolean().default(false),
  bullets: z.array(bulletSchema).max(100).default([]),
});

export const projectSchema = z.object({
  id,
  name: text(200),
  role: text(200).default(''),
  url: text(500).default(''),
  bullets: z.array(bulletSchema).max(50).default([]),
});

export const educationSchema = z.object({
  id,
  institution: text(200),
  degree: text(200).default(''),
  field: text(200).default(''),
  startDate: partialDate.default(null),
  endDate: partialDate.default(null),
  details: text(1000).default(''),
});

export const certificationSchema = z.object({
  id,
  name: text(200),
  issuer: text(200).default(''),
  date: partialDate.default(null),
});

export const simpleItemSchema = z.object({ id, text: text(1500) });

export const languageSchema = z.object({
  id,
  name: text(80),
  /** Free text or CEFR level, user controlled. */
  proficiency: text(80).default(''),
});

export const customSectionSchema = z.object({
  id,
  title: text(120),
  items: z.array(simpleItemSchema).max(100).default([]),
});

export const SECTION_KEYS = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'achievements',
  'publications',
  'languages',
  'custom',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const resumeContentSchema = z.object({
  personal: z.object({
    fullName: text(200).default(''),
    headline: text(300).default(''),
    email: text(254).default(''),
    phone: text(50).default(''),
    location: text(200).default(''),
    links: z.array(linkSchema).max(10).default([]),
  }),
  summary: text(4000).default(''),
  skills: z.array(skillSchema).max(300).default([]),
  experience: z.array(experienceSchema).max(60).default([]),
  projects: z.array(projectSchema).max(60).default([]),
  education: z.array(educationSchema).max(30).default([]),
  certifications: z.array(certificationSchema).max(60).default([]),
  achievements: z.array(simpleItemSchema).max(100).default([]),
  publications: z.array(simpleItemSchema).max(100).default([]),
  languages: z.array(languageSchema).max(30).default([]),
  custom: z.array(customSectionSchema).max(20).default([]),
  sectionOrder: z.array(z.enum(SECTION_KEYS)).default([...SECTION_KEYS]),
  /**
   * Preferred export template, chosen by the user and stored on the version so that formatting
   * changes are versioned and diffed (RI-4.8-05). Absent on versions created before it existed;
   * exports then fall back to whatever template the user picks on the export screen.
   */
  template: z.enum(TEMPLATE_IDS).optional(),
});

export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Bullet = z.infer<typeof bulletSchema>;
export type Skill = z.infer<typeof skillSchema>;

export function emptyResume(): ResumeContent {
  return resumeContentSchema.parse({ personal: {} });
}

let counter = 0;
/** Short unique id for resume items. Not security sensitive. */
export function newItemId(prefix = 'i'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A pointer to a piece of resume text, used for evidence and suggestions. */
export interface ResumeLocation {
  section: SectionKey | 'personal';
  itemId?: string;
  bulletId?: string;
  field?: string;
}

export interface ResumeTextUnit {
  location: ResumeLocation;
  text: string;
  /** Context label shown to users, e.g. "Senior Engineer at Acme". */
  context: string;
}

/** Flatten a resume into addressable text units (used for evidence search). */
export function resumeTextUnits(r: ResumeContent): ResumeTextUnit[] {
  const units: ResumeTextUnit[] = [];
  if (r.personal.headline) {
    units.push({
      location: { section: 'personal', field: 'headline' },
      text: r.personal.headline,
      context: 'Headline',
    });
  }
  if (r.summary)
    units.push({ location: { section: 'summary' }, text: r.summary, context: 'Summary' });
  for (const s of r.skills) {
    units.push({ location: { section: 'skills', itemId: s.id }, text: s.name, context: 'Skills' });
  }
  for (const e of r.experience) {
    const ctx = [e.title, e.company].filter(Boolean).join(' at ');
    if (e.title)
      units.push({
        location: { section: 'experience', itemId: e.id, field: 'title' },
        text: e.title,
        context: ctx,
      });
    for (const b of e.bullets) {
      units.push({
        location: { section: 'experience', itemId: e.id, bulletId: b.id },
        text: b.text,
        context: ctx,
      });
    }
  }
  for (const p of r.projects) {
    const ctx = `Project: ${p.name}`;
    units.push({
      location: { section: 'projects', itemId: p.id, field: 'name' },
      text: [p.name, p.role].filter(Boolean).join(' — '),
      context: ctx,
    });
    for (const b of p.bullets)
      units.push({
        location: { section: 'projects', itemId: p.id, bulletId: b.id },
        text: b.text,
        context: ctx,
      });
  }
  for (const ed of r.education) {
    units.push({
      location: { section: 'education', itemId: ed.id },
      text: [ed.degree, ed.field, ed.institution, ed.details].filter(Boolean).join(', '),
      context: 'Education',
    });
  }
  for (const c of r.certifications) {
    units.push({
      location: { section: 'certifications', itemId: c.id },
      text: [c.name, c.issuer].filter(Boolean).join(' — '),
      context: 'Certifications',
    });
  }
  for (const a of r.achievements)
    units.push({
      location: { section: 'achievements', itemId: a.id },
      text: a.text,
      context: 'Achievements',
    });
  for (const p of r.publications)
    units.push({
      location: { section: 'publications', itemId: p.id },
      text: p.text,
      context: 'Publications',
    });
  for (const l of r.languages) {
    units.push({
      location: { section: 'languages', itemId: l.id },
      text: [l.name, l.proficiency].filter(Boolean).join(' '),
      context: 'Languages',
    });
  }
  for (const c of r.custom) {
    for (const it of c.items)
      units.push({
        location: { section: 'custom', itemId: it.id, field: c.id },
        text: it.text,
        context: c.title,
      });
  }
  return units;
}
