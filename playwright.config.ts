import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E for the local dashboard.
 *
 * The suite boots its own production server (build + start on localhost:3000)
 * and tears it down when done. Production mode is deliberate: the suite
 * also passes against a `next dev` server on localhost, but a fresh
 * production build removes dev-mode variables (HMR socket) entirely.
 *
 * localhost (not 127.0.0.1) is required: Next 16 dev-mode Turbopack
 * blocks the HMR WebSocket from 127.0.0.1 origins, which silently breaks
 * React hydration and leaves every onClick unattached.
 *
 * Release-gate command (`npm run e2e`), never pre-commit: the full job run
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
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // first build after a cold .next can take a while
  },
});
