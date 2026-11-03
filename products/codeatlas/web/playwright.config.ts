import { defineConfig } from '@playwright/test';

const PORT = 4410;
export const E2E_HOME = new URL('./.e2e-home', import.meta.url).pathname;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `rm -rf ${E2E_HOME} && pnpm --filter @nexora/codeatlas-service exec node --no-warnings --import tsx src/cli.ts serve`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { CODEATLAS_HOME: E2E_HOME, CODEATLAS_PORT: String(PORT), AI_PROVIDER: 'disabled' },
  },
});
