/**
 * Large repositories need more memory than Node's default heap (about 2 GiB on 64-bit Linux):
 * the TypeScript compiler holds every program it builds. The brain and index commands re-run
 * themselves once with a larger limit: three quarters of the machine's memory, at most 16 GiB.
 * The limit is a ceiling, not an allocation; memory is only used as the work needs it.
 */
import { spawnSync } from 'node:child_process';
import { totalmem } from 'node:os';
import { getHeapStatistics } from 'node:v8';

const MARK = 'CODEATLAS_HEAP_RELAUNCHED';

/** The heap limit, in MiB, this machine allows the indexer. */
export function wantedHeapMiB(total = totalmem()): number {
  return Math.min(16 * 1024, Math.floor((total / (1024 * 1024)) * 0.75));
}

/**
 * Runs `script args` again in a child Node with the larger heap and returns its exit code, or
 * null when this process already has enough (or is that child).
 */
export function relaunchWithLargerHeap(script: string, args: string[]): number | null {
  if (process.env[MARK]) return null;
  const want = wantedHeapMiB();
  const have = getHeapStatistics().heap_size_limit / (1024 * 1024);
  if (want <= have * 1.25) return null;
  const r = spawnSync(
    process.execPath,
    [...process.execArgv, `--max-old-space-size=${want}`, script, ...args],
    { stdio: 'inherit', env: { ...process.env, [MARK]: '1' } },
  );
  if (r.error) throw r.error;
  return r.status ?? 1;
}
