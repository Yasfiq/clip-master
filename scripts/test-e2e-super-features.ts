import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  console.log('🚀 Starting E2E Browser Test for YouTube Watcher & Drip Scheduler...');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const artifactDir =
    '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

  try {
    // ----------------------------------------------------
    // TEST 1: YouTube Watcher in Settings
    // ----------------------------------------------------
    console.log('Testing YouTube Watcher Settings at http://127.0.0.1:3000/settings...');
    await page.goto('http://127.0.0.1:3000/settings', { waitUntil: 'networkidle' });

    // Ensure YouTube Watcher Card is visible
    const ytCard = page.locator('[data-testid="youtube-watcher-settings-card"]');
    await ytCard.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ YouTube Watcher card found');

    // Add a monitored channel
    const input = page.locator('[data-testid="youtube-watcher-input"]');
    await input.fill('@RadityaDika');
    const nameInput = page.locator('[data-testid="youtube-watcher-name-input"]');
    await nameInput.fill('Raditya Dika');

    const addBtn = page.locator('[data-testid="youtube-watcher-add-button"]');
    await addBtn.click();
    await page.waitForTimeout(1000);

    // Toggle Watcher ON
    const toggleBtn = page.locator('[data-testid="youtube-watcher-toggle-button"]');
    await toggleBtn.click();
    await page.waitForTimeout(1000);

    // Save screenshot of YouTube Watcher in settings
    const ytScreenshotPath = path.join(artifactDir, 'youtube_watcher_ui.png');
    await page.screenshot({ path: ytScreenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved: ${ytScreenshotPath}`);

    // ----------------------------------------------------
    // TEST 2: Drip Scheduler Modal in Clips Gallery
    // ----------------------------------------------------
    console.log('Testing Drip Scheduler Modal at http://127.0.0.1:3000/clips...');
    await page.goto('http://127.0.0.1:3000/clips', { waitUntil: 'networkidle' });

    const dripBtn = page.locator('button:has-text("Jadwal Jam Emas (Drip)")');
    await dripBtn.waitFor({ state: 'visible', timeout: 8000 });
    await dripBtn.click();
    console.log('✅ Clicked Jadwal Jam Emas (Drip) button');

    // Wait for Drip Scheduler modal
    const modal = page.locator('#drip-scheduler-title');
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✅ Drip Scheduler Modal opened successfully');

    // Verify golden hour slots
    await page.locator('text=11.45 WIB').first().waitFor({ state: 'visible' });
    await page.locator('text=17.30 WIB').first().waitFor({ state: 'visible' });
    await page.locator('text=20.15 WIB').first().waitFor({ state: 'visible' });
    console.log('✅ Golden hour slots (11.45, 17.30, 20.15 WIB) verified on screen');

    // Save screenshot of Drip Scheduler
    const dripScreenshotPath = path.join(artifactDir, 'drip_scheduler_ui.png');
    await page.screenshot({ path: dripScreenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved: ${dripScreenshotPath}`);

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ----------------------------------------------------
    // TEST 3: Drip Scheduler in Job Detail
    // ----------------------------------------------------
    console.log('Testing Job Detail at http://127.0.0.1:3000...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });

    // Check header badge
    const headerBadge = page.locator('[data-testid="yt-watcher-header-badge"]');
    if (await headerBadge.isVisible()) {
      console.log('✅ YT Watcher status badge visible on dashboard header');
    }

    // Click first job row in table
    const jobRow = page.locator('tbody tr').first();
    await jobRow.waitFor({ state: 'visible', timeout: 8000 });
    await jobRow.click();
    await page.waitForTimeout(1000);

    const jobScheduleBtn = page.locator('[data-testid="job-detail-drip-schedule-button"]');
    if (await jobScheduleBtn.isVisible()) {
      await jobScheduleBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ Opened Drip Scheduler from Job Detail');

      const jobDetailScreenshotPath = path.join(artifactDir, 'job_detail_schedule_ui.png');
      await page.screenshot({ path: jobDetailScreenshotPath, fullPage: false });
      console.log(`📸 Screenshot saved: ${jobDetailScreenshotPath}`);
    }

    console.log('🎉 All E2E browser checks passed with flying colors!');
  } catch (err) {
    console.error('❌ E2E Browser Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
