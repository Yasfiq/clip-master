import { spawn } from 'child_process';
import { chromium } from '@playwright/test';

async function main() {
  console.log('Starting Next.js dev server...');
  const server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
  });

  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:3001/api/config');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    server.kill();
    throw new Error('Dev server failed to start');
  }

  console.log('Dev server ready on 3001. Launching browser...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('[DEV CONSOLE ERROR]', msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.error('[DEV PAGE ERROR MESSAGE]:', err.message);
    console.error('[DEV PAGE ERROR STACK]:', err.stack);
  });

  await page.goto('http://localhost:3001');
  await page.waitForTimeout(3000);

  const row = page
    .locator('tr')
    .filter({ hasText: /PHASE 1 DONE|cmtscxdc/i })
    .first();
  if (await row.isVisible()) {
    console.log('Clicking job row...');
    await row.click();
    await page.waitForTimeout(4000);
  } else {
    console.log('No job row found.');
  }

  await browser.close();
  server.kill();
  process.exit(0);
}

main().catch(console.error);
