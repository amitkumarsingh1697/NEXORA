import { realpathSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { Db } from '../store/db';
import { tx } from '../store/db';
import { indexMarkdown } from './docs';
import { addSchema, parsePrismaSchema, parseSqlSchema } from './schema';
import { addOrm, readOrmFiles, type OrmStats } from './extract/orm';
import {
  addSqlObjects,
  analyseSql,
  extraTables,
  linkSqlObjects,
  sqlStatus,
  type SqlFileResult,
  type SqlLinkStats,
} from './extract/sql';
import {
  IGNORED_DIRS as IGNORED_DIR_NAMES,
  discoverFiles,
  sha1,
  type DiscoveredFile,
  type UnlistedPaths,
} from './files';
import { analyseNonTsFiles, type AnalyseStats } from './extract/analyse';
import { loadScip, type ScipOptions, type ScipReport } from './scip';
import {
  analyserOf,
  checkInventory,
  coverageSentence,
  summarize,
  type FileRecord,
  type InventorySummary,
} from '@nexora/languages';
import { readGitHistory } from './git';
import { detectFrameworks, findManifests, type Framework, type Manifest } from './manifests';
import { GraphBuilder, splitTerms, type ChunkRec, type Confidence, type NodeRef } from './model';
import {
  DEFAULT_ADAPTERS,
  type AdapterCache,
  runAdapters,
  type AdapterCoverage,
  type LanguageAdapter,
} from './adapters';
import type { IncrementalInfo } from './ts-cache';
import { isTestPath, nearest, type PackageInfo, type TsIndexStats } from './ts-indexer';

export interface CoverageReport {
  repoId: number;
  root: string;
  indexedAt: string;
  durationMs: number;
  git: {
    available: boolean;
    head?: string;
    branch?: string | null;
    /** Paths with uncommitted changes when indexed; the index reflects the working tree, not HEAD. */
    dirtyFiles?: number;
    commitsScanned: number;
    truncated: boolean;
  };
  /** Build, dependency, container and CI manifests found (observed). */
  manifests: Manifest[];
  /** Frameworks declared in package.json dependencies (observed declarations, not proof of use). */
  frameworks: Framework[];
  files: {
    discovered: number;
    byLang: Record<string, number>;
    structurallyAnalysed: number;
    parseFailures: { path: string; error: string }[];
    skipped: Record<string, number>;
    skippedSecretPaths: string[];
    textOnlyByExtension: Record<string, number>;
  };
  packages: number;
  symbols: number;
  routes: number;
  docs: number;
  /** Language adapters that ran, and how many files each analysed structurally (AB-5.3-06). */
  adapters: AdapterCoverage[];
  /** Source files in languages no adapter supports, by language. Indexed as text only. */
  unsupportedLanguages: Record<string, number>;
  imports: TsIndexStats['imports'];
  calls: TsIndexStats['calls'] & { resolutionRate: number };
  edgesByConfidence: Record<Confidence, number>;
  /** Per adapter: whether files were re-analysed or reused from the previous index, and why. */
  incremental: (IncrementalInfo & { adapter: string })[];
  /** Configuration, outbound HTTP and database links found by the S3-3/S3-7 heuristics. */
  integrations: {
    envVars: number;
    configFiles: number;
    configReads: number;
    services: { http: number; db: number };
    serviceCalls: number;
    dbAccesses: number;
  };
  unresolvedRecorded: number;
  unresolvedDropped: number;
  limitations: string[];
  /**
   * Every listed path with what was done to it, summarised (one status per file, counts add up
   * to `inventory.total`). The per-file list is stored in the file_inventory table.
   */
  inventory: InventorySummary & {
    /** Paths not listed file by file: ignored by .gitignore, or folders the walk did not enter. */
    unlisted: UnlistedPaths[];
    summary: string;
  };
  /** Declarations, imports and file links found by the non-TypeScript analysers. */
  otherAnalysis: AnalyseStats;
  /** SCIP indexes read or produced for this run (absent when none was asked for). */
  scip?: ScipReport;
  /** Database objects read from SQL files, and how their references were linked. */
  database: {
    files: number;
    filesFullyParsed: number;
    objects: Record<string, number>;
    links: SqlLinkStats;
  };
  /** Tables, keys and model-to-table links read from ORM models and migrations. */
  orm: OrmStats;
}

export interface IndexOptions {
  /** Language adapters to run; defaults to the shipped set. */
  adapters?: LanguageAdapter[];
  /** Called with coarse progress messages (never file contents). */
  onProgress?: (msg: string) => void;
  now?: () => Date;
  /** Analyse every file even if a previous index could be reused (S3-4). */
  full?: boolean;
  /** SCIP indexes to read, and whether to run the source-only indexers (ADR 0018). */
  scip?: ScipOptions;
}

const CHUNK_MAX_LINES = 150;
const WINDOW_LINES = 80;

function readPackages(files: DiscoveredFile[], texts: Map<string, string>): PackageInfo[] {
  const out: PackageInfo[] = [];
  for (const f of files) {
    if (basename(f.path) !== 'package.json') continue;
    const text = texts.get(f.path);
    if (!text) continue;
    try {
      const pkg = JSON.parse(text) as {
        name?: string;
        bin?: string | Record<string, string>;
        main?: string;
      };
      const dir = f.path === 'package.json' ? '' : f.path.slice(0, -'/package.json'.length);
      const name = pkg.name ?? (dir || 'root');
      const bin = typeof pkg.bin === 'string' ? { [name]: pkg.bin } : (pkg.bin ?? {});
      out.push({ dir, name, bin, main: pkg.main });
    } catch {
      // invalid package.json: ignore
    }
  }
  return out;
}

function windows(lines: string[], from: number, to: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let s = from; s <= to; s += size) {
    const e = Math.min(to, s + size - 1);
    if (lines.slice(s - 1, e).some((l) => l.trim())) out.push([s, e]);
  }
  return out;
}

/** File path → its top-level symbols, from the graph's file→symbol contains edges (built once). */
function topSymbolsByFile(graph: GraphBuilder): Map<string, NodeRef[]> {
  const out = new Map<string, NodeRef[]>();
  for (const e of graph.edges) {
    if (e.kind !== 'contains' || e.src.kind !== 'file' || e.dst.kind !== 'symbol') continue;
    const list = out.get(e.src.key);
    if (list) list.push(e.dst);
    else out.set(e.src.key, [e.dst]);
  }
  return out;
}

function codeChunks(
  graph: GraphBuilder,
  path: string,
  text: string,
  topRefs: NodeRef[],
): ChunkRec[] {
  const lines = text.split('\n');
  const tops = topRefs
    .map((r) => graph.get(r))
    .filter(
      (n): n is NonNullable<typeof n> =>
        !!n && n.startLine !== undefined && n.endLine !== undefined,
    )
    .sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));
  const out: ChunkRec[] = [];
  let cursor = 1;
  const push = (s: number, e: number, symbolKey?: string) =>
    out.push({
      filePath: path,
      startLine: s,
      endLine: e,
      symbolKey,
      kind: 'code',
      body: lines.slice(s - 1, e).join('\n'),
    });
  for (const n of tops) {
    const s = n.startLine as number;
    const e = n.endLine as number;
    if (s < cursor) continue; // nested/overlapping
    for (const [a, b] of windows(lines, cursor, s - 1, WINDOW_LINES)) push(a, b);
    for (const [a, b] of windows(lines, s, e, CHUNK_MAX_LINES)) push(a, b, n.key);
    cursor = e + 1;
  }
  for (const [a, b] of windows(lines, cursor, lines.length, WINDOW_LINES)) push(a, b);
  return out;
}

export function upsertRepo(db: Db, root: string, now: Date): { id: number; root: string } {
  const real = realpathSync(root);
  if (!statSync(real).isDirectory()) throw new Error('Repository path is not a directory.');
  const existing = db.prepare('SELECT id FROM repos WHERE root = ?').get(real) as
    { id: number } | undefined;
  if (existing) return { id: existing.id, root: real };
  const r = db
    .prepare('INSERT INTO repos (root, name, created_at) VALUES (?, ?, ?)')
    .run(real, basename(real), now.toISOString());
  return { id: Number(r.lastInsertRowid), root: real };
}

export function indexRepository(
  db: Db,
  rootInput: string,
  opts: IndexOptions = {},
): CoverageReport {
  const now = opts.now ?? (() => new Date());
  const progress = opts.onProgress ?? (() => undefined);
  const started = Date.now();
  const repo = upsertRepo(db, rootInput, now());
  const run = db
    .prepare("INSERT INTO index_runs (repo_id, started_at, status) VALUES (?, ?, 'running')")
    .run(repo.id, now().toISOString());
  const runId = Number(run.lastInsertRowid);
  try {
    const report = buildAndPersist(
      db,
      repo,
      progress,
      now,
      started,
      opts.adapters ?? DEFAULT_ADAPTERS,
      !opts.full,
      opts.scip,
    );
    db.prepare(
      "UPDATE index_runs SET status = 'succeeded', finished_at = ?, coverage = ?, duration_ms = ? WHERE id = ?",
    ).run(now().toISOString(), JSON.stringify(report), report.durationMs, runId);
    return report;
  } catch (e) {
    db.prepare(
      "UPDATE index_runs SET status = 'failed', finished_at = ?, error = ?, duration_ms = ? WHERE id = ?",
    ).run(
      now().toISOString(),
      e instanceof Error ? e.message : String(e),
      Date.now() - started,
      runId,
    );
    throw e;
  }
}

function buildAndPersist(
  db: Db,
  repo: { id: number; root: string },
  progress: (m: string) => void,
  now: () => Date,
  started: number,
  adapters: LanguageAdapter[],
  incremental: boolean,
  scipOpts?: ScipOptions,
): CoverageReport {
  progress('Discovering files');
  const disc = discoverFiles(repo.root);
  const paths = new Set(disc.files.map((f) => f.path));
  const texts = disc.texts;
  const records = disc.records;

  const packages = readPackages(disc.files, texts);
  const pkgDirs = packages.map((p) => p.dir);
  const repoName = basename(repo.root);
  const moduleOf = (p: string): string => {
    const d = nearest(p, pkgDirs);
    return d === undefined ? repoName : (packages.find((x) => x.dir === d)?.name ?? repoName);
  };

  const graph = new GraphBuilder();
  for (const p of packages)
    graph.addNode({
      kind: 'module',
      key: p.name,
      name: p.name,
      filePath: p.dir ? `${p.dir}/package.json` : 'package.json',
      module: p.name,
      data: { dir: p.dir },
    });
  if (!packages.length)
    graph.addNode({
      kind: 'module',
      key: repoName,
      name: repoName,
      module: repoName,
      data: { dir: '' },
    });

  const byLang: Record<string, number> = {};
  const textOnly: Record<string, number> = {};
  for (const f of disc.files) {
    const text = texts.get(f.path);
    byLang[f.lang] = (byLang[f.lang] ?? 0) + 1;
    const mod = moduleOf(f.path);
    const fileRef = graph.addNode({
      kind: 'file',
      key: f.path,
      name: basename(f.path),
      filePath: f.path,
      module: mod,
      startLine: 1,
      endLine: text ? text.split('\n').length : undefined,
      data: {
        lang: f.lang,
        language: f.language,
        ...(f.role ? { role: f.role } : {}),
        size: f.size,
        loc: text ? text.split('\n').filter((l) => l.trim()).length : 0,
        sha: text ? sha1(text) : undefined,
        isTest: isTestPath(f.path),
      },
    });
    graph.addEdge({
      kind: 'contains',
      src: { kind: 'module', key: mod },
      dst: fileRef,
      confidence: 'observed',
    });
    if (f.lang === 'unsupported' || f.lang === 'text' || f.lang === 'json') {
      if (text && f.lang !== 'json' && f.role !== 'lockfile') {
        const lines = text.split('\n');
        for (const [a, b] of windows(lines, 1, lines.length, WINDOW_LINES))
          graph.chunks.push({
            filePath: f.path,
            startLine: a,
            endLine: b,
            kind: 'text',
            body: lines.slice(a - 1, b).join('\n'),
          });
      }
    }
  }

  progress(`Analysing code (${adapters.map((a) => a.id).join(', ')})`);
  const tsStats = runAdapters(
    adapters,
    { root: repo.root, allPaths: paths, graph, moduleOf },
    disc.files.filter((f) => texts.has(f.path)),
    incremental ? { previous: loadCaches(db, repo.id) } : undefined,
  );
  const handled = new Set(adapters.flatMap((a) => a.languages));
  // Inventory status of files the compiler adapters read: full, or failed with the reason.
  const failedPass1 = new Map<string, string>();
  const failedRefs = new Map<string, string>();
  for (const x of tsStats.filesFailed) {
    if (x.error.startsWith('reference pass:')) failedRefs.set(x.path, x.error);
    else failedPass1.set(x.path, x.error);
  }
  const adapterFiles = new Set<string>();
  for (const f of disc.files) {
    if (!handled.has(f.lang) || !texts.has(f.path)) continue;
    adapterFiles.add(f.path);
    const rec = records.get(f.path);
    if (!rec) continue;
    const adapter = adapters.find((a) => a.languages.includes(f.lang));
    rec.method = adapter?.name ?? 'language adapter';
    rec.resolution = 'compiler';
    if (failedPass1.has(f.path)) {
      rec.status = 'failed';
      rec.reason = failedPass1.get(f.path);
    } else if (failedRefs.has(f.path)) {
      rec.status = 'partial';
      rec.reason = failedRefs.get(f.path);
    } else rec.status = 'full';
  }

  const scip =
    scipOpts && (scipOpts.files?.length || scipOpts.run)
      ? loadScip(repo.root, [...paths], scipOpts, progress)
      : undefined;
  progress('Analysing other languages and file formats');
  const otherAnalysis = analyseNonTsFiles(
    { graph, records, allPaths: paths, moduleOf, scip: scip?.resolver },
    disc.files,
    texts,
    adapterFiles,
  );

  // Database schemas in SQL files (migrations, schema.sql) and Prisma schema files. A SQL
  // file's other objects (views, routines, triggers, indexes…) are linked once every table is known.
  progress('Reading database schemas and objects');
  const sqlFiles: SqlFileResult[] = [];
  for (const f of disc.files) {
    const text = texts.get(f.path);
    if (text === undefined) continue;
    const isSql =
      analyserOf(f.language) === 'sql' ||
      /\.(sql|ddl|pks|pkb|pls|plsql|psql|pgsql|tsql)$/i.test(f.path);
    try {
      if (isSql) {
        const tables = parseSqlSchema(text);
        const sql = analyseSql(text, f.language);
        tables.tables.push(...extraTables(sql, tables.tables));
        addSchema(graph, f.path, tables);
        sqlFiles.push(addSqlObjects(graph, f.path, f.language, moduleOf(f.path), sql));
        const rec = records.get(f.path);
        if (rec) {
          const st = text.trim()
            ? sqlStatus(sql)
            : {
                status: 'full' as const,
                method: 'Empty file (nothing to analyse)',
                reason: undefined,
                resolution: undefined,
              };
          rec.status = st.status;
          rec.method = st.method;
          rec.reason = st.reason;
          rec.resolution = st.resolution;
        }
      } else if (/\.prisma$/i.test(f.path)) addSchema(graph, f.path, parsePrismaSchema(text));
    } catch (e) {
      const rec = records.get(f.path);
      if (rec) {
        rec.status = 'failed';
        rec.reason = `schema reader error: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
      }
    }
  }

  const sqlLinks = linkSqlObjects(graph, sqlFiles);

  // ORM models and migrations (Django, SQLAlchemy, JPA, EF Core, Rails, Laravel, GORM,
  // TypeORM, Liquibase…), resolved across files once every SQL and Prisma table is known.
  progress('Reading ORM models and migrations');
  const orm = addOrm(graph, readOrmFiles(disc.files, texts)).stats;

  // Entry points declared in package.json (observed: they are declared).
  for (const p of packages) {
    const entries: [string, string][] = [
      ...Object.entries(p.bin).map(([k, v]) => [`bin:${k}`, v] as [string, string]),
      ...(p.main ? [['main', p.main] as [string, string]] : []),
    ];
    for (const [label, target] of entries) {
      const file = [p.dir, target.replace(/^\.\//, '')].filter(Boolean).join('/');
      const ep = graph.addNode({
        kind: 'entrypoint',
        key: `${p.name}:${label}`,
        name: `${p.name} ${label}`,
        module: p.name,
        filePath: p.dir ? `${p.dir}/package.json` : 'package.json',
        data: { target: file },
      });
      if (paths.has(file))
        graph.addEdge({
          kind: 'starts_at',
          src: ep,
          dst: { kind: 'file', key: file },
          confidence: 'observed',
          evidencePath: p.dir ? `${p.dir}/package.json` : 'package.json',
          detail: label,
        });
    }
  }

  progress('Indexing documentation');
  const exportedByName = new Map<string, string[]>();
  for (const n of graph.nodes.values()) {
    if (n.kind === 'symbol' && n.exported) {
      const bare = n.name.split('.').pop() as string;
      exportedByName.set(bare, [...(exportedByName.get(bare) ?? []), n.key]);
    }
  }
  let docs = 0;
  for (const f of disc.files) {
    if (f.lang !== 'markdown') continue;
    const text = texts.get(f.path);
    if (text) {
      indexMarkdown(graph, f.path, text, paths, exportedByName, moduleOf);
      docs++;
      const rec = records.get(f.path);
      if (rec) {
        rec.status = 'partial';
        rec.method = 'Markdown section and link reader';
      }
    }
  }

  const topsByFile = topSymbolsByFile(graph);
  for (const f of disc.files) {
    if (f.lang !== 'typescript' && f.lang !== 'javascript') continue;
    const text = texts.get(f.path);
    if (text) graph.chunks.push(...codeChunks(graph, f.path, text, topsByFile.get(f.path) ?? []));
  }

  progress('Reading git history');
  const git = readGitHistory(repo.root);
  for (const [path, h] of git.files) {
    const n = graph.get({ kind: 'file', key: path });
    if (!n) continue;
    const total = h.authors.reduce((a, b) => a + b.lines, 0) || 1;
    n.data = {
      ...n.data,
      commits: h.commits,
      churn: h.churn,
      lastChange: h.lastChange,
      authors: h.authors.slice(0, 5).map((a) => ({
        name: a.name,
        email: a.email,
        commits: a.commits,
        share: Math.round((a.lines / total) * 100) / 100,
      })),
      authorCount: h.authors.length,
    };
  }

  progress('Saving index');
  persist(db, repo.id, graph, tsStats.caches);
  persistInventory(db, repo.id, records);

  const edgesByConfidence: Record<Confidence, number> = { observed: 0, inferred: 0, unknown: 0 };
  for (const e of graph.edges) edgesByConfidence[e.confidence]++;
  const integrations: CoverageReport['integrations'] = {
    envVars: 0,
    configFiles: 0,
    configReads: 0,
    services: { http: 0, db: 0 },
    serviceCalls: 0,
    dbAccesses: 0,
  };
  for (const n of graph.nodes.values()) {
    if (n.kind === 'config' && n.key.startsWith('env:')) integrations.envVars++;
    else if (n.kind === 'service' && n.key.startsWith('db:')) integrations.services.db++;
    else if (n.kind === 'service') integrations.services.http++;
  }
  const configFiles = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind === 'reads_config' || e.kind === 'writes_config') {
      integrations.configReads += e.count;
      if (!e.dst.key.startsWith('env:')) configFiles.add(GraphBuilder.id(e.dst));
    } else if (e.kind === 'calls_service') integrations.serviceCalls += e.count;
    else if (e.kind === 'accesses_db') integrations.dbAccesses += e.count;
  }
  integrations.configFiles = configFiles.size;
  const skipped: Record<string, number> = {};
  for (const s of disc.skipped) skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
  const callTotal =
    tsStats.calls.observed +
    tsStats.calls.inferred +
    tsStats.calls.dynamic +
    tsStats.calls.unresolved;
  const limitations: string[] = [];
  if (!git.available)
    limitations.push(
      'Not a git repository: ownership, churn and change-risk signals are unavailable.',
    );
  if (git.available && !git.head)
    limitations.push(
      'Git repository has no commits yet: ownership and churn signals are unavailable.',
    );
  if (git.dirtyFiles)
    limitations.push(
      `${git.dirtyFiles} paths had uncommitted changes when indexed, so this index reflects the working tree rather than commit ${git.head?.slice(0, 10) ?? 'HEAD'}.`,
    );
  if (git.truncated)
    limitations.push(`Git history truncated to the latest ${git.commitsScanned} commits.`);
  // Inventory: every listed path, with what was done to it.
  const recordList = [...records.values()].sort((a, b) => a.path.localeCompare(b.path));
  const inventory = summarize(recordList, { producer: 'codeatlas' });
  const inventoryErrors = checkInventory(inventory);
  if (inventoryErrors.length)
    throw new Error(`Inventory invariant broken: ${inventoryErrors.join('; ')}`);
  const unsupportedLanguages: Record<string, number> = {};
  for (const r of recordList) {
    if (r.status === 'text') {
      const ext = extname(r.path).toLowerCase() || basename(r.path);
      textOnly[ext] = (textOnly[ext] ?? 0) + 1;
      if (/^(programming|scripting|database)$/.test(r.category))
        unsupportedLanguages[r.language] = (unsupportedLanguages[r.language] ?? 0) + 1;
    }
  }
  const textLangs = inventory.languages
    .filter((l) => l.counts.text > 0)
    .slice(0, 12)
    .map((l) => `${l.counts.text.toLocaleString('en-US')} ${l.language}`)
    .join(', ');
  if (inventory.counts.text)
    limitations.push(
      `${inventory.counts.text.toLocaleString('en-US')} files are searchable as text only, with no structure extracted: ${textLangs}${inventory.languages.filter((l) => l.counts.text > 0).length > 12 ? ', …' : ''}.`,
    );
  if (inventory.counts.partial)
    limitations.push(
      `${inventory.counts.partial.toLocaleString('en-US')} files are partially analysed (declaration patterns, generic parsers or schema readers): their structure is shown, but not checked by a compiler, and calls between their functions are not extracted.`,
    );
  if (inventory.counts.failed)
    limitations.push(
      `${inventory.counts.failed.toLocaleString('en-US')} files could not be analysed (see the inventory for each reason), e.g. ${inventory.reasons
        .filter((r) => r.status === 'failed')
        .slice(0, 2)
        .map((r) => `${r.examples[0]}: ${r.reason}`)
        .join('; ')}.`,
    );
  if (inventory.counts.unsupported)
    limitations.push(
      `${inventory.counts.unsupported} files are recognised but their content is not readable (for example Git LFS pointers).`,
    );
  if (skipped.binary)
    limitations.push(`${skipped.binary} binary files were recorded but not read.`);
  if (skipped.submodule)
    limitations.push(
      `${skipped.submodule} git submodules were not indexed (separate repositories).`,
    );
  if (skipped.symlink)
    limitations.push(
      `${skipped.symlink} symbolic links were recorded; their targets were not followed.`,
    );
  if (disc.unlisted.length)
    limitations.push(
      `Not listed file by file: ${disc.unlisted
        .slice(0, 5)
        .map((u) => `${u.path} (${u.reason})`)
        .join(', ')}${disc.unlisted.length > 5 ? ', …' : ''}.`,
    );
  if (tsStats.filesFailed.length)
    limitations.push(`${tsStats.filesFailed.length} source files could not be fully analysed.`);
  if (tsStats.calls.dynamic)
    limitations.push(
      `${tsStats.calls.dynamic} call sites target callbacks, parameters or computed members; their targets are only known at runtime.`,
    );
  if (skipped.secret)
    limitations.push(`${skipped.secret} files that may contain credentials were not read.`);
  if (skipped.ignored_dir) {
    const folders = [
      ...new Set(
        disc.skipped
          .filter((s) => s.reason === 'ignored_dir')
          .map((s) => s.path.split('/').find((seg) => IGNORED_DIR_NAMES.has(seg))),
      ),
    ].slice(0, 5);
    limitations.push(
      `${skipped.ignored_dir} files tracked by git in folders named ${folders.map((f) => `${f}/`).join(', ')} were not indexed (treated as build output or dependencies).`,
    );
  }
  if (skipped.too_large || skipped.limit)
    limitations.push(
      `${(skipped.too_large ?? 0) + (skipped.limit ?? 0)} files were skipped by size or count limits.`,
    );

  const report: CoverageReport = {
    repoId: repo.id,
    root: repo.root,
    indexedAt: now().toISOString(),
    durationMs: Date.now() - started,
    git: {
      available: git.available,
      head: git.head,
      branch: git.branch,
      dirtyFiles: git.dirtyFiles,
      commitsScanned: git.commitsScanned,
      truncated: git.truncated,
    },
    files: {
      discovered: disc.files.length,
      byLang,
      structurallyAnalysed: tsStats.filesParsed,
      parseFailures: tsStats.filesFailed.slice(0, 100),
      skipped,
      skippedSecretPaths: disc.skipped
        .filter((s) => s.reason === 'secret')
        .map((s) => s.path)
        .slice(0, 50),
      textOnlyByExtension: textOnly,
    },
    inventory: { ...inventory, unlisted: disc.unlisted, summary: coverageSentence(inventory) },
    otherAnalysis,
    ...(scip ? { scip: scip.report } : {}),
    database: {
      files: sqlFiles.length,
      filesFullyParsed: sqlFiles.filter(
        (x) => x.result.mode === 'parser' && !x.result.problems.length,
      ).length,
      objects: sqlFiles
        .flatMap((x) => x.result.objects)
        .reduce<Record<string, number>>((m, o) => ((m[o.kind] = (m[o.kind] ?? 0) + 1), m), {}),
      links: sqlLinks,
    },
    orm,
    manifests: findManifests([
      ...disc.files.map((f) => f.path),
      ...disc.skipped
        .filter((x) => x.reason !== 'secret' && x.reason !== 'ignored_dir')
        .map((x) => x.path),
    ]),
    frameworks: detectFrameworks(
      disc.files
        .filter((f) => basename(f.path) === 'package.json')
        .map((f) => ({ path: f.path, text: texts.get(f.path) ?? '' })),
    ),
    adapters: tsStats.coverage,
    unsupportedLanguages,
    packages: packages.length,
    symbols: tsStats.symbols,
    routes: tsStats.routes,
    docs,
    imports: tsStats.imports,
    calls: {
      ...tsStats.calls,
      resolutionRate: callTotal
        ? Math.round(((tsStats.calls.observed + tsStats.calls.inferred) / callTotal) * 1000) / 1000
        : 1,
    },
    edgesByConfidence,
    incremental: tsStats.incremental,
    integrations,
    unresolvedRecorded: graph.unresolved.length,
    unresolvedDropped: graph.unresolvedDropped,
    limitations,
  };
  db.prepare('UPDATE repos SET last_indexed_at = ?, head_commit = ?, branch = ? WHERE id = ?').run(
    report.indexedAt,
    git.head ?? null,
    git.branch ?? null,
    repo.id,
  );
  return report;
}

function persistInventory(db: Db, repoId: number, records: Map<string, FileRecord>): void {
  tx(db, () => {
    db.prepare('DELETE FROM file_inventory WHERE repo_id = ?').run(repoId);
    const ins = db.prepare(
      'INSERT INTO file_inventory (repo_id, path, language, category, role, status, method, reason, bytes, detected_by, confidence, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const r of records.values())
      ins.run(
        repoId,
        r.path,
        r.language,
        r.category,
        r.role ?? null,
        r.status,
        r.method,
        r.reason ?? null,
        r.bytes ?? null,
        r.detectedBy ?? null,
        r.confidence ?? null,
        r.resolution ?? null,
      );
  });
}

function loadCaches(db: Db, repoId: number): Record<string, AdapterCache> {
  const out: Record<string, AdapterCache> = {};
  const rows = db
    .prepare('SELECT adapter, path, data FROM index_cache WHERE repo_id = ?')
    .all(repoId) as { adapter: string; path: string; data: string }[];
  for (const r of rows) {
    const c = (out[r.adapter] ??= { configHash: '', files: {} });
    if (r.path === '') {
      const head = JSON.parse(r.data) as { configHash: string; extra?: Record<string, string> };
      c.configHash = head.configHash;
      if (head.extra) c.extra = head.extra;
    } else c.files[r.path] = JSON.parse(r.data) as unknown;
  }
  // A cache without its fingerprint row is incomplete: ignore it, which forces a full analysis.
  for (const [k, c] of Object.entries(out)) if (!c.configHash) delete out[k];
  return out;
}

function persist(
  db: Db,
  repoId: number,
  graph: GraphBuilder,
  caches: Record<string, AdapterCache>,
): void {
  tx(db, () => {
    db.prepare('DELETE FROM index_cache WHERE repo_id = ?').run(repoId);
    const insCache = db.prepare(
      'INSERT INTO index_cache (repo_id, adapter, path, data) VALUES (?, ?, ?, ?)',
    );
    for (const [adapter, c] of Object.entries(caches)) {
      insCache.run(
        repoId,
        adapter,
        '',
        JSON.stringify({ configHash: c.configHash, extra: c.extra ?? {} }),
      );
      for (const [path, data] of Object.entries(c.files))
        insCache.run(repoId, adapter, path, JSON.stringify(data));
    }
    db.prepare(
      'DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE repo_id = ?)',
    ).run(repoId);
    for (const t of ['chunks', 'unresolved', 'edges', 'nodes'])
      db.prepare(`DELETE FROM ${t} WHERE repo_id = ?`).run(repoId);

    const insNode = db.prepare(
      'INSERT INTO nodes (repo_id, kind, key, name, file_path, module, symbol_kind, exported, start_line, end_line, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const ids = new Map<string, number>();
    for (const [id, n] of graph.nodes) {
      const r = insNode.run(
        repoId,
        n.kind,
        n.key,
        n.name,
        n.filePath ?? null,
        n.module ?? null,
        n.symbolKind ?? null,
        n.exported ? 1 : 0,
        n.startLine ?? null,
        n.endLine ?? null,
        JSON.stringify(n.data ?? {}),
      );
      ids.set(id, Number(r.lastInsertRowid));
    }
    const insEdge = db.prepare(
      'INSERT INTO edges (repo_id, src, dst, kind, confidence, evidence_path, evidence_line, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const idOf = (ref: NodeRef) => ids.get(GraphBuilder.id(ref));
    for (const e of graph.edges) {
      const s = idOf(e.src);
      const d = idOf(e.dst);
      // An edge to a node that was never declared (e.g. a handler name that does not exist) is dropped, not invented.
      if (s === undefined || d === undefined) continue;
      insEdge.run(
        repoId,
        s,
        d,
        e.kind,
        e.confidence,
        e.evidencePath ?? null,
        e.evidenceLine ?? null,
        e.count > 1 ? `${e.detail ? `${e.detail}; ` : ''}${e.count} sites` : (e.detail ?? null),
      );
    }
    const insUnres = db.prepare(
      'INSERT INTO unresolved (repo_id, file_path, line, kind, text, reason) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const u of graph.unresolved)
      insUnres.run(repoId, u.filePath, u.line, u.kind, u.text, u.reason);
    const insChunk = db.prepare(
      'INSERT INTO chunks (repo_id, file_path, start_line, end_line, symbol_key, kind, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insFts = db.prepare(
      'INSERT INTO chunks_fts (rowid, path, symbol, body, terms) VALUES (?, ?, ?, ?, ?)',
    );
    for (const c of graph.chunks) {
      const r = insChunk.run(
        repoId,
        c.filePath,
        c.startLine,
        c.endLine,
        c.symbolKey ?? null,
        c.kind,
        c.body,
      );
      const symbolName = c.symbolKey?.split('#').pop() ?? '';
      insFts.run(
        Number(r.lastInsertRowid),
        c.filePath,
        symbolName,
        c.body,
        splitTerms(`${c.filePath} ${symbolName} ${c.body}`),
      );
    }
  });
}
