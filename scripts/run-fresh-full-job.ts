import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser, Page } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://localhost:3000';
const VIDEO_PATH = '/home/mohammad-yasfiq/Videos/Bisnis Orang Ini Banyak Banget!.mp4';

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
  console.log('=== Starting Fresh Full E2E Video Processing Trial (12 Clips) ===');
  console.log('Target Video:', VIDEO_PATH);

  let serverProcess: ChildProcess | null = null;
  let isServerRunning = await waitForServer(2000);

  if (!isServerRunning) {
    try {
      const { execSync } = await import('child_process');
      execSync('fuser -k 3000/tcp 2>/dev/null || true');
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
    console.log('Starting Next.js dev server on port 3000...');
    serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: '3000' },
    });

    const ready = await waitForServer(30000);
    if (!ready) {
      if (serverProcess) serverProcess.kill();
      throw new Error('Next.js dev server failed to start within 30s');
    }
  }

  console.log('Server is responsive at', BASE_URL);

  const browser: Browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('[BROWSER ERROR]', msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.error('[BROWSER UNCAUGHT ERROR]', err.message);
  });

  try {
    console.log('Navigating to dashboard...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const shot1 = path.join(ARTIFACT_DIR, 'fresh_01_dashboard.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log('Saved initial dashboard screenshot:', shot1);

    // 1. Select Local File tab
    console.log('Selecting "Local File" tab in QuickCreate form...');
    const localTabBtn = page.getByRole('button', { name: /Local File/i });
    await localTabBtn.click();
    await page.waitForTimeout(500);

    // 2. Input video path
    console.log('Filling video path...');
    const pathInput = page.locator('input#local-path');
    await pathInput.fill(VIDEO_PATH);
    await page.waitForTimeout(500);

    const shot2 = path.join(ARTIFACT_DIR, 'fresh_02_form_filled.png');
    await page.screenshot({ path: shot2, fullPage: true });
    console.log('Saved form filled screenshot:', shot2);

    // 3. Click Start Processing
    console.log('Clicking "Start Processing" button...');
    const submitBtn = page.getByRole('button', { name: /Start Processing/i });
    await submitBtn.click();
    await page.waitForTimeout(3000);

    const shot3 = path.join(ARTIFACT_DIR, 'fresh_03_job_submitted.png');
    await page.screenshot({ path: shot3, fullPage: true });
    console.log('Saved job submission screenshot:', shot3);

    // Find the latest job ID from API
    const jobsRes = await fetch(`${BASE_URL}/api/jobs?limit=5`);
    const jobsData = await jobsRes.json();
    const newJob =
      (jobsData.data?.jobs || []).find(
        (j: any) => j.sourceFilename?.includes('Bisnis Orang Ini') && j.status !== 'COMPLETED',
      ) || (jobsData.data?.jobs || [])[0];

    if (!newJob) throw new Error('Could not find created job in DB');
    const jobId = newJob.id;
    console.log(`>>> Active Job ID: ${jobId} (Status: ${newJob.status}) <<<`);

    // Ensure we are in JobDetail view for this job
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const jobRow = page
      .locator('tr')
      .filter({ hasText: new RegExp(jobId, 'i') })
      .first();
    if (await jobRow.isVisible()) {
      await jobRow.click();
      await page.waitForTimeout(2000);
    }

    // 4. Monitor Phase 1 until PHASE1_DONE
    console.log('--- Monitoring Phase 1 Execution ---');
    let lastStage = '';
    const startTime = Date.now();
    const maxPhase1Ms = 60 * 60 * 1000; // 60 minutes max for Phase 1

    while (Date.now() - startTime < maxPhase1Ms) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`);
        if (res.ok) {
          const payload = await res.json();
          const job = payload.data;
          const status = job.status;
          const stage = job.currentStage || 'PROGRESSING';
          const progress = Math.round((job.progress || 0) * 100);

          if (stage !== lastStage) {
            console.log(
              `[PHASE 1 UPDATE] Status: ${status} | Stage: ${stage} | Progress: ${progress}%`,
            );
            lastStage = stage;
            const stageShot = path.join(ARTIFACT_DIR, `fresh_stage_${stage.toLowerCase()}.png`);
            await page.screenshot({ path: stageShot, fullPage: true });
          }

          if (status === 'PHASE1_DONE') {
            console.log(
              `>>> Phase 1 Complete! Generated ${job.clips?.length || 0} candidate clips. <<<`,
            );
            await page.waitForTimeout(2000);
            const shot4 = path.join(ARTIFACT_DIR, 'fresh_04_phase1_done_12clips.png');
            await page.screenshot({ path: shot4, fullPage: true });
            console.log('Saved Phase 1 completed screenshot:', shot4);
            break;
          }

          if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED_AD') {
            throw new Error(`Job ended prematurely with status ${status}: ${job.errorMessage}`);
          }
        }
      } catch (err: any) {
        console.warn('Phase 1 poll warning:', err.message);
      }

      await page.waitForTimeout(15000);
    }

    // 5. Trigger Phase 2 via Browser Button
    console.log('--- Triggering Phase 2 via Browser UI ---');
    const phase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    await phase2Btn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Clicking "Run Phase 2 →" button on UI...');
    await phase2Btn.click();
    await page.waitForTimeout(3000);

    const shot5 = path.join(ARTIFACT_DIR, 'fresh_05_phase2_started.png');
    await page.screenshot({ path: shot5, fullPage: true });
    console.log('Saved Phase 2 started screenshot:', shot5);

    // 6. Monitor Phase 2 until COMPLETED
    console.log('--- Monitoring Phase 2 Execution (Face Clustering & 3-Word Subtitles) ---');
    let lastP2Stage = '';
    const p2StartTime = Date.now();
    const maxPhase2Ms = 60 * 60 * 1000; // 60 minutes max for Phase 2

    while (Date.now() - p2StartTime < maxPhase2Ms) {
      try {
        const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`);
        if (res.ok) {
          const payload = await res.json();
          const job = payload.data;
          const status = job.status;
          const stage = job.currentStage || 'PROGRESSING';
          const progress = Math.round((job.progress || 0) * 100);

          if (stage !== lastP2Stage) {
            console.log(
              `[PHASE 2 UPDATE] Status: ${status} | Stage: ${stage} | Progress: ${progress}%`,
            );
            lastP2Stage = stage;
            const stageShot = path.join(ARTIFACT_DIR, `fresh_stage_${stage.toLowerCase()}.png`);
            await page.screenshot({ path: stageShot, fullPage: true });
          }

          if (status === 'COMPLETED') {
            console.log('>>> Job reached COMPLETED successfully! All clips rendered. <<<');
            await page.waitForTimeout(3000);
            const shot6 = path.join(ARTIFACT_DIR, 'fresh_06_job_completed.png');
            await page.screenshot({ path: shot6, fullPage: true });
            console.log('Saved Job Completed screenshot:', shot6);
            break;
          }

          if (status === 'FAILED' || status === 'CANCELLED') {
            throw new Error(`Job ended in ${status}: ${job.errorMessage}`);
          }
        }
      } catch (err: any) {
        console.warn('Phase 2 poll warning:', err.message);
      }

      await page.waitForTimeout(15000);
    }

    // 7. View Clips Gallery
    console.log('Navigating to /clips to inspect generated shorts...');
    const viewClipsBtn = page.getByRole('link', { name: /View Clips/i });
    if (await viewClipsBtn.isVisible()) {
      await viewClipsBtn.click();
    } else {
      await page.goto(`${BASE_URL}/clips?job=${jobId}`);
    }

    await page.waitForTimeout(4000);
    const shot7 = path.join(ARTIFACT_DIR, 'fresh_07_clips_gallery_12clips.png');
    await page.screenshot({ path: shot7, fullPage: true });
    console.log('Saved clips gallery screenshot:', shot7);

    console.log('=== Fresh Full Video Processing Trial Completed Successfully! ===');
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
