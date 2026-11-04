import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixtureRepo } from '../../core/test/fixture';
import { E2E_HOME } from '../playwright.config';
import { expectAccessible } from './a11y';

const FIX =
  "--- a/src/handlers.ts\n+++ b/src/handlers.ts\n@@ -5,3 +5,3 @@\n function listUsers(): string[] {\n-  return [];\n+  return ['admin'];\n }\n";

const BAD = FIX.replace("'admin'", "'root'");

test('index a repository, explore it, ask a question, and take a bug through review to a local merge', async ({
  page,
  request,
}) => {
  const root = makeFixtureRepo();
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Repo Owner']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'owner@example.com']);
  const token = readFileSync(join(E2E_HOME, 'token'), 'utf8').trim();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // Without the token the UI explains how to open it.
    await page.goto('/');
    await expect(page.getByText('Open CodeAtlas from your terminal')).toBeVisible();
    await expectAccessible(page, 'no token');
    // The API refuses requests without the token.
    expect((await request.get('/api/repos')).status()).toBe(401);

    await page.goto(`/#token=${token}`);
    await expect(page).toHaveURL(/\/$/); // token removed from the address bar
    // First run shows the welcome screen once (S2-1).
    await expect(page.getByRole('heading', { name: 'Welcome to CodeAtlas' })).toBeVisible();
    await expectAccessible(page, 'welcome');
    await page.getByRole('button', { name: 'Add your first repository' }).click();
    // Clone refuses non-https and local URLs before running git (S1-3).
    await page
      .getByPlaceholder('https://github.com/owner/project.git')
      .fill('http://localhost/x/y');
    await page.getByRole('button', { name: 'Clone and index' }).click();
    await expect(page.getByText('Only https:// repository URLs can be cloned.')).toBeVisible();
    await page.getByPlaceholder('/Users/you/code/my-project').fill(root);
    await page.getByRole('button', { name: 'Add and index' }).click();
    await expect(page.getByText(/Indexed \d/)).toBeVisible({ timeout: 60_000 });
    await expectAccessible(page, 'repositories');
    await page.getByRole('button', { name: /^codeatlas-fixture-/ }).click();

    // Overview: coverage and gaps.
    await expect(page.getByText('Coverage report')).toBeVisible();
    await expect(page.getByText(/Not read \(may contain credentials\)/)).toContainText('.env');
    await expect(page.getByText(/text only.*\.py/)).toBeVisible();

    // Coverage shows branch, manifests and declared frameworks (S1-2).
    await expect(page.getByText(/branch main at [0-9a-f]{10}/)).toBeVisible();
    await expect(page.getByText('Frameworks declared')).toBeVisible();
    await expect(page.getByText('.github/workflows/ci.yml')).toBeVisible();
    await expectAccessible(page, 'overview and coverage');

    // Structure: expand module -> file -> class, collapse again, filter by language (S3-2).
    await page.getByRole('button', { name: 'Structure', exact: true }).click();
    const tree = page.getByRole('list', { name: 'Repository structure' });
    await tree.getByRole('button', { name: 'Expand fixture-app' }).click();
    await tree.getByRole('button', { name: 'Expand src/lib/math.ts' }).click();
    await tree.getByRole('button', { name: 'Expand Calculator' }).click();
    await expect(tree.getByRole('button', { name: 'run', exact: true })).toBeVisible();
    await expect(tree.getByRole('button', { name: 'Collapse Calculator' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expectAccessible(page, 'structure tree');
    await tree.getByRole('button', { name: 'Collapse Calculator' }).click();
    await expect(tree.getByRole('button', { name: 'run', exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Language' }).selectOption('javascript');
    const jsTree = page.getByRole('list', { name: 'Repository structure' });
    await jsTree.getByRole('button', { name: 'Expand fixture-app' }).click();
    await expect(jsTree.getByRole('button', { name: 'src/legacy.js', exact: true })).toBeVisible();
    await expect(jsTree.getByRole('button', { name: 'src/lib/math.ts', exact: true })).toHaveCount(
      0,
    );

    // Integrations tab renders its four groups (S3-3, S3-7).
    await page.getByRole('button', { name: 'Integrations', exact: true }).click();
    await expect(page.getByText(/^Environment variables \(\d+\)$/)).toBeVisible();
    await expect(page.getByText(/^Databases \(\d+\)$/)).toBeVisible();
    await expectAccessible(page, 'integrations');

    // Module documentation from the index, then an overview (no model: evidence only) (S3-5).
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
    await expect(page.getByText('Module documentation')).toBeVisible();
    await expect(page.getByText(/Exports \(\d+\)/)).toBeVisible();
    await expect(page.getByText('src/lib/math.ts:4').first()).toBeVisible();
    await page.getByRole('button', { name: 'Write overview with AI' }).click();
    await expect(
      page.getByText('These are the most relevant places in the repository:'),
    ).toBeVisible();
    await expectAccessible(page, 'module documentation');

    // Risk findings: the fixture's import cycle and the unread .env file (S1-4).
    await page.getByRole('button', { name: 'Risk', exact: true }).click();
    await expect(page.getByText('src/ring/a.ts · src/ring/b.ts')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Potentially sensitive configuration' }),
    ).toBeVisible();
    await expect(page.getByText('supersecretvalue123')).toHaveCount(0);
    await expectAccessible(page, 'risk');

    // Flows: route -> handler -> callee, then node details with evidence.
    await page.getByRole('button', { name: 'Flows' }).click();
    await page.getByRole('button', { name: 'GET /users', exact: true }).click();
    await page.locator('.react-flow__node').filter({ hasText: 'listUsers' }).click();
    await expect(page.getByRole('complementary', { name: 'Node details' })).toContainText(
      'listUsers',
    );
    await expectAccessible(page, 'flows with node details');
    await page.getByRole('button', { name: 'Close' }).click();

    // Ask (no model configured): evidence with citations.
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByLabel('Question').fill('What does handleUsers return?');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByText('Evidence only (no model)')).toBeVisible();
    await expect(page.getByTitle('Index revision the citations refer to')).toContainText('(main)');
    await expect(page.getByRole('button', { name: /S1 · handleUsers/ })).toBeVisible();
    // Answer feedback stays local (S2-1).
    await page.getByRole('button', { name: 'Not useful' }).click();
    await page.getByLabel('Note (optional)').fill('Should mention the route');
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByText('Feedback is kept on this machine only.')).toBeVisible();
    await expectAccessible(page, 'ask');

    // Investigate: bug -> rejected patch -> corrected patch -> approve exact diff -> commit -> merge.
    await page.getByRole('button', { name: 'Investigate' }).click();
    await page.getByLabel('Summary').fill('listUsers returns nothing');
    await page
      .getByLabel('What happens, and what should happen?')
      .fill('GET /users returns [] but listUsers should include admin.');
    await page.getByRole('button', { name: 'Start investigation' }).click();
    await expect(page.getByText('1. Where to look')).toBeVisible();
    await expect(page.getByRole('button', { name: /handleUsers|listUsers/ }).first()).toBeVisible();
    await page.getByLabel('Unified diff').fill(BAD);
    await page.getByRole('button', { name: 'Apply diff in worktree' }).click();
    await expect(page.getByText('3. Review the patch (manual)')).toBeVisible();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByText('rejected', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Unified diff').fill(FIX);
    await page.getByRole('button', { name: 'Apply diff in worktree' }).click();
    const shaText = await page.getByText(/sha256 [0-9a-f]{64}/).textContent();
    const sha = /[0-9a-f]{64}/.exec(shaText ?? '')?.[0] as string;
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      page.getByText('No check has run against this patch yet, so it is not validated.'),
    ).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Approve this exact diff' }).click();
    await expect(page.getByText(/Approved [0-9a-f]{16}…/)).toBeVisible();
    await page.getByLabel('Commit message').fill('fix: include admin');
    await page.getByRole('button', { name: /^Commit to codeatlas\/inv-/ }).click();
    await expect(page.getByText('6. Merge into your branch')).toBeVisible();
    await expect(page.getByText('No validation command has run against this patch.')).toBeVisible();

    // Until merged, the user's checkout is untouched; the fix lives only on the CodeAtlas branch.
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain('return [];');
    expect(
      execFileSync('git', ['-C', root, 'log', '-1', '--format=%s', 'codeatlas/inv-1'], {
        encoding: 'utf8',
      }).trim(),
    ).toBe('fix: include admin');
    expect(
      execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
    ).toBe('main');
    await expect(page.getByText('committed', { exact: true })).toBeVisible();

    // Merge needs the typed hash prefix; the button stays disabled until it matches.
    const mergeButton = page.getByRole('button', { name: 'Merge into main' });
    await page.getByLabel('Approved hash prefix').fill('00000000');
    await expect(mergeButton).toBeDisabled();
    await page.getByLabel('Approved hash prefix').fill(sha.slice(0, 8));
    await mergeButton.click();
    await expect(page.getByText('6. Merged')).toBeVisible();
    await expect(page.getByText('Merged locally')).toBeVisible();
    await expectAccessible(page, 'investigation and merge');
    await expect(
      page.getByText(/Rollback: Revert the merged commit.*git revert [0-9a-f]{40}/),
    ).toBeVisible();
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain("return ['admin'];");
    expect(
      execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ).toBe(
      execFileSync('git', ['-C', root, 'rev-parse', 'codeatlas/inv-1'], {
        encoding: 'utf8',
      }).trim(),
    );

    // Settings: AI status, data location and local analytics of everything above (S2-1).
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText(E2E_HOME, { exact: true })).toBeVisible();
    await expect(page.getByText('👍 0 · 👎 1')).toBeVisible();
    await expect(page.getByText('Should mention the route')).toBeVisible();
    await expect(page.getByText('1 approved / 1 rejected')).toBeVisible();
    await expectAccessible(page, 'settings');
    const del = page.getByRole('button', { name: 'Delete all local data' });
    await expect(del).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await del.click();
    await expect(page.getByRole('status')).toContainText('Your repositories were not touched');
    // The repository's files are unchanged by deletion; the welcome screen returns.
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain("return ['admin'];");
    await page.getByRole('button', { name: '← Repositories' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to CodeAtlas' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
