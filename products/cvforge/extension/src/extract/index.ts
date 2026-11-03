import { genericAdapter } from './generic';
import { linkedinAdapter } from './linkedin';
import { naukriAdapter } from './naukri';
import { ExtractionError, type ExtractedJob, type SiteAdapter } from './types';

export * from './types';
export { visibleText } from './text';

/**
 * Site adapters in priority order. Future adapters (Indeed, Glassdoor, Foundit,
 * StepStone, SEEK, Bayt, …) implement SiteAdapter and are added here; they are
 * not claimed as supported until they exist and have tests.
 */
export const ADAPTERS: SiteAdapter[] = [linkedinAdapter, naukriAdapter];

const LOGIN_OR_CAPTCHA =
  /captcha|verify you are (a )?human|sign in to (view|continue)|join to see|log ?in to (view|continue)|access denied/i;

/** Extract the job visible in `doc`. Never follows links, never reads cookies or storage. */
export function extractJob(doc: Document, href: string): ExtractedJob {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new ExtractionError('unsupported_page', 'This page cannot be read.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new ExtractionError('unsupported_page', 'Browser and extension pages cannot be read.');
  const site = ADAPTERS.find((a) => a.matches(url));
  let job = site?.extract(doc, url) ?? null;
  if (!job) {
    job = genericAdapter.extract(doc, url);
    if (job && site)
      job.warnings.unshift(`${site.label} layout was not recognised; used the generic extractor.`);
  }
  if (!job || job.text.length < 100) {
    const body = doc.body ? (doc.body.textContent ?? '') : '';
    if (LOGIN_OR_CAPTCHA.test(body.slice(0, 5000))) {
      throw new ExtractionError(
        'login_or_captcha',
        'This page asks you to sign in or complete a check. CVForge does not bypass these. Open the job normally, or paste the description manually.',
      );
    }
    throw new ExtractionError(
      'no_job_found',
      'No job description was found on this page. Open the full job posting, or paste the description manually.',
    );
  }
  return job;
}
