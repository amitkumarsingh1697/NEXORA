import type { Logger } from '@nexora/logging';
import type { ModelProvider } from '@nexora/ai';
import type { Db } from './db/client';
import type { BackendConfig } from './config';
import type { ObjectStorage } from './storage/storage';
import type { Mailer } from './lib/mail';

/** Everything a service needs, passed explicitly (no hidden globals). */
export interface Ctx {
  db: Db;
  cfg: BackendConfig;
  storage: ObjectStorage;
  mail: Mailer;
  ai: ModelProvider;
  log: Logger;
  now: () => Date;
}
