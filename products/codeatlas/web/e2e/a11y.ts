import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility scan (S2-5, UX-8-01) with axe-core against WCAG 2.0/2.1 A and AA rules.
 * Serious and critical violations fail the test. Moderate and minor ones are attached to the
 * report so they stay visible. Automated rules catch only part of WCAG; this is not an audit.
 */
export async function expectAccessible(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  await test.info().attach(`axe: ${screen}`, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  const blocking = summary.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking, `serious or critical accessibility violations on ${screen}`).toEqual([]);
}
