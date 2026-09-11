import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, Page } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://localhost:3000';

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
  console.log('=== Starting Phase 2 via Browser Automation ===');

  let serverProcess: ChildProcess | null = null;
  let isServerRunning = await waitForServer(2000);

  if (!isServerRunning) {
    console.log('Spawning Next.js server on port 3000...');
    serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: '3000' },
    });

    const ready = await waitForServer(30000);
    if (!ready) {
      if (serverProcess) serverProcess.kill();
      throw new Error('Next.js server failed to start within 30s');
    }
  }

  console.log('Next.js server is responsive at', BASE_URL);

  const browser: Browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.error('[BROWSER UNCAUGHT ERROR]', err.message);
  });

  try {
    console.log('Navigating to dashboard...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const initialShot = path.join(ARTIFACT_DIR, 'live_03_dashboard_phase1_ready.png');
    await page.screenshot({ path: initialShot, fullPage: true });
    console.log('Saved dashboard screenshot:', initialShot);

    // Find the row for PHASE 1 DONE
    const jobRow = page
      .locator('tr')
      .filter({ hasText: /PHASE 1 DONE|cmtscxdc/i })
      .first();
    await jobRow.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Found job in PHASE 1 DONE state. Clicking row to view detail...');
    await jobRow.click();
    await page.waitForTimeout(2000);

    const detailShot = path.join(ARTIFACT_DIR, 'live_03_phase1_detail.png');
    await page.screenshot({ path: detailShot, fullPage: true });
    console.log('Saved job detail screenshot:', detailShot);

    // Locate the "Run Phase 2 →" button
    const phase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    await phase2Btn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Clicking "Run Phase 2 →" button...');
    await phase2Btn.click();
    await page.waitForTimeout(3000);

    const p2StartedShot = path.join(ARTIFACT_DIR, 'live_04_phase2_started.png');
    await page.screenshot({ path: p2StartedShot, fullPage: true });
    console.log('Saved Phase 2 started screenshot:', p2StartedShot);

    // Monitor execution loop until COMPLETED or FAILED
    console.log('Monitoring Phase 2 execution...');
    let lastStage = '';
    const startTime = Date.now();
    const maxExecutionMs = 45 * 60 * 1000; // 45 minutes max

    while (Date.now() - startTime < maxExecutionMs) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/cmtscxdc30000bs81hp8km0u6`);
        if (res.ok) {
          const data = await res.json();
          const job = data.data;
          const currentStage = job.currentStage || 'UNKNOWN';
          const status = job.status;
          const progress = Math.round(job.progress);

          if (currentStage !== lastStage) {
            console.log(
              `[STAGE UPDATE] Status: ${status} | Stage: ${currentStage} | Progress: ${progress}%`,
            );
            lastStage = currentStage;
            const stageShot = path.join(
              ARTIFACT_DIR,
              `live_stage_${currentStage.toLowerCase()}.png`,
            );
            await page.screenshot({ path: stageShot, fullPage: true });
          }

          if (status === 'COMPLETED') {
            console.log('>>> Job reached COMPLETED successfully! <<<');
            await page.waitForTimeout(3000);
            const completedShot = path.join(ARTIFACT_DIR, 'live_05_job_completed.png');
            await page.screenshot({ path: completedShot, fullPage: true });
            console.log('Saved completed screenshot:', completedShot);
            break;
          }

          if (status === 'FAILED' || status === 'CANCELLED') {
            console.error(`Job terminated with status ${status}: ${job.errorMessage}`);
            const failedShot = path.join(ARTIFACT_DIR, 'live_job_failed.png');
            await page.screenshot({ path: failedShot, fullPage: true });
            throw new Error(`Job ended in ${status}: ${job.errorMessage}`);
          }
        }
      } catch (err: any) {
        console.warn('Status poll warning:', err.message);
      }

      await page.waitForTimeout(8000);
    }

    // Navigate to Clips page to verify output
    console.log('Navigating to /clips to verify generated vertical shorts...');
    const viewClipsBtn = page.getByRole('link', { name: /View Clips/i });
    if (await viewClipsBtn.isVisible()) {
      await viewClipsBtn.click();
    } else {
      await page.goto(`${BASE_URL}/clips?job=cmtscxdc30000bs81hp8km0u6`);
    }

    await page.waitForTimeout(4000);
    const clipsGalleryShot = path.join(ARTIFACT_DIR, 'live_06_clips_gallery.png');
    await page.screenshot({ path: clipsGalleryShot, fullPage: true });
    console.log('Saved clips gallery screenshot:', clipsGalleryShot);

    console.log('=== Phase 2 Browser Automation Completed Successfully! ===');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
