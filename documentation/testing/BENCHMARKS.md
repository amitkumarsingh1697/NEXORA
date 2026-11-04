# CodeAtlas indexing benchmarks (S3-6, PERF-12-03)

**Measured:** 2026-11-04, with `products/codeatlas/core/scripts/benchmark.ts`. **Status:** measured in one environment only. These figures are not a guarantee of speed on other machines.

## Environment

| Item     | Value                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Machine  | Cloud Linux container, 4 vCPU (Intel Xeon @ 2.10 GHz), 15 GB RAM                                     |
| Runtime  | Node.js v22.23.4, TypeScript 5.9.3 (the version CodeAtlas bundles)                                   |
| Database | In-memory SQLite (`:memory:`), so disk speed is not included                                         |
| Memory   | Peak resident set size of the whole benchmark process (`process.resourceUsage().maxRSS`), all 4 runs |

## Repositories

| Repository                                                  | Revision                                        | Files discovered | Files analysed (TS/JS) | Symbols | Notes                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------- | ---------------: | ---------------------: | ------: | --------------------------------------------------------------------------------------- |
| This repository (Nexora)                                    | branch `claude/sprint-3` at the time of the run |              367 |                    270 |   1,403 | Dependencies installed (`node_modules` present), 15+ tsconfig groups                    |
| [honojs/hono](https://github.com/honojs/hono) (public, MIT) | `8b7f9e97d661dbc8e933cf81dc36fec8d35b9146`      |              564 |                    451 |   1,930 | Cloned without installing dependencies, so imports of external packages stay unresolved |

## Results

Each row is one run of the script: a cold index, a re-index with nothing changed, a re-index after appending one exported function to the named file, and a forced full index of that same state in a fresh database.

| Repository | Changed file                               | Cold index | Re-index, no change | Re-index after change (files re-analysed) | Forced full index | Incremental graph = full graph | Peak memory |
| ---------- | ------------------------------------------ | ---------: | ------------------: | ----------------------------------------: | ----------------: | :----------------------------: | ----------: |
| Nexora     | `products/cvforge/core/src/job/compare.ts` |     13.3 s |               0.6 s |                         5.5 s (33 of 270) |            11.7 s |              yes               |     1.49 GB |
| hono       | `src/middleware/cors/index.ts` (leaf)      |     12.6 s |               1.2 s |                          2.0 s (2 of 451) |            12.4 s |              yes               |     1.48 GB |
| hono       | `src/utils/url.ts` (imported widely)       |     12.1 s |               1.3 s |                       11.7 s (221 of 451) |            11.4 s |              yes               |     1.48 GB |

"Incremental graph = full graph" compares every node (with its data), edge (with confidence, evidence and detail) and unresolved reference.

### What the numbers show

- Re-indexing an unchanged repository takes about a second instead of 12 seconds.
- A change to a file few others import is cheap (2 s on hono). A change to a widely imported file re-analyses everything that depends on it, so it costs about as much as a full index: in the worst case incremental indexing gives no saving, and it is never wrong.
- Memory is dominated by the TypeScript compiler (about 1.5 GB peak for these sizes). Larger repositories have not been measured.

## Changes made because of these measurements

- **Shared parsed files between tsconfig groups.** The first measurement of this repository took 22 s with 1.98 GB resident at the end of the run, because each of its tsconfig groups re-parsed the same library and `node_modules` declaration files. Sharing parsed files between the groups (as the TypeScript language service does) brought it to 13 s and 1.35 GB (same measure) with an identical graph (compared node by node and edge by edge before and after).
- **A merge bug found by the hono run.** The first incremental run on hono did not match the full index: for overloaded methods, the full index dropped the doc comment of the first overload when it merged the later, undocumented overloads, while the cached replay kept it. Merging now ignores missing values, both modes keep the doc comment, and a regression test covers it.

## Not measured

- Repositories much larger than these (thousands of TypeScript files), Windows and macOS, and spinning disks.
- Time spent in the browser UI, and chat or model latency.
- Indexing through the local service, which runs the same code in a child process and adds process start-up time.

## Reproduce

```bash
pnpm --filter @nexora/codeatlas-core exec tsx scripts/benchmark.ts <repository folder> <a file in it>
```

The script restores the file it changes.
