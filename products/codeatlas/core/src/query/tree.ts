/**
 * Hierarchical drill-down (spec §5.5, AB-5.5-03/04): repository → module → file → symbol,
 * loaded one level at a time so large repositories stay responsive, with a language filter.
 */
import type { Db } from '../store/db';
import { NODE_COLS, toNode, type NodeRow } from './graph';

export interface TreeItem {
  /** Node id, for the node panel. */
  id: number;
  kind: 'module' | 'file' | 'symbol';
  label: string;
  /** What to pass back to load children; absent when the item has none. */
  expand?: { module: string } | { file: string } | { symbol: string };
  childCount: number;
  lang?: string;
  symbolKind?: string;
  exported?: boolean;
  line?: number;
}

type RawNode = Parameters<typeof toNode>[0];

function files(db: Db, repoId: number, lang?: string): NodeRow[] {
  const rows = (
    db
      .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = 'file'`)
      .all(repoId) as unknown as RawNode[]
  ).map(toNode);
  return lang ? rows.filter((f) => f.data.lang === lang) : rows;
}

/** Languages present, with file counts, for the filter. */
export function repoLanguages(db: Db, repoId: number): { lang: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const f of files(db, repoId)) {
    const l = typeof f.data.lang === 'string' ? f.data.lang : 'unknown';
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([lang, n]) => ({ lang, files: n }))
    .sort((a, b) => b.files - a.files || a.lang.localeCompare(b.lang));
}

/** Children of one tree level. With no parent: the modules. */
export function treeChildren(
  db: Db,
  repoId: number,
  parent: { module?: string; file?: string; symbol?: string; lang?: string } = {},
): TreeItem[] {
  const lang = parent.lang || undefined;
  if (parent.symbol !== undefined || parent.file !== undefined) {
    const [ownerKind, ownerKey] =
      parent.symbol !== undefined ? ['symbol', parent.symbol] : ['file', parent.file ?? ''];
    const owner = db
      .prepare('SELECT id FROM nodes WHERE repo_id = ? AND kind = ? AND key = ?')
      .get(repoId, ownerKind, ownerKey) as { id: number } | undefined;
    if (!owner) return [];
    const kids = (
      db
        .prepare(
          `SELECT ${NODE_COLS.split(', ')
            .map((c) => `n.${c}`)
            .join(', ')} FROM edges e JOIN nodes n ON n.id = e.dst
           WHERE e.repo_id = ? AND e.src = ? AND e.kind = 'contains' AND n.kind = 'symbol'`,
        )
        .all(repoId, owner.id) as unknown as RawNode[]
    ).map(toNode);
    const childCounts = containsCounts(
      db,
      repoId,
      kids.map((k) => k.id),
    );
    return kids
      .sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0))
      .map((k) => {
        const n = childCounts.get(k.id) ?? 0;
        return {
          id: k.id,
          kind: 'symbol' as const,
          label: k.name.split('.').pop() ?? k.name,
          childCount: n,
          ...(n ? { expand: { symbol: k.key } } : {}),
          symbolKind: k.symbolKind ?? undefined,
          exported: k.exported,
          line: k.startLine ?? undefined,
        };
      });
  }

  const all = files(db, repoId, lang);
  if (parent.module !== undefined) {
    const inModule = all.filter((f) => f.module === parent.module);
    const counts = containsCounts(
      db,
      repoId,
      inModule.map((f) => f.id),
    );
    return inModule
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((f) => {
        const n = counts.get(f.id) ?? 0;
        return {
          id: f.id,
          kind: 'file' as const,
          label: f.key,
          childCount: n,
          ...(n ? { expand: { file: f.key } } : {}),
          lang: typeof f.data.lang === 'string' ? f.data.lang : undefined,
        };
      });
  }

  const perModule = new Map<string, number>();
  for (const f of all) if (f.module) perModule.set(f.module, (perModule.get(f.module) ?? 0) + 1);
  const modules = (
    db
      .prepare(`SELECT ${NODE_COLS} FROM nodes WHERE repo_id = ? AND kind = 'module'`)
      .all(repoId) as unknown as RawNode[]
  ).map(toNode);
  return modules
    .filter((m) => perModule.has(m.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => ({
      id: m.id,
      kind: 'module' as const,
      label: m.key,
      childCount: perModule.get(m.key) ?? 0,
      expand: { module: m.key },
    }));
}

function containsCounts(db: Db, repoId: number, ids: number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const stmt = db.prepare(
    `SELECT e.src AS id, COUNT(*) AS n FROM edges e JOIN nodes n ON n.id = e.dst
     WHERE e.repo_id = ? AND e.kind = 'contains' AND n.kind = 'symbol' AND e.src IN (SELECT value FROM json_each(?))
     GROUP BY e.src`,
  );
  for (const r of stmt.all(repoId, JSON.stringify(ids)) as { id: number; n: number }[])
    out.set(r.id, r.n);
  return out;
}
