import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelProvider } from '@nexora/ai';
import {
  indexRepository,
  InvestigationWorkflow,
  openDb,
  WorkflowError,
  type Db,
} from '../src/index';
import { makeFixtureRepo } from './fixture';

let root: string;
let wtRoot: string;
let db: Db;
let repoId: number;
let wf: InvestigationWorkflow;

const g = (args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

function provider(json: unknown): ModelProvider {
  return {
    id: 'fake',
    local: true,
    capabilities: async () => ({
      provider: 'fake',
      available: true,
      model: 'fake',
      models: [],
      contextWindowTokens: 64000,
      supportsJsonSchema: true,
      local: true,
    }),
    generate: async () => ({
      text: JSON.stringify(json),
      model: 'fake',
      provider: 'fake',
      durationMs: 1,
    }),
  };
}

const FIX = `--- a/src/handlers.ts
+++ b/src/handlers.ts
@@ -4,5 +4,5 @@
 
 function listUsers(): string[] {
-  return [];
+  return ['admin'];
 }
 
`;

beforeAll(() => {
  root = makeFixtureRepo();
  g(['config', 'user.name', 'Repo Owner']);
  g(['config', 'user.email', 'owner@example.com']);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  pkg.scripts = { test: 'node check.js', deploy: 'echo deploying', 'lint:fix': 'echo fix' };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(
    join(root, 'check.js'),
    "const fs = require('fs');\nconsole.log('secret visible:', process.env.SUPER_SECRET_TOKEN ? 'yes' : 'no');\nconst ok = fs.readFileSync('src/handlers.ts', 'utf8').includes(\"'admin'\");\nconsole.log(ok ? 'PASS' : 'FAIL');\nprocess.exit(ok ? 0 : 1);\n",
  );
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'add check']);
  // A repository hook that must never run.
  writeFileSync(
    join(root, '.git/hooks/pre-commit'),
    `#!/bin/sh\ntouch "${join(root, 'HOOK_RAN')}"\n`,
  );
  chmodSync(join(root, '.git/hooks/pre-commit'), 0o755);
  writeFileSync(
    join(root, '.git/hooks/post-merge'),
    `#!/bin/sh\ntouch "${join(root, 'HOOK_RAN')}"\n`,
  );
  chmodSync(join(root, '.git/hooks/post-merge'), 0o755);
  wtRoot = mkdtempSync(join(tmpdir(), 'codeatlas-wt-'));
  db = openDb(':memory:');
  repoId = indexRepository(db, root).repoId;
  wf = new InvestigationWorkflow({ db, worktreeRoot: wtRoot, identity: () => 'tester' });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(wtRoot, { recursive: true, force: true });
});

describe('investigation workflow', () => {
  let id: number;
  let sha: string;
  const mainHead = () => g(['rev-parse', 'main']);

  it('records a bug and points at suspect code, affected routes and tests', () => {
    const inv = wf.create(
      repoId,
      'listUsers returns an empty list',
      'GET /users always returns []. listUsers should include the admin user.',
    );
    id = inv.id;
    expect(inv.status).toBe('open');
    expect(inv.analysis.suspects[0]).toMatchObject({ filePath: 'src/handlers.ts' });
    expect(inv.analysis.routesAffected).toContain('GET /users');
  });

  it('creates an isolated worktree on its own branch without touching the user checkout', () => {
    const before = mainHead();
    const inv = wf.ensureWorktree(repoId, id);
    expect(inv.branch).toBe(`codeatlas/inv-${id}`);
    expect(inv.worktreePath?.startsWith(wtRoot)).toBe(true);
    expect(existsSync(join(inv.worktreePath as string, 'src/handlers.ts'))).toBe(true);
    expect(g(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(mainHead()).toBe(before);
  });

  it('rejects patches that escape the repository or do not apply', () => {
    expect(() =>
      wf.proposeManualPatch(
        repoId,
        id,
        '--- a/../../etc/passwd\n+++ b/../../etc/passwd\n@@ -1 +1 @@\n-a\n+b\n',
      ),
    ).toThrow(/Refusing to edit path/);
    expect(() =>
      wf.proposeManualPatch(
        repoId,
        id,
        '--- a/.git/config\n+++ b/.git/config\n@@ -1 +1 @@\n-a\n+b\n',
      ),
    ).toThrow(/Refusing/);
    expect(() =>
      wf.proposeManualPatch(repoId, id, FIX.replace('return [];', 'return nothing;')),
    ).toThrow(/does not apply/);
  });

  it('records a manual patch with its SHA-256 and changed files, in the worktree only', () => {
    const p = wf.proposeManualPatch(repoId, id, FIX, 'Return the admin user');
    sha = p.sha256;
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.files).toEqual([{ path: 'src/handlers.ts', added: 1, deleted: 1 }]);
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain('return [];');
    expect(wf.get(repoId, id).status).toBe('patch_proposed');
  });

  it('only allows allowlisted commands and strips credentials from their environment', async () => {
    expect(wf.commands(repoId, id).map((c) => c.id)).toEqual([
      'install',
      'run:lint:fix',
      'run:test',
    ]);
    await expect(wf.runCommand(repoId, id, 'run:deploy')).rejects.toThrow(/not on the allowlist/);
    await expect(wf.runCommand(repoId, id, 'rm -rf /')).rejects.toThrow(/not on the allowlist/);
    process.env.SUPER_SECRET_TOKEN = 'shh';
    try {
      const r = await wf.runCommand(repoId, id, 'run:test');
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain('PASS');
      expect(r.output).toContain('secret visible: no');
    } finally {
      delete process.env.SUPER_SECRET_TOKEN;
    }
    expect(wf.runs(id)[0]).toMatchObject({ exitCode: 0 });
  });

  it('approval must name the exact diff hash that was reviewed', () => {
    expect(() => wf.approve(repoId, id, '0'.repeat(64))).toThrow(WorkflowError);
    expect(wf.approve(repoId, id, sha)).toMatchObject({ status: 'approved', approvedSha: sha });
    const [a] = wf.approvals(id);
    expect(a).toMatchObject({
      decision: 'approved',
      sha256: sha,
      approver: 'tester',
      validation: 'passed',
      acknowledgedUnvalidated: false,
      baseCommit: mainHead(),
    });
    expect(a?.runIds).toEqual(
      wf
        .runs(id)
        .map((r) => r.id)
        .reverse(),
    );
  });

  it('refuses to commit if the worktree changed after approval', () => {
    const wt = wf.get(repoId, id).worktreePath as string;
    writeFileSync(join(wt, 'sneaky.txt'), 'hidden change');
    expect(() => wf.commit(repoId, id)).toThrow(/changed after approval/);
    rmSync(join(wt, 'sneaky.txt'));
    execFileSync('git', ['-C', wt, 'reset', '-q']);
  });

  it('commits to the investigation branch only, without running hooks, and never merges', () => {
    const before = mainHead();
    const out = wf.commit(repoId, id, 'fix: include admin in listUsers');
    expect(out.investigation.status).toBe('committed');
    expect(g(['log', '-1', '--format=%s', `codeatlas/inv-${id}`])).toBe(
      'fix: include admin in listUsers',
    );
    expect(g(['log', '-1', '--format=%an', `codeatlas/inv-${id}`])).toBe('Repo Owner');
    expect(mainHead()).toBe(before);
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain('return [];');
    expect(existsSync(join(root, 'HOOK_RAN'))).toBe(false);
    expect(out.mergeCommand).toBe(`git -C '${root}' merge --ff-only codeatlas/inv-${id}`);
    expect(out.rollbackCommand).toBe(`git -C '${root}' revert ${out.investigation.commitSha}`);
  });

  it('keeps a complete audit trail', () => {
    expect(wf.events(id).map((e) => e.type)).toEqual([
      'created',
      'worktree_created',
      'patch_proposed',
      'command_refused',
      'command_refused',
      'command_run',
      'approved',
      'commit_refused',
      'committed',
    ]);
  });

  it('discarding removes the worktree but keeps a committed branch', () => {
    const path = wf.get(repoId, id).worktreePath as string;
    wf.discard(repoId, id);
    expect(existsSync(path)).toBe(false);
    expect(g(['branch', '--list', `codeatlas/inv-${id}`])).toContain(`codeatlas/inv-${id}`);
  });
});

describe('model-proposed patches', () => {
  it('applies grounded search/replace edits and records them as a patch', async () => {
    const inv = wf.create(
      repoId,
      'listUsers returns an empty list',
      'listUsers in src/handlers.ts should return admin',
    );
    const p = await wf.proposeModelPatch(
      repoId,
      inv.id,
      provider({
        explanation: 'Return admin.',
        edits: [{ path: 'src/handlers.ts', find: 'return [];', replace: "return ['admin'];" }],
      }),
    );
    expect(p.source).toBe('model');
    expect(p.diff).toContain("+  return ['admin'];");
    wf.discard(repoId, inv.id);
  });

  it('rejects edits outside the investigated files or that match ambiguously, leaving the worktree clean', async () => {
    const inv = wf.create(
      repoId,
      'listUsers returns an empty list',
      'listUsers in src/handlers.ts should return admin',
    );
    await expect(
      wf.proposeModelPatch(
        repoId,
        inv.id,
        provider({
          explanation: 'x',
          edits: [{ path: 'package.json', find: '"test"', replace: '"pwned"' }],
        }),
      ),
    ).rejects.toThrow(/not part of the investigation/);
    await expect(
      wf.proposeModelPatch(
        repoId,
        inv.id,
        provider({
          explanation: 'x',
          edits: [{ path: 'src/handlers.ts', find: 'export function', replace: 'function' }],
        }),
      ),
    ).rejects.toThrow(/matched 2 places/);
    const wt = wf.get(repoId, inv.id).worktreePath as string;
    expect(execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' })).toBe('');
    expect(wf.events(inv.id).filter((e) => e.type === 'model_patch_rejected')).toHaveLength(2);
    wf.discard(repoId, inv.id);
  });

  it('requires git history for patches', () => {
    const plain = makeFixtureRepo(false);
    try {
      const d = openDb(':memory:');
      const r = indexRepository(d, plain);
      const w = new InvestigationWorkflow({ db: d, worktreeRoot: wtRoot });
      const inv = w.create(r.repoId, 'bug', 'listUsers');
      expect(() => w.ensureWorktree(r.repoId, inv.id)).toThrow(/git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('approval records and local merge (S1-1)', () => {
  let id: number;
  let sha: string;
  const BAD = FIX.replace("'admin'", "'root'");
  const head = () => g(['rev-parse', 'HEAD']);
  const prefix = () => sha.slice(0, 8);

  it('a failing validation blocks approval until it is explicitly acknowledged; rejection is recorded', async () => {
    const inv = wf.create(
      repoId,
      'listUsers returns an empty list',
      'listUsers should return admin',
    );
    id = inv.id;
    const bad = wf.proposeManualPatch(repoId, id, BAD, 'Return root');
    const r = await wf.runCommand(repoId, id, 'run:test');
    expect(r.exitCode).toBe(1);
    expect(wf.validationOf(bad.id).validation).toBe('failed');
    expect(() => wf.approve(repoId, id, bad.sha256)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    expect(wf.report(repoId, id).risks[0]).toMatch(/not validated/);
    wf.reject(repoId, id, 'wrong user');
    expect(wf.approvals(id)[0]).toMatchObject({
      decision: 'rejected',
      patchId: bad.id,
      validation: 'failed',
      reason: 'wrong user',
      approver: 'tester',
    });
  });

  it('records an approval with passed validation for the corrected patch', async () => {
    const p = wf.proposeManualPatch(repoId, id, FIX, 'Return admin');
    sha = p.sha256;
    expect(wf.validationOf(p.id).validation).toBe('not_run');
    expect((await wf.runCommand(repoId, id, 'run:test')).exitCode).toBe(0);
    wf.approve(repoId, id, sha);
    expect(wf.approvals(id)[0]).toMatchObject({ decision: 'approved', validation: 'passed' });
  });

  it('refuses to merge before commit and with a wrong confirmation', () => {
    expect(wf.mergeCheck(repoId, id).ok).toBe(false);
    expect(() => wf.merge(repoId, id, prefix())).toThrow(/Commit the approved patch/);
    wf.commit(repoId, id);
    expect(wf.mergeCheck(repoId, id)).toMatchObject({
      ok: true,
      targetBranch: 'main',
      problems: [],
    });
    expect(() => wf.merge(repoId, id, '00000000')).toThrow(/first 8 characters/);
  });

  it('refuses to merge when your working tree has uncommitted tracked changes', () => {
    const before = head();
    writeFileSync(join(root, 'src/handlers.ts'), '// local edit\n', { flag: 'a' });
    try {
      expect(wf.mergeCheck(repoId, id).problems.join(' ')).toMatch(/uncommitted changes/);
      expect(() => wf.merge(repoId, id, prefix())).toThrow(
        expect.objectContaining({ code: 'MERGE_REFUSED' }),
      );
      expect(head()).toBe(before);
    } finally {
      g(['checkout', '--', 'src/handlers.ts']);
    }
  });

  it('refuses to merge when your branch moved since the investigation started', () => {
    writeFileSync(join(root, 'NOTES.md'), 'unrelated\n');
    g(['add', 'NOTES.md']);
    g(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'unrelated work']);
    try {
      expect(wf.mergeCheck(repoId, id).problems.join(' ')).toMatch(/branch moved since/);
      expect(() => wf.merge(repoId, id, prefix())).toThrow(/branch moved since/);
    } finally {
      g(['reset', '-q', '--hard', 'HEAD~1']);
    }
  });

  it('refuses to merge when the investigation branch changed after commit', () => {
    const wt = wf.get(repoId, id).worktreePath as string;
    const gw = (args: string[]) => execFileSync('git', ['-C', wt, ...args], { encoding: 'utf8' });
    writeFileSync(join(wt, 'extra.txt'), 'not reviewed\n');
    gw(['add', 'extra.txt']);
    gw(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'unreviewed']);
    try {
      const problems = wf.mergeCheck(repoId, id).problems.join(' ');
      expect(problems).toMatch(/branch moved after the commit/);
      expect(() => wf.merge(repoId, id, prefix())).toThrow(/branch moved after the commit/);
    } finally {
      gw(['reset', '-q', '--hard', 'HEAD~1']);
    }
  });

  it('refuses to merge when the approval does not match the current patch (changed hash or superseded patch)', () => {
    const inv = wf.get(repoId, id);
    const rejected = wf.patches(id).find((p) => p.status === 'rejected');
    db.prepare('UPDATE investigations SET current_patch_id = ? WHERE id = ?').run(
      rejected?.id ?? null,
      id,
    );
    try {
      expect(wf.mergeCheck(repoId, id).problems.join(' ')).toMatch(/No approval record matches/);
    } finally {
      db.prepare('UPDATE investigations SET current_patch_id = ? WHERE id = ?').run(
        inv.currentPatchId,
        id,
      );
    }
    db.prepare(
      "UPDATE inv_approvals SET sha256 = ? WHERE investigation_id = ? AND decision = 'approved'",
    ).run('f'.repeat(64), id);
    try {
      expect(() => wf.merge(repoId, id, prefix())).toThrow(/No approval record matches/);
    } finally {
      db.prepare(
        "UPDATE inv_approvals SET sha256 = ? WHERE investigation_id = ? AND decision = 'approved'",
      ).run(sha, id);
    }
  });

  it('merges by fast-forward on explicit confirmation, even after the worktree is discarded, and records it', () => {
    const inv = wf.discard(repoId, id);
    expect(inv.status).toBe('committed');
    expect(wf.mergeCheck(repoId, id).ok).toBe(true);
    const out = wf.merge(repoId, id, prefix().toUpperCase());
    expect(out.investigation.status).toBe('merged');
    expect(head()).toBe(inv.commitSha);
    expect(g(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(readFileSync(join(root, 'src/handlers.ts'), 'utf8')).toContain("return ['admin'];");
    expect(existsSync(join(root, 'HOOK_RAN'))).toBe(false);
    expect(out.merge).toMatchObject({
      sha256: sha,
      commitSha: inv.commitSha,
      targetBranch: 'main',
      mergedBy: 'tester',
      approvalId: wf.approvals(id)[0]?.id,
    });
    expect(out.rollback).toBe(`git revert ${inv.commitSha}`);
    expect(wf.merges(id)).toHaveLength(1);
    expect(wf.report(repoId, id).rollback).toContain(`git revert ${inv.commitSha}`);
    expect(() => wf.merge(repoId, id, prefix())).toThrow(
      expect.objectContaining({ code: 'MERGE_REFUSED' }),
    );
    const types = wf.events(id).map((e) => e.type);
    expect(types.filter((t) => t === 'merge_refused').length).toBeGreaterThanOrEqual(4);
    expect(types).toContain('merged');
  });

  it('acknowledged approval of a failing patch is recorded as such', async () => {
    const inv = wf.create(repoId, 'bug', 'listUsers in src/handlers.ts');
    const p = wf.proposeManualPatch(
      repoId,
      inv.id,
      FIX.replace('-  return [];', "-  return ['admin'];").replace(
        "+  return ['admin'];",
        "+  return ['root'];",
      ),
    );
    expect((await wf.runCommand(repoId, inv.id, 'run:test')).exitCode).toBe(1);
    wf.approve(repoId, inv.id, p.sha256, { acknowledgeFailedValidation: true });
    expect(wf.approvals(inv.id)[0]).toMatchObject({
      validation: 'failed',
      acknowledgedUnvalidated: true,
    });
    wf.discard(repoId, inv.id);
  });
});
