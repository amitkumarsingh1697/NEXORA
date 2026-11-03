import { firstElement, textOf, visibleText } from './text';
import type { SiteAdapter } from './types';

// Naukri uses generated class names; match on stable substrings.
const TITLE = ['[class*="jd-header-title"]', 'h1'];
const COMPANY = ['[class*="jd-header-comp-name"] a', '[class*="jd-header-comp-name"]'];
const LOCATION = ['[class*="jhc__location"]', '[class*="location"] a', '[class*="location"]'];
const DESCRIPTION = [
  'section[class*="job-desc-container"]',
  '[class*="job-desc"]',
  '[class*="dang-inner-html"]',
];

export const naukriAdapter: SiteAdapter = {
  id: 'naukri',
  label: 'Naukri',
  matches: (url) =>
    /(^|\.)naukri\.com$/.test(url.hostname) && /job-listings|\/job\//.test(url.pathname),
  extract(doc, url) {
    const desc = firstElement(doc, DESCRIPTION);
    if (!desc) return null;
    return {
      site: 'naukri',
      url: url.toString(),
      title: textOf(doc, TITLE),
      company: textOf(doc, COMPANY),
      location: textOf(doc, LOCATION),
      text: visibleText(desc),
      method: 'Naukri job description section',
      warnings: [],
    };
  },
};
