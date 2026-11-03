import { loadBackendConfig } from '../config';
import { createDatabase, runMigrations } from './client';

const cfg = loadBackendConfig();
const database = createDatabase(cfg.DATABASE_URL, 1);
try {
  await runMigrations(database.db);
  console.log('Migrations applied.');
} finally {
  await database.close();
}
