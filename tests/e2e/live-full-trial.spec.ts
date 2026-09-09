import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const VIDEO_PATH = '/home/mohammad-yasfiq/Videos/Bisnis Orang Ini Banyak Banget!.mp4';

test.describe('Live Full Video Processing Trial', () => {
  // Allow up to 60 minutes for processing 55-minute video on CPU
  test.setTimeout(3_600_000);

  test('Full pipeline run on local 55-minute video via Web UI', async ({ page }) => {
    console.log('[E2E Live] 1. Opening Dashboard at http://localhost:3000...');
    await page.goto('/', { timeout: 60_000 });
    await expect(page).toHaveTitle(/Clip Master/i);

    // 2. Select Local File tab and input path
    console.log('[E2E Live] 2. Selecting Local File and typing video path...');
    const localTab = page.getByRole('button', { name: 'Local File' });
    await localTab.click();

    const localInput = page.locator('#local-path');
    await expect(localInput).toBeVisible({ timeout: 5000 });
    await localInput.fill(VIDEO_PATH);

    const shotInput = path.join(ARTIFACT_DIR, 'live_01_submission.png');
    await page.screenshot({ path: shotInput, fullPage: true });
    console.log('[E2E Live] Saved input screenshot:', shotInput);

    // 3. Click Start Processing
    console.log('[E2E Live] 3. Clicking Start Processing button...');
    const submitBtn = page.getByRole('button', { name: /Start Processing/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for JobDetail to render (job selection)
    await page.waitForTimeout(3000);
    const shotStarted = path.join(ARTIFACT_DIR, 'live_02_job_started.png');
    await page.screenshot({ path: shotStarted, fullPage: true });
    console.log('[E2E Live] Saved job started screenshot:', shotStarted);

    // 4. Poll and monitor Phase 1 (DISCOVER -> AD_FILTER -> TRANSCRIBE -> ANALYZE -> CUT)
    console.log('[E2E Live] 4. Monitoring Phase 1 execution...');
    let phase1Done = false;
    let lastLogTime = Date.now();

    while (!phase1Done) {
      await page.waitForTimeout(10_000); // Check every 10 seconds

      // Check if job status reached PHASE1_DONE or FAILED
      const phase1DoneBadge = page.getByText(/PHASE 1 DONE|PHASE1_DONE/i).first();
      const failedBadge = page.getByText(/FAILED|REJECTED_AD/i).first();

      if (await failedBadge.isVisible()) {
        const errorText = await page
          .locator('.text-red-800, .bg-red-50')
          .first()
          .innerText()
          .catch(() => 'Unknown error');
        console.error('[E2E Live] Job encountered failure:', errorText);
        const shotFail = path.join(ARTIFACT_DIR, 'live_failed.png');
        await page.screenshot({ path: shotFail, fullPage: true });
        throw new Error(`Job failed during execution: ${errorText}`);
      }

      if (await phase1DoneBadge.isVisible()) {
        phase1Done = true;
        console.log('[E2E Live] Phase 1 completed successfully! Status is PHASE1_DONE.');
        break;
      }

      // Periodic logging & screenshot every 2 minutes
      if (Date.now() - lastLogTime > 120_000) {
        lastLogTime = Date.now();
        const progressText = await page
          .locator('.font-mono, [class*="progress"]')
          .first()
          .innerText()
          .catch(() => '');
        console.log(`[E2E Live] Still processing Phase 1... (Progress snippet: ${progressText})`);
        const shotPeriodic = path.join(ARTIFACT_DIR, 'live_phase1_progress.png');
        await page.screenshot({ path: shotPeriodic, fullPage: true });
      }
    }

    // Capture Phase 1 complete screenshot
    const shotP1 = path.join(ARTIFACT_DIR, 'live_03_phase1_completed.png');
    await page.screenshot({ path: shotP1, fullPage: true });
    console.log('[E2E Live] Saved Phase 1 complete screenshot:', shotP1);

    // 5. Trigger Phase 2 from UI (Run Phase 2 button)
    console.log('[E2E Live] 5. Clicking Run Phase 2 button on UI...');
    const runPhase2Btn = page.getByRole('button', { name: /Run Phase 2/i });
    await expect(runPhase2Btn).toBeVisible({ timeout: 15_000 });
    await runPhase2Btn.click();

    await page.waitForTimeout(3000);
    const shotP2Started = path.join(ARTIFACT_DIR, 'live_04_phase2_started.png');
    await page.screenshot({ path: shotP2Started, fullPage: true });
    console.log('[E2E Live] Saved Phase 2 started screenshot:', shotP2Started);

    // 6. Monitor Phase 2 until COMPLETED (EDIT -> SUBTITLE -> EXPORT -> COMPRESS)
    console.log('[E2E Live] 6. Monitoring Phase 2 execution...');
    let phase2Done = false;
    lastLogTime = Date.now();

    while (!phase2Done) {
      await page.waitForTimeout(10_000);

      const completedBadge = page.getByText(/COMPLETED/i).first();
      const failedBadge = page.getByText(/FAILED/i).first();

      if (await failedBadge.isVisible()) {
        const errorText = await page
          .locator('.text-red-800, .bg-red-50')
          .first()
          .innerText()
          .catch(() => 'Unknown error');
        console.error('[E2E Live] Job failed during Phase 2:', errorText);
        const shotFail = path.join(ARTIFACT_DIR, 'live_phase2_failed.png');
        await page.screenshot({ path: shotFail, fullPage: true });
        throw new Error(`Job failed in Phase 2: ${errorText}`);
      }

      if (await completedBadge.isVisible()) {
        phase2Done = true;
        console.log('[E2E Live] Phase 2 completed! Job status is COMPLETED.');
        break;
      }

      if (Date.now() - lastLogTime > 60_000) {
        lastLogTime = Date.now();
        console.log('[E2E Live] Still rendering clips in Phase 2...');
        const shotPeriodicP2 = path.join(ARTIFACT_DIR, 'live_phase2_progress.png');
        await page.screenshot({ path: shotPeriodicP2, fullPage: true });
      }
    }

    // Capture COMPLETED screenshot
    const shotCompleted = path.join(ARTIFACT_DIR, 'live_05_job_completed.png');
    await page.screenshot({ path: shotCompleted, fullPage: true });
    console.log('[E2E Live] Saved job completed screenshot:', shotCompleted);

    // 7. Navigate to Clips gallery
    console.log('[E2E Live] 7. Navigating to Clips gallery...');
    const viewClipsLink = page.getByRole('link', { name: /View Clips/i });
    if (await viewClipsLink.isVisible()) {
      await viewClipsLink.click();
    } else {
      await page.goto('/clips');
    }

    await page.waitForTimeout(3000);
    const shotGallery = path.join(ARTIFACT_DIR, 'live_06_clips_gallery.png');
    await page.screenshot({ path: shotGallery, fullPage: true });
    console.log('[E2E Live] Saved clips gallery screenshot:', shotGallery);

    console.log('[E2E Live] End-to-end processing trial completed successfully!');
  });
});
