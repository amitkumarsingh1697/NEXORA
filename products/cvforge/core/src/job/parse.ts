import { findConcepts } from '../taxonomy/skills';
import type { JobDescription, Requirement, RequirementKind } from './model';

type SectionType = 'required' | 'preferred' | 'responsibilities' | 'about' | 'benefits' | 'other';

const SECTION_PATTERNS: [SectionType, RegExp][] = [
  [
    'preferred',
    /^(preferred|nice[- ]to[- ]have|bonus|good to have|desirable|preferred qualifications|pluses|bonus points|it would be great if)/i,
  ],
  [
    'responsibilities',
    /^(responsibilities|key responsibilities|what you('|’)ll do|what you will do|the role|your role|role overview|duties|job description|day[- ]to[- ]day|in this role)/i,
  ],
  [
    'required',
    /^(requirements|required|qualifications|minimum qualifications|basic qualifications|what you('|’)ll (need|bring)|what we('|’)re looking for|must[- ]have|skills|required skills|about you|who you are|you have|technical skills|experience required|essential)/i,
  ],
  ['benefits', /^(benefits|perks|what we offer|why join|compensation|our offer)/i],
  ['about', /^(about (us|the company|the team)|who we are|company overview|our mission)/i],
];

const AUTH_RE =
  /\b(visa|sponsorship|authori[sz]ed to work|work permit|right to work|citizenship|security clearance)\b/i;
const BULLET_RE = /^\s*(?:[•●▪◦‣∙·\-*–]|\d+[.)])\s+/;
const LANG_NAMES = [
  'English',
  'German',
  'French',
  'Arabic',
  'Hindi',
  'Spanish',
  'Dutch',
  'Italian',
  'Japanese',
  'Mandarin',
  'Portuguese',
];

const COUNTRY_HINTS: [string, RegExp][] = [
  [
    'India',
    /\b(india|bengaluru|bangalore|pune|hyderabad|chennai|mumbai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi)\b/i,
  ],
  ['United Arab Emirates', /\b(uae|dubai|abu dhabi|sharjah|united arab emirates)\b/i],
  [
    'United Kingdom',
    /\b(uk|united kingdom|london|manchester|edinburgh|birmingham|bristol|leeds|glasgow|cambridge)\b/i,
  ],
  [
    'United States',
    /\b(usa|united states|new york|san francisco|seattle|austin|boston|chicago|remote[- ]us|[A-Z][a-z]+,\s*(CA|NY|TX|WA|MA|IL|CO|GA|NC|VA|NJ|FL))\b/,
  ],
  [
    'Germany',
    /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart)\b/i,
  ],
  ['France', /\b(france|paris|lyon|toulouse|marseille|lille|nantes)\b/i],
  ['Netherlands', /\b(netherlands|amsterdam|rotterdam|utrecht|eindhoven)\b/i],
  ['Ireland', /\b(ireland|dublin|cork)\b/i],
  ['Canada', /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i],
  ['Australia', /\b(australia|sydney|melbourne|brisbane|perth)\b/i],
  ['Singapore', /\bsingapore\b/i],
];

let reqCounter = 0;
const rid = () => `rq_${(++reqCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function sectionOf(line: string): SectionType | null {
  const s = line.replace(/[:：]\s*$/, '').trim();
  if (s.length > 70 || BULLET_RE.test(line)) return null;
  // "Label: value" lines carry content and are not headings.
  if (/[:：]\s*\S/.test(line)) return null;
  for (const [t, re] of SECTION_PATTERNS) if (re.test(s)) return t;
  return null;
}

function labelled(lines: string[], labels: string[]): string {
  for (const l of lines) {
    const m = new RegExp(`^(?:${labels.join('|')})\\s*[:：-]\\s*(.+)$`, 'i').exec(l);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export function parseSalary(text: string): JobDescription['salary'] {
  const re =
    /((?:₹|\$|£|€|INR|USD|GBP|EUR|AED|SGD|CAD|AUD)\s?\d[\d,.]*\s*(?:LPA|lakhs?|cr|k|K|L)?(?:\s*(?:-|–|to)\s*(?:₹|\$|£|€|INR|USD|GBP|EUR|AED|SGD|CAD|AUD)?\s?\d[\d,.]*\s*(?:LPA|lakhs?|cr|k|K|L)?)?(?:\s*(?:per|\/|a)\s*(?:year|annum|yr|month|mo|hour|hr))?|\d[\d,.]*\s*(?:-|–|to)\s*\d[\d,.]*\s*(?:LPA|lakhs? per annum))/;
  const m = re.exec(text);
  if (!m?.[1]) return null;
  const raw = m[1].trim();
  const curMatch = /₹|\$|£|€|INR|USD|GBP|EUR|AED|SGD|CAD|AUD|LPA/.exec(raw)?.[0] ?? null;
  const currency =
    curMatch === '₹' || curMatch === 'LPA'
      ? 'INR'
      : curMatch === '$'
        ? 'USD'
        : curMatch === '£'
          ? 'GBP'
          : curMatch === '€'
            ? 'EUR'
            : curMatch;
  const mult = (s: string) =>
    /k\b/i.test(s) ? 1000 : /lpa|lakh|\bL\b/i.test(s) ? 100000 : /cr/i.test(s) ? 10000000 : 1;
  const nums = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|K|L|LPA|lakhs?|cr)?/g)].map(
    (x) =>
      Number((x[1] ?? '0').replace(/,/g, '')) * mult(x[2] ?? (/LPA|lakh/i.test(raw) ? 'LPA' : '')),
  );
  const period = /hour|hr/i.test(raw)
    ? 'hour'
    : /month|mo\b/i.test(raw)
      ? 'month'
      : /year|annum|yr|LPA/i.test(raw)
        ? 'year'
        : 'unspecified';
  return { text: raw, currency, min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null, period };
}

function classify(
  text: string,
  section: SectionType,
): { kind: RequirementKind; hard: boolean; minYears: number | null } {
  const years = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)/i.exec(text);
  const minYears = years?.[1] ? Number(years[1]) : null;
  const mustWords = /\b(must|required|mandatory|essential|minimum)\b/i.test(text);
  if (
    /\b(visa|sponsorship|authori[sz]ed to work|work permit|right to work|citizenship|security clearance)\b/i.test(
      text,
    )
  ) {
    return { kind: 'experience', hard: true, minYears: null };
  }
  if (
    /\b(degree|bachelor|master|b\.?tech|m\.?tech|b\.?e\.?|bsc|msc|phd|computer science or|graduate)\b/i.test(
      text,
    )
  ) {
    return {
      kind: 'education',
      hard:
        section === 'required' && (mustWords || /\brequired\b|\bin computer science\b/i.test(text)),
      minYears,
    };
  }
  if (/\b(certifi(ed|cation)s?)\b/i.test(text))
    return { kind: 'certification', hard: section === 'required' && mustWords, minYears };
  if (
    new RegExp(
      `\\b(fluent|fluency|proficien\\w*|native|business[- ]level)\\b.*\\b(${LANG_NAMES.join('|')})\\b|\\b(${LANG_NAMES.join('|')})\\b.*\\b(fluent|fluency|proficien\\w*|speaking|written)\\b`,
      'i',
    ).test(text)
  ) {
    return { kind: 'language', hard: section === 'required', minYears: null };
  }
  if (minYears !== null) return { kind: 'experience', hard: section !== 'preferred', minYears };
  if (
    /\b(lead(ing)?|mentor\w*|manag(e|ing) (a )?team|people management|stakeholders?|coach\w*|hiring|direct reports|influence|strategy|roadmap)\b/i.test(
      text,
    )
  ) {
    return { kind: 'leadership', hard: false, minYears: null };
  }
  if (section === 'responsibilities')
    return { kind: 'responsibility', hard: false, minYears: null };
  const concepts = findConcepts(text);
  if (concepts.length && concepts.every((c) => c.category === 'domain'))
    return { kind: 'domain', hard: false, minYears: null };
  return {
    kind: section === 'preferred' ? 'preferred_skill' : 'required_skill',
    hard: false,
    minYears: null,
  };
}

/**
 * Deterministic job description parser. Extracts only what is explicitly
 * written: salary and work authorisation are never inferred.
 */
export function parseJobDescription(
  rawText: string,
  hints: { title?: string; company?: string; location?: string } = {},
): JobDescription {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = lines.join('\n');

  let title = hints.title?.trim() || labelled(lines, ['job title', 'title', 'position', 'role']);
  if (!title) {
    const first = lines.find(
      (l) =>
        l.length <= 100 &&
        /\b(engineer|developer|architect|manager|lead|scientist|analyst|consultant|director|head|sre|devops|specialist)\b/i.test(
          l,
        ),
    );
    title = first ?? '';
  }
  const company =
    hints.company?.trim() ||
    labelled(lines, ['company', 'employer', 'organisation', 'organization']) ||
    (/\babout\s+([A-Z][\w&.\- ]{1,40})\b/.exec(text)?.[1]?.trim() ?? '');
  const location =
    hints.location?.trim() || labelled(lines, ['location', 'locations', 'based in', 'office']);
  const country = COUNTRY_HINTS.find(([, re]) => re.test(location || text))?.[0] ?? '';
  const workMode = /\bhybrid\b/i.test(text)
    ? 'hybrid'
    : /\b(fully remote|remote[- ]first|100% remote|remote)\b/i.test(text)
      ? 'remote'
      : /\b(on[- ]?site|in[- ]office|office[- ]based)\b/i.test(text)
        ? 'onsite'
        : 'unspecified';
  const employmentType = /\bintern(ship)?\b/i.test(text)
    ? 'internship'
    : /\b(contract|contractor|freelance|c2h)\b/i.test(text)
      ? 'contract'
      : /\bpart[- ]time\b/i.test(text)
        ? 'part_time'
        : /\btemporary|fixed[- ]term\b/i.test(text)
          ? 'temporary'
          : /\bfull[- ]time|permanent\b/i.test(text)
            ? 'full_time'
            : 'unspecified';
  const workAuthorization = lines.filter((l) =>
    /\b(visa|sponsorship|authori[sz]ed to work|work permit|right to work|citizenship|security clearance)\b/i.test(
      l,
    ),
  );
  const languages = LANG_NAMES.filter(
    (n) =>
      new RegExp(`\\b${n}\\b`).test(text) &&
      /\b(fluent|fluency|proficien|speak|written|native|language)/i.test(text),
  );

  const requirements: Requirement[] = [];
  let section: SectionType = 'other';
  let sectionTitle = 'Description';
  let sawSections = false;
  for (const line of lines) {
    const s = sectionOf(line);
    if (s) {
      section = s;
      sectionTitle = line.replace(/[:：]\s*$/, '');
      sawSections = true;
      continue;
    }
    const isBullet = BULLET_RE.test(line);
    const body = line.replace(BULLET_RE, '').trim();
    // Explicit work-authorisation statements are always captured, wherever they appear.
    const isAuth = AUTH_RE.test(body);
    if ((section === 'about' || section === 'benefits') && !isAuth) continue;
    if (/^(compensation|salary|pay|ctc)\s*[:：]/i.test(body)) continue;
    if (body.length < 12) continue;
    // Outside known sections, only consider lines that read like requirements.
    if (section === 'other' && !isAuth) {
      if (
        !(isBullet && sawSections) &&
        !/\b(experience|knowledge|proficien|familiar|understanding|degree|ability to|skills? in|expertise|hands[- ]on)\b/i.test(
          body,
        )
      )
        continue;
    }
    const { kind, hard, minYears } = classify(body, section === 'other' ? 'required' : section);
    const concepts = findConcepts(body).map((c) => c.name);
    const importance =
      section === 'preferred' || /\b(nice to have|preferred|a plus|bonus|desirable)\b/i.test(body)
        ? 'preferred'
        : 'required';
    const finalKind: RequirementKind =
      kind === 'required_skill' && importance === 'preferred' ? 'preferred_skill' : kind;
    // Split technology lists ("Java, Spring Boot and Kafka") into one requirement per concept
    // so each can be evidenced and clarified separately.
    const techConcepts = concepts.filter(
      (c) => !['leadership', 'domain'].includes(findConcepts(c)[0]?.category ?? ''),
    );
    if (
      (finalKind === 'required_skill' || finalKind === 'preferred_skill') &&
      techConcepts.length >= 2
    ) {
      for (const cname of concepts) {
        requirements.push({
          id: rid(),
          kind: finalKind,
          text: `${cname} — from: "${body}"`,
          concepts: [cname],
          minYears: null,
          importance,
          hard: false,
          sourceSection: sectionTitle,
        });
      }
      continue;
    }
    requirements.push({
      id: rid(),
      kind: finalKind,
      text: body,
      concepts,
      minYears,
      importance,
      hard,
      sourceSection: sectionTitle,
    });
  }
  const yearsReqs = requirements.map((r) => r.minYears).filter((y): y is number => y !== null);
  return {
    title,
    company,
    location,
    country,
    workMode,
    employmentType,
    salary: parseSalary(text),
    workAuthorization,
    languages,
    minYearsOverall: yearsReqs.length ? Math.max(...yearsReqs) : null,
    requirements,
  };
}
