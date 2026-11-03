import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CoverageReport } from '@nexora/codeatlas-core';

export interface Job {
  id: string;
  repoId: number;
  root: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
  report?: CoverageReport;
}

const CHILD = fileURLToPath(new URL('./index-child.ts', import.meta.url));
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const TIMEOUT_MS = 30 * 60_000;

/** Runs indexing out of process so the API stays responsive; one job per repository at a time. */
export class JobRunner {
  private jobs = new Map<string, Job>();
  private children = new Map<string, ReturnType<typeof fork>>();

  constructor(
    private readonly dbPath: string,
    /** Called once for every job when it ends: succeeded, failed or cancelled. */
    private readonly onFinished?: (job: Job) => void,
  ) {}

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  activeFor(repoId: number): Job | undefined {
    return [...this.jobs.values()].find((j) => j.repoId === repoId && j.status === 'running');
  }

  start(repoId: number, root: string, onDone?: (job: Job) => void): Job {
    const existing = this.activeFor(repoId);
    if (existing) return existing;
    const job: Job = {
      id: randomUUID(),
      repoId,
      root,
      status: 'running',
      progress: [],
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    const child = fork(CHILD, [this.dbPath, root], {
      execArgv: ['--no-warnings', '--import', TSX],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    this.children.set(job.id, child);
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('message', (m: { type: string; message?: string; report?: CoverageReport }) => {
      if (m.type === 'progress' && m.message) job.progress.push(m.message);
      if (m.type === 'done') job.report = m.report;
      if (m.type === 'error') job.error = m.message;
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      this.children.delete(job.id);
      job.finishedAt = new Date().toISOString();
      if (job.status === 'cancelled') job.error = 'Cancelled. The previous index is unchanged.';
      else if (code === 0 && job.report) job.status = 'succeeded';
      else {
        job.status = 'failed';
        job.error ??=
          signal === 'SIGKILL'
            ? 'Indexing timed out.'
            : `Indexer exited with code ${code}. ${stderr.split('\n').filter(Boolean).slice(-3).join(' ')}`;
      }
      // Keep the last 50 jobs.
      if (this.jobs.size > 50) this.jobs.delete(this.jobs.keys().next().value as string);
      this.onFinished?.(job);
      onDone?.(job);
    });
    return job;
  }

  /**
   * Stop a running index. The child is killed; its uncommitted SQLite
   * transaction is rolled back, so the previous index stays queryable.
   * Resolves once the child has exited.
   */
  cancel(id: string): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    const child = this.children.get(id);
    if (!job || job.status !== 'running' || !child) return Promise.resolve(job);
    job.status = 'cancelled';
    return new Promise((resolve) => {
      const force = setTimeout(() => child.kill('SIGKILL'), 3_000);
      child.once('exit', () => {
        clearTimeout(force);
        resolve(job);
      });
      child.kill('SIGTERM');
    });
  }
}
