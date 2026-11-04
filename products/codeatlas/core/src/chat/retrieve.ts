import type { Db } from '../store/db';
import { edgesFrom, edgesTo, nodeByKey, nodesByIds, type NodeRow } from '../query/graph';
import { findNodes, search, type SearchHit } from '../query/search';
import { redactSecrets } from './redact';

export interface Source {
  id: string; // S1, S2…
  filePath: string;
  startLine: number;
  endLine: number;
  symbol: string | null;
  kind: 'code' | 'doc' | 'text';
  text: string;
  reason: string;
}

export interface GraphFact {
  text: string;
  confidence: string;
  evidence: string | null;
}

export interface Retrieval {
  question: string;
  sources: Source[];
  facts: GraphFact[];
  entities: { id: number; kind: string; key: string; name: string }[];
  redactions: number;
  /** The index revision every source was read from (spec §5.8: citations include the revision). */
  revision: IndexRevision;
}

export interface IndexRevision {
  /** HEAD commit when indexed, or null for a folder without git history. */
  commit: string | null;
  branch: string | null;
  indexedAt: string | null;
  /** True when the working tree had uncommitted changes at index time. */
  dirty: boolean;
}

/** Revision of the latest successful index of a repository. */
export function indexRevision(db: Db, repoId: number): IndexRevision {
  const repo = db
    .prepare('SELECT head_commit, branch, last_indexed_at FROM repos WHERE id = ?')
    .get(repoId) as
    | { head_commit: string | null; branch: string | null; last_indexed_at: string | null }
    | undefined;
  const run = db
    .prepare(
      "SELECT coverage FROM index_runs WHERE repo_id = ? AND status = 'succeeded' ORDER BY id DESC LIMIT 1",
    )
    .get(repoId) as { coverage: string | null } | undefined;
  let dirty: boolean;
  try {
    const cov = JSON.parse(run?.coverage ?? '{}') as { git?: { dirtyFiles?: number } };
    dirty = Number(cov.git?.dirtyFiles ?? 0) > 0;
  } catch {
    dirty = false;
  }
  return {
    commit: repo?.head_commit ?? null,
    branch: repo?.branch ?? null,
    indexedAt: repo?.last_indexed_at ?? null,
    dirty,
  };
}

const MAX_SOURCE_LINES = 60;

/** Identifier-like tokens the user probably means literally (backticks, camelCase, paths). */
export function extractEntities(q: string): string[] {
  const out = new Set<string>();
  for (const m of q.matchAll(/`([^`]{2,100})`/g)) out.add((m[1] as string).trim());
  for (const m of q.matchAll(
    /\b([a-z]+[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[a-z0-9]+_[a-z0-9_]+)\b/g,
  ))
    out.add(m[1] as string);
  for (const m of q.matchAll(/\b([\w.-]+\/[\w./-]+\.[cm]?[jt]sx?)\b/g)) out.add(m[1] as string);
  for (const m of q.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/:[\].-]*)/g))
    out.add(`${m[1]} ${m[2]}`);
  return [...out].slice(0, 6);
}

export function clip(
  body: string,
  start: number,
  focus?: number,
): { text: string; startLine: number; endLine: number } {
  const lines = body.split('\n');
  if (lines.length <= MAX_SOURCE_LINES)
    return { text: body, startLine: start, endLine: start + lines.length - 1 };
  const offset = focus
    ? Math.max(0, Math.min(lines.length - MAX_SOURCE_LINES, focus - start - 10))
    : 0;
  const part = lines.slice(offset, offset + MAX_SOURCE_LINES);
  return {
    text: part.join('\n'),
    startLine: start + offset,
    endLine: start + offset + part.length - 1,
  };
}

export function chunkForSymbol(db: Db, repoId: number, key: string): SearchHit | null {
  const r = db
    .prepare(
      'SELECT id, file_path, start_line, end_line, symbol_key, kind, body FROM chunks WHERE repo_id = ? AND symbol_key = ? ORDER BY start_line LIMIT 1',
    )
    .get(repoId, key) as
    | {
        id: number;
        file_path: string;
        start_line: number;
        end_line: number;
        symbol_key: string;
        kind: 'code';
        body: string;
      }
    | undefined;
  return r
    ? {
        chunkId: r.id,
        filePath: r.file_path,
        startLine: r.start_line,
        endLine: r.end_line,
        symbolKey: r.symbol_key,
        kind: r.kind,
        score: 0,
        body: r.body,
      }
    : null;
}

function label(n: NodeRow): string {
  return n.kind === 'symbol' ? `${n.name} (${n.filePath}:${n.startLine})` : n.key;
}

/** Gather grounded context for a question: named entities first, then BM25 search, plus graph facts. */
export function retrieve(
  db: Db,
  repoId: number,
  question: string,
  opts: { maxSources?: number } = {},
): Retrieval {
  const max = opts.maxSources ?? 8;
  const sources: Source[] = [];
  const facts: GraphFact[] = [];
  const seenChunks = new Set<number>();
  let redactions = 0;
  const add = (h: SearchHit, reason: string) => {
    if (seenChunks.has(h.chunkId) || sources.length >= max) return;
    seenChunks.add(h.chunkId);
    const c = clip(h.body, h.startLine);
    const red = redactSecrets(c.text);
    redactions += red.redactions;
    sources.push({
      id: `S${sources.length + 1}`,
      filePath: h.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbol: h.symbolKey?.split('#').pop() ?? null,
      kind: h.kind,
      text: red.text,
      reason,
    });
  };

  const entities: Retrieval['entities'] = [];
  for (const term of extractEntities(question)) {
    const exact = nodeByKey(db, repoId, 'route', term) ?? nodeByKey(db, repoId, 'file', term);
    const matches = exact
      ? [exact]
      : findNodes(db, repoId, term, 5).filter(
          (n) => n.name === term || n.name.endsWith(`.${term}`) || n.key === term,
        );
    for (const m of matches.slice(0, 2)) {
      entities.push({ id: m.id, kind: m.kind, key: m.key, name: m.name });
      if (m.kind === 'symbol') {
        const ch = chunkForSymbol(db, repoId, m.key);
        if (ch) add(ch, `definition of ${m.name}`);
      }
      // Graph facts with evidence.
      const out = edgesFrom(db, repoId, m.id).filter((e) => e.kind !== 'contains');
      const inc = edgesTo(db, repoId, m.id).filter((e) => e.kind !== 'contains');
      const others = new Map(
        nodesByIds(db, repoId, [...out.map((e) => e.dst), ...inc.map((e) => e.src)]).map((n) => [
          n.id,
          n,
        ]),
      );
      for (const e of out.slice(0, 12)) {
        const o = others.get(e.dst);
        if (o)
          facts.push({
            text: `${m.name} ${e.kind} ${label(o)}`,
            confidence: e.confidence,
            evidence: e.evidencePath ? `${e.evidencePath}:${e.evidenceLine ?? ''}` : null,
          });
      }
      for (const e of inc.slice(0, 12)) {
        const o = others.get(e.src);
        if (o)
          facts.push({
            text: `${label(o)} ${e.kind} ${m.name}`,
            confidence: e.confidence,
            evidence: e.evidencePath ? `${e.evidencePath}:${e.evidenceLine ?? ''}` : null,
          });
      }
      // For routes, include the handler's code.
      if (m.kind === 'route') {
        for (const e of out.filter((x) => x.kind === 'handled_by')) {
          const h = others.get(e.dst);
          const ch = h ? chunkForSymbol(db, repoId, h.key) : null;
          if (ch) add(ch, `handler of ${m.key}`);
        }
      }
    }
  }
  for (const h of search(db, repoId, question, { limit: max * 2 })) add(h, 'search match');
  return {
    question,
    sources,
    facts: facts.slice(0, 30),
    entities,
    redactions,
    revision: indexRevision(db, repoId),
  };
}
