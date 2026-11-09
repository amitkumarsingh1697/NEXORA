/**
 * Repository file inventory: one record per listed path, and the summary both products show.
 * The summary is computed only from records, so every number on a dashboard is a count of
 * real processing results. Invariant: the status counts add up to `total`.
 */
import { categoryOf } from './registry';
import { roleInfo } from './roles';
import {
  CATEGORY_LABEL,
  ROLE_GROUP_LABEL,
  STATUSES,
  type Category,
  type FileStatus,
  type RoleGroup,
} from './types';

export interface FileRecord {
  path: string;
  language: string;
  category: Category;
  role?: string;
  status: FileStatus;
  /** What processed the file (an analyser name), or why it was not processed. */
  method: string;
  /** For excluded, failed, unsupported and binary files: why. */
  reason?: string;
  bytes?: number;
  /** How the language was identified, and whether the choice was a heuristic. */
  detectedBy?: string;
  confidence?: 'observed' | 'inferred';
  alternatives?: string[];
  /**
   * How references between declarations were linked: `compiler` by a type checker, `syntax`
   * from a full parse by names, scope and imports (each link labelled observed, inferred or
   * unresolved). Absent when no references were linked.
   */
  resolution?: 'compiler' | 'syntax';
}

export type StatusCounts = Record<FileStatus, number>;

export interface LanguageRow {
  language: string;
  category: Category;
  files: number;
  bytes: number;
  counts: StatusCounts;
  /** Files with status full or partial. */
  analysed: number;
  /** analysed / (files that could be read: total minus excluded and binary); null when none. */
  coverage: number | null;
  /** The best and worst status present, as one word for the table. */
  status: 'full' | 'partial' | 'text' | 'mixed' | 'unsupported' | 'failed' | 'excluded' | 'binary';
  /** Analysis method used most for this language. */
  method: string;
}

export interface RoleRow {
  role: string;
  label: string;
  group: RoleGroup;
  groupLabel: string;
  files: number;
  counts: StatusCounts;
  analysed: number;
  coverage: number | null;
  examples: string[];
}

export interface DirectoryRow {
  path: string;
  files: number;
  counts: StatusCounts;
  analysed: number;
  coverage: number | null;
}

export interface ReasonRow {
  status: FileStatus;
  reason: string;
  files: number;
  examples: string[];
}

export interface InventorySummary {
  producer: string;
  /** Every path listed for the repository (git ls-files, or a directory walk). */
  total: number;
  counts: StatusCounts;
  /** Files with status full or partial. */
  analysed: number;
  /** Files that could be read: everything except excluded and binary. */
  readable: number;
  /** analysed / readable, from 0 to 1; null when nothing was readable. */
  coverage: number | null;
  /** full / readable. */
  fullCoverage: number | null;
  languages: LanguageRow[];
  categories: { category: Category; label: string; files: number; analysed: number }[];
  fileTypes: RoleRow[];
  directories: DirectoryRow[];
  reasons: ReasonRow[];
  /** Files not fully analysed, worst first, bounded; `notAnalysedTotal` says how many exist. */
  notAnalysed: Pick<FileRecord, 'path' | 'language' | 'status' | 'reason' | 'method'>[];
  notAnalysedTotal: number;
  /** Languages identified by a heuristic or default among several candidates. */
  ambiguous: { language: string; alternatives: string[]; files: number }[];
}

export const emptyCounts = (): StatusCounts =>
  Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;

const analysedOf = (c: StatusCounts) => c.full + c.partial;
const readableOf = (c: StatusCounts) => c.full + c.partial + c.text + c.unsupported + c.failed;
const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);

function statusWord(c: StatusCounts): LanguageRow['status'] {
  const present = STATUSES.filter((s) => c[s] > 0);
  if (present.length === 1) return present[0] as LanguageRow['status'];
  // One readable status for most of the files names the row; otherwise it is mixed.
  const total = STATUSES.reduce((t, s) => t + c[s], 0);
  const readable = present.filter((s) => s !== 'excluded' && s !== 'binary');
  if (readable.length === 1 && c[readable[0] as FileStatus] * 2 >= total)
    return readable[0] as LanguageRow['status'];
  return 'mixed';
}

/** Worst first, for lists of files that were not fully analysed. */
const SEVERITY: Record<FileStatus, number> = {
  failed: 0,
  unsupported: 1,
  text: 2,
  excluded: 3,
  partial: 4,
  binary: 5,
  full: 6,
};

export interface SummaryOptions {
  producer: string;
  /** Directory depth for the per-directory breakdown (default 2). */
  depth?: number;
  maxDirectories?: number;
  maxNotAnalysed?: number;
  maxExamples?: number;
}

export function summarize(records: FileRecord[], opts: SummaryOptions): InventorySummary {
  const depth = opts.depth ?? 2;
  const maxEx = opts.maxExamples ?? 5;
  const counts = emptyCounts();
  const langs = new Map<string, LanguageRow & { methods: Map<string, number> }>();
  const roles = new Map<string, RoleRow>();
  const dirs = new Map<string, DirectoryRow>();
  const reasons = new Map<string, ReasonRow>();
  const ambiguous = new Map<string, { language: string; alternatives: string[]; files: number }>();
  const cats = new Map<Category, { files: number; analysed: number }>();

  for (const r of records) {
    counts[r.status]++;
    const isAnalysed = r.status === 'full' || r.status === 'partial';
    let L = langs.get(r.language);
    if (!L) {
      L = {
        language: r.language,
        category: r.category ?? categoryOf(r.language),
        files: 0,
        bytes: 0,
        counts: emptyCounts(),
        analysed: 0,
        coverage: null,
        status: 'text',
        method: '',
        methods: new Map(),
      };
      langs.set(r.language, L);
    }
    L.files++;
    L.bytes += r.bytes ?? 0;
    L.counts[r.status]++;
    L.methods.set(r.method, (L.methods.get(r.method) ?? 0) + 1);
    const cat = cats.get(L.category) ?? { files: 0, analysed: 0 };
    cat.files++;
    if (isAnalysed) cat.analysed++;
    cats.set(L.category, cat);

    if (r.role) {
      const info = roleInfo(r.role);
      let R = roles.get(r.role);
      if (!R) {
        R = {
          role: r.role,
          label: info?.label ?? r.role,
          group: info?.group ?? 'config',
          groupLabel: ROLE_GROUP_LABEL[info?.group ?? 'config'],
          files: 0,
          counts: emptyCounts(),
          analysed: 0,
          coverage: null,
          examples: [],
        };
        roles.set(r.role, R);
      }
      R.files++;
      R.counts[r.status]++;
      if (R.examples.length < maxEx) R.examples.push(r.path);
    }

    const segs = r.path.split('/');
    const dir = segs.length > 1 ? segs.slice(0, Math.min(depth, segs.length - 1)).join('/') : '.';
    let D = dirs.get(dir);
    if (!D) {
      D = { path: dir, files: 0, counts: emptyCounts(), analysed: 0, coverage: null };
      dirs.set(dir, D);
    }
    D.files++;
    D.counts[r.status]++;

    if (r.status !== 'full' && r.status !== 'partial' && r.status !== 'text') {
      const reason = r.reason ?? r.method;
      const key = `${r.status}\0${reason}`;
      let X = reasons.get(key);
      if (!X) {
        X = { status: r.status, reason, files: 0, examples: [] };
        reasons.set(key, X);
      }
      X.files++;
      if (X.examples.length < maxEx) X.examples.push(r.path);
    }
    if (r.confidence === 'inferred' && r.alternatives?.length) {
      const A = ambiguous.get(r.language) ?? {
        language: r.language,
        alternatives: r.alternatives.slice(0, 8),
        files: 0,
      };
      A.files++;
      ambiguous.set(r.language, A);
    }
  }

  const finish = <T extends { counts: StatusCounts; analysed: number; coverage: number | null }>(
    x: T,
  ) => {
    x.analysed = analysedOf(x.counts);
    x.coverage = ratio(x.analysed, readableOf(x.counts));
    return x;
  };
  const languages = [...langs.values()]
    .map((L) => {
      finish(L);
      L.status = statusWord(L.counts);
      L.method = [...L.methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const { methods: _m, ...row } = L;
      void _m;
      return row;
    })
    .sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
  const notAnalysedAll = records
    .filter((r) => r.status !== 'full' && r.status !== 'binary')
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.path.localeCompare(b.path));
  const analysed = analysedOf(counts);
  const readable = readableOf(counts);
  return {
    producer: opts.producer,
    total: records.length,
    counts,
    analysed,
    readable,
    coverage: ratio(analysed, readable),
    fullCoverage: ratio(counts.full, readable),
    languages,
    categories: [...cats.entries()]
      .map(([category, v]) => ({ category, label: CATEGORY_LABEL[category], ...v }))
      .sort((a, b) => b.files - a.files),
    fileTypes: [...roles.values()]
      .map(finish)
      .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel) || b.files - a.files),
    directories: [...dirs.values()]
      .map(finish)
      .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path))
      .slice(0, opts.maxDirectories ?? 200),
    reasons: [...reasons.values()].sort(
      (a, b) => SEVERITY[a.status] - SEVERITY[b.status] || b.files - a.files,
    ),
    notAnalysed: notAnalysedAll.slice(0, opts.maxNotAnalysed ?? 500).map((r) => ({
      path: r.path,
      language: r.language,
      status: r.status,
      method: r.method,
      ...(r.reason ? { reason: r.reason } : {}),
    })),
    notAnalysedTotal: notAnalysedAll.length,
    ambiguous: [...ambiguous.values()].sort((a, b) => b.files - a.files),
  };
}

/** Checks the inventory invariant: status counts add up to the number of listed paths. */
export function checkInventory(s: InventorySummary): string[] {
  const errors: string[] = [];
  const sum = STATUSES.reduce((t, k) => t + s.counts[k], 0);
  if (sum !== s.total) errors.push(`status counts add up to ${sum}, not ${s.total}`);
  const langSum = s.languages.reduce((t, l) => t + l.files, 0);
  if (langSum !== s.total) errors.push(`language rows add up to ${langSum}, not ${s.total}`);
  return errors;
}

/** One sentence for the overview, from the counts. Never says "complete" unless every readable file was fully analysed. */
export function coverageSentence(s: InventorySummary): string {
  const fmt = (n: number) => n.toLocaleString('en-US');
  const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 1000) / 10}%`);
  if (!s.total) return 'No files were found.';
  const parts = [
    `${fmt(s.total)} files found`,
    `${fmt(s.counts.full)} fully analysed`,
    `${fmt(s.counts.partial)} partially analysed`,
    `${fmt(s.counts.text)} text only`,
  ];
  if (s.counts.failed) parts.push(`${fmt(s.counts.failed)} failed`);
  if (s.counts.unsupported) parts.push(`${fmt(s.counts.unsupported)} not readable`);
  parts.push(`${fmt(s.counts.excluded)} excluded`, `${fmt(s.counts.binary)} binary`);
  return `${parts.join(', ')}. ${pct(s.coverage)} of readable files were analysed (${pct(s.fullCoverage)} fully).`;
}
