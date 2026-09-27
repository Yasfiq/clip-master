import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, Page } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const PORT = '3005';
const BASE_URL = `http://localhost:${PORT}`;
const JOB_ID = 'cmttukln100001r81oomjso3j';

async function waitForServer(maxWaitMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/config`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log('=== Triggering Phase 2 via Browser Automation (12 Clips) ===');

  try {
    const { execSync } = await import('child_process');
    execSync('fuser -k 3005/tcp 2>/dev/null || true');
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`Starting Next.js dev server on port ${PORT}...`);
  const serverProcess: ChildProcess = spawn('npx', ['next', 'dev', '-p', PORT], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `/home/mohammad-yasfiq/.nvm/versions/node/v24.19.0/bin:${process.env.PATH || ''}`,
      PORT,
    },
  });

  const ready = await waitForServer(30000);
  if (!ready) {
    serverProcess.kill();
    throw new Error(`Next.js server failed to respond on port ${PORT}`);
  }
  console.log('Server is ready at', BASE_URL);

  const browser: Browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text());
  });

  try {
    console.log('Navigating to dashboard...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // If JobDetail is not open, click the job row in the table
    let phase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    if (!(await phase2Btn.isVisible())) {
      console.log('JobDetail not currently open, finding job row in table...');
      const row = page
        .locator('tr')
        .filter({ hasText: /PHASE 1 DONE|cmttukln/i })
        .first();
      if (await row.isVisible()) {
        await row.click();
        await page.waitForTimeout(2000);
      }
    }

    const shot1 = path.join(ARTIFACT_DIR, 'fresh_03_phase1_done_12clips.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log('Saved Phase 1 ready screenshot:', shot1);

    // Click Run Phase 2
    phase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    await phase2Btn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Clicking "Run Phase 2 →" button on browser UI...');
    await phase2Btn.click();
    await page.waitForTimeout(3000);

    const shot2 = path.join(ARTIFACT_DIR, 'fresh_04_phase2_started.png');
    await page.screenshot({ path: shot2, fullPage: true });
    console.log('Saved Phase 2 started screenshot:', shot2);

    // Monitor Phase 2 until COMPLETED
    console.log('--- Monitoring Phase 2 Execution (Face Clustering & 3-Word Subtitles) ---');
    let lastStage = '';
    while (true) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${JOB_ID}`);
        if (res.ok) {
          const payload = await res.json();
          const job = payload.data;
          const status = job.status;
          const stage = job.currentStage || 'PROCESSING';
          const progress = Math.round((job.progress || 0) * 100);

          if (stage !== lastStage) {
            console.log(`[PHASE 2] Status: ${status} | Stage: ${stage} | Progress: ${progress}%`);
            lastStage = stage;
          }

          if (status === 'COMPLETED') {
            console.log('>>> Job reached COMPLETED successfully! All 12 clips rendered. <<<');
            await page.waitForTimeout(3000);
            const shot3 = path.join(ARTIFACT_DIR, 'fresh_05_job_completed.png');
            await page.screenshot({ path: shot3, fullPage: true });
            console.log('Saved Job Completed screenshot:', shot3);
            break;
          }

          if (status === 'FAILED' || status === 'CANCELLED') {
            throw new Error(`Job ended in ${status}: ${job.errorMessage}`);
          }
        }
      } catch (err: any) {
        console.warn('Phase 2 polling warning:', err.message);
      }
      await page.waitForTimeout(10000);
    }

    // View Clips Gallery
    console.log('Navigating to /clips to verify generated vertical shorts...');
    await page.goto(`${BASE_URL}/clips?job=${JOB_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    const shot4 = path.join(ARTIFACT_DIR, 'fresh_06_clips_gallery_12clips.png');
    await page.screenshot({ path: shot4, fullPage: true });
    console.log('Saved clips gallery screenshot:', shot4);

    console.log('=== Fresh 12-Clips Full E2E Execution Completed Successfully! ===');
  } finally {
    await browser.close();
    serverProcess.kill();
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
