import { mkdir, readFile, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomToken } from '../lib/crypto';

/**
 * Private object storage abstraction. v1 ships a local filesystem driver;
 * a hosted driver (S3-compatible, private bucket) implements the same interface.
 */
export interface ObjectStorage {
  put(prefix: string, bytes: Uint8Array): Promise<{ key: string; size: number }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  usage(prefix: string): Promise<number>;
}

const KEY_RE = /^[a-z0-9-]+(\/[A-Za-z0-9_-]+)+$/;

export class LocalFileStorage implements ObjectStorage {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Resolve a key to a path, refusing anything that escapes the storage root. */
  private pathFor(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return p;
  }

  async put(prefix: string, bytes: Uint8Array) {
    const key = `${prefix}/${randomToken(18)}`;
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    await writeFile(p, bytes, { mode: 0o600, flag: 'wx' });
    return { key, size: bytes.length };
  }

  async get(key: string) {
    return readFile(this.pathFor(key));
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    if (!/^[a-z0-9-]+(\/[A-Za-z0-9_-]+)*$/.test(prefix)) throw new Error('Invalid storage prefix');
    await rm(join(this.root, prefix), { recursive: true, force: true });
  }

  async usage(prefix: string) {
    const dir = join(this.root, prefix);
    let total = 0;
    const walk = async (d: string) => {
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      for (const e of entries) {
        const p = join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else total += (await stat(p)).size;
      }
    };
    await walk(dir);
    return total;
  }
}
