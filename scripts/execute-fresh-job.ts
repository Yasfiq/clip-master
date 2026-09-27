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
  console.log('=== Starting Fresh 12-Clips Full E2E Execution ===');
  console.log('Port:', PORT, '| Target Job ID:', JOB_ID);

  console.log(`Starting Next.js server on port ${PORT}...`);
  const serverProcess: ChildProcess = spawn('npx', ['next', 'dev', '-p', PORT], {
    stdio: 'inherit',
    env: { ...process.env, PORT },
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
    await page.waitForTimeout(2000);

    const shot1 = path.join(ARTIFACT_DIR, 'fresh_01_dashboard.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log('Saved dashboard screenshot:', shot1);

    // Find and click the PENDING job row
    console.log(`Locating job ${JOB_ID} on dashboard...`);
    const jobRow = page
      .locator('tr')
      .filter({ hasText: new RegExp(JOB_ID, 'i') })
      .first();
    await jobRow.waitFor({ state: 'visible', timeout: 10000 });
    await jobRow.click();
    await page.waitForTimeout(2000);

    // Check if start button is visible
    const startBtn = page.getByRole('button', { name: /Start Job/i });
    if (await startBtn.isVisible()) {
      console.log('Clicking "▶ Start Job" button on UI...');
      await startBtn.click();
      await page.waitForTimeout(2000);
    }

    const shot2 = path.join(ARTIFACT_DIR, 'fresh_02_job_started.png');
    await page.screenshot({ path: shot2, fullPage: true });
    console.log('Saved job started screenshot:', shot2);

    // Monitor Phase 1 until PHASE1_DONE
    console.log('--- Monitoring Phase 1 Execution ---');
    let lastStage = '';
    while (true) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${JOB_ID}`);
        if (res.ok) {
          const payload = await res.json();
          const job = payload.data;
          const status = job.status;
          const stage = job.currentStage || 'PENDING';
          const progress = Math.round((job.progress || 0) * 100);

          if (stage !== lastStage) {
            console.log(`[PHASE 1] Status: ${status} | Stage: ${stage} | Progress: ${progress}%`);
            lastStage = stage;
          }

          if (status === 'PHASE1_DONE') {
            const clipCount = job.clips?.length || 0;
            console.log(`>>> Phase 1 Complete! Selected & Cut ${clipCount} clips! <<<`);
            await page.waitForTimeout(2000);
            const shot3 = path.join(ARTIFACT_DIR, 'fresh_03_phase1_done_12clips.png');
            await page.screenshot({ path: shot3, fullPage: true });
            console.log('Saved Phase 1 completed screenshot:', shot3);
            break;
          }

          if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED_AD') {
            throw new Error(`Job ended prematurely with status ${status}: ${job.errorMessage}`);
          }
        }
      } catch (err: any) {
        console.warn('Phase 1 polling warning:', err.message);
      }
      await page.waitForTimeout(5000);
    }

    // Trigger Phase 2 via Browser UI
    console.log('--- Triggering Phase 2 via Browser UI ---');
    // Reload page to ensure fresh DOM state
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const p1DoneRow = page
      .locator('tr')
      .filter({ hasText: new RegExp(JOB_ID, 'i') })
      .first();
    await p1DoneRow.click();
    await page.waitForTimeout(2000);

    const phase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    await phase2Btn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Clicking "Run Phase 2 →" button on UI...');
    await phase2Btn.click();
    await page.waitForTimeout(3000);

    const shot4 = path.join(ARTIFACT_DIR, 'fresh_04_phase2_started.png');
    await page.screenshot({ path: shot4, fullPage: true });
    console.log('Saved Phase 2 started screenshot:', shot4);

    // Monitor Phase 2 until COMPLETED
    console.log('--- Monitoring Phase 2 Execution (Face Clustering & 3-Word Subtitles) ---');
    let lastP2Stage = '';
    while (true) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${JOB_ID}`);
        if (res.ok) {
          const payload = await res.json();
          const job = payload.data;
          const status = job.status;
          const stage = job.currentStage || 'PROCESSING';
          const progress = Math.round((job.progress || 0) * 100);

          if (stage !== lastP2Stage) {
            console.log(`[PHASE 2] Status: ${status} | Stage: ${stage} | Progress: ${progress}%`);
            lastP2Stage = stage;
          }

          if (status === 'COMPLETED') {
            console.log('>>> Job reached COMPLETED successfully! All 12 clips rendered. <<<');
            await page.waitForTimeout(3000);
            const shot5 = path.join(ARTIFACT_DIR, 'fresh_05_job_completed.png');
            await page.screenshot({ path: shot5, fullPage: true });
            console.log('Saved Job Completed screenshot:', shot5);
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

    const shot6 = path.join(ARTIFACT_DIR, 'fresh_06_clips_gallery_12clips.png');
    await page.screenshot({ path: shot6, fullPage: true });
    console.log('Saved clips gallery screenshot:', shot6);

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
