import { STATUSES, type FileStatus } from '@nexora/languages';

/** The processing statuses of a file, in order from fully analysed to binary. */
export const FILE_STATUSES = STATUSES;
import type { Db } from '../store/db';

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
  /** How references were linked: 'compiler', 'syntax', or null when none were. */
  resolution: string | null;
}

export interface InventoryFilter {
  status?: FileStatus;
  language?: string;
  role?: string;
  /** Path prefix (a folder). */
  dir?: string;
  /** Substring of the path. */
  q?: string;
  offset?: number;
  limit?: number;
}

export const isFileStatus = (s: unknown): s is FileStatus =>
  (STATUSES as readonly string[]).includes(s as string);

/**
 * The per-file inventory of the latest index, filtered and paged, so every listed path and
 * what happened to it can be looked up (nothing is summarised away).
 */
export function inventoryFiles(
  db: Db,
  repoId: number,
  f: InventoryFilter = {},
): { total: number; offset: number; items: InventoryFile[] } {
  const where = ['repo_id = ?'];
  const args: (string | number)[] = [repoId];
  if (f.status) {
    where.push('status = ?');
    args.push(f.status);
  }
  if (f.language) {
    where.push('language = ?');
    args.push(f.language);
  }
  if (f.role) {
    where.push('role = ?');
    args.push(f.role);
  }
  if (f.dir) {
    where.push('(path = ? OR substr(path, 1, ?) = ?)');
    const d = f.dir.replace(/\/+$/, '');
    args.push(d, d.length + 1, `${d}/`);
  }
  if (f.q) {
    where.push('instr(lower(path), ?) > 0');
    args.push(f.q.toLowerCase());
  }
  const sql = where.join(' AND ');
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM file_inventory WHERE ${sql}`).get(...args) as {
      n: number;
    }
  ).n;
  const offset = Math.max(0, Math.floor(f.offset ?? 0));
  const limit = Math.min(500, Math.max(1, Math.floor(f.limit ?? 100)));
  const items = (
    db
      .prepare(
        `SELECT path, language, category, role, status, method, reason, bytes, detected_by AS detectedBy, confidence, resolution FROM file_inventory WHERE ${sql} ORDER BY path LIMIT ? OFFSET ?`,
      )
      .all(...args, limit, offset) as unknown as InventoryFile[]
  ).map((r) => ({ ...r }));
  return { total, offset, items };
}
