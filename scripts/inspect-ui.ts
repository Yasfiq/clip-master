import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const dashboardShot = path.join(ARTIFACT_DIR, 'current_dashboard.png');
  await page.screenshot({ path: dashboardShot, fullPage: true });
  console.log('Saved dashboard screenshot:', dashboardShot);

  // Click the job row to open JobDetail and see if any error triggers
  const row = page.locator('tr').filter({ hasText: 'PHASE 1 DONE' }).first();
  if (await row.isVisible()) {
    console.log('Clicking job row...');
    await row.click();
    await page.waitForTimeout(2000);
    const detailShot = path.join(ARTIFACT_DIR, 'current_detail.png');
    await page.screenshot({ path: detailShot, fullPage: true });
    console.log('Saved detail screenshot:', detailShot);
  }

  await browser.close();
}

main().catch(console.error);
