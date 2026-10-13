import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3006',
    channel: 'chrome',
    headless: true,
    trace: 'on',
    screenshot: 'on',
  },
  webServer: {
    command: 'npx next start -p 3006',
    url: 'http://localhost:3006',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
