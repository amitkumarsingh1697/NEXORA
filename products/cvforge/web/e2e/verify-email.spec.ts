import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expectAccessible } from './a11y';

const OUTBOX = join(process.cwd(), '.data', 'e2e', 'outbox');

/** Newest confirmation link the outbox holds for an address. */
async function latestLink(to: string): Promise<string> {
  const names = (await readdir(OUTBOX)).filter((n) => n.endsWith('.eml')).sort();
  for (const n of names.reverse()) {
    const text = await readFile(join(OUTBOX, n), 'utf8');
    const m = /verify-email\?token=(\S+)/.exec(text);
    if (text.startsWith(`To: ${to}\n`) && m) return `/verify-email?token=${m[1]}`;
  }
  throw new Error(`no confirmation mail for ${to}`);
}

test('email confirmation from the outbox link', async ({ page }) => {
  const email = `confirm-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Confirm');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a very long passphrase');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/resumes\/upload/);

  await page.goto('/settings');
  await expect(page.getByText('Email address not confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByText('A new confirmation link is on its way.')).toBeVisible();
  await expectAccessible(page, 'settings with confirmation banner');

  await page.goto(await latestLink(email));
  await expectAccessible(page, 'confirm email');
  await page.getByRole('button', { name: 'Confirm email address' }).click();
  await expect(page.getByText('Email address confirmed')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Email address not confirmed')).toHaveCount(0);

  // The same link cannot be used twice.
  await page.goto(await latestLink(email));
  await page.getByRole('button', { name: 'Confirm email address' }).click();
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();
});
