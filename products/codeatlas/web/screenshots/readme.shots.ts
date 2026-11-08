import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { E2E_HOME } from '../playwright.config';

/** README screenshots of CodeAtlas exploring a fresh clone of this repository. */
const OUT_DIR = resolve(process.cwd(), '../../../documentation/assets/screenshots');
const REPO_ROOT = resolve(process.cwd(), '../../..');

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
}

test('CodeAtlas', async ({ page }) => {
  test.setTimeout(300_000);
  const clone = join(mkdtempSync(join(tmpdir(), 'codeatlas-shots-')), 'nexora');
  execFileSync('git', ['clone', '--quiet', REPO_ROOT, clone]);
  const token = readFileSync(join(E2E_HOME, 'token'), 'utf8').trim();

  await page.goto(`/#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Welcome to CodeAtlas' })).toBeVisible();
  await shot(page, 'codeatlas-welcome');
  await page.getByRole('button', { name: 'Add your first repository' }).click();
  await page.getByPlaceholder('/Users/you/code/my-project').fill(clone);
  await page.getByRole('button', { name: 'Add and index' }).click();
  await expect(page.getByText(/Indexed \d/)).toBeVisible({ timeout: 240_000 });
  await shot(page, 'codeatlas-repositories');
  await page
    .getByRole('button', { name: /^nexora/ })
    .first()
    .click();
  await expect(page.getByText('Coverage report')).toBeVisible();
  await shot(page, 'codeatlas-overview');

  const tab = async (name: string) =>
    page.getByRole('button', { name, exact: true }).first().click();

  // The 3D architecture brain: whole brain, inside one lobe, then one function's links.
  await tab('Brain');
  const brain = page.getByTestId('brain');
  await expect(brain.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500); // let the camera settle
  await shot(page, 'codeatlas-brain');
  await brain.getByRole('button', { name: /^Backend/ }).click();
  await page.waitForTimeout(2500);
  await shot(page, 'codeatlas-brain-backend');
  await brain.getByRole('searchbox', { name: 'Search the brain' }).fill('validateBrain');
  await brain
    .getByRole('option', { name: /^validateBrain/ })
    .first()
    .click();
  await page.waitForTimeout(2500);
  await shot(page, 'codeatlas-brain-method');
  await brain.getByRole('searchbox', { name: 'Search the brain' }).fill('workspaces');
  await brain
    .getByRole('option', { name: /^workspaces\s*Table/ })
    .first()
    .click();
  await page.waitForTimeout(2500);
  await shot(page, 'codeatlas-brain-table');
  await brain.getByRole('button', { name: 'Diagrams' }).click();
  const diagrams = brain.getByRole('dialog', { name: 'Architecture diagrams' });
  await diagrams.getByLabel('Tables from').selectOption({ index: 1 });
  await shot(page, 'codeatlas-diagram-er');
  await diagrams.getByRole('tab', { name: 'Schema diagram' }).click();
  await shot(page, 'codeatlas-diagram-schema');
  await diagrams.getByRole('tab', { name: 'Class diagram' }).click();
  await diagrams.getByLabel('Classes in').selectOption('backend');
  await shot(page, 'codeatlas-diagram-class');
  await diagrams.getByRole('button', { name: 'Close diagrams' }).click();

  await tab('Structure');
  const tree = page.getByRole('list', { name: 'Repository structure' });
  await tree
    .getByRole('button', { name: /^Expand / })
    .first()
    .click();
  await shot(page, 'codeatlas-structure');
  for (const name of ['Modules', 'Dependencies', 'Integrations', 'Risk', 'Knowledge']) {
    await tab(name);
    await shot(page, `codeatlas-${name.toLowerCase()}`);
  }
  await tab('Flows');
  await page.getByRole('button', { name: 'GET /api/auth/me', exact: true }).click();
  await shot(page, 'codeatlas-flows');

  await tab('Ask');
  await page.getByLabel('Question').fill('How does the resume parser detect section headings?');
  await page.getByRole('button', { name: /^Ask/ }).last().click();
  await expect(page.getByRole('button', { name: /^S1 · / })).toBeVisible({ timeout: 60_000 });
  await shot(page, 'codeatlas-ask');

  await tab('Investigate');
  await shot(page, 'codeatlas-investigate');
});
