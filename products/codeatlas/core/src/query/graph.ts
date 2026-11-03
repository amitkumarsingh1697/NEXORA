import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Db } from '../store/db';
import type { Confidence } from '../indexer/model';

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

export interface EdgeRow {
  id: number;
  src: number;
  dst: number;
  kind: string;
  confidence: Confidence;
  evidencePath: string | null;
  evidenceLine: number | null;
  detail: string | null;
}

interface RawNode {
  id: number;
  kind: string;
  key: string;
  name: string;
  file_path: string | null;
  module: string | null;
  symbol_kind: string | null;
  exported: number;
  start_line: number | null;
  end_line: number | null;
  data: string;
}

interface RawEdge {
  id: number;
  src: number;
  dst: number;
  kind: string;
  confidence: Confidence;
  evidence_path: string | null;
  evidence_line: number | null;
  detail: string | null;
}

export const NODE_COLS =
  'id, kind, key, name, file_path, module, symbol_kind, exported, start_line, end_line, data';
export const EDGE_COLS = 'id, src, dst, kind, confidence, evidence_path, evidence_line, detail';

export function toNode(r: RawNode): NodeRow {
  return {
    id: r.id,
    kind: r.kind,
    key: r.key,
    name: r.name,
    filePath: r.file_path,
    module: r.module,
    symbolKind: r.symbol_kind,
    exported: !!r.exported,
    startLine: r.start_line,
    endLine: r.end_line,
    data: JSON.parse(r.data) as Record<string, unknown>,
  };
}

export function toEdge(r: RawEdge): EdgeRow {
  return {
    id: r.id,
    src: r.src,
    dst: r.dst,
    kind: r.kind,
    confidence: r.confidence,
    evidencePath: r.evidence_path,
    evidenceLine: r.evidence_line,
    detail: r.detail,
  };
}

export interface RepoRow {
  id: number;
  root: string;
  name: string;
  lastIndexedAt: string | null;
  headCommit: string | null;
}

export function listRepos(db: Db): RepoRow[] {
  return (
    db
      .prepare('SELECT id, root, name, last_indexed_at, head_commit FROM repos ORDER BY name')
      .all() as {
      id: number;
      root: string;
      name: string;
      last_indexed_at: string | null;
      head_commit: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    root: r.root,
    name: r.name,
    lastIndexedAt: r.last_indexed_at,
    headCommit: r.head_commit,
  }));
}

export function getRepo(db: Db, repoId: number): RepoRow | null {
  return listRepos(db).find((r) => r.id === repoId) ?? null;
}

export function latestCoverage(db: Db, repoId: number): unknown {
  const r = db
    .prepare(
      "SELECT coverage FROM index_runs WHERE repo_id = ? AND status = 'succeeded' ORDER BY id DESC LIMIT 1",
    )
    .get(repoId) as { coverage: string } | undefined;
  return r ? JSON.parse(r.coverage) : null;
}

export function indexRuns(
  db: Db,
  repoId: number,
  limit = 10,
): {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  error: string | null;
  durationMs: number | null;
}[] {
  return (
    db
      .prepare(
        'SELECT id, started_at, finished_at, status, error, duration_ms FROM index_runs WHERE repo_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(repoId, limit) as {
      id: number;
      started_at: string;
      finished_at: string | null;
      status: string;
      error: string | null;
      duration_ms: number | null;
    }[]
  ).map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    error: r.error,
    durationMs: r.duration_ms,
  }));
}

export function nodeById(db: Db, repoId: number, id: number): NodeRow | null {
  const r = db
    .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND id = ?`)
    .get(repoId, id) as RawNode | undefined;
  return r ? toNode(r) : null;
}

export function nodeByKey(db: Db, repoId: number, kind: string, key: string): NodeRow | null {
  const r = db
    .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = ? AND key = ?`)
    .get(repoId, kind, key) as RawNode | undefined;
  return r ? toNode(r) : null;
}

export function nodesByIds(db: Db, repoId: number, ids: number[]): NodeRow[] {
  if (!ids.length) return [];
  const out: NodeRow[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    out.push(
      ...(
        db
          .prepare(
            `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND id IN (${part.map(() => '?').join(',')})`,
          )
          .all(repoId, ...part) as unknown as RawNode[]
      ).map(toNode),
    );
  }
  return out;
}

export function listNodes(
  db: Db,
  repoId: number,
  kind: string,
  opts: { module?: string; limit?: number } = {},
): NodeRow[] {
  const rows = opts.module
    ? db
        .prepare(
          `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = ? AND module = ? ORDER BY key LIMIT ?`,
        )
        .all(repoId, kind, opts.module, opts.limit ?? 5000)
    : db
        .prepare(
          `SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = ? ORDER BY key LIMIT ?`,
        )
        .all(repoId, kind, opts.limit ?? 5000);
  return (rows as unknown as RawNode[]).map(toNode);
}

export function edgesFrom(db: Db, repoId: number, id: number, kinds?: string[]): EdgeRow[] {
  const rows = db
    .prepare(`SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND src = ?`)
    .all(repoId, id) as unknown as RawEdge[];
  return rows.map(toEdge).filter((e) => !kinds || kinds.includes(e.kind));
}

export function edgesTo(db: Db, repoId: number, id: number, kinds?: string[]): EdgeRow[] {
  const rows = db
    .prepare(`SELECT ${EDGE_COLS} FROM edges WHERE repo_id = ? AND dst = ?`)
    .all(repoId, id) as unknown as RawEdge[];
  return rows.map(toEdge).filter((e) => !kinds || kinds.includes(e.kind));
}

export interface NodeDetail {
  node: NodeRow;
  outgoing: (EdgeRow & { other: NodeRow })[];
  incoming: (EdgeRow & { other: NodeRow })[];
}

export function nodeDetail(db: Db, repoId: number, id: number): NodeDetail | null {
  const node = nodeById(db, repoId, id);
  if (!node) return null;
  const out = edgesFrom(db, repoId, id);
  const inc = edgesTo(db, repoId, id);
  const others = new Map(
    nodesByIds(db, repoId, [...new Set([...out.map((e) => e.dst), ...inc.map((e) => e.src)])]).map(
      (n) => [n.id, n],
    ),
  );
  return {
    node,
    outgoing: out.flatMap((e) =>
      others.get(e.dst) ? [{ ...e, other: others.get(e.dst) as NodeRow }] : [],
    ),
    incoming: inc.flatMap((e) =>
      others.get(e.src) ? [{ ...e, other: others.get(e.src) as NodeRow }] : [],
    ),
  };
}

export function unresolvedList(
  db: Db,
  repoId: number,
  limit = 500,
): { filePath: string; line: number; kind: string; text: string; reason: string }[] {
  return (
    db
      .prepare(
        'SELECT file_path, line, kind, text, reason FROM unresolved WHERE repo_id = ? ORDER BY file_path, line LIMIT ?',
      )
      .all(repoId, limit) as {
      file_path: string;
      line: number;
      kind: string;
      text: string;
      reason: string;
    }[]
  ).map((r) => ({
    filePath: r.file_path,
    line: r.line,
    kind: r.kind,
    text: r.text,
    reason: r.reason,
  }));
}

/**
 * Read source lines from the working tree for citations. Refuses paths
 * outside the repository (including via symlinks).
 */
export function readSource(
  root: string,
  path: string,
  start = 1,
  end?: number,
): { path: string; startLine: number; endLine: number; lines: string[] } {
  const realRoot = realpathSync(root);
  const abs = realpathSync(join(realRoot, path));
  const r = relative(realRoot, abs);
  if (r.startsWith('..') || r.startsWith(sep) || r === '')
    throw new Error('Path is outside the repository.');
  const all = readFileSync(abs, 'utf8').split('\n');
  const s = Math.max(1, start);
  const e = Math.min(all.length, end ?? all.length, s + 2000);
  return { path: r.split(sep).join('/'), startLine: s, endLine: e, lines: all.slice(s - 1, e) };
}
