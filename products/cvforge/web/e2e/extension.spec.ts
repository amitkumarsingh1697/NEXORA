import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';

/**
 * Real-browser test of the CVForge extension against the running server:
 * pair with a single-use code from Settings, extract a job page, review, save,
 * then confirm the workspace exists and that the code cannot be reused.
 *
 * Limitation: Playwright cannot click the toolbar icon, which is what grants
 * `activeTab` in real use. The fixture job page is therefore served on the
 * CVForge origin (already in host_permissions), and the popup, opened as a tab,
 * is told which tab is "active". Everything else is the shipped code path.
 */

// Minimal typing for the extension APIs used inside popup.evaluate().
interface QueryInfo {
  url?: string;
  active?: boolean;
  currentWindow?: boolean;
}
interface StorageArea {
  get(keys: null): Promise<Record<string, unknown>>;
}
declare const chrome: {
  storage: { local: StorageArea; session: StorageArea };
  tabs: { query(q: QueryInfo): Promise<{ id?: number }[]> };
  scripting: {
    executeScript<T>(o: {
      target: { tabId: number };
      func: () => Promise<T>;
    }): Promise<{ result?: T }[]>;
  };
};

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const EXT_DIR = resolve(process.cwd(), '../extension');
const OUT = join(EXT_DIR, '.output-e2e');

const RESUME = `Arjun Mehta
Backend Engineer
arjun.mehta@example.com | Pune, India

SKILLS
Languages: TypeScript, SQL
Frameworks: Node.js, Express

EXPERIENCE
Backend Engineer | Orbit Labs | Pune
Jan 2020 – Present
• Built Node.js APIs in TypeScript serving 40 internal teams
`;

const JOB_LD = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Senior Node.js Engineer',
  hiringOrganization: { name: 'Initech' },
  jobLocation: { address: { addressLocality: 'Pune', addressCountry: 'IN' } },
  description:
    '<p>We are hiring a Senior Node.js Engineer.</p><ul><li>5+ years of experience with Node.js and TypeScript</li><li>Experience with PostgreSQL and Kubernetes</li></ul>',
};

let ctx: BrowserContext;

test.beforeAll(() => {
  execFileSync('pnpm', ['exec', 'wxt', 'build'], {
    cwd: EXT_DIR,
    env: { ...process.env, WXT_CVFORGE_URL: BASE, WXT_OUT_DIR: OUT },
    stdio: 'pipe',
  });
});

test.afterAll(async () => {
  await ctx?.close();
});

async function extensionId(page: Page): Promise<string> {
  await page.goto('chrome://extensions');
  return page.evaluate(() => {
    const list = document
      .querySelector('extensions-manager')
      ?.shadowRoot?.querySelector('extensions-item-list')?.shadowRoot;
    return list?.querySelector('extensions-item')?.id ?? '';
  });
}

test('extension pairs, extracts a job, and saves it to a workspace', async () => {
  const extPath = join(OUT, 'chrome-mv3');
  ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  await ctx.route(`${BASE}/__fixture/job`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Job</title><script type="application/ld+json">${JSON.stringify(JOB_LD)}</script></head><body><nav>Home</nav><p>Careers at Initech</p></body></html>`,
    }),
  );

  // Account with a confirmed resume version.
  const app = await ctx.newPage();
  await app.goto(`${BASE}/signup`);
  await app.getByLabel('Name').fill('Arjun');
  await app.getByLabel('Email').fill('arjun@example.com');
  await app.getByLabel('Password').fill('another long passphrase');
  await app.getByRole('checkbox').check();
  await app.getByRole('button', { name: 'Create account' }).click();
  await expect(app).toHaveURL(/\/resumes\/upload/);
  const dir = join(process.cwd(), '.data', 'e2e');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'arjun.docx');
  await writeFile(file, await renderDocx(parseResumeText(RESUME).content, 'classic'));
  await app.locator('input[type=file]').setInputFiles(file);
  await app.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(app.getByText('Extraction complete')).toBeVisible();
  await app.getByRole('button', { name: 'Confirm version' }).click();
  await expect(app.getByText('Version confirmed')).toBeVisible();

  // Pairing code from Settings.
  await app.goto(`${BASE}/settings/extension`);
  await app.getByRole('button', { name: 'Generate pairing code' }).click();
  const code = (await app.locator('p[aria-live=polite]').textContent())?.trim() ?? '';
  expect(code.length).toBeGreaterThanOrEqual(8);

  const job = await ctx.newPage();
  await job.goto(`${BASE}/__fixture/job`);

  const popup = await ctx.newPage();
  const errors: string[] = [];
  popup.on('pageerror', (e) => errors.push(e.message));
  const id = await extensionId(popup);
  expect(id).toMatch(/^[a-p]{32}$/);
  await popup.goto(`chrome-extension://${id}/popup.html`);

  // Pair.
  await popup.getByLabel('Pairing code').fill(code);
  await popup.getByRole('button', { name: 'Connect' }).click();
  await expect(popup.getByRole('button', { name: 'Extract job from this tab' })).toBeVisible();

  // Tokens: refresh token persisted, access token only in session storage.
  const stored = await popup.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
  }));
  expect(Object.keys(stored.local).sort()).toEqual(['cvf.deviceId', 'cvf.refreshToken']);
  expect(String(stored.session['cvf.accessToken'])).toMatch(/^ext1\./);

  // Content scripts (including our injected extractor) cannot read credentials:
  // storage is restricted to trusted extension contexts (research R4, S1-5).
  const fromContentScript = await popup.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: async () => {
        try {
          return { keys: Object.keys(await chrome.storage.local.get(null)) };
        } catch (e) {
          return { denied: String((e as Error).message ?? e) };
        }
      },
    });
    return res?.result as { keys?: string[]; denied?: string };
  }, `${BASE}/__fixture/job`);
  expect(fromContentScript.keys ?? []).not.toContain('cvf.refreshToken');
  expect(fromContentScript.denied).toBeTruthy();

  // Point "active tab" at the fixture page (see limitation above), then extract.
  await popup.evaluate(async (url) => {
    const [target] = await chrome.tabs.query({ url });
    const original = chrome.tabs.query.bind(chrome.tabs);
    Object.defineProperty(chrome.tabs, 'query', {
      configurable: true,
      value: async (q: QueryInfo) => (q.active ? [target] : original(q)),
    });
  }, `${BASE}/__fixture/job`);
  await popup.getByRole('button', { name: 'Extract job from this tab' }).click();

  // Review step shows extracted, editable fields.
  await expect(popup.getByLabel('Job title')).toHaveValue('Senior Node.js Engineer');
  await expect(popup.getByLabel('Company')).toHaveValue('Initech');
  await expect(popup.getByLabel(/Job description/)).toHaveValue(/PostgreSQL and Kubernetes/);
  await expect(popup.getByLabel('Compare against resume')).toBeVisible();
  await popup.getByLabel('Company').fill('Initech Ltd');
  await popup.getByRole('button', { name: 'Save to CVForge' }).click();
  await expect(popup.getByText('Saved to CVForge.')).toBeVisible();
  const href = await popup
    .getByRole('link', { name: 'Open the analysis workspace' })
    .getAttribute('href');
  expect(href).toMatch(new RegExp(`^${BASE}/workspaces/[0-9a-f-]{36}$`));

  // The workspace exists for the signed-in user, with the edited company.
  await app.goto(href ?? '');
  await expect(app.getByText('Initech Ltd').first()).toBeVisible();

  // The pairing code is single-use.
  const reuse = await app.request.post(`${BASE}/api/extension/pair`, {
    data: { code, deviceName: 'replay' },
  });
  expect(reuse.status()).toBe(401);

  // Disconnect revokes the device and clears local credentials.
  await popup.getByRole('button', { name: 'Disconnect' }).click();
  await expect(popup.getByLabel('Pairing code')).toBeVisible();
  const after = await popup.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
  expect(after).toEqual([]);
  expect(errors).toEqual([]);
});
