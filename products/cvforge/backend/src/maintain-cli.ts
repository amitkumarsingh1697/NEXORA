import { createContext } from './factory';
import { loadBackendConfig } from './config';
import { runMaintenance } from './services/maintenance';

// Retention sweep entry point: `pnpm --filter @nexora/cvforge-backend maintain` (schedule hourly).
const ctx = createContext(loadBackendConfig());
try {
  const r = await runMaintenance(ctx);
  console.log(JSON.stringify(r));
} finally {
  await ctx.close();
}
