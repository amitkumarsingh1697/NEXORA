import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Regenerates the CodeAtlas README screenshots in documentation/assets/screenshots.
 * It indexes a fresh clone of this repository. Not part of the test gate.
 * Run: pnpm --filter @nexora/codeatlas-web screenshots
 */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  testMatch: '*.shots.ts',
  use: { ...base.use, viewport: { width: 1280, height: 800 }, trace: 'off' },
});
