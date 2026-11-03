// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ExtractionError, extractJob } from '../extract';

function page(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

const LONG =
  'We are looking for a Senior Backend Engineer with 5+ years of experience in Node.js, TypeScript and PostgreSQL. You will design APIs, own reliability, and mentor engineers.';

describe('extractJob', () => {
  it('extracts a LinkedIn job panel', () => {
    const doc = page(`
      <h1 class="top-card-layout__title">Senior Backend Engineer</h1>
      <a class="topcard__org-name-link">Acme Corp</a>
      <span class="topcard__flavor--bullet">Bengaluru, India</span>
      <div class="show-more-less-html__markup"><p>${LONG}</p><ul><li>Kubernetes</li><li>AWS</li></ul></div>`);
    const job = extractJob(doc, 'https://www.linkedin.com/jobs/view/123');
    expect(job.site).toBe('linkedin');
    expect(job.title).toBe('Senior Backend Engineer');
    expect(job.company).toBe('Acme Corp');
    expect(job.location).toBe('Bengaluru, India');
    expect(job.text).toContain('PostgreSQL');
    expect(job.text).toContain('Kubernetes');
  });

  it('extracts a Naukri job description', () => {
    const doc = page(`
      <h1 class="styles_jd-header-title__abc">Data Engineer</h1>
      <div class="styles_jd-header-comp-name__x"><a>Globex</a></div>
      <span class="styles_jhc__location__y">Pune</span>
      <section class="styles_job-desc-container__z"><div>${LONG}</div></section>`);
    const job = extractJob(
      doc,
      'https://www.naukri.com/job-listings-data-engineer-globex-pune-123',
    );
    expect(job.site).toBe('naukri');
    expect(job.title).toBe('Data Engineer');
    expect(job.company).toBe('Globex');
    expect(job.location).toBe('Pune');
    expect(job.text).toContain('TypeScript');
  });

  it('falls back to the generic extractor with a warning when the LinkedIn layout is unknown', () => {
    const doc = page(
      `<main><h1>Platform Engineer</h1><article><p>${LONG}</p><p>${LONG}</p></article></main>`,
    );
    const job = extractJob(doc, 'https://www.linkedin.com/jobs/view/456');
    expect(job.site).toBe('generic');
    expect(job.warnings[0]).toMatch(/LinkedIn layout was not recognised/);
  });

  it('prefers schema.org JobPosting JSON-LD on career sites', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'QA Lead',
      description: `<p>${LONG}</p>`,
      hiringOrganization: { name: 'Initech' },
      jobLocation: { address: { addressLocality: 'Austin', addressCountry: 'US' } },
    };
    const doc = page(
      `<script type="application/ld+json">${JSON.stringify(ld)}</script><div>Unrelated nav</div>`,
    );
    const job = extractJob(doc, 'https://careers.initech.example/jobs/qa-lead');
    expect(job.site).toBe('generic');
    expect(job.title).toBe('QA Lead');
    expect(job.company).toBe('Initech');
    expect(job.location).toContain('Austin');
    expect(job.text).toContain('Node.js');
  });

  it('ignores hidden elements and scripts', () => {
    const doc = page(
      `<div class="show-more-less-html__markup"><p>${LONG}</p><p style="display:none">SECRET-HIDDEN</p><script>var x = "SCRIPT-TEXT"</script></div>`,
    );
    const job = extractJob(doc, 'https://www.linkedin.com/jobs/view/1');
    expect(job.text).not.toContain('SECRET-HIDDEN');
    expect(job.text).not.toContain('SCRIPT-TEXT');
  });

  it('reports login walls and CAPTCHAs instead of bypassing them', () => {
    const doc = page('<div>Please verify you are a human to continue</div>');
    expect(() => extractJob(doc, 'https://www.naukri.com/job-listings-x-1')).toThrowError(
      ExtractionError,
    );
    try {
      extractJob(doc, 'https://www.naukri.com/job-listings-x-1');
    } catch (e) {
      expect((e as ExtractionError).reason).toBe('login_or_captcha');
    }
  });

  it('rejects pages with no job and non-web URLs', () => {
    expect(() => extractJob(page('<p>Hello</p>'), 'https://example.com/')).toThrow(
      /No job description/,
    );
    expect(() => extractJob(page('<p>x</p>'), 'chrome://extensions')).toThrow(/cannot be read/);
  });
});
