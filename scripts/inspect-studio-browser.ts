import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
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

  // Screenshot dashboard
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_01_dashboard.png') });
  console.log('Dashboard screenshotted');

  // Find job link or card
  const jobCard = page
    .locator('text=raditya_dika_satu_jam')
    .or(page.locator('text=COMPLETED'))
    .first();
  if (await jobCard.isVisible()) {
    console.log('Clicking job card...');
    await jobCard.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_02_job_detail.png') });
    console.log('Job detail screenshotted');
  }

  // Look for Studio Editor button
  const studioBtn = page
    .locator('button:has-text("Studio Editor")')
    .or(page.locator('button:has-text("Edit Subtitle")'))
    .first();
  if (await studioBtn.isVisible()) {
    console.log('Clicking Studio Editor button...');
    await studioBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_03_studio_modal.png') });
    console.log('Studio modal screenshotted');

    // Tab 1: Hook & Headline
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'browser_04_studio_tab_hook.png') });

    // Tab 2: Branding & Sumber
    const tabBranding = page
      .locator('button:has-text("Branding & Sumber")')
      .or(page.locator('button:has-text("Branding")'))
      .first();
    if (await tabBranding.isVisible()) {
      await tabBranding.click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'browser_05_studio_tab_branding.png'),
      });
    }

    // Tab 3: Subtitle
    const tabSubtitle = page.locator('button:has-text("Subtitle")').first();
    if (await tabSubtitle.isVisible()) {
      await tabSubtitle.click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'browser_06_studio_tab_subtitle.png'),
      });
    }
  } else {
    console.warn('Studio Editor button not found on page!');
  }

  await browser.close();
  console.log('Inspection complete!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
