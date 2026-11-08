import { readFileSync } from 'node:fs';
import type { BrainModel } from './model';

/** The single-file brain page with a data placeholder, built by `pnpm --filter @nexora/brain build`. */
export const BRAIN_TEMPLATE_PATH = new URL('../template/brain-template.html', import.meta.url);

/** Escapes JSON so it cannot close the <script> element that carries it. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Puts a brain model into the page template, giving one self-contained HTML file. */
export function renderBrainHtml(model: BrainModel, template?: string): string {
  const page = template ?? readFileSync(BRAIN_TEMPLATE_PATH, 'utf8');
  if (!page.includes('__BRAIN_DATA__'))
    throw new Error('The brain template has no data placeholder.');
  const title = model.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return page
    .replace('<title>Architecture brain</title>', () => `<title>${title}</title>`)
    .replace('__BRAIN_DATA__', () => scriptSafeJson(model));
}
