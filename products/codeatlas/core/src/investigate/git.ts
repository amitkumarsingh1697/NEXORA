import { execFile, execFileSync } from 'node:child_process';

/** Environment for git: no prompts, no pager, no repository hooks. */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  GIT_OPTIONAL_LOCKS: '0',
};
// Hooks are repository-defined code; CodeAtlas never runs them.
const SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false'];

export class GitError extends Error {}

export function git(dir: string, args: string[], input?: string): string {
  try {
    return execFileSync('git', [...SAFE, '-C', dir, ...args], {
      encoding: 'utf8',
      env: GIT_ENV,
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new GitError(
      (err.stderr || err.message).toString().trim().split('\n').slice(-3).join(' '),
    );
  }
}

export function gitAsync(dir: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...SAFE, '-C', dir, ...args],
      { encoding: 'utf8', env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) =>
        err ? reject(new GitError(stderr.trim() || err.message)) : resolve(stdout),
    );
  });
}
