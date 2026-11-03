import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ORIGIN: `http://localhost:${PORT}`,
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? 'postgres://nexora:nexora_dev@127.0.0.1:5432/cvforge_e2e',
      STORAGE_DIR: '.data/e2e/storage',
      MAIL_OUTBOX_DIR: '.data/e2e/outbox',
      AI_PROVIDER: 'disabled',
      // Test-only secret; never used outside the throwaway e2e database.
      APP_SECRET: process.env.E2E_APP_SECRET ?? 'e2e-only-secret-0123456789abcdef0123456789abcdef',
    },
  },
});
