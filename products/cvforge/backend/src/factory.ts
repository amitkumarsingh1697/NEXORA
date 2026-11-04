import { createLogger } from '@nexora/logging';
import { createProvider } from '@nexora/ai';
import type { BackendConfig } from './config';
import type { Ctx } from './context';
import { createDatabase } from './db/client';
import { LocalFileStorage } from './storage/storage';
import { OutboxMailer, SmtpMailer, type Mailer } from './lib/mail';

export function createMailer(cfg: BackendConfig): Mailer {
  if (cfg.MAIL_TRANSPORT === 'smtp')
    return new SmtpMailer({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE === 'true',
      requireTls: cfg.SMTP_REQUIRE_TLS === 'true',
      user: cfg.SMTP_USER || undefined,
      password: cfg.SMTP_PASSWORD || undefined,
      from: cfg.MAIL_FROM,
    });
  return new OutboxMailer(cfg.MAIL_OUTBOX_DIR);
}

/** Build the service context from configuration. */
export function createContext(cfg: BackendConfig): Ctx & { close(): Promise<void> } {
  const database = createDatabase(cfg.DATABASE_URL);
  return {
    db: database.db,
    cfg,
    storage: new LocalFileStorage(cfg.STORAGE_DIR),
    mail: createMailer(cfg),
    ai: createProvider(cfg),
    log: createLogger({ name: 'cvforge' }),
    now: () => new Date(),
    close: () => database.close(),
  };
}
