import { chromium } from '@playwright/test';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://127.0.0.1:3000';
const JOB_ID = 'cmtzq4qfz0003n481rs3igc2f';

async function verifyAndComplete() {
  console.log(`⏳ Monitoring job ${JOB_ID} until completion...`);

  let isCompleted = false;
  let attempts = 0;
  const maxAttempts = 100; // 100 * 5s = ~8 minutes

  while (!isCompleted && attempts < maxAttempts) {
    attempts++;
    const res = await fetch(`${BASE_URL}/api/jobs/${JOB_ID}`);
    if (res.ok) {
      const data = (await res.json()) as any;
      const job = data.data;
      console.log(
        `[Attempt ${attempts}] Status: ${job.status} | Stage: ${job.currentStage} | Progress: ${Math.round((job.progress || 0) * 100)}%`,
      );

      if (job.status === 'COMPLETED') {
        isCompleted = true;
        break;
      }
      if (job.status === 'FAILED') {
        throw new Error(`Job failed: ${job.errorMessage}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!isCompleted) {
    throw new Error('Timed out waiting for job completion');
  }

  console.log(
    '🎉 Job reached COMPLETED successfully! Launching Playwright browser verification...',
  );

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  try {
    // 1. Visit Dashboard
    console.log('📸 1. Capturing Dashboard with completed job...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_05_job_completed.png') });

    // 2. Visit Clips Gallery
    console.log('📸 2. Capturing Clips Gallery (/clips)...');
    await page.goto(`${BASE_URL}/clips`, { waitUntil: 'networkidle' });
    await page.waitForSelector('article', { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_05_clips_gallery.png') });

    // 3. Open Studio Editor Modal
    console.log('📸 3. Opening Studio Editor Workspace Modal...');
    const studioBtn = page.locator('button:has-text("Studio Editor")').first();
    await studioBtn.click();
    await page.waitForSelector('#studio-editor-title', { timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_06_studio_modal.png') });

    // 4. ffprobe verification
    console.log('🔍 4. Probing all exported MP4 files on disk...');
    const exportFiles = fs
      .readdirSync('media/exports')
      .filter((f) => f.includes(JOB_ID) && f.endsWith('.mp4') && !f.endsWith('_final.mp4'))
      .sort();

    console.log(`Found ${exportFiles.length} exported MP4 files:`);
    for (const file of exportFiles) {
      const fullPath = path.join('media/exports', file);
      const probeOutput = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name -show_entries format=duration,size -of json "${fullPath}"`,
        { encoding: 'utf-8' },
      );
      const probe = JSON.parse(probeOutput);
      const v = probe.streams[0];
      const dur = parseFloat(probe.format.duration).toFixed(1);
      const sizeMB = (probe.format.size / 1024 / 1024).toFixed(1);
      console.log(`✅ ${file}: ${v.width}x${v.height} (${v.codec_name}), ${dur}s, ${sizeMB} MB`);
    }

    console.log('🌟 End-to-End browser test completed with 100% success!');
  } finally {
    await browser.close();
  }
}

verifyAndComplete().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
