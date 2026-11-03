import { createLogger } from '@nexora/logging';
import { createProvider } from '@nexora/ai';
import type { BackendConfig } from './config';
import type { Ctx } from './context';
import { createDatabase } from './db/client';
import { LocalFileStorage } from './storage/storage';
import { OutboxMailer } from './lib/mail';

/** Build the service context from configuration. */
export function createContext(cfg: BackendConfig): Ctx & { close(): Promise<void> } {
  const database = createDatabase(cfg.DATABASE_URL);
  return {
    db: database.db,
    cfg,
    storage: new LocalFileStorage(cfg.STORAGE_DIR),
    mail: new OutboxMailer(cfg.MAIL_OUTBOX_DIR),
    ai: createProvider(cfg),
    log: createLogger({ name: 'cvforge' }),
    now: () => new Date(),
    close: () => database.close(),
  };
}
