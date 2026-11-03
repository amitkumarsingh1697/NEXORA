import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseResumeText, renderDocx } from '@nexora/cvforge-core';
import { expectAccessible } from './a11y';

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

test('complete resume intelligence journey', async ({ page }) => {
  const dir = join(process.cwd(), '.data', 'e2e');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'priya.docx');
  await writeFile(file, await renderDocx(parseResumeText(RESUME).content, 'classic'));

  // Sign up
  await page.goto('/signup');
  await expectAccessible(page, 'sign up');
  await page.getByLabel('Name').fill('Priya');
  await page.getByLabel('Email').fill('priya@example.com');
  await page.getByLabel('Password').fill('a very long passphrase');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/resumes\/upload/);

  // Upload
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(page.getByText('Extraction complete')).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue('Priya Sharma');
  await expectAccessible(page, 'resume review and editor');

  // Correct and confirm
  await page.getByLabel('Headline').fill('Senior Software Engineer (Payments)');
  await page.getByRole('button', { name: 'Confirm version' }).click();
  await expect(page.getByText('Version confirmed')).toBeVisible();

  // Workspace
  await page.goto('/workspaces/new');
  await page.getByLabel('Job description').fill(JD);
  await page.getByRole('button', { name: 'Create workspace and analyse' }).click();
  await expect(page.getByText('Job Match Score')).toBeVisible();
  await expect(page.getByText(/pending clarification/).first()).toBeVisible();
  await expectAccessible(page, 'workspace analysis');

  // Requirement matrix shows evidence
  await page.getByRole('tab', { name: 'Requirements' }).click();
  await expect(page.getByText('Demonstrated').first()).toBeVisible();
  await expectAccessible(page, 'requirement matrix');

  // Clarify: confirm Kubernetes, skip AWS
  await page.getByRole('tab', { name: /Clarify/ }).click();
  const k8s = page.locator('section', { hasText: 'Have you used Kubernetes' });
  await k8s
    .getByLabel('Your answer')
    .fill('Deployed the FinPay payment services to Kubernetes clusters');
  await k8s.getByRole('button', { name: 'Yes, I have this' }).click();
  await expect(page.getByText('Answer recorded and analysis updated.')).toBeVisible();
  await expectAccessible(page, 'clarification questions');
  const aws = page.locator('section', { hasText: 'Have you used AWS' });
  await aws.getByRole('button', { name: 'Skip' }).click();
  await expect(aws.getByText('Skipped')).toBeVisible();

  // Scores are explained
  await page.getByRole('tab', { name: 'Scores' }).click();
  await expect(page.getByText('Required skills and qualifications').first()).toBeVisible();
  await expect(page.getByText('Uncertainty').first()).toBeVisible();
  await expectAccessible(page, 'score explanations');

  // Suggestions: accept bullet, reject a skill
  await page.getByRole('tab', { name: 'Suggestions' }).click();
  await page.getByRole('button', { name: 'Generate suggestions' }).click();
  const bullet = page.locator('section', { hasText: 'Add bullet' }).first();
  await expect(bullet).toBeVisible();
  await bullet.getByRole('button', { name: 'Accept' }).click();
  await expect(bullet.getByText('accepted')).toBeVisible();
  const skill = page.locator('section', { hasText: 'Add skill' }).first();
  await skill.getByRole('button', { name: 'Reject' }).click();
  await expect(skill.getByText('rejected')).toBeVisible();
  await expectAccessible(page, 'suggestions');
  await page.getByRole('button', { name: 'Create version' }).click();

  // Compare
  await expect(page).toHaveURL(/compare/);
  await expect(page.getByText('Structured changes')).toBeVisible();
  await expect(
    page.getByText('Deployed the FinPay payment services to Kubernetes clusters').first(),
  ).toBeVisible();
  await expect(page.getByText('Decision record')).toBeVisible();
  await expectAccessible(page, 'version comparison');

  // Export DOCX and PDF
  await page.goto('/exports');
  for (const format of ['docx', 'pdf'] as const) {
    await page.getByLabel('Format').selectOption(format);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate and download' }).click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(new RegExp(`_v2_classic\\.${format}$`));
  }
  await expect(page.getByText('Matches version').first()).toBeVisible();
  await expectAccessible(page, 'exports');

  // Job comparison (RI-4.4-04): a second job, analysed against the newer version
  await page.goto('/workspaces/new');
  await page.getByLabel('Job description').fill(JD2);
  await page.getByRole('button', { name: 'Create workspace and analyse' }).click();
  await expect(page.getByText('Job Match Score')).toBeVisible();
  await page.goto('/workspaces');
  const boxes = page.getByRole('checkbox', { name: /^Compare / });
  await expect(boxes).toHaveCount(2);
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText('Skills these jobs share')).toBeVisible();
  const shared = page.locator('tr', {
    has: page.getByRole('cell', { name: 'Kafka', exact: true }),
  });
  await expect(shared).toBeVisible();
  await expect(page.getByText(/analysed against different resume versions/)).toBeVisible();
  await expectAccessible(page, 'job comparison');
  await page.goto('/dashboard');
  await expectAccessible(page, 'dashboard');
});

test('unauthenticated users are redirected and APIs refuse access', async ({ page, request }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  const r = await request.get('/api/resumes');
  expect(r.status()).toBe(401);
  const csrf = await request.post('/api/auth/login', {
    headers: { origin: 'https://evil.example' },
    data: { email: 'a@b.co', password: 'x' },
  });
  expect(csrf.status()).toBe(403);
});
