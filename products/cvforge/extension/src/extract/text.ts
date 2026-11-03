/**
 * Convert visible DOM content to plain text with line breaks and bullets.
 * Works in browsers and in jsdom (which has no innerText).
 */
const BLOCK = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'UL',
  'OL',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BR',
  'TR',
  'TABLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'DD',
  'DT',
  'BLOCKQUOTE',
  'PRE',
]);
const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'BUTTON',
  'IFRAME',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'NAV',
  'FORM',
]);

export const MAX_TEXT = 50_000;

function isHidden(el: Element): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const style = (el as HTMLElement).style;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  const view = el.ownerDocument.defaultView;
  // Real browsers: respect computed visibility. jsdom returns defaults here.
  if (view && typeof view.getComputedStyle === 'function') {
    const cs = view.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
  }
  return false;
}

export function visibleText(root: Element): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push((node.textContent ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (SKIP.has(el.tagName) || isHidden(el)) return;
    const block = BLOCK.has(el.tagName);
    if (block) out.push('\n');
    if (el.tagName === 'LI') out.push('• ');
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) out.push('\n');
  };
  walk(root);
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

export function textOf(doc: Document, selectors: string[]): string {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const t = el ? visibleText(el).replace(/\n+/g, ' ').trim() : '';
    if (t) return t.slice(0, 300);
  }
  return '';
}

export function firstElement(doc: Document, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && visibleText(el).length > 0) return el;
  }
  return null;
}
