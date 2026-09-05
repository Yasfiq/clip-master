import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E for the local dashboard.
 *
 * The suite talks to a running dev server on 127.0.0.1:3000. It is a
 * release-gate command (`npm run e2e`), never pre-commit: the full job run
 * inside it executes yt-dlp/FFmpeg/Whisper through the real pipeline.
 *
 * Browser: system Chrome (channel: 'chrome') — no Playwright-bundled
 * download required, keeps offline installs deterministic.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 900_000, // 15 min: a real pipeline job run dominates the budget
  expect: { timeout: 15_000 },
  fullyParallel: false, // one active job at a time is a project invariant
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
