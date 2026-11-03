export type SiteId = 'linkedin' | 'naukri' | 'generic';

export interface ExtractedJob {
  site: SiteId;
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
  /** How the text was located, shown to the user for transparency. */
  method: string;
  warnings: string[];
}

export interface SiteAdapter {
  id: SiteId;
  label: string;
  matches(url: URL): boolean;
  extract(doc: Document, url: URL): ExtractedJob | null;
}

export class ExtractionError extends Error {
  readonly reason: 'unsupported_page' | 'no_job_found' | 'login_or_captcha';
  constructor(reason: ExtractionError['reason'], message: string) {
    super(message);
    this.name = 'ExtractionError';
    this.reason = reason;
  }
}
