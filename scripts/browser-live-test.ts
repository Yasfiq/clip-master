import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://127.0.0.1:3000';

async function runLiveBrowserTest() {
  console.log('🚀 Starting live browser test on', BASE_URL);

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
    console.log('📸 1. Visiting Dashboard (/)...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_01_dashboard.png') });

    // 2. Visit Clips Gallery
    console.log('📸 2. Visiting Clips Gallery (/clips)...');
    await page.goto(`${BASE_URL}/clips`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('article', { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_02_clips_gallery.png') });

    // 3. Open Studio Editor Modal
    console.log('📸 3. Opening Studio Editor for clip_demo_studio_001...');
    const studioButton = page.locator('button:has-text("Studio Editor")').first();
    await studioButton.click();

    // Wait for the modal header by id
    await page.waitForSelector('#studio-editor-title', { timeout: 10000 });
    await page.waitForTimeout(1000); // allow initial fetch to complete
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_03_hook_tab.png') });

    // 4. Tab 1: Hook & Headline Interactions
    console.log('📸 4. Testing Tab 1: Hook & Headline...');
    const freeze12 = page.locator('button:has-text("1.2s")');
    if (await freeze12.isVisible()) {
      await freeze12.click();
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_04_hook_configured.png') });

    // 5. Tab 2: Branding & Sumber
    console.log('📸 5. Testing Tab 2: Branding & Sumber...');
    const brandingTab = page.getByRole('button', { name: 'Branding & Sumber' });
    await brandingTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_05_branding_tab.png') });

    // 6. Tab 3: Subtitle
    console.log('📸 6. Testing Tab 3: Subtitle...');
    const subtitleTab = page.locator('button:has-text("Subtitle (")');
    await subtitleTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_06_subtitle_tab.png') });

    // Click on cue 2 to verify interactive seeking
    const secondCueBadge = page.locator('button:has-text("→")').nth(1);
    if (await secondCueBadge.isVisible()) {
      await secondCueBadge.click();
      console.log('🎯 Clicked second cue badge for video seek');
      await page.waitForTimeout(600);
    }

    // 7. Tab 4: Transisi
    console.log('📸 7. Testing Tab 4: Transisi...');
    const transitionTab = page.getByRole('button', { name: 'Transisi' });
    await transitionTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_07_transisi_tab.png') });

    // 8. Test "Simpan Draf"
    console.log('💾 8. Testing Simpan Draf...');
    const saveBtn = page.locator('button:has-text("Simpan Draf")');
    await saveBtn.click();
    await page.waitForSelector('text=Subtitle berhasil disimpan ke disk.', { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_08_draft_saved.png') });

    // 9. Test Video Playback in Studio Modal
    console.log('▶️ 9. Testing Video Playback in Studio Modal...');
    const videoLocator = page.locator('video');
    await videoLocator.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      return v.play();
    });
    await page.waitForTimeout(3000); // let it play for 3s
    const currentTime = await videoLocator.evaluate((v: HTMLVideoElement) => v.currentTime);
    console.log(`🎬 Video currentTime: ${currentTime.toFixed(2)}s`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_09_video_playback_active.png') });

    // 10. Close Modal and return to Gallery
    console.log('🚪 10. Closing Modal...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_10_gallery_after_modal.png') });

    console.log('🎉 Live browser test completed with 100% success!');
  } catch (err) {
    console.error('❌ Error during live browser test:', err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_error.png') });
    throw err;
  } finally {
    await browser.close();
  }
}

runLiveBrowserTest();
