import { chromium } from 'playwright';
import path from 'path';

async function main() {
  console.log(
    '🚀 Starting E2E Browser Test for 9:16 Framing Layouts (Smart Face Tracking, Center, Blur-Fill)...',
  );

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
    console.log('Navigating to http://127.0.0.1:3000/clips...');
    await page.goto('http://127.0.0.1:3000/clips', { waitUntil: 'networkidle' });

    // Open first clip's Studio Editor
    const studioBtn = page.locator('button:has-text("Studio")').first();
    await studioBtn.waitFor({ state: 'visible', timeout: 10000 });
    await studioBtn.click();
    console.log('✅ Clicked Studio Editor button on clip card');

    // Wait for Studio Modal to open
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Clip Studio Modal opened');

    // Click Framing Tab
    const framingTab = page.locator('[data-testid="studio-tab-framing"]');
    await framingTab.waitFor({ state: 'visible', timeout: 8000 });
    await framingTab.click();
    console.log('✅ Clicked Framing & Layout Tab');

    // Verify 3 framing modes exist and split-podcast is GONE
    await page.locator('[data-testid="framing-mode-auto-face"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="framing-mode-center"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="framing-mode-blur-fill"]').waitFor({ state: 'visible' });

    const splitBtnCount = await page.locator('[data-testid="framing-mode-split-podcast"]').count();
    if (splitBtnCount > 0) {
      throw new Error('Split-podcast option is still present in the UI!');
    }
    console.log('✅ Confirmed: split-podcast option is cleanly removed');

    // Screenshot: Clean Framing Layout tab
    const faceScreenshotPath = path.join(artifactDir, 'framing_tab_clean.png');
    await page.screenshot({ path: faceScreenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved: ${faceScreenshotPath}`);

    // Click Blur-Fill
    const blurFillBtn = page.locator('[data-testid="framing-mode-blur-fill"]');
    await blurFillBtn.click();
    await page.waitForTimeout(400);
    console.log('✅ Switched to Blur-Fill framing mode');

    // Click Center Crop
    const centerBtn = page.locator('[data-testid="framing-mode-center"]');
    await centerBtn.click();
    await page.waitForTimeout(400);
    console.log('✅ Switched to Center Crop framing mode');

    // Switch back to Smart Face Tracking
    const autoFaceBtn = page.locator('[data-testid="framing-mode-auto-face"]');
    await autoFaceBtn.click();
    await page.waitForTimeout(400);
    console.log('✅ Switched back to Smart Face Tracking framing mode');

    console.log('🎉 E2E Test for Clean 9:16 Framing Layouts passed with 100% success!');
  } catch (err) {
    console.error('❌ E2E Browser Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
