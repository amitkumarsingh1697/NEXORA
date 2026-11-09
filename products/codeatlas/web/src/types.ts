export type Confidence = 'observed' | 'inferred' | 'unknown';

export interface Repo {
  id: number;
  root: string;
  name: string;
  lastIndexedAt: string | null;
  headCommit: string | null;
  job?: Job | null;
}

export interface Job {
  id: string;
  repoId: number;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: string[];
  error?: string;
}

export interface Coverage {
  indexedAt: string;
  durationMs: number;
  git: {
    available: boolean;
    head?: string;
    branch?: string | null;
    dirtyFiles?: number;
    commitsScanned: number;
    truncated: boolean;
  };
  manifests?: { path: string; kind: string; confidence: 'observed' }[];
  frameworks?: {
    name: string;
    category: string;
    package: string;
    version: string;
    evidence: string;
    dev: boolean;
  }[];
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
  imports: { internal: number; external: number; unresolved: number };
  calls: {
    observed: number;
    inferred: number;
    external: number;
    builtin: number;
    dynamic: number;
    unresolved: number;
    resolutionRate: number;
  };
  edgesByConfidence: Record<Confidence, number>;
  /** Absent in indexes built before Sprint 3. */
  adapters?: {
    id: string;
    name: string;
    languages: string[];
    filesAnalysed: number;
    filesFailed: number;
  }[];
  unsupportedLanguages?: Record<string, number>;
  /** Per-file processing counts (schema 7 and later). */
  inventory?: Inventory;
  incremental?: {
    adapter: string;
    mode: 'full' | 'incremental';
    reason: string;
    reanalysed: number;
    reused: number;
  }[];
  integrations?: {
    envVars: number;
    configFiles: number;
    configReads: number;
    services: { http: number; db: number };
    serviceCalls: number;
    dbAccesses: number;
  };
  unresolvedRecorded: number;
  limitations: string[];
}

export interface NodeRow {
  id: number;
  kind: string;
  key: string;
  name: string;
  filePath: string | null;
  module: string | null;
  symbolKind: string | null;
  exported: boolean;
  startLine: number | null;
  endLine: number | null;
  data: Record<string, unknown>;
}

export interface EdgeWithOther {
  id: number;
  kind: string;
  confidence: Confidence;
  evidencePath: string | null;
  evidenceLine: number | null;
  detail: string | null;
  other: NodeRow;
}

export interface NodeDetail {
  node: NodeRow;
  outgoing: EdgeWithOther[];
  incoming: EdgeWithOther[];
}

export interface ViewNode {
  id: string;
  kind: string;
  label: string;
  group?: string;
  ref?: number;
  metrics?: Record<string, number | string | boolean | null>;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  confidence: Confidence;
  weight: number;
  evidence?: { path: string; line: number | null }[];
}

export interface GraphView {
  nodes: ViewNode[];
  edges: ViewEdge[];
  truncated: boolean;
  notes: string[];
}

export const FILE_STATUSES = [
  'full',
  'partial',
  'text',
  'unsupported',
  'failed',
  'excluded',
  'binary',
] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];
export type StatusCounts = Record<FileStatus, number>;

/** The file inventory of an index: every listed path counted by how it was processed. */
export interface Inventory {
  producer: string;
  total: number;
  counts: StatusCounts;
  analysed: number;
  readable: number;
  coverage: number | null;
  fullCoverage: number | null;
  summary: string;
  languages: {
    language: string;
    category: string;
    files: number;
    counts: StatusCounts;
    analysed: number;
    coverage: number | null;
    status: string;
    method: string;
  }[];
  categories: { category: string; label: string; files: number; analysed: number }[];
  fileTypes: {
    role: string;
    label: string;
    group: string;
    groupLabel: string;
    files: number;
    counts: StatusCounts;
    analysed: number;
    coverage: number | null;
    examples: string[];
  }[];
  directories: {
    path: string;
    files: number;
    counts: StatusCounts;
    analysed: number;
    coverage: number | null;
  }[];
  reasons: { status: FileStatus; reason: string; files: number; examples: string[] }[];
  notAnalysedTotal: number;
  ambiguous: { language: string; alternatives: string[]; files: number }[];
  unlisted: { path: string; reason: string }[];
}

export interface InventoryFile {
  path: string;
  language: string;
  category: string;
  role: string | null;
  status: FileStatus;
  method: string;
  reason: string | null;
  bytes: number | null;
  detectedBy: string | null;
  confidence: string | null;
}
