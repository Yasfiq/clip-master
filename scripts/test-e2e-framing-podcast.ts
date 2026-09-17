import { chromium } from 'playwright';
import path from 'path';

async function main() {
  console.log(
    '🚀 Starting E2E Browser Test for Smart Face Tracking & Split-Screen Podcast Layout...',
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

    // Verify 4 framing modes exist
    await page.locator('[data-testid="framing-mode-auto-face"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="framing-mode-split-podcast"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="framing-mode-center"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="framing-mode-blur-fill"]').waitFor({ state: 'visible' });
    console.log('✅ All 4 framing modes (Smart Face, Split Podcast, Center, Blur Fill) visible');

    // Screenshot 1: Smart Face Tracking default view
    const faceScreenshotPath = path.join(artifactDir, 'framing_tab_auto_face.png');
    await page.screenshot({ path: faceScreenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved: ${faceScreenshotPath}`);

    // Click Podcast Split-Screen
    const splitBtn = page.locator('[data-testid="framing-mode-split-podcast"]');
    await splitBtn.click();
    await page.waitForTimeout(500);
    console.log('✅ Switched to Podcast Split-Screen mode');

    // Verify split-screen controls
    await page.locator('[data-testid="host-x-slider"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="guest-x-slider"]').waitFor({ state: 'visible' });
    console.log('✅ Dual-speaker Host & Guest sliders visible');

    // Select Cyan divider color
    const cyanBtn = page.locator('[data-testid="divider-color-cyan"]');
    await cyanBtn.click();
    console.log('✅ Selected Cyan divider line');

    // Select Center-Divider subtitle placement
    const centerSubBtn = page.locator('[data-testid="sub-placement-center-divider"]');
    await centerSubBtn.click();
    console.log('✅ Selected Center-Divider subtitle placement');

    await page.waitForTimeout(600);

    // Screenshot 2: Podcast Split-Screen customized view with visual divider
    const splitScreenshotPath = path.join(artifactDir, 'framing_tab_split_podcast.png');
    await page.screenshot({ path: splitScreenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved: ${splitScreenshotPath}`);

    console.log(
      '🎉 E2E Test for Smart Face Tracking & Split-Screen Podcast Layout passed with 100% success!',
    );
  } catch (err) {
    console.error('❌ E2E Browser Test Failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
