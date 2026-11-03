import type { Db } from '../store/db';

export interface SearchHit {
  chunkId: number;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolKey: string | null;
  kind: 'code' | 'doc' | 'text';
  score: number;
  body: string;
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'be',
  'it',
  'this',
  'that',
  'how',
  'what',
  'where',
  'which',
  'who',
  'why',
  'does',
  'do',
  'did',
  'with',
  'from',
  'by',
  'at',
  'as',
  'when',
  'can',
  'i',
  'we',
  'you',
  'my',
  'our',
  'me',
  'show',
  'find',
  'explain',
  'tell',
  'about',
  'there',
  'any',
  'all',
  'code',
  'file',
  'files',
  'function',
  'functions',
]);

/** Turn free text into FTS5 terms: words, plus camelCase/snake parts. */
export function queryTerms(q: string): string[] {
  const out = new Set<string>();
  for (const m of q.matchAll(/[\p{L}\p{N}_$]+/gu)) {
    const w = m[0];
    const parts = w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_$]+/);
    for (const p of [w, ...parts]) {
      const t = p.toLowerCase();
      if (t.length >= 2 && !STOP.has(t)) out.add(t);
    }
  }
  return [...out].slice(0, 16);
}

function ftsExpr(terms: string[], op: 'AND' | 'OR'): string {
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(` ${op} `);
}

interface Raw {
  id: number;
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_key: string | null;
  kind: 'code' | 'doc' | 'text';
  body: string;
  score: number;
}

/**
 * BM25-ranked search over code, docs and text chunks of one repository.
 * Symbol names and paths weigh more than body text. Results that match
 * every term come first; partial matches fill the remainder.
 */
export function search(
  db: Db,
  repoId: number,
  q: string,
  opts: { limit?: number; kinds?: ('code' | 'doc' | 'text')[]; pathPrefix?: string } = {},
): SearchHit[] {
  const limit = Math.min(opts.limit ?? 20, 100);
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const sql = `SELECT c.id, c.file_path, c.start_line, c.end_line, c.symbol_key, c.kind, c.body, bm25(chunks_fts, 3.0, 6.0, 1.0, 1.5) AS score
    FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ? AND c.repo_id = ? ORDER BY score LIMIT ?`;
  const stmt = db.prepare(sql);
  const seen = new Set<number>();
  const out: SearchHit[] = [];
  // Partial (OR) matches must cover at least a third of the terms to count as evidence.
  const minTerms = Math.max(1, Math.ceil(terms.length / 3));
  const covers = (r: Raw) => {
    const raw = `${r.file_path} ${r.symbol_key ?? ''} ${r.body}`;
    const hay = raw.toLowerCase();
    const words = new Set(
      raw
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9$]+/),
    );
    return (
      terms.filter((t) => [...words].some((w) => w.startsWith(t)) || hay.includes(t)).length >=
      minTerms
    );
  };
  const take = (rows: Raw[], partial = false) => {
    for (const r of rows) {
      if (seen.has(r.id) || out.length >= limit) continue;
      if (partial && !covers(r)) continue;
      if (opts.kinds && !opts.kinds.includes(r.kind)) continue;
      if (opts.pathPrefix && !r.file_path.startsWith(opts.pathPrefix)) continue;
      seen.add(r.id);
      out.push({
        chunkId: r.id,
        filePath: r.file_path,
        startLine: r.start_line,
        endLine: r.end_line,
        symbolKey: r.symbol_key,
        kind: r.kind,
        score: Math.round(-r.score * 1000) / 1000,
        body: r.body,
      });
    }
  };
  const fetch = limit * 4;
  if (terms.length > 1) take(stmt.all(ftsExpr(terms, 'AND'), repoId, fetch) as unknown as Raw[]);
  if (out.length < limit)
    take(stmt.all(ftsExpr(terms, 'OR'), repoId, fetch) as unknown as Raw[], terms.length > 1);
  return out;
}

/** Find symbols/files/routes by name (for the UI search box and chat entity lookup). */
export function findNodes(
  db: Db,
  repoId: number,
  q: string,
  limit = 20,
): {
  id: number;
  kind: string;
  key: string;
  name: string;
  filePath: string | null;
  startLine: number | null;
}[] {
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return (
    db
      .prepare(
        `SELECT id, kind, key, name, file_path, start_line FROM nodes WHERE repo_id = ? AND kind IN ('symbol','file','route','module','doc','entrypoint') AND (name LIKE ? ESCAPE '\\' OR key LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN lower(name) = lower(?) THEN 0 WHEN lower(name) LIKE lower(?) THEN 1 ELSE 2 END, length(key) LIMIT ?`,
      )
      .all(repoId, like, like, q, `${q}%`, limit) as {
      id: number;
      kind: string;
      key: string;
      name: string;
      file_path: string | null;
      start_line: number | null;
    }[]
  ).map((r) => ({
    id: r.id,
    kind: r.kind,
    key: r.key,
    name: r.name,
    filePath: r.file_path,
    startLine: r.start_line,
  }));
}
