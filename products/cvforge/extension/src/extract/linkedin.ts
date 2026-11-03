import { firstElement, textOf, visibleText } from './text';
import type { SiteAdapter } from './types';

// LinkedIn markup changes often; these selectors cover the signed-in job view and
// the public job page as observed at build time. The generic adapter is the fallback.
const TITLE = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  '.top-card-layout__title',
  'h1',
];
const COMPANY = [
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name',
  '.topcard__org-name-link',
  '.top-card-layout__second-subline a',
];
const LOCATION = [
  '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
  '.jobs-unified-top-card__bullet',
  '.topcard__flavor--bullet',
];
const DESCRIPTION = [
  '#job-details',
  '.jobs-description__content',
  '.jobs-box__html-content',
  '.show-more-less-html__markup',
  '.description__text',
];

export const linkedinAdapter: SiteAdapter = {
  id: 'linkedin',
  label: 'LinkedIn',
  matches: (url) => /(^|\.)linkedin\.com$/.test(url.hostname) && /\/jobs\//.test(url.pathname),
  extract(doc, url) {
    const desc = firstElement(doc, DESCRIPTION);
    if (!desc) return null;
    return {
      site: 'linkedin',
      url: url.toString(),
      title: textOf(doc, TITLE),
      company: textOf(doc, COMPANY),
      location: textOf(doc, LOCATION),
      text: visibleText(desc),
      method: 'LinkedIn job description panel',
      warnings: [],
    };
  },
};
