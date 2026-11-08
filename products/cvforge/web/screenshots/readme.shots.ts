import { test, expect, chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';

/**
 * README screenshots of CVForge, taken from a real running build. Every name,
 * company and job here is made up. Output: documentation/assets/screenshots.
 */
const OUT_DIR = resolve(process.cwd(), '../../../documentation/assets/screenshots');
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const EXT_DIR = resolve(process.cwd(), '../extension');
const EXT_OUT = join(EXT_DIR, '.output-e2e');
const PDF = resolve(process.cwd(), '../core/src/__tests__/fixtures/layout-two-line-header.pdf');

const RESUME = `Priya Sharma
Senior Software Engineer
priya.sharma@example.com | +91 98765 43210 | Pune, India

SUMMARY
Backend engineer focused on Java microservices for payments.

SKILLS
Languages: Java, SQL, Python
Frameworks: Spring Boot, Hibernate

EXPERIENCE
Senior Software Engineer | FinPay Technologies | Pune
Jan 2019 – Present
• Designed and built Java microservices for payment processing handling 2 million transactions per day
• Responsible for developing REST APIs consumed by 3 partner banks
Software Engineer, DataWorks Ltd, Bengaluru
Jun 2015 - Dec 2018
• Implemented Kafka consumers for event ingestion

EDUCATION
B.Tech in Computer Science, Pune Institute of Technology, 2011 - 2015
`;

const JD = `Senior Backend Engineer
Company: Acme Payments
Location: Bengaluru, India (Hybrid)

Responsibilities
- Design and build scalable microservices for payment processing

Requirements
- 6+ years of professional software development experience
- Strong experience with Java and Spring Boot
- Experience with Kafka, Kubernetes and AWS
- Bachelor's degree in Computer Science or related field
`;

const JD2 = `Platform Engineer
Company: Beta Cloud
Location: Remote

Requirements
- Strong experience with Java
- Experience with Kafka and Terraform
`;

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForLoadState('networkidle');
  // Let transitions settle so the picture shows final colours.
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage });
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a very long passphrase');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/resumes\/upload/);
}

test('CVForge web app', async ({ page }) => {
  await mkdir(OUT_DIR, { recursive: true });
  await page.goto('/');
  await shot(page, 'cvforge-home');
  await page.goto('/signup');
  await shot(page, 'cvforge-signup');

  await signUp(page, 'Priya', 'priya@example.com');
  await shot(page, 'cvforge-upload');
  const dir = join(process.cwd(), '.data', 'e2e');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'priya.docx');
  await writeFile(file, await renderDocx(parseResumeText(RESUME).content, 'classic'));
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(page.getByText('Extraction complete')).toBeVisible();
  await shot(page, 'cvforge-resume-review');
  await page.getByRole('button', { name: 'Confirm version' }).click();
  await expect(page.getByText('Version confirmed')).toBeVisible();

  await page.goto('/workspaces/new');
  await page.getByLabel('Job description').fill(JD);
  await shot(page, 'cvforge-new-workspace');
  await page.getByRole('button', { name: 'Create workspace and analyse' }).click();
  await expect(page.getByText('Job Match Score')).toBeVisible();
  await shot(page, 'cvforge-analysis', true);

  await page.getByRole('tab', { name: 'Requirements' }).click();
  await expect(page.getByText('Demonstrated').first()).toBeVisible();
  await shot(page, 'cvforge-requirements', true);

  await page.getByRole('tab', { name: /Clarify/ }).click();
  const k8s = page.locator('section', { hasText: 'Have you used Kubernetes' });
  await k8s
    .getByLabel('Your answer')
    .fill('Deployed the FinPay payment services to Kubernetes clusters');
  await shot(page, 'cvforge-clarify');
  await k8s.getByRole('button', { name: 'Yes, I have this' }).click();
  await expect(page.getByText('Answer recorded and analysis updated.')).toBeVisible();

  await page.getByRole('tab', { name: 'Scores' }).click();
  await expect(page.getByText('Uncertainty').first()).toBeVisible();
  await shot(page, 'cvforge-scores', true);

  await page.getByRole('tab', { name: 'Suggestions' }).click();
  await page.getByRole('button', { name: 'Generate suggestions' }).click();
  const bullet = page.locator('section', { hasText: 'Add bullet' }).first();
  await expect(bullet).toBeVisible();
  await bullet.getByRole('button', { name: 'Accept' }).click();
  await expect(bullet.getByText('accepted')).toBeVisible();
  await shot(page, 'cvforge-suggestions', true);
  await page.getByRole('button', { name: 'Create version' }).click();
  await expect(page).toHaveURL(/compare/);
  await expect(page.getByText('Structured changes')).toBeVisible();
  await shot(page, 'cvforge-compare', true);

  await page.goto('/exports');
  await page.getByLabel('Format').selectOption('pdf');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate and download' }).click();
  await download;
  await expect(page.getByText('Matches version')).toBeVisible();
  await shot(page, 'cvforge-exports');

  await page.goto('/workspaces/new');
  await page.getByLabel('Job description').fill(JD2);
  await page.getByRole('button', { name: 'Create workspace and analyse' }).click();
  await expect(page.getByText('Job Match Score')).toBeVisible();
  await page.goto('/workspaces');
  const boxes = page.getByRole('checkbox', { name: /^Compare / });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText('Skills these jobs share')).toBeVisible();
  await shot(page, 'cvforge-job-comparison', true);

  await page.goto('/dashboard');
  await shot(page, 'cvforge-dashboard');
  await page.goto('/settings/extension');
  await page.getByRole('button', { name: 'Generate pairing code' }).click();
  await shot(page, 'cvforge-extension-pairing');
});

test('CVForge PDF extraction', async ({ page }) => {
  await signUp(page, 'Arjun', 'arjun.verma@example.com');
  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(page.getByText('Extraction complete')).toBeVisible();
  await shot(page, 'cvforge-pdf-extraction');
});

test('CVForge browser extension', async () => {
  execFileSync('pnpm', ['exec', 'wxt', 'build'], {
    cwd: EXT_DIR,
    env: { ...process.env, WXT_CVFORGE_URL: BASE, WXT_OUT_DIR: EXT_OUT },
    stdio: 'pipe',
  });
  const extPath = join(EXT_OUT, 'chrome-mv3');
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  const JOB_LD = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: 'Senior Node.js Engineer',
    hiringOrganization: { name: 'Initech' },
    jobLocation: { address: { addressLocality: 'Pune', addressCountry: 'IN' } },
    description:
      '<p>We are hiring a Senior Node.js Engineer.</p><ul><li>5+ years of experience with Node.js and TypeScript</li><li>Experience with PostgreSQL and Kubernetes</li></ul>',
  };
  await ctx.route(`${BASE}/__fixture/job`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Job</title><script type="application/ld+json">${JSON.stringify(JOB_LD)}</script></head><body><h1>Senior Node.js Engineer</h1><p>Initech, Pune</p></body></html>`,
    }),
  );
  const app = await ctx.newPage();
  await signUp(app, 'Neha', 'neha@example.com');
  const dir = join(process.cwd(), '.data', 'e2e');
  const file = join(dir, 'neha.docx');
  await writeFile(file, await renderDocx(parseResumeText(RESUME).content, 'classic'));
  await app.locator('input[type=file]').setInputFiles(file);
  await app.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(app.getByText('Extraction complete')).toBeVisible();
  await app.getByRole('button', { name: 'Confirm version' }).click();
  await expect(app.getByText('Version confirmed')).toBeVisible();
  await app.goto(`${BASE}/settings/extension`);
  await app.getByRole('button', { name: 'Generate pairing code' }).click();
  const code = (await app.locator('p[aria-live=polite]').textContent())?.trim() ?? '';

  const job = await ctx.newPage();
  await job.goto(`${BASE}/__fixture/job`);
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 400, height: 640 });
  await popup.goto('chrome://extensions');
  const id = await popup.evaluate(
    () =>
      document
        .querySelector('extensions-manager')
        ?.shadowRoot?.querySelector('extensions-item-list')
        ?.shadowRoot?.querySelector('extensions-item')?.id ?? '',
  );
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await shot(popup, 'extension-pair', true);
  await popup.getByLabel('Pairing code').fill(code);
  await popup.getByRole('button', { name: 'Connect' }).click();
  await expect(popup.getByRole('button', { name: 'Extract job from this tab' })).toBeVisible();
  await shot(popup, 'extension-ready', true);
  // Playwright cannot click the toolbar icon, so point "active tab" at the job page.
  await popup.evaluate(async (url) => {
    const c = (globalThis as unknown as { chrome: any }).chrome; // eslint-disable-line @typescript-eslint/no-explicit-any
    const [target] = await c.tabs.query({ url });
    const original = c.tabs.query.bind(c.tabs);
    Object.defineProperty(c.tabs, 'query', {
      configurable: true,
      value: async (q: { active?: boolean }) => (q.active ? [target] : original(q)),
    });
  }, `${BASE}/__fixture/job`);
  await popup.getByRole('button', { name: 'Extract job from this tab' }).click();
  await expect(popup.getByLabel('Job title')).toHaveValue('Senior Node.js Engineer');
  await shot(popup, 'extension-review', true);
  await popup.getByRole('button', { name: 'Save to CVForge' }).click();
  await expect(popup.getByText('Saved to CVForge.')).toBeVisible();
  await shot(popup, 'extension-saved', true);
  await ctx.close();
});
