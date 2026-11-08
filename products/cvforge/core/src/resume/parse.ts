import { newItemId, resumeContentSchema, type ResumeContent, type SectionKey } from './model';
import { parseDateRange } from './dates';

type KnownSection = Exclude<SectionKey, 'custom'>;
/** A heading either names a resume section, a personal-details block, or an unknown section. */
export type HeadingKind = KnownSection | 'personal' | 'custom';

const HEADINGS: Record<KnownSection | 'personal', string[]> = {
  personal: [
    'personal details',
    'personal information',
    'personal info',
    'personal data',
    'contact',
    'contact details',
    'contact information',
    'contact info',
  ],
  summary: [
    'summary',
    'professional summary',
    'profile summary',
    'profile',
    'professional profile',
    'career profile',
    'about me',
    'about',
    'objective',
    'career objective',
    'executive summary',
    'career summary',
    'summary of qualifications',
    'professional overview',
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
    'technical proficiency',
    'technical competencies',
    'expertise',
    'skills & tools',
    'skills and tools',
    'tools & technologies',
    'tools and technologies',
    'core skills',
    'skill set',
    'skillset',
    'skills summary',
    'it skills',
    'competencies',
    'key competencies',
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
    'experience summary',
    'internships',
    'internship',
    'internship experience',
  ],
  projects: [
    'projects',
    'key projects',
    'personal projects',
    'selected projects',
    'project experience',
    'academic projects',
    'notable projects',
    'side projects',
    'major projects',
    'open source',
    'open source contributions',
  ],
  education: [
    'education',
    'academic background',
    'academics',
    'academic details',
    'education & training',
    'education and training',
    'academic qualifications',
    'educational qualifications',
    'educational qualification',
    'education details',
    'qualifications',
  ],
  certifications: [
    'certifications',
    'certification',
    'certificates',
    'professional certifications',
    'licenses',
    'licenses & certifications',
    'licenses and certifications',
    'courses & certifications',
    'certifications & training',
    'training & certifications',
    'courses',
  ],
  achievements: [
    'achievements',
    'achievement',
    'key achievements',
    'key achievement',
    'awards',
    'honors',
    'honours',
    'accomplishments',
    'awards & recognition',
    'awards and recognition',
    'awards & achievements',
    'achievements & awards',
    'honors & awards',
    'recognition',
  ],
  publications: ['publications', 'papers', 'talks', 'publications & talks', 'patents'],
  languages: ['languages', 'language proficiency', 'spoken languages', 'languages known'],
};

const headingLookup = new Map<string, KnownSection | 'personal'>();
for (const [key, names] of Object.entries(HEADINGS)) {
  for (const n of names) headingLookup.set(n, key as KnownSection | 'personal');
}

/**
 * Classify a line as a section heading. Unknown ALL-CAPS short lines are reported as
 * 'custom'; the caller decides whether that is plausible at this point in the document
 * (an ALL-CAPS name at the top of a resume is not a section).
 */
export function detectHeading(line: string): HeadingKind | null {
  if (line.includes('\t')) return null;
  const norm = line
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (headingLookup.has(norm)) return headingLookup.get(norm) ?? null;
  if (/^[A-Z][A-Z &/]{2,40}$/.test(line.trim()) && line.trim().split(/\s+/).length <= 4)
    return 'custom';
  return null;
}

// Includes the Symbol/Wingdings private-use bullets that Word writes into PDFs.
const BULLET_CHARS = '•●▪◦‣∙·○■□►▸➢➤✓✔❖\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF06C\uF0A8';
const LONE_BULLET_RE = new RegExp(`^[${BULLET_CHARS}\\-*–]$`);
const BULLET_RE = new RegExp(`^\\s*(?:[${BULLET_CHARS}\\-*–]|\\d+[.)])\\s+`);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/[^\s|,)]+|github\.com\/[^\s|,)]+|[a-z0-9-]+\.[a-z]{2,}\/[^\s|,)]*)|https?:\/\/[^\s|,)]+/i;
const LINK_LABEL_RE = /^(linkedin|github|portfolio|website|blog|twitter|x|leetcode|kaggle)$/i;
const ROLE_WORDS =
  /\b(engineer|developer|architect|manager|lead|consultant|analyst|director|head|principal|intern|scientist|administrator|specialist|officer|vp|vice president|cto|cio|ceo|coo|founder|co-founder|programmer|designer|associate|fellow|owner|sre|devops|staff|member|trainee|tester|qa|researcher|assistant|coordinator|executive|technician|advisor|partner)\b/i;
const DEGREE_RE =
  /\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|bsc|msc|bachelor|master|mba|phd|ph\.d|doctorate|diploma|b\.?\s?a\b|m\.?\s?a\b|bca|mca|b\.?\s?com|m\.?\s?com|b\.?\s?s\b|m\.?\s?s\b|associate degree|a-levels|high school|higher secondary|senior secondary|secondary school|ssc|hsc|sslc|cbse|icse|matriculation|intermediate|class (?:x|xii|10|12)(?:th)?|(?:10|12)th|post graduate|pgdm|graduation)/i;
const INSTITUTION_RE =
  /\b(university|college|institute|school|academy|iit|nit|iiit|polytechnic|vidyalaya)\b/i;
const GRADE_RE =
  /\b(cgpa|gpa|cpi|sgpa|percentage|grade|marks|score)\b|\d+(?:\.\d+)?\s?%|\d+(?:\.\d+)?\s?\/\s?(?:10|4)\b/i;
/** "Noida, India", "San Francisco, CA", "Remote". */
const LOCATION_RE =
  /^(?:remote|hybrid|on-?site|[A-Z][\p{L}.'-]+(?: [A-Z][\p{L}.'-]+){0,2},\s*[A-Z][\p{L}.'-]+(?: [A-Z][\p{L}.'-]+){0,2})(?:\s*\((?:remote|hybrid|on-?site)\))?$/iu;
const ORG_WORD_RE =
  /^(technology|technologies|solutions|systems|services|labs|ltd|inc|pvt|limited|llp|llc|bank|group|software|consulting|corp|corporation|company|industries|global|international|infotech|networks|ventures)$/i;
const PLACE_RE = /^[A-Z][\p{L}.'-]+(?: [A-Z][\p{L}.'-]+){0,2}$/u;
const hasOrgWord = (s: string) =>
  s.split(/\s+/).some((w) => ORG_WORD_RE.test(w.replace(/[.,]/g, '')));
/** "Pune, India" is a place; "Senior Software Engineer, FinPay Technologies" is not. */
const isLocation = (s: string) => LOCATION_RE.test(s) && !ROLE_WORDS.test(s) && !hasOrgWord(s);
/** A bare place name such as "Pune": capitalised words with no job or company words. */
const isBarePlace = (s: string) => PLACE_RE.test(s) && !ROLE_WORDS.test(s) && !hasOrgWord(s);
const TRAILING_LOCATION_RE =
  /\s((?:[A-Z][\p{L}.'-]+ ){0,2}[A-Z][\p{L}.'-]+,\s*[A-Z][\p{L}.'-]+(?: [A-Z][\p{L}.'-]+)?)$/u;

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

const isBullet = (line: string) => BULLET_RE.test(line);
const stripBullet = (line: string) => line.replace(BULLET_RE, '').trim();
/** Tabs mark column gaps (from the PDF layout); inside running text they are just spaces. */
const flat = (line: string) => line.replace(/\t/g, ' ').trim();

function parenDepth(s: string): number {
  let d = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if ((ch === ')' || ch === ']' || ch === '}') && d > 0) d--;
  }
  return d;
}

/** Split on separators that are not inside brackets, so "Spring (Core, Boot)" stays whole. */
function splitTopLevel(s: string, seps: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    if (depth === 0) {
      const m = seps.exec(s.slice(i));
      if (m && m.index === 0) {
        out.push(cur);
        cur = '';
        i += m[0].length - 1;
        continue;
      }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * A line continues the previous one when the previous line was cut mid-phrase (open
 * bracket, trailing comma or conjunction) or this line starts in lower case or with a
 * bracket. PDF extraction already rejoins soft wraps using the page layout; this is the
 * text-only fallback for pasted text and other sources.
 */
function continuesPrevious(prev: string, line: string): boolean {
  if (isBullet(line) || line.includes('\t') || parseDateRange(line)) return false;
  if (prev.includes('\t') && parenDepth(prev) === 0) return false;
  if (parenDepth(prev) > 0) return true;
  if (/[,(&/]$|\b(and|or|with|of|for|to|the|in|on|a|an|including)$/i.test(prev)) return true;
  return /^[a-z][a-z]/.test(line) || /^[()]/.test(line);
}

const isDateLine = (line: string) => !isBullet(line) && parseDateRange(line) !== null;
/** "Key Project: …", "Tech stack: …": body content, never an entry header. */
const isLabelLine = (line: string) => /^[A-Za-z][\w &/-]{1,30}:\s+\S/.test(line);
/** Short, title-like line: a candidate entry header (job title, company, project name). */
function isHeaderish(line: string): boolean {
  const t = flat(line);
  return (
    !isBullet(line) && !isLabelLine(t) && t.length <= 100 && !/[.;!?]$/.test(t) && !EMAIL_RE.test(t)
  );
}

interface Entry {
  header: string[];
  body: string[];
}

/**
 * Split a section into entries. Lines with a date range anchor an entry; the short lines
 * right next to the anchor (before or after it, never past a bullet) are its header. Every
 * other line is body: bullets and description paragraphs stay with the entry above them.
 * Without dates, a short title-like line that follows a body starts the next entry.
 */
function segmentEntries(lines: string[], isAnchor: (l: string) => boolean): Entry[] {
  const anchors = lines.map((l, i) => (isAnchor(l) ? i : -1)).filter((i) => i >= 0);
  const entries: Entry[] = [];
  if (anchors.length) {
    const starts: { start: number; headerEnd: number }[] = [];
    let floor = 0;
    for (const a of anchors) {
      if (a < floor) continue;
      const own = flat(lines[a] ?? '').replace(parseDateRange(lines[a] ?? '')?.matched ?? '', '');
      const hasText = /[A-Za-z]{2}/.test(own);
      let fwd = 0;
      const maxFwd = hasText ? 1 : 2;
      while (
        fwd < maxFwd &&
        a + 1 + fwd < lines.length &&
        !anchors.includes(a + 1 + fwd) &&
        isHeaderish(lines[a + 1 + fwd] ?? '') &&
        // A line right before a date-only anchor is that next entry's header, not ours.
        !(
          anchors.includes(a + 2 + fwd) &&
          !/[A-Za-z]{2}/.test(
            flat(lines[a + 2 + fwd] ?? '').replace(
              parseDateRange(lines[a + 2 + fwd] ?? '')?.matched ?? '',
              '',
            ),
          )
        )
      )
        fwd++;
      let back = 0;
      const maxBack = hasText ? (fwd ? 0 : 1) : Math.max(0, 2 - fwd);
      while (
        back < maxBack &&
        a - 1 - back >= floor &&
        isHeaderish(lines[a - 1 - back] ?? '') &&
        !isDateLine(lines[a - 1 - back] ?? '')
      )
        back++;
      // A header line directly after a bullet is the bullet's last line only if it reads
      // like a sentence fragment; title-cased short lines are headers.
      starts.push({ start: a - back, headerEnd: a + fwd });
      floor = a + fwd + 1;
    }
    const firstStart = starts[0]?.start ?? 0;
    const preamble = lines.slice(0, firstStart);
    for (const [k, s] of starts.entries()) {
      const next = starts[k + 1]?.start ?? lines.length;
      entries.push({
        header: lines.slice(s.start, s.headerEnd + 1),
        body: lines.slice(s.headerEnd + 1, next),
      });
    }
    if (preamble.length && entries[0]) entries[0].body.unshift(...preamble);
    return entries;
  }
  let cur: Entry | null = null;
  for (const line of lines) {
    if (isHeaderish(line) && (!cur || cur.body.length > 0)) {
      cur = { header: [line], body: [] };
      entries.push(cur);
      continue;
    }
    if (!cur) {
      cur = { header: [], body: [] };
      entries.push(cur);
    }
    cur.body.push(line);
  }
  return entries;
}

/** Header text split into columns (tabs), then on the usual title/company separators. */
function headerSegments(line: string, dropDates = true): string[] {
  let t = line;
  if (dropDates) {
    const r = parseDateRange(t);
    if (r) t = t.replace(r.matched, '');
  }
  const segs: string[] = [];
  for (const col of t.split('\t')) {
    const c = col.replace(/^[\s|,–—-]+|[\s|,–—(-]+$/g, '').trim();
    if (!c) continue;
    for (const part of splitTopLevel(c, /^(?:\s+[|–—]\s+|\s+-\s+|\s+at\s+|\s+@\s+)/i)) {
      if (isLocation(part)) {
        segs.push(part);
        continue;
      }
      const trailing = TRAILING_LOCATION_RE.exec(part);
      const before = trailing ? part.slice(0, trailing.index) : '';
      if (trailing?.[1] && parenDepth(before) === 0 && !before.includes(',')) {
        // "P8Sense Technology Noida, India": organisation words are not part of the city.
        const words = trailing[1].split(' ');
        while (words.length > 1 && ORG_WORD_RE.test(words[0] ?? '')) words.shift();
        const loc = words.join(' ');
        if (isLocation(loc)) {
          segs.push(part.slice(0, part.length - loc.length).trim(), loc);
          continue;
        }
      }
      segs.push(...splitTopLevel(part, /^,\s+/));
    }
  }
  return segs.filter(Boolean);
}

function bodyBullets(body: string[]): { id: string; text: string }[] {
  return body
    .map((l) => flat(stripBullet(l)))
    .filter(Boolean)
    .map((text) => ({ id: newItemId('b'), text }));
}

/**
 * Deterministic resume parser. It is intentionally conservative: anything it
 * cannot place is returned in `unassignedLines` so the user can review it,
 * rather than being silently dropped.
 */
export function parseResumeText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) =>
      l
        .split('\t')
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\t'),
    )
    .filter(Boolean)
    // Some extractors put a bullet glyph on its own line; it belongs to the next line.
    .reduce<string[]>((acc, l) => {
      const prev = acc[acc.length - 1];
      if (prev !== undefined && LONE_BULLET_RE.test(prev)) acc[acc.length - 1] = `${prev} ${l}`;
      else acc.push(l);
      return acc;
    }, []);
  const blocks: { key: HeadingKind | 'header'; title: string; lines: string[] }[] = [
    { key: 'header', title: 'Personal', lines: [] },
  ];
  let seenKnown = false;
  for (const line of lines) {
    const block = blocks[blocks.length - 1] as (typeof blocks)[number];
    let h = detectHeading(line);
    // Before the first real section, an ALL-CAPS line is the name or headline, not a section.
    if (h === 'custom' && !seenKnown) h = null;
    if (h) {
      if (h !== 'custom') seenKnown = true;
      blocks.push({ key: h, title: line.replace(/[:：]\s*$/, '').trim(), lines: [] });
      continue;
    }
    const prev = block.lines[block.lines.length - 1];
    if (
      prev !== undefined &&
      block.key !== 'header' &&
      block.key !== 'personal' &&
      continuesPrevious(prev, line)
    )
      block.lines[block.lines.length - 1] = `${prev}${/[A-Za-z]-$/.test(prev) ? '' : ' '}${line}`;
    else block.lines.push(line);
  }

  const draft = resumeContentSchema.parse({ personal: {} });
  const unassigned: string[] = [];
  const warnings: string[] = [];
  const conf: SectionConfidence[] = [];
  const order: SectionKey[] = [];

  for (const block of blocks) {
    const key = block.key;
    if (key !== 'header' && key !== 'personal' && !order.includes(key)) order.push(key);
    switch (key) {
      case 'header':
        parsePersonal(block.lines, draft, unassigned, warnings, true);
        break;
      case 'personal': {
        // A "Personal Details" block: contact fields go to Personal information; facts the
        // resume model has no field for (date of birth, nationality…) stay visible in a
        // section of the same name so they are neither lost nor mixed into other sections.
        const extras: string[] = [];
        parsePersonal(block.lines, draft, extras, warnings, false);
        if (extras.length)
          draft.custom.push({
            id: newItemId('cu'),
            title: block.title,
            items: extras.map((t) => ({ id: newItemId('ci'), text: t })),
          });
        break;
      }
      case 'summary':
        draft.summary = [draft.summary, block.lines.map((l) => flat(stripBullet(l))).join(' ')]
          .filter(Boolean)
          .join('\n\n');
        conf.push({
          section: 'summary',
          confidence: draft.summary ? 0.9 : 0.3,
          note: 'Summary paragraph detected.',
        });
        break;
      case 'skills':
        parseSkills(block.lines, draft, unassigned);
        conf.push({
          section: 'skills',
          confidence: draft.skills.length ? 0.85 : 0.3,
          note: `${draft.skills.length} skills recognised.`,
        });
        break;
      case 'experience': {
        const before = draft.experience.length;
        parseExperience(block.lines, draft);
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
          confidence: draft.projects.length ? 0.75 : 0.3,
          note: `${draft.projects.length} projects.`,
        });
        break;
      case 'education':
        parseEducation(block.lines, draft, unassigned);
        conf.push({
          section: 'education',
          confidence: draft.education.length ? 0.8 : 0.3,
          note: `${draft.education.length} entries.`,
        });
        break;
      case 'certifications':
        for (const item of listItems(block.lines)) {
          const range = parseDateRange(item);
          const yr = /\b(19|20)\d{2}\b/.exec(item)?.[0] ?? null;
          const rest = item
            .replace(range?.matched ?? '', '')
            .replace(/[\s,(–—-]*\b(?:19|20)\d{2}\)?$/, '')
            .replace(/[\s,(–—-]+$/, '');
          // "Name, Issuer, 2022" / "Name by Issuer" / "Name – Issuer". A dash inside the name
          // ("Architect – Professional") is only a separator when there is no comma.
          let parts = splitTopLevel(rest, /^(?:\s+\|\s+|\s+by\s+|,\s+)/i).filter(
            (p) => !/^(?:19|20)\d{2}$/.test(p),
          );
          if (parts.length === 1) parts = splitTopLevel(rest, /^(?:\s+[–—]\s+|\s+-\s+)/);
          const name = parts.length > 1 ? parts.slice(0, -1).join(', ') : (parts[0] ?? rest);
          const issuer = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
          draft.certifications.push({ id: newItemId('ce'), name, issuer, date: yr });
        }
        conf.push({
          section: 'certifications',
          confidence: 0.8,
          note: `${draft.certifications.length} certifications.`,
        });
        break;
      case 'achievements':
      case 'publications':
        for (const t of listItems(block.lines))
          draft[key].push({ id: newItemId(key.slice(0, 2)), text: t });
        conf.push({ section: key, confidence: 0.8, note: `${draft[key].length} items.` });
        break;
      case 'languages':
        for (const l of block.lines) {
          for (const part of splitTopLevel(flat(stripBullet(l)), /^[,;|•·]\s*/)) {
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
          items: listItems(block.lines).map((t) => ({ id: newItemId('ci'), text: t })),
        });
        conf.push({
          section: 'custom',
          confidence: 0.6,
          note: `Unrecognised section "${block.title}" kept as a custom section.`,
        });
        break;
    }
  }
  // Keep detected section order, then any remaining sections.
  draft.sectionOrder = [...order, ...draft.sectionOrder.filter((k) => !order.includes(k))];

  const found =
    (draft.personal.fullName ? 1 : 0) +
    (draft.personal.email ? 1 : 0) +
    (draft.personal.phone ? 1 : 0);
  conf.push({
    section: 'personal',
    confidence: Math.min(1, 0.3 + found * 0.23),
    note: 'Name and contact details.',
  });

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
  fitToSchema(draft, unassigned);
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

/**
 * Items of a list-like section: each bullet is an item; a short title line followed by a
 * description paragraph ("Best Annual Performance" + its explanation) is one item.
 */
function listItems(lines: string[]): string[] {
  const items: string[] = [];
  let pendingTitle: string | null = null;
  for (const raw of lines) {
    const t = flat(stripBullet(raw));
    if (!t) continue;
    if (isBullet(raw)) {
      if (pendingTitle) items.push(pendingTitle);
      pendingTitle = null;
      items.push(t);
      continue;
    }
    if (pendingTitle) {
      items.push(`${pendingTitle}: ${t}`);
      pendingTitle = null;
      continue;
    }
    if (isHeaderish(raw) && t.length <= 60 && !/:$/.test(t)) pendingTitle = t;
    else items.push(t);
  }
  if (pendingTitle) items.push(pendingTitle);
  return items;
}

function parseSkills(lines: string[], draft: ResumeContent, unassigned: string[]) {
  let category: string | undefined;
  for (const l of lines) {
    const s = flat(stripBullet(l));
    const colon = /^([^:()]{2,50}):\s*(.*)$/.exec(s);
    // A line without its own "Category:" prefix continues the category above it.
    if (colon) category = colon[1]?.trim();
    const list = colon ? (colon[2] ?? '') : s;
    for (const raw of splitTopLevel(list, /^\s*[,;|•·]\s*/)) {
      const name = raw.replace(/\.$/, '').trim();
      if (!name) continue;
      if (name.length > 120) {
        unassigned.push(name);
        continue;
      }
      if (!draft.skills.some((k) => k.name.toLowerCase() === name.toLowerCase()))
        draft.skills.push({ id: newItemId('sk'), name, category });
    }
  }
}

function parsePersonal(
  lines: string[],
  draft: ResumeContent,
  unassigned: string[],
  warnings: string[],
  isTop: boolean,
) {
  const p = draft.personal;
  const addLink = (url: string) => {
    if (p.links.some((l) => l.url === url) || p.links.length >= 10) return;
    const label = /linkedin/i.test(url) ? 'LinkedIn' : /github/i.test(url) ? 'GitHub' : 'Website';
    p.links.push({ id: newItemId('ln'), label, url });
  };
  const bareLabels: string[] = [];
  for (const [i, line] of lines.entries()) {
    const kv = /^([A-Za-z][A-Za-z .]{1,30}?)\s*[:：]\s*(.+)$/.exec(flat(line));
    if (kv && !isTop && !EMAIL_RE.test(kv[1] ?? '')) {
      const k = (kv[1] ?? '').toLowerCase();
      const v = (kv[2] ?? '').trim();
      if (/^(full )?name$/.test(k) && !p.fullName) p.fullName = v;
      else if (/e-?mail/.test(k) && !p.email) p.email = EMAIL_RE.exec(v)?.[0] ?? v;
      else if (/phone|mobile|contact( no| number)?|tel/.test(k) && !p.phone) p.phone = v;
      else if (/address|location|city|residence/.test(k) && !p.location) p.location = v;
      else if (/linkedin|github|portfolio|website|url/.test(k)) addLink(v);
      else if (/^languages?( known| spoken)?$/.test(k))
        for (const name of splitTopLevel(v, /^[,;|]\s*/))
          draft.languages.push({ id: newItemId('la'), name, proficiency: '' });
      else unassigned.push(flat(line));
      continue;
    }
    const segments = splitTopLevel(line, /^(?:\s*[|•·\t]\s*|\s{3,})/);
    let consumed = false;
    const rest: string[] = [];
    for (const seg of segments) {
      const email = EMAIL_RE.exec(seg)?.[0];
      if (email) {
        if (!p.email) p.email = email;
        consumed = true;
        continue;
      }
      const url = URL_RE.exec(seg)?.[0];
      if (url) {
        addLink(url);
        consumed = true;
        continue;
      }
      if (LINK_LABEL_RE.test(seg.trim())) {
        bareLabels.push(seg.trim());
        consumed = true;
        continue;
      }
      const phone = PHONE_RE.exec(seg)?.[0];
      if (phone && phone.replace(/\D/g, '').length >= 8 && !parseDateRange(seg)) {
        if (!p.phone) p.phone = phone.trim();
        consumed = true;
        continue;
      }
      if (LOCATION_RE.test(seg) && !p.location && i > 0 && seg.length < 60) {
        p.location = seg;
        consumed = true;
        continue;
      }
      rest.push(seg);
    }
    if (consumed && !rest.length) continue;
    const t = consumed ? rest.join(' | ') : flat(line);
    if (!p.fullName && /^[\p{L}][\p{L} .'-]{1,60}$/u.test(t) && t.split(' ').length <= 5) {
      p.fullName = t;
      continue;
    }
    if (isTop && !p.headline && t.length <= 160 && i <= 3) {
      p.headline = t;
      continue;
    }
    // Text before the first heading that is not contact info is likely an untitled summary.
    if (isTop && t.length > 80) draft.summary = [draft.summary, t].filter(Boolean).join(' ');
    else unassigned.push(t);
  }
  // A label such as "LinkedIn" whose address is not in the file (an unresolved hyperlink):
  // say so rather than inventing a URL.
  for (const label of bareLabels) {
    const known = p.links.some((l) => l.label.toLowerCase() === label.toLowerCase());
    if (!known)
      warnings.push(
        `The resume shows "${label}" but the file does not contain its web address. Add the link in Personal details.`,
      );
  }
}

function parseExperience(lines: string[], draft: ResumeContent) {
  for (const entry of segmentEntries(lines, isDateLine)) {
    const range = entry.header.map((h) => parseDateRange(h)).find(Boolean) ?? null;
    // The line carrying the dates usually carries the title ("Senior Developer   Oct 2024 - Now").
    const dateLine = entry.header.find((h) => parseDateRange(h));
    const ordered = dateLine
      ? [dateLine, ...entry.header.filter((h) => h !== dateLine)]
      : entry.header;
    let segs = ordered.flatMap((h) => headerSegments(h));
    let title = '';
    const locations: string[] = [];
    const others: string[] = [];
    // "Title, Company" over "Dates | Pune": what is left of the date line is the location.
    const dateRest = dateLine ? headerSegments(dateLine) : [];
    if (entry.header.length > 1 && dateRest.length === 1 && isBarePlace(dateRest[0] as string)) {
      locations.push(dateRest[0] as string);
      segs = entry.header.filter((h) => h !== dateLine).flatMap((h) => headerSegments(h));
    }
    for (const s of segs) {
      if (isLocation(s)) locations.push(s);
      else if (!title && ROLE_WORDS.test(s.replace(/\(.*?\)/g, ''))) title = s;
      else others.push(s);
    }
    if (!title && others.length > 1) title = others.shift() ?? '';
    let company = others.shift() ?? '';
    // "Title | Company | Pune": a trailing place-like segment is the location.
    const last = others[others.length - 1];
    if (!locations.length && last && PLACE_RE.test(last)) locations.push(others.pop() as string);
    // Anything else in the header (a team or client name) stays visible with the company.
    if (others.length) company = [company, ...others].filter(Boolean).join(', ');
    if (!title && !company && !entry.body.length) continue;
    draft.experience.push({
      id: newItemId('ex'),
      title,
      company,
      location: locations.join(', '),
      startDate: range?.start ?? null,
      endDate: range?.end ?? null,
      current: range?.current ?? false,
      bullets: bodyBullets(entry.body),
    });
  }
}

function parseProjects(lines: string[], draft: ResumeContent) {
  for (const entry of segmentEntries(lines, isDateLine)) {
    let url = '';
    let role = '';
    const nameParts: string[] = [];
    for (const h of entry.header) {
      const r = parseDateRange(h);
      for (const col of h.split('\t')) {
        const c = col.trim();
        if (!c) continue;
        if (r && c.includes(r.matched)) {
          const restOfCol = c.replace(r.matched, '').replace(/^[\s|,–—-]+|[\s|,–—(-]+$/g, '');
          if (restOfCol) nameParts.push(restOfCol);
          nameParts.push(`(${r.matched})`);
          continue;
        }
        const parts = splitTopLevel(c, /^\s+[|]\s+/);
        for (const part of parts) {
          const u = URL_RE.exec(part)?.[0];
          if (u && u.length >= part.length - 2 && !url) url = u;
          else if (
            !role &&
            nameParts.length &&
            ROLE_WORDS.test(part) &&
            part.split(' ').length <= 5
          )
            role = part;
          else nameParts.push(part);
        }
      }
    }
    const body: string[] = [];
    for (const l of entry.body) {
      const t = flat(stripBullet(l));
      const link = /^(?:link|url|github|demo|live|repo(?:sitory)?)\s*:\s*(\S+)$/i.exec(t);
      if (link?.[1] && !url) url = link[1];
      else body.push(l);
    }
    const name = nameParts.join(' | ').replace(/ \| \(/g, ' (');
    if (!name && !body.length) continue;
    draft.projects.push({
      id: newItemId('pr'),
      name: name || 'Project',
      role,
      url,
      bullets: bodyBullets(body),
    });
  }
}

const YEAR_RE = /\b(?:19|20)\d{2}\b/;
const isEduAnchor = (l: string) => !isBullet(l) && (parseDateRange(l) !== null || YEAR_RE.test(l));

function parseEducation(lines: string[], draft: ResumeContent, unassigned: string[]) {
  const anchored = lines.some(isEduAnchor);
  const entries = anchored
    ? segmentEntries(lines, isEduAnchor)
    : // No dates at all: each degree line starts an entry.
      lines.reduce<Entry[]>((acc, l) => {
        if (DEGREE_RE.test(l) || !acc.length) acc.push({ header: [l], body: [] });
        else (acc[acc.length - 1] as Entry).header.push(l);
        return acc;
      }, []);
  for (const entry of entries) {
    const ed = {
      id: newItemId('ed'),
      institution: '',
      degree: '',
      field: '',
      startDate: null as string | null,
      endDate: null as string | null,
      details: '',
    };
    const details: string[] = [];
    for (const h of entry.header) {
      const flatLine = flat(stripBullet(h));
      const range = parseDateRange(flatLine);
      if (range) {
        ed.startDate = range.start;
        ed.endDate = range.end;
      } else {
        const yr = YEAR_RE.exec(flatLine)?.[0];
        if (yr) ed.endDate = yr;
      }
      for (const col of stripBullet(h).split('\t')) {
        let c = col.replace(range?.matched ?? '\u0000', '').trim();
        if (!range)
          c = c
            .replace(YEAR_RE, '')
            .replace(/\s*,\s*,/, ',')
            .trim();
        c = c.replace(/^[\s|,–—-]+|[\s|,–—(-]+$/g, '');
        if (!c) continue;
        const chunks = splitTopLevel(c, /^(?:,\s+|\s+\|\s+)/);
        for (const [ci, chunk] of chunks.entries()) {
          if (!ed.degree && DEGREE_RE.test(chunk) && !GRADE_RE.test(chunk)) {
            const m = /^(.*?)(?:\s+[-–—:]\s+|\s+in\s+|\s*\((.+)\)\s*$)(.*)$/.exec(chunk);
            if (m) {
              ed.degree = (m[1] ?? '').trim();
              ed.field = (m[2] ?? m[3] ?? '').trim();
            } else ed.degree = chunk;
          } else if (GRADE_RE.test(chunk)) details.push(chunk);
          else if (!ed.institution && (INSTITUTION_RE.test(chunk) || ci === 0))
            ed.institution = chunk;
          else details.push(chunk);
        }
      }
    }
    for (const b of entry.body) {
      const t = flat(stripBullet(b));
      if (t) details.push(t);
    }
    ed.details = details.join(', ');
    if (!ed.institution && !ed.degree) {
      unassigned.push(...entry.header.map(flat), ...entry.body.map(flat));
      continue;
    }
    draft.education.push(ed);
  }
}

/** Split text longer than `max` at sentence (or word) boundaries. */
function chunkText(t: string, max: number): string[] {
  const out: string[] = [];
  let rest = t;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('. ') + 1, 0) || window.lastIndexOf(' ') || max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Keep parsed content inside the schema limits instead of failing the whole upload:
 * over-long bullets are split, over-long fields are shortened (the full text goes to
 * the review list) and list overflow is reported, never silently dropped.
 */
function fitToSchema(d: ResumeContent, unassigned: string[]) {
  const clip = (v: string, max: number) => {
    if (v.length <= max) return v;
    unassigned.push(v);
    return v.slice(0, max);
  };
  const splitBullets = (bs: { id: string; text: string }[], maxItems: number) => {
    const out = bs.flatMap((b) =>
      b.text.length <= 1500
        ? [b]
        : chunkText(b.text, 1500).map((text, i) => ({ id: i ? newItemId('b') : b.id, text })),
    );
    for (const extra of out.slice(maxItems)) unassigned.push(extra.text);
    return out.slice(0, maxItems);
  };
  const capList = <T>(list: T[], max: number, text: (t: T) => string) => {
    for (const extra of list.slice(max)) unassigned.push(text(extra));
    return list.slice(0, max);
  };
  const p = d.personal;
  p.fullName = clip(p.fullName, 200);
  p.headline = clip(p.headline, 300);
  p.phone = clip(p.phone, 50);
  p.location = clip(p.location, 200);
  d.summary = clip(d.summary, 4000);
  d.skills = capList(d.skills, 300, (s) => s.name);
  d.experience = capList(d.experience, 60, (e) => [e.title, e.company].join(' '));
  for (const e of d.experience) {
    e.title = clip(e.title, 200);
    e.company = clip(e.company, 200);
    e.location = clip(e.location, 200);
    e.bullets = splitBullets(e.bullets, 100);
  }
  d.projects = capList(d.projects, 60, (x) => x.name);
  for (const x of d.projects) {
    x.name = clip(x.name, 200);
    x.role = clip(x.role, 200);
    x.url = clip(x.url, 500);
    x.bullets = splitBullets(x.bullets, 50);
  }
  d.education = capList(d.education, 30, (e) => e.institution);
  for (const e of d.education) {
    e.institution = clip(e.institution, 200);
    e.degree = clip(e.degree, 200);
    e.field = clip(e.field, 200);
    e.details = clip(e.details, 1000);
  }
  d.certifications = capList(d.certifications, 60, (c) => c.name);
  for (const c of d.certifications) {
    c.name = clip(c.name, 200);
    c.issuer = clip(c.issuer, 200);
  }
  d.achievements = splitBullets(d.achievements, 100);
  d.publications = splitBullets(d.publications, 100);
  d.languages = capList(d.languages, 30, (l) => l.name);
  for (const l of d.languages) {
    l.name = clip(l.name, 80);
    l.proficiency = clip(l.proficiency, 80);
  }
  d.custom = capList(d.custom, 20, (c) => c.title);
  for (const c of d.custom) {
    c.title = clip(c.title, 120);
    c.items = splitBullets(c.items, 100);
  }
}
