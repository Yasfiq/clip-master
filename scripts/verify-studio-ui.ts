import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
  console.log('Launching Chrome for Studio Workspace UI verification...');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  console.log('Navigating to http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });

  // Find job row
  const jobRow = page.locator('text=COMPLETED').first();
  await jobRow.waitFor({ timeout: 10000 });
  await jobRow.click();
  await page.waitForTimeout(2000);

  // Click Studio Editor
  const studioBtn = page.locator('button:has-text("Studio Editor")').first();
  await studioBtn.waitFor({ timeout: 10000 });
  await studioBtn.click();
  await page.waitForTimeout(2000);

  // Capture Studio Modal with Tab 1 (Hook)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'studio_verified_01_hook.png') });
  console.log('Captured studio_verified_01_hook.png');

  // Switch to Tab 2 (Branding & Sumber)
  const brandingBtn = page.locator('button[title="Branding & Sumber"]').first();
  if (await brandingBtn.isVisible()) {
    await brandingBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'studio_verified_02_branding.png') });
    console.log('Captured studio_verified_02_branding.png');
  }

  // Switch to Tab 3 (Subtitle)
  const subBtn = page.locator('button[title="Subtitle & Auto Captions"]').first();
  if (await subBtn.isVisible()) {
    await subBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'studio_verified_03_subtitles.png') });
    console.log('Captured studio_verified_03_subtitles.png');
  }

  await browser.close();
  console.log('Studio UI Verification Script Completed Successfully!');
}

main().catch((err) => {
  console.error('Studio UI Verification Failed:', err);
  process.exit(1);
});
