import { visibleText } from './text';
import type { ExtractedJob, SiteAdapter } from './types';

interface JobPostingLd {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?:
    | {
        address?: {
          addressLocality?: string;
          addressRegion?: string;
          addressCountry?: string | { name?: string };
        };
      }
    | { address?: unknown }[];
  '@graph'?: JobPostingLd[];
}

function isJobPosting(o: JobPostingLd): boolean {
  const t = o['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

/** Read schema.org JobPosting JSON-LD, which many career sites publish for search engines. */
export function readJsonLd(doc: Document): JobPostingLd | null {
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(s.textContent ?? '') as JobPostingLd | JobPostingLd[];
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      const job = items.find(isJobPosting);
      if (job) return job;
    } catch {
      // Malformed JSON-LD on the page; ignore and fall back to visible content.
    }
  }
  return null;
}

function htmlToText(doc: Document, html: string): string {
  // Parse into an inert template element (scripts never execute there).
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const div = doc.createElement('div');
  div.appendChild(tpl.content.cloneNode(true));
  return visibleText(div);
}

function ldLocation(job: JobPostingLd): string {
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  const a = (
    loc as
      | {
          address?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string | { name?: string };
          };
        }
      | undefined
  )?.address;
  if (!a) return '';
  const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
  return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ');
}

const KEYWORDS =
  /responsibilit|requirement|qualification|what you('|’)ll|experience|skills|about the role|job description/i;

/** Pick the visible block that most looks like a job description. */
function bestBlock(doc: Document): Element | null {
  const candidates = Array.from(doc.querySelectorAll('main, article, [role="main"], section, div'));
  let best: { el: Element; score: number } | null = null;
  for (const el of candidates) {
    const text = visibleText(el);
    if (text.length < 300) continue;
    const hits = (text.match(new RegExp(KEYWORDS, 'gi')) ?? []).length;
    if (!hits) continue;
    // Prefer dense, keyword-rich blocks over the whole page.
    const score =
      hits * 1000 - Math.max(0, text.length - 8000) / 10 + Math.min(text.length, 8000) / 100;
    if (!best || score > best.score) best = { el, score };
  }
  return best?.el ?? null;
}

export const genericAdapter: SiteAdapter = {
  id: 'generic',
  label: 'Career page',
  matches: () => true,
  extract(doc, url): ExtractedJob | null {
    const ld = readJsonLd(doc);
    if (ld?.description) {
      const org =
        typeof ld.hiringOrganization === 'string'
          ? ld.hiringOrganization
          : ld.hiringOrganization?.name;
      return {
        site: 'generic',
        url: url.toString(),
        title: ld.title ?? '',
        company: org ?? '',
        location: ldLocation(ld),
        text: htmlToText(doc, ld.description),
        method: 'Structured job data (schema.org JobPosting) published by the page',
        warnings: [],
      };
    }
    const block = bestBlock(doc);
    if (!block) return null;
    const title = doc.querySelector('h1')
      ? visibleText(doc.querySelector('h1') as Element)
      : doc.title;
    return {
      site: 'generic',
      url: url.toString(),
      title: title.slice(0, 300),
      company: '',
      location: '',
      text: visibleText(block),
      method: 'Largest visible block that looks like a job description',
      warnings: [
        'Detected heuristically. Check that the text is complete and remove anything unrelated.',
      ],
    };
  },
};
