import { spawn } from 'child_process';
import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
  console.log('Starting Next.js server...');
  const server = spawn('npm', ['run', 'start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000' },
  });

  // Wait for server to respond
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:3000/api/config');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    server.kill();
    throw new Error('Server failed to start');
  }

  console.log('Server is ready. Launching browser...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('[BROWSER]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('[PAGE ERROR]', err.message, err.stack));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);

  const dashShot = path.join(ARTIFACT_DIR, 'dash_check.png');
  await page.screenshot({ path: dashShot, fullPage: true });
  console.log('Saved dashboard screenshot');

  // Check if job row is visible
  const row = page
    .locator('tr')
    .filter({ hasText: /PHASE 1 DONE|cmtscxdc/i })
    .first();
  if (await row.isVisible()) {
    console.log('Found job row, clicking to open JobDetail...');
    await row.click();
    await page.waitForTimeout(3000);
    const detailShot = path.join(ARTIFACT_DIR, 'detail_check.png');
    await page.screenshot({ path: detailShot, fullPage: true });
    console.log('Saved detail screenshot');
  } else {
    console.log('No job row found on dashboard table.');
  }

  await browser.close();
  server.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
