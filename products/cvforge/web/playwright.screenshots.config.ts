import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Regenerates the README screenshots in documentation/assets/screenshots from a
 * clean database with made-up sample data. Not part of the test gate.
 * Run: pnpm --filter @nexora/cvforge-web screenshots
 */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  testMatch: '*.shots.ts',
  use: { ...base.use, viewport: { width: 1280, height: 800 }, trace: 'off' },
});
