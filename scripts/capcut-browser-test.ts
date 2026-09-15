import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://127.0.0.1:3000';

async function runCapcutBrowserTest() {
  console.log('🚀 Testing new CapCut Workspace at', BASE_URL);

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
    // 1. Visit Clips Gallery
    console.log('📸 1. Visiting Clips Gallery (/clips)...');
    await page.goto(`${BASE_URL}/clips`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('article', { timeout: 10000 });

    // 2. Open CapCut Studio Editor
    console.log('📸 2. Opening CapCut Studio Workspace...');
    const studioButton = page.locator('button:has-text("Studio Editor")').first();
    await studioButton.click();

    // Wait for the workspace header
    await page.waitForSelector('#studio-editor-title', { timeout: 10000 });
    await page.waitForTimeout(1200); // allow data to load

    // Screenshot 1: Full-Screen CapCut Workspace Overview
    console.log('📸 3. Capturing Full-Screen CapCut Workspace Overview...');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_01_workspace_overview.png') });

    // 3. Switch to Hook Tool Drawer
    console.log('📸 4. Switching to Hook Tool Drawer...');
    const hookToolBtn = page.locator('button[title="Hook & Headline"]');
    await hookToolBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_02_hook_tool_drawer.png') });

    // 4. Switch to Branding Tool Drawer
    console.log('📸 5. Switching to Branding Tool Drawer...');
    const brandToolBtn = page.locator('button[title="Branding & Sumber"]');
    await brandToolBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_03_branding_drawer.png') });

    // 5. Test Timeline Playback
    console.log('▶️ 6. Testing Multi-Track Timeline Playback...');
    // Click play
    const videoLocator = page.locator('video');
    await videoLocator.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      return v.play();
    });
    await page.waitForTimeout(3500); // let it play for 3.5s
    const currentTime = await videoLocator.evaluate((v: HTMLVideoElement) => v.currentTime);
    console.log(`🎬 Video currentTime: ${currentTime.toFixed(2)}s`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_04_timeline_playback.png') });

    // 6. Test "Simpan Draf"
    console.log('💾 7. Testing Simpan Draf...');
    const saveBtn = page.locator('button:has-text("Simpan Draf")');
    await saveBtn.click();
    await page.waitForSelector('text=Subtitle berhasil disimpan ke disk.', { timeout: 10000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_05_draft_saved.png') });

    console.log('🎉 CapCut Video Editor Workspace test completed with 100% success!');
  } catch (err) {
    console.error('❌ Error during CapCut test:', err);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'capcut_error.png') });
    throw err;
  } finally {
    await browser.close();
  }
}

runCapcutBrowserTest();
