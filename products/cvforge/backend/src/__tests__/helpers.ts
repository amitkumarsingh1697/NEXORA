import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { DisabledProvider, type ModelProvider } from '@nexora/ai';
import { createLogger } from '@nexora/logging';
import { loadBackendConfig } from '../config';
import type { Ctx } from '../context';
import { createDatabase, runMigrations, type Database } from '../db/client';
import { LocalFileStorage } from '../storage/storage';
import { OutboxMailer } from '../lib/mail';

export const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://nexora:nexora_dev@127.0.0.1:5432/cvforge_test';

export interface TestEnv {
  ctx: Ctx & { mail: OutboxMailer };
  clock: { now: Date };
  database: Database;
  dir: string;
  cleanup(): Promise<void>;
}

/** Fresh schema per test file, real Postgres, temp storage, controllable clock. */
export async function setupTestEnv(ai: ModelProvider = new DisabledProvider()): Promise<TestEnv> {
  const database = createDatabase(TEST_DB, 5);
  await database.db.execute(sql`drop schema if exists public cascade`);
  await database.db.execute(sql`drop schema if exists drizzle cascade`);
  await database.db.execute(sql`create schema public`);
  await runMigrations(database.db);
  const dir = await mkdtemp(join(tmpdir(), 'cvforge-test-'));
  const clock = { now: new Date('2026-11-01T10:00:00Z') };
  const cfg = loadBackendConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    STORAGE_DIR: join(dir, 'storage'),
    MAIL_OUTBOX_DIR: join(dir, 'outbox'),
    AI_PROVIDER: 'disabled',
  });
  const ctx = {
    db: database.db,
    cfg,
    storage: new LocalFileStorage(cfg.STORAGE_DIR),
    mail: new OutboxMailer(cfg.MAIL_OUTBOX_DIR),
    ai,
    log: createLogger({ name: 'test', level: 'silent' }),
    now: () => clock.now,
  };
  return {
    ctx,
    clock,
    database,
    dir,
    async cleanup() {
      await database.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export const PASSWORD = 'correct horse battery staple';
