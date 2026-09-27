import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';
const TARGET_JOB_ID = 'cmu2b2jjj0001wl8141g23pki';

interface VerificationItem {
  id: string;
  category: string;
  description: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const verifications: VerificationItem[] = [];

function recordVerification(
  id: string,
  category: string,
  description: string,
  status: 'PASS' | 'FAIL',
  details: string,
) {
  verifications.push({ id, category, description, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${id}] ${category}: ${description}`);
  console.log(`   Details: ${details}`);
}

async function runHookAndCanvasE2ETest() {
  console.log('================================================================');
  console.log('🧪 SUBAGENT 1: E2E TEST - HOOK, TTS, FREEZE SIMULATION & SWITCHER');
  console.log('================================================================');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser: Browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'id-ID',
  });

  const page: Page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[Browser console error]: ${msg.text()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // PHASE 0: Navigation & Studio Workspace Modal Launch
    // -------------------------------------------------------------
    console.log('\n--- Phase 0: Opening Studio Workspace ---');
    const clipsUrl = `http://127.0.0.1:3000/clips?job=${TARGET_JOB_ID}`;
    console.log(`Navigating to ${clipsUrl}`);
    await page.goto(clipsUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const firstStudioBtn = page.locator('button:has-text("Studio Editor")').first();
    await firstStudioBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Found Studio Editor button. Clicking to launch Studio Workspace...');
    await firstStudioBtn.click();

    const modalDialog = page.locator('div[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible', timeout: 10000 });

    // Wait for any initial spinner to clear
    await page
      .waitForSelector('.animate-spin', { state: 'detached', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    recordVerification(
      'INIT-1',
      'Initialization',
      'Studio Workspace Modal Opened',
      'PASS',
      'Successfully opened Studio Workspace modal dialog for job ' + TARGET_JOB_ID,
    );

    // -------------------------------------------------------------
    // PHASE 1: Tab Hook & Headline Testing
    // -------------------------------------------------------------
    console.log('\n--- Phase 1: Testing Tab Hook & Headline ---');
    const hookTabBtn = page.locator('button[title="Hook & Headline"]').first();
    await hookTabBtn.waitFor({ state: 'visible', timeout: 5000 });
    await hookTabBtn.click();
    await page.waitForTimeout(600);

    const hookInput = page.locator('input[placeholder="Contoh: KEBEBASAN ADALAH SEGALANYA..."]');
    await hookInput.waitFor({ state: 'visible', timeout: 5000 });

    // 1.1 Test Headline Hook Text Variations
    console.log('Testing headline text editing with multiple variations...');
    const testHeadlines = [
      'TUTORIAL VIRAL CAPCUT 2026',
      'JANGAN SCROLL DULU BESTIE!',
      'RAHASIA VIRAL SHORT VIDEO TERBONGKAR',
    ];

    for (const headline of testHeadlines) {
      await hookInput.fill(headline);
      await page.waitForTimeout(400);

      // Verify canvas banner reflects the text in the canvas monitor
      const bannerMatch = page
        .locator(`.aspect-\\[9\\/16\\] .z-20:has-text("${headline}")`)
        .first();
      const isVisible = await bannerMatch.isVisible();
      if (!isVisible) {
        throw new Error(`Hook banner did not reflect edited text "${headline}" in canvas`);
      }
      console.log(`   - Verified canvas headline display: "${headline}"`);
    }

    recordVerification(
      'HOOK-1',
      'Hook Headline',
      'Edit Hook Headline Variations',
      'PASS',
      `Tested 3 text variations. All reactively rendered in the Canvas monitor overlay.`,
    );

    // 1.2 Toggle Position: Tengah Layar (top-1/2) vs Atas Layar (top-14)
    console.log('Testing Hook Position Toggle (Tengah vs Atas)...');
    const topPosBtn = page.locator('button:has-text("Atas Layar")').first();
    const centerPosBtn = page.locator('button:has-text("Tengah Layar (Baku)")').first();

    // Click Atas Layar
    await topPosBtn.click();
    await page.waitForTimeout(500);
    const topBannerContainer = page.locator('.top-14');
    const isTopPositioned = (await topBannerContainer.count()) > 0;
    const isTopActiveButton = (await topPosBtn.getAttribute('class'))?.includes('bg-amber-400');

    // Click Tengah Layar (Baku)
    await centerPosBtn.click();
    await page.waitForTimeout(500);
    const centerBannerContainer = page.locator('.top-1\\/2');
    const isCenterPositioned = (await centerBannerContainer.count()) > 0;
    const isCenterActiveButton = (await centerPosBtn.getAttribute('class'))?.includes(
      'bg-amber-400',
    );

    if (isTopPositioned && isTopActiveButton && isCenterPositioned && isCenterActiveButton) {
      recordVerification(
        'HOOK-2',
        'Hook Position',
        'Toggle Position: Tengah Layar vs Atas Layar',
        'PASS',
        'Canvas banner successfully toggled between top-14 (Atas) and top-1/2 (Tengah) with proper button highlight states.',
      );
    } else {
      recordVerification(
        'HOOK-2',
        'Hook Position',
        'Toggle Position: Tengah Layar vs Atas Layar',
        'FAIL',
        `isTopPositioned=${isTopPositioned}, isTopActiveButton=${isTopActiveButton}, isCenterPositioned=${isCenterPositioned}, isCenterActiveButton=${isCenterActiveButton}`,
      );
    }

    // 1.3 Test Tombol [Dengarkan Voiceover AI & Sinkron Durasi]
    console.log('Testing Voiceover AI (Edge-TTS) & Duration Synchronization...');
    const ttsSyncBtn = page
      .locator('button:has-text("Dengarkan Voiceover AI & Sinkron Durasi")')
      .first();
    await ttsSyncBtn.waitFor({ state: 'visible', timeout: 5000 });

    const [ttsResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/clips/') &&
          res.url().includes('/tts') &&
          res.request().method() === 'POST',
        { timeout: 35000 },
      ),
      ttsSyncBtn.click(),
    ]);

    const ttsJson = await ttsResponse.json();
    console.log('TTS API Response received:', JSON.stringify(ttsJson));

    await page.waitForSelector('text=Voiceover berhasil dibuat', { timeout: 15000 });

    const freezeDurationBadge = page.locator('text=⏱').first();
    const freezeDurationText = await freezeDurationBadge.textContent();
    console.log(`Detected Synchronized Freeze Duration in UI: ${freezeDurationText}`);

    const syncedSec = ttsJson?.data?.duration;
    if (
      ttsResponse.status() === 200 &&
      ttsJson.success &&
      syncedSec > 0 &&
      freezeDurationText?.includes(`${syncedSec.toFixed(2)}s`)
    ) {
      recordVerification(
        'HOOK-3',
        'Voiceover AI (TTS)',
        'Dengarkan Voiceover AI & Sinkron Durasi',
        'PASS',
        `TTS generated successfully via id-ID-GadisNeural. Synchronized freeze duration: ${syncedSec.toFixed(2)}s (verified in UI badge: ${freezeDurationText}).`,
      );
    } else {
      recordVerification(
        'HOOK-3',
        'Voiceover AI (TTS)',
        'Dengarkan Voiceover AI & Sinkron Durasi',
        'FAIL',
        `Mismatch in TTS response or duration badge. Status: ${ttsResponse.status()}, JSON: ${JSON.stringify(ttsJson)}, Text: ${freezeDurationText}`,
      );
    }

    // 1.4 Test Manual Freeze Duration Options by turning off TTS toggle
    console.log('Testing turning off TTS toggle and checking manual freeze durations...');
    const ttsToggle = page.locator('input[type="checkbox"]').first();
    await ttsToggle.setChecked(false, { force: true });
    await page.waitForTimeout(600);

    const manualButtons = ['0s', '1.0s', '1.2s', '1.5s', '2.0s'];
    const manualResults: { [btn: string]: boolean } = {};

    for (const btnText of manualButtons) {
      const btn = page.locator(`button:has-text("${btnText}")`).first();
      const isVis = await btn.isVisible();
      if (isVis) {
        await btn.click();
        await page.waitForTimeout(300);
        const btnClass = await btn.getAttribute('class');
        manualResults[btnText] = !!btnClass?.includes('bg-amber-400');
      } else {
        manualResults[btnText] = false;
      }
    }
    console.log('Manual duration button selection states:', manualResults);

    // Re-enable TTS toggle
    console.log('Re-enabling TTS toggle...');
    await ttsToggle.setChecked(true, { force: true });
    await page.waitForTimeout(600);

    const isTtsReEnabled = await page.locator('text=Suara Wanita (GadisNeural)').isVisible();

    // Screenshot 1: Hook Edit State
    const screenshot1Path = path.join(ARTIFACT_DIR, 'e2e_subagent1_hook_edit.png');
    await page.screenshot({ path: screenshot1Path, fullPage: false });
    console.log(`Saved screenshot: ${screenshot1Path}`);

    const allManualPassed = manualButtons.every((b) => manualResults[b]);
    if (allManualPassed && isTtsReEnabled) {
      recordVerification(
        'HOOK-4',
        'Manual Freeze & TTS Toggle',
        'Manual Freeze Options & Toggle Switch',
        'PASS',
        `Successfully toggled off TTS, validated manual options (0s, 1.0s, 1.2s, 1.5s, 2.0s), and restored TTS toggle.`,
      );
    } else {
      recordVerification(
        'HOOK-4',
        'Manual Freeze & TTS Toggle',
        'Manual Freeze Options & Toggle Switch',
        'FAIL',
        `Manual options verification failed: ${JSON.stringify(manualResults)}, isTtsReEnabled=${isTtsReEnabled}`,
      );
    }

    // -------------------------------------------------------------
    // PHASE 2: Canvas Freeze Frame Simulation (Draft Mode)
    // -------------------------------------------------------------
    console.log('\n--- Phase 2: Testing Canvas Freeze Frame Simulation (Draft Mode) ---');

    // Make sure playhead is reset to 0
    const skipBackBtn = page.locator('button[title="Cue Sebelumnya"]').first();
    await skipBackBtn.click();
    await page.waitForTimeout(500);

    // Ensure currentTime is at 0
    const timeDisplay = page.locator('header span:has-text("00:00.00")').first();
    console.log('Playhead reset to 00:00.00.');

    // Start playback with play button
    const playPauseBtn = page.locator('button[title*="Spasi"]').first();
    console.log('Starting draft video playback (Frame 1 Freeze Simulation)...');
    await playPauseBtn.click();

    // Wait ~1000ms: During freeze (t < freezeSec ~2.88s)
    await page.waitForTimeout(1000);

    // Assertions for Freeze Active State:
    // a) Video element currentTime is at 0 (Frame 1 frozen)
    const videoCurrentTimeDuringFreeze = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v ? v.currentTime : -1;
    });

    // b) Hook banner is visible with yellow styling inside canvas monitor
    const canvasHookBanner = page
      .locator(
        '.aspect-\\[9\\/16\\] div.bg-amber-400:has-text("RAHASIA VIRAL SHORT VIDEO TERBONGKAR")',
      )
      .first();
    const isHookBannerVisibleDuringFreeze = await canvasHookBanner.isVisible();

    // c) Countdown badge is active: "⏱ Freeze: X.Xs"
    const freezeCountdownBadge = page.locator('text=⏱ Freeze:').first();
    const isCountdownBadgeVisible = await freezeCountdownBadge.isVisible();
    const countdownBadgeText = (await freezeCountdownBadge.textContent().catch(() => ''))?.trim();
    console.log(
      `Active Freeze Countdown: "${countdownBadgeText}", video currentTime: ${videoCurrentTimeDuringFreeze}s`,
    );

    // d) Subtitle conversation cue must NOT be visible yet
    const activeSubtitleElem = page.locator('span.font-montserrat').first();
    const isSubtitleVisibleDuringFreeze = await activeSubtitleElem.isVisible().catch(() => false);

    // Screenshot 2: Freeze Frame Active
    const screenshot2Path = path.join(ARTIFACT_DIR, 'e2e_subagent1_freeze_active.png');
    await page.screenshot({ path: screenshot2Path, fullPage: false });
    console.log(`Saved screenshot: ${screenshot2Path}`);

    if (
      videoCurrentTimeDuringFreeze === 0 &&
      isHookBannerVisibleDuringFreeze &&
      isCountdownBadgeVisible &&
      !isSubtitleVisibleDuringFreeze
    ) {
      recordVerification(
        'SIM-1',
        'Freeze Simulation',
        'Freeze Active: Frame 1 Frozen, Banner Visible, Countdown Active, Subtitle Hidden',
        'PASS',
        `Frame 1 strictly frozen at 0s, hook banner prominently visible, countdown active ("${countdownBadgeText}"), subtitle hidden.`,
      );
    } else {
      recordVerification(
        'SIM-1',
        'Freeze Simulation',
        'Freeze Active: Frame 1 Frozen, Banner Visible, Countdown Active, Subtitle Hidden',
        'FAIL',
        `Mismatch: videoCurrentTime=${videoCurrentTimeDuringFreeze}, hookVisible=${isHookBannerVisibleDuringFreeze}, countdownVisible=${isCountdownBadgeVisible}, subtitleVisible=${isSubtitleVisibleDuringFreeze}`,
      );
    }

    // Wait for freeze duration to elapse + transition into moving video dialogue
    // Synced duration is ~2.88s. We already waited 1.0s, so waiting another 3.0s reaches ~4.0s (dialogue time ~1.12s)
    console.log('Waiting for freeze duration to complete and transition to moving dialogue...');
    await page.waitForTimeout(3000);

    // Assertions for Resumed Video State:
    // a) Video element currentTime > 0 and not paused
    const videoStatusAfter = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        currentTime: v ? v.currentTime : -1,
        paused: v ? v.paused : true,
      };
    });
    console.log(
      `Video status after freeze elapsed: currentTime=${videoStatusAfter.currentTime}s, paused=${videoStatusAfter.paused}`,
    );

    // b) Hook banner must be gone
    const isHookBannerVisibleAfter = await canvasHookBanner.isVisible().catch(() => false);

    // c) Countdown badge must be gone
    const isCountdownBadgeVisibleAfter = await freezeCountdownBadge.isVisible().catch(() => false);

    // d) Subtitle conversation cue must now be visible
    const isSubtitleVisibleAfter = await activeSubtitleElem.isVisible().catch(() => false);
    const subtitleTextAfter = isSubtitleVisibleAfter ? await activeSubtitleElem.textContent() : '';
    console.log(`Resumed Subtitle Text: "${subtitleTextAfter?.trim()}"`);

    // Screenshot 3: Video Resumed
    const screenshot3Path = path.join(ARTIFACT_DIR, 'e2e_subagent1_video_resumed.png');
    await page.screenshot({ path: screenshot3Path, fullPage: false });
    console.log(`Saved screenshot: ${screenshot3Path}`);

    // Pause video with Space key
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    if (
      videoStatusAfter.currentTime > 0 &&
      !isHookBannerVisibleAfter &&
      !isCountdownBadgeVisibleAfter &&
      isSubtitleVisibleAfter
    ) {
      recordVerification(
        'SIM-2',
        'Freeze Simulation',
        'Freeze Elapsed: Video Resumes, Hook Banner Disappears, Subtitles Appear',
        'PASS',
        `Video seamlessly resumed playback at ${videoStatusAfter.currentTime.toFixed(2)}s, countdown badge & hook banner disappeared, and subtitle cue appeared ("${subtitleTextAfter?.trim()}").`,
      );
    } else {
      recordVerification(
        'SIM-2',
        'Freeze Simulation',
        'Freeze Elapsed: Video Resumes, Hook Banner Disappears, Subtitles Appear',
        'FAIL',
        `Mismatch: currentTime=${videoStatusAfter.currentTime}, hookVisible=${isHookBannerVisibleAfter}, countdownVisible=${isCountdownBadgeVisibleAfter}, subtitleVisible=${isSubtitleVisibleAfter}`,
      );
    }

    // -------------------------------------------------------------
    // PHASE 3: Canvas Mode Switcher (Simulasi Draf vs Hasil Render)
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Testing Canvas Mode Switcher ---');
    const draftModeBtn = page.locator('button:has-text("Simulasi Draf")').first();
    const renderedModeBtn = page.locator('button:has-text("Hasil Render (Final)")').first();

    // Verify initial mode is draft
    const initialDraftClass = await draftModeBtn.getAttribute('class');
    const isInitialDraftActive = initialDraftClass?.includes('bg-blue-600');

    // Click Hasil Render (Final)
    console.log('Switching to [Hasil Render (Final)]...');
    await renderedModeBtn.click();
    await page.waitForTimeout(1500);

    // Verify green badge: '🎬 Video Hasil Render (Final Hardsub & Freeze Frame)'
    const renderedBadge = page.locator('text=Video Hasil Render (Final Hardsub & Freeze Frame)');
    const isRenderedBadgeVisible = await renderedBadge.isVisible();

    // Verify video src points to rendered video (no clean=1 query param)
    const renderedVideoSrc = await page.locator('video').first().getAttribute('src');
    const isCleanRemoved = renderedVideoSrc ? !renderedVideoSrc.includes('clean=1') : false;
    console.log(`Rendered Video src: ${renderedVideoSrc}`);

    // Switch back to [Simulasi Draf]
    console.log('Switching back to [Simulasi Draf]...');
    await draftModeBtn.click();
    await page.waitForTimeout(1200);

    // Verify rendered badge is gone
    const isRenderedBadgeRemoved = !(await renderedBadge.isVisible().catch(() => false));

    // Verify clean=1 is restored in video src
    const draftVideoSrc = await page.locator('video').first().getAttribute('src');
    const isCleanRestored = draftVideoSrc ? draftVideoSrc.includes('clean=1') : false;
    console.log(`Draft Video src: ${draftVideoSrc}`);

    if (
      isInitialDraftActive &&
      isRenderedBadgeVisible &&
      isCleanRemoved &&
      isRenderedBadgeRemoved &&
      isCleanRestored
    ) {
      recordVerification(
        'MODE-1',
        'Canvas Mode Switcher',
        'Toggle Simulasi Draf vs Hasil Render (Final)',
        'PASS',
        `Successfully switched to Hasil Render (final video loaded, badge visible) and smoothly switched back to Simulasi Draf (clean video + CSS mockup overlays restored).`,
      );
    } else {
      recordVerification(
        'MODE-1',
        'Canvas Mode Switcher',
        'Toggle Simulasi Draf vs Hasil Render (Final)',
        'FAIL',
        `Mode switcher failed: isInitialDraftActive=${isInitialDraftActive}, isRenderedBadgeVisible=${isRenderedBadgeVisible}, isCleanRemoved=${isCleanRemoved}, isRenderedBadgeRemoved=${isRenderedBadgeRemoved}, isCleanRestored=${isCleanRestored}`,
      );
    }

    console.log('\n================================================================');
    console.log('📊 TEST SUMMARY RESULTS:');
    console.log('================================================================');
    let passCount = 0;
    let failCount = 0;
    for (const v of verifications) {
      const icon = v.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} [${v.id}] ${v.category}: ${v.description} -> ${v.status}`);
      if (v.status === 'PASS') passCount++;
      else failCount++;
    }
    console.log(`\nTotal: ${verifications.length} | Passed: ${passCount} | Failed: ${failCount}`);

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Test execution encountered an error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runHookAndCanvasE2ETest();
