import { newItemId, resumeContentSchema, type ResumeContent, type SectionKey } from './model';
import { parseDateRange } from './dates';

const HEADINGS: Record<Exclude<SectionKey, 'custom'>, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'profile',
    'professional profile',
    'about me',
    'about',
    'objective',
    'career objective',
    'executive summary',
    'career summary',
    'overview',
  ],
  skills: [
    'skills',
    'technical skills',
    'core competencies',
    'key skills',
    'technologies',
    'tech stack',
    'technical expertise',
    'expertise',
    'skills & tools',
    'skills and tools',
    'core skills',
    'competencies',
    'areas of expertise',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
    'employment',
    'work history',
    'career history',
    'relevant experience',
    'professional background',
  ],
  projects: [
    'projects',
    'key projects',
    'personal projects',
    'selected projects',
    'project experience',
  ],
  education: [
    'education',
    'academic background',
    'academics',
    'education & training',
    'education and training',
    'academic qualifications',
  ],
  certifications: [
    'certifications',
    'certification',
    'certificates',
    'licenses & certifications',
    'licenses and certifications',
    'courses & certifications',
  ],
  achievements: [
    'achievements',
    'awards',
    'honors',
    'honours',
    'accomplishments',
    'awards & recognition',
    'awards and recognition',
    'key achievements',
  ],
  publications: ['publications', 'papers', 'talks', 'publications & talks', 'patents'],
  languages: ['languages', 'language proficiency', 'spoken languages'],
};

const headingLookup = new Map<string, Exclude<SectionKey, 'custom'>>();
for (const [key, names] of Object.entries(HEADINGS)) {
  for (const n of names) headingLookup.set(n, key as Exclude<SectionKey, 'custom'>);
}

export function detectHeading(line: string): Exclude<SectionKey, 'custom'> | 'custom' | null {
  const norm = line
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (headingLookup.has(norm)) return headingLookup.get(norm) ?? null;
  // An ALL-CAPS short line with no digits/punctuation is treated as an unknown custom heading.
  if (/^[A-Z][A-Z &/]{2,40}$/.test(line.trim()) && line.trim().split(/\s+/).length <= 4)
    return 'custom';
  return null;
}

const BULLET_RE = /^\s*(?:[•●▪◦‣∙·\-*–]|\d+[.)])\s+/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/[^\s|,]+|github\.com\/[^\s|,]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s|,]*)/i;
const ROLE_WORDS =
  /\b(engineer|developer|architect|manager|lead|consultant|analyst|director|head|principal|intern|scientist|administrator|specialist|officer|vp|vice president|cto|cio|programmer|designer|associate|fellow|owner|sre|devops)\b/i;
const DEGREE_RE =
  /\b(b\.?\s?tech|m\.?\s?tech|b\.?e\b|m\.?e\b|b\.?sc|m\.?sc|bsc|msc|bachelor|master|mba|phd|ph\.d|doctorate|diploma|b\.?a\b|m\.?a\b|bca|mca|b\.?s\b|m\.?s\b|associate degree|a-levels|high school)/i;
const INSTITUTION_RE = /\b(university|college|institute|school|academy|iit|nit|polytechnic)\b/i;

export interface SectionConfidence {
  section: SectionKey | 'personal';
  confidence: number;
  note: string;
}

export interface ParseResult {
  content: ResumeContent;
  confidence: { overall: number; sections: SectionConfidence[] };
  unassignedLines: string[];
  warnings: string[];
}

function splitList(line: string): string[] {
  return line
    .split(/[,;|•·]|\s{2,}/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 0 && s.length <= 60);
}

function stripBullet(line: string) {
  return line.replace(BULLET_RE, '').trim();
}

/** Split an entry header ("Senior Engineer | Acme Corp | Pune") into title/company/location. */
function splitHeader(text: string): { title: string; company: string; location: string } {
  const parts = text
    .split(/\s+[|–—]\s+|\s+-\s+|\s+at\s+|,\s+|\s+@\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { title: '', company: '', location: '' };
  const titleIdx = parts.findIndex((p) => ROLE_WORDS.test(p));
  if (titleIdx === -1)
    return { title: '', company: parts[0] ?? '', location: parts.slice(1).join(', ') };
  const title = parts[titleIdx] ?? '';
  const rest = parts.filter((_, i) => i !== titleIdx);
  return { title, company: rest[0] ?? '', location: rest.slice(1).join(', ') };
}

/**
 * Deterministic resume parser. It is intentionally conservative: anything it
 * cannot place is returned in `unassignedLines` so the user can review it,
 * rather than being silently dropped.
 */
export function parseResumeText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const blocks: { key: SectionKey | 'personal'; title: string; lines: string[] }[] = [
    { key: 'personal', title: 'Personal', lines: [] },
  ];
  for (const line of lines) {
    const h = detectHeading(line);
    if (h) blocks.push({ key: h, title: line.replace(/[:：]\s*$/, '').trim(), lines: [] });
    else blocks[blocks.length - 1]?.lines.push(line);
  }

  const draft = resumeContentSchema.parse({ personal: {} });
  const unassigned: string[] = [];
  const warnings: string[] = [];
  const conf: SectionConfidence[] = [];
  const order: SectionKey[] = [];

  for (const block of blocks) {
    if (block.key !== 'personal' && !order.includes(block.key)) order.push(block.key);
    switch (block.key) {
      case 'personal':
        parsePersonal(block.lines, draft, unassigned, conf);
        break;
      case 'summary':
        draft.summary = [draft.summary, block.lines.map(stripBullet).join(' ')]
          .filter(Boolean)
          .join('\n\n');
        conf.push({
          section: 'summary',
          confidence: draft.summary ? 0.9 : 0.3,
          note: 'Summary paragraph detected.',
        });
        break;
      case 'skills': {
        for (const l of block.lines) {
          const s = stripBullet(l);
          const colon = /^([^:]{2,40}):\s*(.+)$/.exec(s);
          const category = colon?.[1]?.trim();
          for (const name of splitList(colon?.[2] ?? s)) {
            if (!draft.skills.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
              draft.skills.push({ id: newItemId('sk'), name, category });
            }
          }
        }
        conf.push({
          section: 'skills',
          confidence: draft.skills.length ? 0.85 : 0.3,
          note: `${draft.skills.length} skills recognised.`,
        });
        break;
      }
      case 'experience': {
        const before = draft.experience.length;
        parseExperience(block.lines, draft, unassigned);
        const added = draft.experience.slice(before);
        const withDates = added.filter((e) => e.startDate).length;
        const withTitle = added.filter((e) => e.title).length;
        const c = added.length
          ? 0.4 + 0.3 * (withDates / added.length) + 0.3 * (withTitle / added.length)
          : 0.2;
        conf.push({
          section: 'experience',
          confidence: Math.round(c * 100) / 100,
          note: `${added.length} roles, ${withDates} with dates, ${withTitle} with titles.`,
        });
        break;
      }
      case 'projects':
        parseProjects(block.lines, draft);
        conf.push({
          section: 'projects',
          confidence: draft.projects.length ? 0.7 : 0.3,
          note: `${draft.projects.length} projects.`,
        });
        break;
      case 'education':
        parseEducation(block.lines, draft, unassigned);
        conf.push({
          section: 'education',
          confidence: draft.education.length ? 0.75 : 0.3,
          note: `${draft.education.length} entries.`,
        });
        break;
      case 'certifications':
        for (const l of block.lines) {
          const s = stripBullet(l);
          const range = parseDateRange(s);
          const yr = /\b(19|20)\d{2}\b/.exec(s)?.[0] ?? null;
          const [name, issuer] = s
            .replace(range?.matched ?? '', '')
            .split(/\s+[–—-]\s+|\s+by\s+|,\s+/i);
          draft.certifications.push({
            id: newItemId('ce'),
            name: (name ?? s).trim(),
            issuer: (issuer ?? '').trim(),
            date: yr,
          });
        }
        conf.push({
          section: 'certifications',
          confidence: 0.75,
          note: `${draft.certifications.length} certifications.`,
        });
        break;
      case 'achievements':
      case 'publications':
        for (const l of block.lines)
          draft[block.key].push({ id: newItemId(block.key.slice(0, 2)), text: stripBullet(l) });
        conf.push({
          section: block.key,
          confidence: 0.8,
          note: `${draft[block.key].length} items.`,
        });
        break;
      case 'languages':
        for (const l of block.lines) {
          for (const part of splitList(stripBullet(l))) {
            const m = /^([^()\-–:]+)[\s(\-–:]*([^)]*)\)?$/.exec(part);
            draft.languages.push({
              id: newItemId('la'),
              name: (m?.[1] ?? part).trim(),
              proficiency: (m?.[2] ?? '').trim(),
            });
          }
        }
        conf.push({
          section: 'languages',
          confidence: 0.8,
          note: `${draft.languages.length} languages.`,
        });
        break;
      case 'custom':
        draft.custom.push({
          id: newItemId('cu'),
          title: block.title,
          items: block.lines.map((l) => ({ id: newItemId('ci'), text: stripBullet(l) })),
        });
        conf.push({
          section: 'custom',
          confidence: 0.5,
          note: `Unrecognised section "${block.title}" kept as a custom section.`,
        });
        break;
    }
  }
  // Keep detected section order, then any remaining sections.
  draft.sectionOrder = [...order, ...draft.sectionOrder.filter((k) => !order.includes(k))];

  if (!draft.experience.length)
    warnings.push('No employment history was recognised. Please add it manually.');
  if (!draft.personal.email) warnings.push('No email address was found.');
  if (unassigned.length)
    warnings.push(`${unassigned.length} line(s) could not be placed in a section and need review.`);

  const weights = conf.filter((c) =>
    ['personal', 'experience', 'skills', 'education'].includes(c.section),
  );
  const overall = weights.length
    ? weights.reduce((n, c) => n + c.confidence, 0) / weights.length
    : 0.2;
  const penalty = Math.min(0.3, unassigned.length * 0.02);
  return {
    content: resumeContentSchema.parse(draft),
    confidence: {
      overall: Math.max(0, Math.round((overall - penalty) * 100) / 100),
      sections: conf,
    },
    unassignedLines: unassigned,
    warnings,
  };
}

function parsePersonal(
  lines: string[],
  draft: ResumeContent,
  unassigned: string[],
  conf: SectionConfidence[],
) {
  let found = 0;
  for (const [i, line] of lines.entries()) {
    const segments = line
      .split(/\s*[|•·]\s*|\s{3,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    let consumed = false;
    for (const seg of segments) {
      const email = EMAIL_RE.exec(seg)?.[0];
      if (email && !draft.personal.email) {
        draft.personal.email = email;
        consumed = true;
        continue;
      }
      const url = URL_RE.exec(seg)?.[0];
      if (url && !EMAIL_RE.test(seg)) {
        const label = /linkedin/i.test(url)
          ? 'LinkedIn'
          : /github/i.test(url)
            ? 'GitHub'
            : 'Website';
        draft.personal.links.push({ id: newItemId('ln'), label, url });
        consumed = true;
        continue;
      }
      const phone = PHONE_RE.exec(seg)?.[0];
      if (phone && phone.replace(/\D/g, '').length >= 8 && !draft.personal.phone) {
        draft.personal.phone = phone.trim();
        consumed = true;
        continue;
      }
      if (
        i > 0 &&
        /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(seg) &&
        !draft.personal.location &&
        seg.length < 60
      ) {
        draft.personal.location = seg;
        consumed = true;
      }
    }
    if (consumed) continue;
    if (
      !draft.personal.fullName &&
      /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(line) &&
      line.split(' ').length <= 5
    ) {
      draft.personal.fullName = line;
      found++;
      continue;
    }
    if (!draft.personal.headline && line.length <= 160 && i <= 3) {
      draft.personal.headline = line;
      continue;
    }
    // Text before the first heading that is not contact info is likely an untitled summary.
    if (line.length > 80) draft.summary = [draft.summary, line].filter(Boolean).join(' ');
    else unassigned.push(line);
  }
  if (draft.personal.email) found++;
  if (draft.personal.phone) found++;
  conf.push({
    section: 'personal',
    confidence: Math.min(1, 0.3 + found * 0.23),
    note: 'Name and contact details.',
  });
}

function parseExperience(lines: string[], draft: ResumeContent, unassigned: string[]) {
  type Exp = ResumeContent['experience'][number];
  let cur: Exp | null = null;
  const push = () => {
    if (cur && (cur.title || cur.company || cur.bullets.length)) draft.experience.push(cur);
  };
  const fresh = (): Exp => ({
    id: newItemId('ex'),
    title: '',
    company: '',
    location: '',
    startDate: null,
    endDate: null,
    current: false,
    bullets: [],
  });
  for (const line of lines) {
    if (BULLET_RE.test(line)) {
      if (!cur) cur = fresh();
      cur.bullets.push({ id: newItemId('b'), text: stripBullet(line) });
      continue;
    }
    const range = parseDateRange(line);
    if (range) {
      const rest = line
        .replace(range.matched, '')
        .replace(/[()|,–—-]\s*$/, '')
        .replace(/^\s*[|,–—-]\s*/, '')
        .trim();
      // A date line directly after a header line without dates belongs to that header.
      const attachToCurrent =
        cur && !cur.startDate && cur.bullets.length === 0 && (cur.title || cur.company);
      if (!attachToCurrent) {
        push();
        cur = fresh();
      }
      const target = cur as Exp;
      target.startDate = range.start;
      target.endDate = range.end;
      target.current = range.current;
      if (rest) {
        const h = splitHeader(rest);
        if (!target.title) target.title = h.title;
        if (!target.company) target.company = h.company;
        if (!target.location) target.location = h.location;
        if (
          !target.title &&
          !h.title &&
          target.company &&
          h.company &&
          target.company !== h.company
        )
          target.title = h.company;
      }
      continue;
    }
    if (line.length > 110) {
      // Paragraph-style responsibility description.
      if (!cur) cur = fresh();
      cur.bullets.push({ id: newItemId('b'), text: line });
      continue;
    }
    if (cur && cur.bullets.length === 0 && (!cur.title || !cur.company)) {
      const h = splitHeader(line);
      if (!cur.title && h.title) cur.title = h.title;
      if (!cur.company) cur.company = h.company || (cur.title ? line : '');
      if (!cur.location && h.location) cur.location = h.location;
      continue;
    }
    if (ROLE_WORDS.test(line) || !cur || cur.bullets.length > 0) {
      push();
      cur = fresh();
      const h = splitHeader(line);
      cur.title = h.title;
      cur.company = h.company;
      cur.location = h.location;
      continue;
    }
    unassigned.push(line);
  }
  push();
}

function parseProjects(lines: string[], draft: ResumeContent) {
  let cur: ResumeContent['projects'][number] | null = null;
  for (const line of lines) {
    if (BULLET_RE.test(line) && cur) {
      cur.bullets.push({ id: newItemId('b'), text: stripBullet(line) });
      continue;
    }
    if (!BULLET_RE.test(line) && line.length <= 110) {
      if (cur) draft.projects.push(cur);
      const [name, role] = line.split(/\s+[|–—]\s+|\s+-\s+/);
      cur = {
        id: newItemId('pr'),
        name: (name ?? line).trim(),
        role: (role ?? '').trim(),
        url: '',
        bullets: [],
      };
      continue;
    }
    if (!cur) cur = { id: newItemId('pr'), name: 'Project', role: '', url: '', bullets: [] };
    cur.bullets.push({ id: newItemId('b'), text: stripBullet(line) });
  }
  if (cur) draft.projects.push(cur);
}

function parseEducation(lines: string[], draft: ResumeContent, unassigned: string[]) {
  let cur: ResumeContent['education'][number] | null = null;
  const fresh = () => ({
    id: newItemId('ed'),
    institution: '',
    degree: '',
    field: '',
    startDate: null as string | null,
    endDate: null as string | null,
    details: '',
  });
  for (const raw of lines) {
    const line = stripBullet(raw);
    const range = parseDateRange(line);
    const year = range ? null : /\b(19|20)\d{2}\b/.exec(line)?.[0];
    const withoutDates = line
      .replace(range?.matched ?? year ?? '', '')
      .replace(/[()|,–—-]\s*$/, '')
      .trim();
    const isDegree = DEGREE_RE.test(line);
    const isInst = INSTITUTION_RE.test(line);
    if (isDegree || isInst) {
      if (!cur || (isDegree && cur.degree) || (isInst && !isDegree && cur.institution)) {
        if (cur) draft.education.push(cur);
        cur = fresh();
      }
      for (const part of withoutDates.split(/\s+[|–—]\s+|,\s+|\s+-\s+/)) {
        if (DEGREE_RE.test(part) && !cur.degree) {
          const [deg, field] = part.split(/\s+in\s+|\s+of\s+(?=[A-Z])/);
          cur.degree = (deg ?? part).trim();
          cur.field = (field ?? '').trim();
        } else if (INSTITUTION_RE.test(part) && !cur.institution) cur.institution = part.trim();
        else if (part.trim()) cur.details = [cur.details, part.trim()].filter(Boolean).join(', ');
      }
      if (range) {
        cur.startDate = range.start;
        cur.endDate = range.end;
      } else if (year) cur.endDate = year;
      continue;
    }
    if (cur && (range || year)) {
      if (range) {
        cur.startDate = range.start;
        cur.endDate = range.end;
      } else if (year) cur.endDate = year;
      if (withoutDates) cur.details = [cur.details, withoutDates].filter(Boolean).join(', ');
      continue;
    }
    if (cur) cur.details = [cur.details, line].filter(Boolean).join(', ');
    else unassigned.push(raw);
  }
  if (cur) draft.education.push(cur);
}
