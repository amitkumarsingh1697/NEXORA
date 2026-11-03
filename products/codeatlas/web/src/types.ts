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
  status: 'running' | 'succeeded' | 'failed';
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
