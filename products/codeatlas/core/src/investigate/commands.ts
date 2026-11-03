import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Command allowlist for investigation worktrees. Only these shapes can run:
 *   <pm> install (lockfile, lifecycle scripts disabled)
 *   <pm> run <script>  where <script> exists in package.json and is a test/typecheck/lint/build/check script
 * Commands run with execFile (no shell), inside the worktree, with a timeout,
 * capped output, and credentials removed from the environment. Package scripts
 * are code from the repository itself, so every run is an explicit user action.
 */

export interface AllowedCommand {
  id: string;
  label: string;
  file: string;
  args: string[];
  description: string;
}

const SCRIPT_RE = /^(test|typecheck|lint|build|check)(:[\w-]+)?$/;
const SECRET_ENV =
  /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|API_KEY|APIKEY|^AWS_|^GH_|^GITHUB_|^NPM_|^OPENAI|^ANTHROPIC|^AI_API|^DATABASE_URL$|^PG/i;
export const MAX_OUTPUT = 200_000;
export const COMMAND_TIMEOUT_MS = 10 * 60_000;

export function packageManager(dir: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function allowedCommands(dir: string): AllowedCommand[] {
  const pkgFile = join(dir, 'package.json');
  if (!existsSync(pkgFile)) return [];
  let scripts: Record<string, string> = {};
  try {
    scripts =
      (JSON.parse(readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }).scripts ??
      {};
  } catch {
    return [];
  }
  const pm = packageManager(dir);
  const install: AllowedCommand =
    pm === 'npm'
      ? {
          id: 'install',
          label: 'npm ci --ignore-scripts',
          file: 'npm',
          args: ['ci', '--ignore-scripts'],
          description: 'Install dependencies from the lockfile without running install scripts.',
        }
      : {
          id: 'install',
          label: `${pm} install --frozen-lockfile --ignore-scripts`,
          file: pm,
          args: ['install', '--frozen-lockfile', '--ignore-scripts'],
          description: 'Install dependencies from the lockfile without running install scripts.',
        };
  const runs = Object.keys(scripts)
    .filter((s) => SCRIPT_RE.test(s))
    .sort()
    .map((s) => ({
      id: `run:${s}`,
      label: `${pm} run ${s}`,
      file: pm,
      args: ['run', s],
      description: `Runs the "${s}" script from package.json: ${String(scripts[s]).slice(0, 160)}`,
    }));
  return [install, ...runs];
}

export function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  env.CI = '1';
  env.FORCE_COLOR = '0';
  return env;
}

export interface RunResult {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  durationMs: number;
}

export function runAllowed(
  dir: string,
  id: string,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<RunResult> {
  const cmd = allowedCommands(dir).find((c) => c.id === id);
  if (!cmd)
    return Promise.reject(
      new Error(`Command "${id}" is not on the allowlist for this repository.`),
    );
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(
      cmd.file,
      cmd.args,
      {
        cwd: dir,
        env: scrubbedEnv(),
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        killSignal: 'SIGKILL',
        shell: false,
      },
      (err, stdout, stderr) => {
        const e = err as
          (Error & { code?: number | string; killed?: boolean; signal?: string }) | null;
        let output = `${stdout}${stderr ? `\n${stderr}` : ''}`;
        if (output.length > MAX_OUTPUT) output = `…(truncated)\n${output.slice(-MAX_OUTPUT)}`;
        const timedOut = !!e?.killed && Date.now() - started >= timeoutMs - 50;
        resolve({
          command: cmd.label,
          exitCode: e ? (typeof e.code === 'number' ? e.code : null) : 0,
          timedOut,
          output: e && typeof e.code === 'string' ? `${output}\n${e.message}` : output,
          durationMs: Date.now() - started,
        });
      },
    );
  });
}
