import { chromium } from '@playwright/test';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://127.0.0.1:3000';
const YOUTUBE_URL = 'https://youtu.be/sD5TqyFOt0Y?si=g8RIvHbP6oxle8I0';

async function runE2EBrowserTest() {
  console.log('🚀 Starting E2E Live Browser Test at', BASE_URL);

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
    // 1. Visit Settings to set maxClips to 5 for quick thorough verification
    console.log('⚙️ 1. Configuring settings (maxClips=5 for fast verification)...');
    await page.request.post(`${BASE_URL}/api/config`, {
      data: { name: 'default', maxClips: 5, isDefault: true },
    });
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_01_settings.png') });

    // 2. Visit Dashboard
    console.log('🌐 2. Visiting Dashboard to submit YouTube URL...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_02_dashboard_ready.png') });

    // 3. Input YouTube URL and submit job
    console.log(`📥 3. Submitting YouTube link: ${YOUTUBE_URL}...`);
    const urlInput = page.locator('#url-input');
    await urlInput.waitFor({ state: 'visible', timeout: 15000 });
    await urlInput.fill(YOUTUBE_URL);
    await page.waitForTimeout(500);

    // Intercept POST /api/jobs to capture the created job ID
    const jobCreationPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/jobs') &&
        res.request().method() === 'POST' &&
        (res.status() === 200 || res.status() === 201),
    );
    const submitBtn = page
      .locator('button:has-text("Mulai Proses Video"), button[type="submit"]')
      .first();
    await submitBtn.click();
    const jobRes = await jobCreationPromise;
    const jobJson = await jobRes.json();
    const jobId = jobJson.data.id;
    console.log(`📌 Created & Active Job ID: ${jobId}`);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_03_job_started.png') });

    // 5. Monitor stage progress until COMPLETED_PHASE1 or COMPLETED
    console.log('📊 5. Monitoring pipeline stage execution...');
    let isCompleted = false;
    let phase2Triggered = false;
    let attempts = 0;
    const maxAttempts = 240; // 240 * 3s = 12 minutes max

    while (!isCompleted && attempts < maxAttempts) {
      attempts++;
      await page.waitForTimeout(3000);

      // Check job status from page text or API
      const statusRes = await page.request.get(`${BASE_URL}/api/jobs/${jobId}`);
      if (statusRes.ok()) {
        const data = await statusRes.json();
        const job = data.data;
        console.log(
          `   [Attempt ${attempts}] Stage: ${job.currentStage || 'DONE'} | Progress: ${Math.round((job.progress || 0) * 100)}% | Status: ${job.status}`,
        );

        if (job.status === 'PHASE1_DONE' && !phase2Triggered) {
          phase2Triggered = true;
          console.log(
            '🎉 Phase 1 complete! Now triggering Phase 2 (COMPRESS & Formula Standar Baku)...',
          );
          await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_04_phase1_completed.png') });

          const phase2Btn = page.locator('button:has-text("Jalankan Phase 2")');
          if ((await phase2Btn.count()) > 0) {
            await phase2Btn.click();
          } else {
            await page.request.post(`${BASE_URL}/api/jobs/${jobId}/phase2`, { data: {} });
          }
          await page.waitForTimeout(3000);
          continue;
        }

        if (job.status === 'COMPLETED') {
          isCompleted = true;
          break;
        }

        if (job.status === 'FAILED') {
          throw new Error(`Job failed with error: ${job.errorMessage}`);
        }
      }
    }

    if (!isCompleted) {
      throw new Error('Pipeline timed out before reaching completion.');
    }

    console.log('🎉 Job successfully completed full pipeline execution (Phase 1 + Phase 2)!');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_05_job_completed.png') });

    // 6. Inspect Clips Gallery
    console.log('🎬 6. Visiting Clips Gallery (/clips)...');
    await page.goto(`${BASE_URL}/clips`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('article', { timeout: 15000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_05_clips_gallery.png') });

    // 7. Open Studio Editor Modal for the first clip
    console.log('🎨 7. Opening Studio Editor Workspace...');
    const studioBtn = page.locator('button:has-text("Studio Editor")').first();
    await studioBtn.click();
    await page.waitForSelector('#studio-editor-title', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_06_studio_modal.png') });

    // 8. Verify exported clip media files on disk with ffprobe
    console.log('🔍 8. Verifying exported MP4 files on disk with ffprobe...');
    const exportFiles = fs
      .readdirSync('media/exports')
      .filter((f) => f.includes(jobId) && f.endsWith('.mp4'))
      .sort();

    console.log(`Found ${exportFiles.length} exported MP4 files for job ${jobId}`);
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

    console.log('✨ All E2E browser tests passed with 100% success!');
  } catch (err) {
    console.error('❌ E2E Browser Test failed:', err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e2e_error.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runE2EBrowserTest();
