import 'server-only';
import { createContext, loadBackendConfig, type Ctx } from '@nexora/cvforge-backend';

// One context per server process; kept on globalThis so dev hot-reload does not leak pools.
const g = globalThis as unknown as { __cvforgeCtx?: Ctx };

export function ctx(): Ctx {
  g.__cvforgeCtx ??= createContext(loadBackendConfig());
  return g.__cvforgeCtx;
}
