const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_RE =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const SINGLE = `(?:${MONTH_RE}\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const END = `(?:${SINGLE}|present|current|now|till date|to date|ongoing)`;
export const DATE_RANGE_RE = new RegExp(`(${SINGLE})\\s*(?:-|–|—|to|until)\\s*(${END})`, 'i');

/** Normalise a written date to YYYY-MM or YYYY. Returns null if unrecognised. */
export function normaliseDate(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\./g, '');
  let m = /^([a-z]+)\s+(\d{4})$/.exec(s);
  if (m && m[1] && m[2] && MONTHS[m[1]]) return `${m[2]}-${String(MONTHS[m[1]]).padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{4})$/.exec(s);
  if (m && m[1] && m[2]) {
    const mo = Number(m[1]);
    if (mo >= 1 && mo <= 12) return `${m[2]}-${String(mo).padStart(2, '0')}`;
  }
  m = /^(\d{4})$/.exec(s);
  if (m && m[1]) return m[1];
  return null;
}

export interface ParsedRange {
  start: string | null;
  end: string | null;
  current: boolean;
  matched: string;
}

export function parseDateRange(line: string): ParsedRange | null {
  const m = DATE_RANGE_RE.exec(line);
  if (!m || !m[1] || !m[2]) return null;
  const endRaw = m[2].toLowerCase();
  const current = /present|current|now|till date|to date|ongoing/.test(endRaw);
  return {
    start: normaliseDate(m[1]),
    end: current ? null : normaliseDate(m[2]),
    current,
    matched: m[0],
  };
}

/** Convert YYYY or YYYY-MM into a month index (year*12 + month-1). YYYY maps to January. */
export function monthIndex(d: string): number {
  const [y, m] = d.split('-');
  return Number(y) * 12 + (m ? Number(m) - 1 : 0);
}
