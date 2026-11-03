import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CoverageReport } from '@nexora/codeatlas-core';

export interface Job {
  id: string;
  repoId: number;
  root: string;
  status: 'running' | 'succeeded' | 'failed';
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

  constructor(private readonly dbPath: string) {}

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
      job.finishedAt = new Date().toISOString();
      if (code === 0 && job.report) job.status = 'succeeded';
      else {
        job.status = 'failed';
        job.error ??=
          signal === 'SIGKILL'
            ? 'Indexing timed out.'
            : `Indexer exited with code ${code}. ${stderr.split('\n').filter(Boolean).slice(-3).join(' ')}`;
      }
      // Keep the last 50 jobs.
      if (this.jobs.size > 50) this.jobs.delete(this.jobs.keys().next().value as string);
      onDone?.(job);
    });
    return job;
  }
}
