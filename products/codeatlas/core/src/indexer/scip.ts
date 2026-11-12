/**
 * SCIP indexes for compiler-grade resolution (ADR 0018). CodeAtlas reads `.scip` files that an
 * indexer wrote, and can run the indexers that only analyse source without building it:
 *
 * - scip-python (Pyright's analysis; reads the code, runs none of it);
 * - scip-go (go/packages with cgo off and the local Go toolchain only; may download module
 *   source through the Go proxy, never runs repository code).
 *
 * Indexers that build the project (scip-java runs Gradle or Maven, rust-analyzer runs build
 * scripts and procedural macros, scip-dotnet runs MSBuild, scip-clang needs a compilation
 * database, scip-ruby runs Sorbet over gems) are not run here: give CodeAtlas their `.scip`
 * output instead.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { decodeIndex, projectPrefix, ScipResolver, type IndexInput } from '@nexora/scip';

export interface ScipOptions {
  /** `.scip` files to read (absolute, or relative to the repository root). */
  files?: string[];
  /** Run the source-only indexers found on PATH (scip-python, scip-go). Default false. */
  run?: boolean;
  /** Per indexer run. Default 10 minutes. */
  timeoutMs?: number;
}

export interface ScipSource {
  /** Where the index came from: a file given, or an indexer this run started. */
  from: 'file' | 'run';
  /** Indexer name (`scip-python`), or the file's base name. */
  name: string;
  tool?: string;
  documents?: number;
  ms?: number;
  /** Why this index is missing: not installed, failed, timed out, unreadable. */
  error?: string;
}

export interface ScipReport {
  sources: ScipSource[];
}

const RUNNERS: {
  name: string;
  /** Repository files that make this indexer worth running. */
  wants: (paths: string[]) => boolean;
  args: (out: string, project: string) => string[];
  env?: Record<string, string>;
}[] = [
  {
    name: 'scip-python',
    wants: (ps) => ps.some((p) => /\.pyi?$/.test(p)),
    args: (out, project) => ['index', '.', '--project-name', project, '--output', out, '--quiet'],
  },
  {
    name: 'scip-go',
    wants: (ps) => ps.includes('go.mod'),
    args: (out) => ['index', '--output', out, '--quiet'],
    // No C compiler, no toolchain download, go.mod and go.sum never rewritten.
    env: { CGO_ENABLED: '0', GOTOOLCHAIN: 'local', GOFLAGS: '-mod=readonly' },
  },
];

/** An executable on PATH, or undefined. */
function which(cmd: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, cmd);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      // not in this directory
    }
  }
  return undefined;
}

function read(path: string, root: string, from: 'file' | 'run', name: string, ms?: number) {
  const source: ScipSource = { from, name, ...(ms !== undefined ? { ms } : {}) };
  try {
    const index = decodeIndex(readFileSync(path));
    source.tool = index.tool ? `${index.tool.name} ${index.tool.version}`.trim() : undefined;
    source.documents = index.documents.length;
    return { source, input: { index, prefix: projectPrefix(index.projectRoot, root) } };
  } catch (e) {
    source.error = `unreadable index: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    return { source, input: undefined };
  }
}

/**
 * Reads the given indexes and, when asked, runs the source-only indexers. Never throws: each
 * index that could not be read or produced is reported with the reason.
 */
export function loadScip(
  root: string,
  paths: string[],
  opts: ScipOptions,
  progress: (msg: string) => void = () => undefined,
): { resolver?: ScipResolver; report: ScipReport } {
  const inputs: IndexInput[] = [];
  const report: ScipReport = { sources: [] };
  for (const f of opts.files ?? []) {
    const p = isAbsolute(f) ? f : resolve(root, f);
    if (!existsSync(p)) {
      report.sources.push({ from: 'file', name: f, error: 'file not found' });
      continue;
    }
    const r = read(p, root, 'file', f);
    report.sources.push(r.source);
    if (r.input) inputs.push(r.input);
  }
  if (opts.run) {
    const dir = mkdtempSync(join(tmpdir(), 'codeatlas-scip-'));
    try {
      for (const runner of RUNNERS) {
        if (!runner.wants(paths)) continue;
        const exe = which(runner.name);
        if (!exe) {
          report.sources.push({ from: 'run', name: runner.name, error: 'not installed' });
          continue;
        }
        progress(`Resolving references with ${runner.name}`);
        const out = join(dir, `${runner.name}.scip`);
        const started = Date.now();
        const r = spawnSync(exe, runner.args(out, 'repository'), {
          cwd: root,
          env: { ...process.env, ...runner.env },
          timeout: opts.timeoutMs ?? 10 * 60_000,
          stdio: ['ignore', 'ignore', 'pipe'],
          maxBuffer: 4 * 1024 * 1024,
        });
        const ms = Date.now() - started;
        if (r.error || r.status !== 0 || !existsSync(out)) {
          const why = r.error
            ? r.error.message
            : r.signal
              ? `stopped by ${r.signal}`
              : `exit code ${r.status}`;
          const err = (r.stderr?.toString() ?? '').trim().split('\n').slice(-1)[0]?.slice(0, 200);
          report.sources.push({
            from: 'run',
            name: runner.name,
            ms,
            error: err ? `${why}: ${err}` : why,
          });
          continue;
        }
        const x = read(out, root, 'run', runner.name, ms);
        report.sources.push(x.source);
        if (x.input) inputs.push(x.input);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { resolver: inputs.length ? new ScipResolver(inputs) : undefined, report };
}
