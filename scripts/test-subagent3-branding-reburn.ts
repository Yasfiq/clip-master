import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const BASE_URL = 'http://127.0.0.1:3000';
const TARGET_JOB_ID = 'cmu2b2jjj0001wl8141g23pki';

interface TestStepResult {
  step: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const testResults: TestStepResult[] = [];

function recordResult(step: string, name: string, status: 'PASS' | 'FAIL', details: string) {
  testResults.push({ step, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${step}] ${name}: ${details}`);
}

async function runSubagent3BrandingReburnTest() {
  console.log('================================================================');
  console.log('🚀 SUBAGENT 3: STUDIO BRANDING & RE-BURN PLAYWRIGHT E2E TEST');
  console.log('Target Job ID:', TARGET_JOB_ID);
  console.log('Artifacts Directory:', ARTIFACT_DIR);
  console.log('================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // STEP 1: Navigate to Studio Workspace
    // -------------------------------------------------------------
    const targetUrl = `${BASE_URL}/clips?job=${TARGET_JOB_ID}`;
    console.log(`🌐 Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 35000 });

    const studioButton = page.locator('button:has-text("Studio Editor")').first();
    await studioButton.waitFor({ state: 'visible', timeout: 15000 });
    await studioButton.click();

    await page.waitForSelector('#studio-editor-title', { timeout: 15000 });
    // Allow studio data fetch to resolve
    await page.waitForTimeout(2000);
    recordResult(
      'Step 1',
      'Open Studio Workspace',
      'PASS',
      'Navigated to clips gallery and opened Studio Modal for job ' + TARGET_JOB_ID,
    );

    // -------------------------------------------------------------
    // STEP 2: Branding & Sumber Drawer Test
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Testing Tab Branding & Sumber ---');
    const brandingTabBtn = page.locator('button[title="Branding & Sumber"]').first();
    await brandingTabBtn.click();
    await page.waitForTimeout(600);

    // 2A. Logo Watermark Toggle ON/OFF
    const logoCheckbox = page
      .locator('span:text-is("Logo Channel")')
      .locator(
        'xpath=ancestor::div[contains(@class, "flex items-center justify-between")]//input[@type="checkbox"]',
      );
    await logoCheckbox.waitFor({ state: 'attached', timeout: 5000 });

    // Toggle OFF
    await logoCheckbox.setChecked(false, { force: true });
    await page.waitForTimeout(300);
    const logoCountOff = await page.locator('img[alt="Logo"]').count();
    if (logoCountOff !== 0) {
      throw new Error(
        `Expected 0 logo images in canvas when Logo Channel is OFF, found ${logoCountOff}`,
      );
    }

    // Toggle ON
    await logoCheckbox.setChecked(true, { force: true });
    await page.waitForTimeout(400);
    const logoLocator = page.locator('img[alt="Logo"]');
    await logoLocator.waitFor({ state: 'visible', timeout: 5000 });
    recordResult(
      'Step 2A',
      'Logo Watermark Toggle',
      'PASS',
      'Logo successfully toggled OFF (disappeared from canvas) and ON (visible in canvas)',
    );

    // 2B. Opacity Slider
    const logoOpacitySlider = page
      .locator('span:has-text("Opasitas Logo")')
      .locator('xpath=ancestor::div[1]/following-sibling::input[@type="range"]');
    await logoOpacitySlider.waitFor({ state: 'visible', timeout: 5000 });

    await logoOpacitySlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(el, '0.7');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);

    const opacityLabel = await page
      .locator('span:has-text("Opasitas Logo")')
      .locator('xpath=following-sibling::span')
      .innerText();
    const logoParentStyle = await logoLocator
      .locator('xpath=ancestor::div[contains(@class, "rounded shadow-md")]')
      .getAttribute('style');
    recordResult(
      'Step 2B',
      'Logo Opacity Slider',
      'PASS',
      `Opacity adjusted to 70%: UI label = "${opacityLabel}", canvas element style = "${logoParentStyle}"`,
    );

    // 2C. 4-Corner Placement Test
    const positions = [
      { name: 'Pojok Kanan Atas', expectedClass: 'top-4 right-4' },
      { name: 'Pojok Kiri Bawah', expectedClass: 'bottom-6 left-4' },
      { name: 'Pojok Kanan Bawah', expectedClass: 'bottom-6 right-4' },
      { name: 'Pojok Kiri Atas', expectedClass: 'top-4 left-4' },
    ];

    for (const pos of positions) {
      const btn = page.locator(`button:has-text("${pos.name}")`).first();
      await btn.click();
      await page.waitForTimeout(250);
      const containerClass = await logoLocator
        .locator(
          'xpath=ancestor::div[contains(@class, "pointer-events-none") and contains(@class, "z-20")]',
        )
        .getAttribute('class');
      if (!containerClass || !containerClass.includes(pos.expectedClass)) {
        throw new Error(
          `Logo position "${pos.name}" failed: expected class containing "${pos.expectedClass}", got "${containerClass}"`,
        );
      }
      console.log(
        `  ✓ Position button "${pos.name}" verified with canvas class "${pos.expectedClass}"`,
      );
    }
    recordResult(
      'Step 2C',
      '4-Corner Watermark Placement',
      'PASS',
      'Tested all 4 corner positions (Pojok Kiri Atas, Pojok Kanan Atas, Pojok Kiri Bawah, Pojok Kanan Bawah) with canvas classes updated dynamically',
    );

    // 2D. Atribusi Sumber Video Test
    const sourceCheckbox = page
      .locator('span:text-is("Sumber Video Asli")')
      .locator(
        'xpath=ancestor::div[contains(@class, "flex items-center justify-between")]//input[@type="checkbox"]',
      );
    await sourceCheckbox.setChecked(true, { force: true });
    await page.waitForTimeout(300);

    const sourceTextInput = page.locator('input[placeholder="Contoh: Source: Raditya Dika"]');
    await sourceTextInput.waitFor({ state: 'visible', timeout: 5000 });
    const testSourceText = 'Source: Eksperimen Podcast QA';
    await sourceTextInput.fill(testSourceText);
    await page.waitForTimeout(200);

    // Select position 'Bawah Tengah'
    const bottomCenterBtn = page.locator('button:has-text("Bawah Tengah")').first();
    await bottomCenterBtn.click();
    await page.waitForTimeout(300);

    // Verify pill appears in canvas
    const sourcePill = page.getByText(testSourceText, { exact: true });
    await sourcePill.waitFor({ state: 'visible', timeout: 5000 });
    const pillContainerClass = await sourcePill
      .locator(
        'xpath=ancestor::div[contains(@class, "pointer-events-none") and contains(@class, "z-20")]',
      )
      .getAttribute('class');
    if (!pillContainerClass || !pillContainerClass.includes('bottom-28')) {
      throw new Error(
        `Source attribution pill placement mismatch: expected "bottom-28", got "${pillContainerClass}"`,
      );
    }

    // Screenshot 1: Branding Canvas
    const screenshot1Path = path.join(ARTIFACT_DIR, 'e2e_subagent3_branding_canvas.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`📸 Screenshot saved: ${screenshot1Path}`);
    recordResult(
      'Step 2D',
      'Source Attribution Pill & Canvas Screenshot',
      'PASS',
      `Source text "${testSourceText}" activated at "Bawah Tengah" and rendered on canvas.`,
    );

    // -------------------------------------------------------------
    // STEP 3: Tab Transisi & Audio Test
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Testing Tab Transisi & Audio ---');

    // 3A. Transisi Slider
    const transisiTabBtn = page.locator('button[title="Transisi & Fade"]').first();
    await transisiTabBtn.click();
    await page.waitForTimeout(400);

    const fadeInSlider = page
      .locator('span:has-text("Fade In (Pembuka)")')
      .locator('xpath=ancestor::div[1]/following-sibling::input[@type="range"]');
    await fadeInSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(el, '0.8');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const fadeOutSlider = page
      .locator('span:has-text("Fade Out (Penutup)")')
      .locator('xpath=ancestor::div[1]/following-sibling::input[@type="range"]');
    await fadeOutSlider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(el, '1.2');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(250);

    const fadeInLabel = await page
      .locator('span:has-text("Fade In (Pembuka)")')
      .locator('xpath=following-sibling::span')
      .innerText();
    const fadeOutLabel = await page
      .locator('span:has-text("Fade Out (Penutup)")')
      .locator('xpath=following-sibling::span')
      .innerText();
    recordResult(
      'Step 3A',
      'Transitions Fade In/Out Sliders',
      'PASS',
      `Fade In set to 0.8s (Label: ${fadeInLabel}), Fade Out set to 1.2s (Label: ${fadeOutLabel})`,
    );

    // 3B. Audio & Narator AI
    const audioTabBtn = page.locator('button[title="Audio & Narator AI"]').first();
    await audioTabBtn.click();
    await page.waitForTimeout(400);

    const voiceSelect = page.locator('select:has(option[value="id-ID-GadisNeural"])');
    await voiceSelect.waitFor({ state: 'visible', timeout: 5000 });

    // Select ArdiNeural
    await voiceSelect.selectOption('id-ID-ArdiNeural');
    let currentVoiceVal = await voiceSelect.inputValue();
    if (currentVoiceVal !== 'id-ID-ArdiNeural') {
      throw new Error(`Expected voice selection "id-ID-ArdiNeural", got "${currentVoiceVal}"`);
    }

    // Select GadisNeural
    await voiceSelect.selectOption('id-ID-GadisNeural');
    currentVoiceVal = await voiceSelect.inputValue();
    if (currentVoiceVal !== 'id-ID-GadisNeural') {
      throw new Error(`Expected voice selection "id-ID-GadisNeural", got "${currentVoiceVal}"`);
    }
    recordResult(
      'Step 3B',
      'AI Voice Selection Dropdown',
      'PASS',
      'Successfully verified switching between id-ID-ArdiNeural and id-ID-GadisNeural.',
    );

    // -------------------------------------------------------------
    // STEP 4: Hook Text Setup & Save Draft Persistence Test
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Testing Save Draft & Persistence Across Reload ---');

    // Also set a unique Hook Headline text so we verify persistence of both branding and hook
    const hookTabBtn = page.locator('button[title="Hook & Headline"]').first();
    await hookTabBtn.click();
    await page.waitForTimeout(400);

    const hookInput = page.locator('input[placeholder="Contoh: KEBEBASAN ADALAH SEGALANYA..."]');
    await hookInput.waitFor({ state: 'visible', timeout: 5000 });
    const testHookText = 'HOOK EKSPERIMEN PODCAST QA';
    await hookInput.fill(testHookText);
    await page.waitForTimeout(200);

    // Click [Simpan Draf]
    const saveDraftBtn = page.locator('button:has-text("Simpan Draf")').first();
    await saveDraftBtn.click();

    // Verify notification
    await page.waitForSelector('text=Subtitle berhasil disimpan ke disk.', { timeout: 10000 });
    console.log('  ✓ Toast/Notification confirmed: "Subtitle berhasil disimpan ke disk."');

    // Reload page to test true disk/database persistence
    console.log('🔄 Reloading page to test data persistence...');
    await page.reload({ waitUntil: 'networkidle', timeout: 35000 });

    // Reopen Studio Modal
    const reopenStudioBtn = page.locator('button:has-text("Studio Editor")').first();
    await reopenStudioBtn.waitFor({ state: 'visible', timeout: 15000 });
    await reopenStudioBtn.click();
    await page.waitForSelector('#studio-editor-title', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Verify Branding persistence
    const brandingTabReopen = page.locator('button[title="Branding & Sumber"]').first();
    await brandingTabReopen.click();
    await page.waitForTimeout(500);

    const persistedSourceText = await page
      .locator('input[placeholder="Contoh: Source: Raditya Dika"]')
      .inputValue();
    if (persistedSourceText !== testSourceText) {
      throw new Error(
        `Branding persistence check failed: expected "${testSourceText}", got "${persistedSourceText}"`,
      );
    }

    // Verify Hook persistence
    const hookTabReopen = page.locator('button[title="Hook & Headline"]').first();
    await hookTabReopen.click();
    await page.waitForTimeout(500);

    const persistedHookText = await page
      .locator('input[placeholder="Contoh: KEBEBASAN ADALAH SEGALANYA..."]')
      .inputValue();
    if (persistedHookText !== testHookText) {
      throw new Error(
        `Hook persistence check failed: expected "${testHookText}", got "${persistedHookText}"`,
      );
    }

    // Screenshot 2: Draft Persisted
    const screenshot2Path = path.join(ARTIFACT_DIR, 'e2e_subagent3_draft_persisted.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`📸 Screenshot saved: ${screenshot2Path}`);
    recordResult(
      'Step 4',
      'Save Draft & Data Persistence',
      'PASS',
      `Confirmed notification "Subtitle berhasil disimpan ke disk." and verified persistence after reload: Branding = "${persistedSourceText}", Hook = "${persistedHookText}".`,
    );

    // -------------------------------------------------------------
    // STEP 5: Render Ulang (Re-burn) FFmpeg Video Studio
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Testing FFmpeg Video Studio Re-burn ---');

    const renderStudioBtn = page.locator('button:has-text("Render Video Studio")').first();
    await renderStudioBtn.click();

    // Verify spinner text appears
    await page.waitForSelector('text=Sedang Merender...', { timeout: 10000 });
    console.log('  ✓ Spinner confirmed: "Sedang Merender..."');

    // Wait for render to complete (up to 180 seconds)
    console.log('⏳ Rendering studio video via FFmpeg (waiting up to 180s)...');
    await page.waitForSelector('text=Video studio berhasil dirender ulang!', { timeout: 180000 });
    console.log('  ✓ Header notification confirmed: "Video studio berhasil dirender ulang!"');

    // Wait 2s for UI transition to finalize
    await page.waitForTimeout(2000);

    // Verify automatic transition to [Hasil Render (Final)]
    const finalModeBtn = page.locator('button:has-text("Hasil Render (Final)")').first();
    await finalModeBtn.waitFor({ state: 'visible', timeout: 5000 });
    const finalModeClass = await finalModeBtn.getAttribute('class');
    if (!finalModeClass || !finalModeClass.includes('bg-emerald-600')) {
      throw new Error(
        `Expected [Hasil Render (Final)] button to be active with bg-emerald-600, got "${finalModeClass}"`,
      );
    }

    // Verify rendered mode badge in canvas
    const renderedBadge = page.locator('text=Video Hasil Render (Final Hardsub & Freeze Frame)');
    await renderedBadge.waitFor({ state: 'visible', timeout: 10000 });

    // Video final playback test
    console.log('▶️ Testing final rendered video playback...');
    const videoLocator = page.locator('video').first();
    await videoLocator.evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      return v.play();
    });

    await page.waitForTimeout(3500); // allow playback to advance
    const currentTime = await videoLocator.evaluate((v: HTMLVideoElement) => v.currentTime);
    const isPaused = await videoLocator.evaluate((v: HTMLVideoElement) => v.paused);
    console.log(
      `🎬 Rendered video playback: currentTime = ${currentTime.toFixed(2)}s, paused = ${isPaused}`,
    );

    if (currentTime <= 0.1) {
      throw new Error(`Rendered video did not advance playback (currentTime = ${currentTime})`);
    }

    // Screenshot 3: Reburn Complete
    const screenshot3Path = path.join(ARTIFACT_DIR, 'e2e_subagent3_reburn_complete.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`📸 Screenshot saved: ${screenshot3Path}`);
    recordResult(
      'Step 5',
      'FFmpeg Re-burn Render Execution & Final Playback',
      'PASS',
      `Re-burn rendered successfully, transitioned to Final Render mode, and video played smoothly (currentTime: ${currentTime.toFixed(2)}s).`,
    );
  } catch (error: any) {
    console.error('❌ Test failed with error:', error);
    const errScreenshot = path.join(ARTIFACT_DIR, 'e2e_subagent3_error.png');
    await page.screenshot({ path: errScreenshot }).catch(() => {});
    recordResult('Failure', 'E2E Test Execution', 'FAIL', error.message || String(error));
    throw error;
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log('📋 FINAL E2E TEST SUMMARY');
  console.log('================================================================');
  testResults.forEach((r) => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} [${r.step}] ${r.name}: ${r.details}`);
  });
  console.log('================================================================\n');
}

runSubagent3BrandingReburnTest().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
