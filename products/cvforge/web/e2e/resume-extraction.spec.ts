import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Upload-and-extract through the real UI with a PDF whose layout reproduces the resume
 * reported on 2026-11-06 (see core/src/__tests__/parse-layouts.test.ts). The review page
 * must show each section filled in the right place, not split across entries.
 */
const PDF = fileURLToPath(
  new URL('../../core/src/__tests__/fixtures/layout-two-line-header.pdf', import.meta.url),
);

test('uploaded PDF resume is extracted into the right sections', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Arjun');
  await page.getByLabel('Email').fill('arjun.extract@example.com');
  await page.getByLabel('Password').fill('a very long passphrase');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/resumes\/upload/);

  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Upload and extract' }).click();
  await expect(page.getByText('Extraction complete')).toBeVisible();

  // Personal information
  await expect(page.getByLabel('Full name')).toHaveValue('ARJUN VERMA');
  await expect(page.getByLabel('Headline')).toHaveValue(
    'Senior Java Full Stack Developer | AI-Agentic Development',
  );
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('arjun.verma@example.com');
  await expect(page.getByLabel('Phone')).toHaveValue('+91-9000000001');

  // Skills: whole bracketed names, every one with a category
  const skills = page.getByLabel('Skill', { exact: true });
  await expect(skills).toHaveCount(60);
  const skillNames = await skills.evaluateAll((els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );
  expect(skillNames).toContain('LLM API Integration (function-calling, tool-use)');
  expect(skillNames).toContain('Software Development Methodologies (Scrum, Agile, Kanban)');
  const categories = await page
    .getByLabel('Category', { exact: true })
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(categories.filter((c) => !c)).toEqual([]);

  // Experience: four roles with the right fields
  const values = async (label: string) =>
    page
      .getByLabel(label, { exact: true })
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(await values('Title')).toEqual([
    'Senior Developer',
    'Associate Technical Lead',
    'Senior Software Engineer',
    'Software Engineer',
  ]);
  expect(await values('Company')).toEqual([
    'Northwind (Client: Contoso)',
    'Fabrikam (Client: Tailspin Hardware Inc)',
    'Litware (Client: Woodgrove Investment Bank Ltd)',
    'Q7Logic Technology',
  ]);
  // The first Location field is the personal one; this resume states no home location.
  expect(await values('Location')).toEqual([
    '',
    'Noida, India',
    'Gurgaon, India',
    'Pune, India',
    'Noida, India',
  ]);

  // Projects and education
  expect(await values('Name')).toEqual([
    'Prompt Smith – AI Prompt Refinement Engine',
    'Airline Reservation System',
    'Banking Management System',
    'Campus Planner – Classroom Scheduling System',
    'Grade Sense – Student Performance Predictor',
  ]);
  expect(await values('Degree')).toEqual([
    'BTech',
    'Higher Secondary Certificate',
    'Secondary School Certificate',
  ]);
  expect(await values('Field')).toEqual(['Computer Science and Engineering', '', '']);
  expect(await values('Institution')).toEqual([
    'Dr. A.B.C. Example Technical University',
    'Elm Public School',
    'Elm Public School',
  ]);

  // Only the real custom section
  expect(await values('Section title')).toEqual(['LEADERSHIP & MENTORSHIP']);

  // The resume page lists the parse review: the missing LinkedIn address is flagged
  await page.getByRole('link', { name: '← Back to resume' }).click();
  await expect(page.getByText(/does not contain its web address/)).toBeVisible();
  await expect(page.getByText(/could not be placed/)).toHaveCount(0);
});
