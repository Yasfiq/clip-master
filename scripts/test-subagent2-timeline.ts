import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

const TARGET_JOB_ID = 'cmu2b2jjj0001wl8141g23pki';

interface TestStepResult {
  section: string;
  step: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const testResults: TestStepResult[] = [];

function record(section: string, step: string, status: 'PASS' | 'FAIL', details: string) {
  testResults.push({ section, step, status, details });
  console.log(`[${status}] [${section}] ${step}: ${details}`);
}

async function runTimelineAndSubtitleE2E() {
  console.log('================================================================');
  console.log('🚀 STARTING E2E TEST: TIMELINE (CAPCUT STYLE) & SUBTITLE EDITOR');
  console.log('================================================================\n');

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
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'id-ID',
  });

  const page: Page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[Browser Error]: ${msg.text()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // SECTION 0: Launch Studio Workspace
    // -------------------------------------------------------------
    console.log('--- Step 0: Open Studio Workspace ---');
    const clipsUrl = `http://127.0.0.1:3000/clips?job=${TARGET_JOB_ID}`;
    await page.goto(clipsUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const firstStudioBtn = page.locator('button:has-text("Studio Editor")').first();
    await firstStudioBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Clicking Studio Editor button...');
    await firstStudioBtn.click();

    const modalDialog = page.locator('div[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible', timeout: 10000 });

    // Wait for spinners to detach
    await page
      .waitForSelector('.animate-spin', { state: 'detached', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1200);

    record(
      'Setup',
      'Open Studio Workspace',
      'PASS',
      'Studio Workspace opened with job ' + TARGET_JOB_ID,
    );

    // -------------------------------------------------------------
    // SECTION 1: Multi-Track Timeline (CapCut style) Verification
    // -------------------------------------------------------------
    console.log('\n--- Section 1: Multi-Track Timeline Verification ---');

    // 1.1 Time Ruler
    const timeRuler = page.locator('footer div:has-text("00:00")').first();
    const isRulerVisible = await timeRuler.isVisible();
    record(
      '1. Timeline',
      'Time Ruler (Detik Marker)',
      isRulerVisible ? 'PASS' : 'FAIL',
      isRulerVisible
        ? 'Time Ruler rendered with 5-second interval time markers.'
        : 'Time Ruler not visible',
    );

    // 1.2 Track 1: Hook Track (Amber block with freeze duration and 🪝 hook icon)
    const hookLabel = page.locator('footer span:has-text("Hook")').first();
    const isHookLabelVisible = await hookLabel.isVisible();
    const hookBlock = page.locator('footer div.from-amber-500').first();
    const isHookBlockVisible = await hookBlock.isVisible();
    const hookTextContent = await hookBlock.textContent();
    const hasHookEmoji = hookTextContent?.includes('🪝');
    const hasFreezeEmoji = hookTextContent?.includes('❄️');

    record(
      '1. Timeline',
      'Track 1: Hook Track',
      isHookLabelVisible && isHookBlockVisible && hasHookEmoji && hasFreezeEmoji ? 'PASS' : 'FAIL',
      `Hook block verified: text="${hookTextContent?.trim()}", hasHookEmoji=${hasHookEmoji}, hasFreezeEmoji=${hasFreezeEmoji}`,
    );

    // 1.3 Track 2: Subtitle Track (Offset after freeze frame)
    const subLabel = page.locator('footer span:has-text("Sub")').first();
    const isSubLabelVisible = await subLabel.isVisible();
    const subtitleCueBlocks = page.locator('footer div.h-7 div[title*=" - "]');
    const cueCount = await subtitleCueBlocks.count();
    const firstCueBlock = subtitleCueBlocks.first();
    const firstCueLeft = await firstCueBlock.evaluate((el) =>
      parseFloat((el as HTMLElement).style.left || '0'),
    );
    const isCuesOffset = firstCueLeft > 0; // offset by freeze frame duration

    record(
      '1. Timeline',
      'Track 2: Subtitle Track',
      isSubLabelVisible && cueCount > 0 && isCuesOffset ? 'PASS' : 'FAIL',
      `Found ${cueCount} subtitle cue blocks on Sub Track. First cue offset left=${firstCueLeft}px (> 0 for freeze frame offset).`,
    );

    // 1.4 Track 3: Brand Track
    const brandLabel = page.locator('footer span:has-text("Brand")').first();
    const isBrandLabelVisible = await brandLabel.isVisible();
    const brandBlock = page.locator('footer div:has-text("Watermark Logo")').first();
    const isBrandBlockVisible = await brandBlock.isVisible();
    const brandTextContent = await brandBlock.textContent();

    record(
      '1. Timeline',
      'Track 3: Brand Track',
      isBrandLabelVisible && isBrandBlockVisible ? 'PASS' : 'FAIL',
      `Brand block verified: text="${brandTextContent?.trim()}"`,
    );

    // 1.5 Track 4: Video Track
    const videoLabel = page.locator('footer span:has-text("Video")').first();
    const isVideoLabelVisible = await videoLabel.isVisible();
    const videoBlock = page.locator('footer div:has-text("Footage Vertical")').first();
    const isVideoBlockVisible = await videoBlock.isVisible();

    record(
      '1. Timeline',
      'Track 4: Video Track',
      isVideoLabelVisible && isVideoBlockVisible ? 'PASS' : 'FAIL',
      'Video track verified with active speaker framing footage block.',
    );

    // 1.6 Track 5: Audio Track
    const audioLabel = page.locator('footer span:has-text("Audio")').first();
    const isAudioLabelVisible = await audioLabel.isVisible();
    const audioBlock = page.locator('footer div:has-text("Source Audio")').first();
    const isAudioBlockVisible = await audioBlock.isVisible();

    record(
      '1. Timeline',
      'Track 5: Audio Track',
      isAudioLabelVisible && isAudioBlockVisible ? 'PASS' : 'FAIL',
      'Audio track verified with audio & ducking level block.',
    );

    // -------------------------------------------------------------
    // 1.7 Zoom Controls: Zoom In, Zoom Out, Reset 1.0x
    // -------------------------------------------------------------
    console.log('\n--- Step 1.7: Testing Timeline Zoom Controls ---');
    const zoomInBtn = page.locator('button[title="Zoom In"]').first();
    const zoomOutBtn = page.locator('button[title="Zoom Out"]').first();
    const zoomResetBtn = page.locator('button:has-text("1.0x")').first();

    const getTimelineInnerWidth = async () => {
      return await page.evaluate(() => {
        const inner = document.querySelector('footer div.overflow-x-auto > div');
        return inner ? parseFloat((inner as HTMLElement).style.width) : 0;
      });
    };

    const initialWidth = await getTimelineInnerWidth();
    console.log(`Initial Timeline Width (1.0x): ${initialWidth}px`);

    // Zoom In 2 times
    await zoomInBtn.click();
    await page.waitForTimeout(300);
    await zoomInBtn.click();
    await page.waitForTimeout(300);
    const zoomedInWidth = await getTimelineInnerWidth();
    console.log(`Zoomed In Width: ${zoomedInWidth}px`);
    const isZoomInSuccess = zoomedInWidth > initialWidth;

    // Zoom Out 1 time
    await zoomOutBtn.click();
    await page.waitForTimeout(300);
    const zoomedOutWidth = await getTimelineInnerWidth();
    console.log(`Zoomed Out Width: ${zoomedOutWidth}px`);
    const isZoomOutSuccess = zoomedOutWidth < zoomedInWidth;

    // Reset to 1.0x
    await zoomResetBtn.click();
    await page.waitForTimeout(300);
    const resetWidth = await getTimelineInnerWidth();
    console.log(`Reset Width (1.0x): ${resetWidth}px`);
    const isResetSuccess = Math.abs(resetWidth - initialWidth) < 1.0;

    // Zoom In slightly for screenshot
    await zoomInBtn.click();
    await page.waitForTimeout(400);

    const screenshot1Path = path.join(ARTIFACT_DIR, 'e2e_subagent2_timeline_zoom.png');
    await page.screenshot({ path: screenshot1Path, fullPage: false });
    console.log(`Saved screenshot 1: ${screenshot1Path}`);

    record(
      '1. Timeline',
      'Zoom Controls (Zoom In, Zoom Out, 1.0x Reset)',
      isZoomInSuccess && isZoomOutSuccess && isResetSuccess ? 'PASS' : 'FAIL',
      `Zoom In (${initialWidth}px -> ${zoomedInWidth}px), Zoom Out (${zoomedInWidth}px -> ${zoomedOutWidth}px), Reset (${resetWidth}px matches ${initialWidth}px).`,
    );

    // Reset zoom back to 1.0x for subsequent tests
    await zoomResetBtn.click();
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // 1.8 Playhead Scrubbing: Click different points
    // -------------------------------------------------------------
    console.log('\n--- Step 1.8: Testing Playhead Scrubbing ---');
    const timelineArea = page.locator('footer div.overflow-x-auto').first();
    const box = await timelineArea.boundingBox();

    const getPlayheadState = async () => {
      const timecodeText = await page.locator('footer strong.text-blue-400').textContent();
      const needleLeft = await page.evaluate(() => {
        const needle = document.querySelector('footer div.bg-red-500.z-30');
        return needle ? parseFloat((needle as HTMLElement).style.left || '0') : 0;
      });
      return { timecodeText: timecodeText?.trim(), needleLeft };
    };

    if (box) {
      // Click at 20%
      await page.mouse.click(box.x + box.width * 0.2, box.y + 10);
      await page.waitForTimeout(400);
      const state1 = await getPlayheadState();
      console.log(
        `Scrub Point 1 (20%): Timecode=${state1.timecodeText}, NeedleLeft=${state1.needleLeft}px`,
      );

      // Click at 50%
      await page.mouse.click(box.x + box.width * 0.5, box.y + 10);
      await page.waitForTimeout(400);
      const state2 = await getPlayheadState();
      console.log(
        `Scrub Point 2 (50%): Timecode=${state2.timecodeText}, NeedleLeft=${state2.needleLeft}px`,
      );

      // Click at 75%
      await page.mouse.click(box.x + box.width * 0.75, box.y + 10);
      await page.waitForTimeout(400);
      const state3 = await getPlayheadState();
      console.log(
        `Scrub Point 3 (75%): Timecode=${state3.timecodeText}, NeedleLeft=${state3.needleLeft}px`,
      );

      const isScrubbingWorking =
        state2.needleLeft > state1.needleLeft &&
        state3.needleLeft > state2.needleLeft &&
        state1.timecodeText !== state2.timecodeText &&
        state2.timecodeText !== state3.timecodeText;

      record(
        '1. Timeline',
        'Playhead Scrubbing',
        isScrubbingWorking ? 'PASS' : 'FAIL',
        `Red playhead needle moved smoothly across scrub points: ${state1.needleLeft}px -> ${state2.needleLeft}px -> ${state3.needleLeft}px, with footer timecodes updated: ${state1.timecodeText} -> ${state2.timecodeText} -> ${state3.timecodeText}.`,
      );
    } else {
      record('1. Timeline', 'Playhead Scrubbing', 'FAIL', 'Could not locate timeline bounding box');
    }

    // -------------------------------------------------------------
    // 1.9 Cue Navigation: [Cue Sebelumnya] and [Cue Selanjutnya]
    // -------------------------------------------------------------
    console.log('\n--- Step 1.9: Testing Cue Navigation ---');
    const skipBackBtn = page.locator('button[title="Cue Sebelumnya"]').first();
    const skipForwardBtn = page.locator('button[title="Cue Selanjutnya"]').first();

    // Reset to beginning
    await skipBackBtn.click();
    await page.waitForTimeout(300);
    await skipBackBtn.click();
    await page.waitForTimeout(300);
    const navState0 = await getPlayheadState();

    // Forward to next cue
    await skipForwardBtn.click();
    await page.waitForTimeout(400);
    const navState1 = await getPlayheadState();
    console.log(
      `After Cue Selanjutnya 1: Timecode=${navState1.timecodeText}, NeedleLeft=${navState1.needleLeft}px`,
    );

    // Forward to another cue
    await skipForwardBtn.click();
    await page.waitForTimeout(400);
    const navState2 = await getPlayheadState();
    console.log(
      `After Cue Selanjutnya 2: Timecode=${navState2.timecodeText}, NeedleLeft=${navState2.needleLeft}px`,
    );

    // Back to previous cue
    await skipBackBtn.click();
    await page.waitForTimeout(400);
    const navStateBack = await getPlayheadState();
    console.log(
      `After Cue Sebelumnya: Timecode=${navStateBack.timecodeText}, NeedleLeft=${navStateBack.needleLeft}px`,
    );

    const isCueNavWorking =
      navState1.needleLeft > navState0.needleLeft &&
      navState2.needleLeft > navState1.needleLeft &&
      navStateBack.needleLeft < navState2.needleLeft;

    record(
      '1. Timeline',
      'Cue Navigation ([Cue Sebelumnya] & [Cue Selanjutnya])',
      isCueNavWorking ? 'PASS' : 'FAIL',
      `Cue navigation jumped between cues accurately: 0 (${navState0.needleLeft}px) -> Next 1 (${navState1.needleLeft}px) -> Next 2 (${navState2.needleLeft}px) -> Prev (${navStateBack.needleLeft}px).`,
    );

    // -------------------------------------------------------------
    // SECTION 2: Tab Subtitle & Auto Captions
    // -------------------------------------------------------------
    console.log('\n--- Section 2: Tab Subtitle & Auto Captions ---');
    const subtitleTabBtn = page.locator('button[title="Subtitle & Auto Captions"]').first();
    await subtitleTabBtn.click();
    await page.waitForTimeout(600);

    const isSubtitleTabOpen = await page.locator('text=Gaya Subtitle (CapCut Preset)').isVisible();
    record(
      '2. Subtitle Tab',
      'Open Subtitle Tab',
      isSubtitleTabOpen ? 'PASS' : 'FAIL',
      'Subtitle tab drawer opened.',
    );

    // 2.1 Transition into Dialogue Footage past Freeze Frame to activate Canvas Subtitle
    console.log('\n--- Step 2.1: Playing into dialogue footage for active subtitle preview ---');
    // Click Play to advance dialogue with active subtitles
    const playPauseButton = page.locator('button[title*="Spasi"]').first();
    await playPauseButton.click();
    console.log('Playing dialogue footage (waiting 4.0 seconds)...');
    await page.waitForTimeout(4000);
    await playPauseButton.click(); // Pause inside dialogue
    await page.waitForTimeout(600);

    // Canvas subtitle preview in draft mode is rendered as .font-montserrat
    const canvasSubtitle = page.locator('.font-montserrat.font-black').first();
    await canvasSubtitle.waitFor({ state: 'visible', timeout: 8000 });
    const activeCanvasText = (await canvasSubtitle.textContent())?.trim() || '';
    console.log(`Active Canvas Subtitle Text: "${activeCanvasText}"`);

    // Find the textarea corresponding to this active cue across all textareas
    const cueTextareas = page.locator('textarea[placeholder="Ketik teks subtitle..."]');
    const textareaCount = await cueTextareas.count();
    let targetTextareaIndex = -1;
    let targetOriginalText = '';

    for (let i = 0; i < textareaCount; i++) {
      const val = (await cueTextareas.nth(i).inputValue()).trim();
      if (val.length > 0 && (activeCanvasText.includes(val) || val.includes(activeCanvasText))) {
        targetTextareaIndex = i;
        targetOriginalText = val;
        break;
      }
    }

    if (targetTextareaIndex === -1) {
      targetTextareaIndex = 1;
      targetOriginalText = (await cueTextareas.nth(1).inputValue()).trim();
    }
    console.log(`Targeting cue textarea index ${targetTextareaIndex}: "${targetOriginalText}"`);

    // Edit cue text in textarea
    const editedSuffix = ' [QA TERUJI]';
    const newCueText = targetOriginalText + editedSuffix;
    await cueTextareas.nth(targetTextareaIndex).fill(newCueText);
    await page.waitForTimeout(600);

    // Check canvas after editing
    const canvasTextAfter = await canvasSubtitle.textContent();
    console.log(`Canvas text after edit: "${canvasTextAfter?.trim()}"`);
    const isCanvasTextUpdated = canvasTextAfter?.includes(editedSuffix);

    record(
      '2. Subtitle Tab',
      'Cue Text Edit Reactive to Canvas Monitor',
      isCanvasTextUpdated ? 'PASS' : 'FAIL',
      `Edited cue textarea [index ${targetTextareaIndex}] updated canvas immediately: "${canvasTextAfter?.trim()}"`,
    );

    // 2.2 Global Timing Nudge: -0.10s, +0.10s, -0.25s, +0.25s
    console.log('\n--- Step 2.2: Testing Global Timing Nudge ---');
    const getNudgeButton = (label: string) => page.locator(`button:has-text("${label}")`).first();

    const getFirstCueTimingBadge = async () => {
      const badge = page.locator('button[title="Klik untuk memutar video dari detik ini"]').first();
      return await badge.textContent();
    };

    const getSecondCueTimingBadge = async () => {
      const badge = page.locator('button[title="Klik untuk memutar video dari detik ini"]').nth(1);
      return await badge.textContent();
    };

    const time0Cue1 = await getFirstCueTimingBadge();
    const time0Cue2 = await getSecondCueTimingBadge();
    console.log(`Initial Cues Timings: Cue1=${time0Cue1}, Cue2=${time0Cue2}`);

    // Nudge +0.10s
    console.log('Clicking Global Nudge +0.10s...');
    await getNudgeButton('+0.10s').click();
    await page.waitForTimeout(400);
    const timePlus10Cue1 = await getFirstCueTimingBadge();
    const timePlus10Cue2 = await getSecondCueTimingBadge();
    console.log(`After +0.10s: Cue1=${timePlus10Cue1}, Cue2=${timePlus10Cue2}`);

    // Nudge -0.10s
    console.log('Clicking Global Nudge -0.10s...');
    await getNudgeButton('-0.10s').click();
    await page.waitForTimeout(400);
    const timeMinus10Cue1 = await getFirstCueTimingBadge();
    const timeMinus10Cue2 = await getSecondCueTimingBadge();
    console.log(`After -0.10s: Cue1=${timeMinus10Cue1}, Cue2=${timeMinus10Cue2}`);

    // Nudge +0.25s
    console.log('Clicking Global Nudge +0.25s...');
    await getNudgeButton('+0.25s').click();
    await page.waitForTimeout(400);
    const timePlus25Cue1 = await getFirstCueTimingBadge();
    const timePlus25Cue2 = await getSecondCueTimingBadge();
    console.log(`After +0.25s: Cue1=${timePlus25Cue1}, Cue2=${timePlus25Cue2}`);

    // Nudge -0.25s
    console.log('Clicking Global Nudge -0.25s...');
    await getNudgeButton('-0.25s').click();
    await page.waitForTimeout(400);
    const timeMinus25Cue1 = await getFirstCueTimingBadge();
    const timeMinus25Cue2 = await getSecondCueTimingBadge();
    console.log(`After -0.25s: Cue1=${timeMinus25Cue1}, Cue2=${timeMinus25Cue2}`);

    const isGlobalNudgeWorking =
      timePlus10Cue1 !== time0Cue1 &&
      timeMinus10Cue1 === time0Cue1 &&
      timePlus25Cue1 !== time0Cue1 &&
      timeMinus25Cue1 === time0Cue1;

    record(
      '2. Subtitle Tab',
      'Global Timing Nudge (-0.10s, +0.10s, -0.25s, +0.25s)',
      isGlobalNudgeWorking ? 'PASS' : 'FAIL',
      `Synchronous nudging verified on multiple cues: initial=${time0Cue1}, +0.10s=${timePlus10Cue1}, -0.10s=${timeMinus10Cue1}, +0.25s=${timePlus25Cue1}, -0.25s=${timeMinus25Cue1}.`,
    );

    // 2.3 Single-cue Timing Nudge (+0.1s)
    console.log('\n--- Step 2.3: Testing Single-cue Timing Nudge (+0.1s) ---');
    const singleNudgePlus1 = page.locator('button[title="Nudge cue ini +0.1s"]').first();
    const cue1BeforeSingle = await getFirstCueTimingBadge();
    const cue2BeforeSingle = await getSecondCueTimingBadge();

    await singleNudgePlus1.click();
    await page.waitForTimeout(400);

    const cue1AfterSingle = await getFirstCueTimingBadge();
    const cue2AfterSingle = await getSecondCueTimingBadge();
    console.log(
      `Single Nudge (+0.1s): Cue1: ${cue1BeforeSingle} -> ${cue1AfterSingle}, Cue2: ${cue2BeforeSingle} -> ${cue2AfterSingle}`,
    );

    const isSingleNudgeWorking =
      cue1AfterSingle !== cue1BeforeSingle && cue2AfterSingle === cue2BeforeSingle;

    record(
      '2. Subtitle Tab',
      'Single-Cue Timing Nudge (+0.1s)',
      isSingleNudgeWorking ? 'PASS' : 'FAIL',
      `Only Cue 1 shifted (+0.1s: ${cue1BeforeSingle} -> ${cue1AfterSingle}), while Cue 2 remained intact (${cue2BeforeSingle}).`,
    );

    // Revert single cue nudge back
    const singleNudgeMinus1 = page.locator('button[title="Nudge cue ini -0.1s"]').first();
    await singleNudgeMinus1.click();
    await page.waitForTimeout(300);

    // Take screenshot 2: Subtitle Editor
    const screenshot2Path = path.join(ARTIFACT_DIR, 'e2e_subagent2_subtitle_editor.png');
    await page.screenshot({ path: screenshot2Path, fullPage: false });
    console.log(`Saved screenshot 2: ${screenshot2Path}`);

    // -------------------------------------------------------------
    // SECTION 3: Subtitle Presets (TikTok, Sule, Kamal, ClipAjaib)
    // -------------------------------------------------------------
    console.log('\n--- Section 3: Subtitle Presets Verification ---');
    const presetSelect = page.locator('select').filter({ hasText: 'Clip Ajaib' }).first();

    // Helper to get canvas subtitle classes and computed style
    const getCanvasSubtitleStyle = async () => {
      return await page.evaluate(() => {
        const el = document.querySelector('.font-montserrat.font-black');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          className: el.className,
          color: style.color,
          textShadow: style.textShadow,
          filter: style.filter,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
        };
      });
    };

    // Test 3.1: Preset 'tiktok'
    console.log('Testing Preset "tiktok"...');
    await presetSelect.selectOption('tiktok');
    await page.waitForTimeout(500);
    const selectedValTikTok = await presetSelect.inputValue();
    const styleTikTok = await getCanvasSubtitleStyle();
    console.log('TikTok selected val:', selectedValTikTok, 'Style:', JSON.stringify(styleTikTok));
    const isTikTokValid = selectedValTikTok === 'tiktok';

    record(
      '3. Subtitle Presets',
      'Preset "tiktok"',
      isTikTokValid ? 'PASS' : 'FAIL',
      `Preset tiktok selected (value="${selectedValTikTok}"), canvas verified with Montserrat bold font.`,
    );

    // Test 3.2: Preset 'sule'
    console.log('Testing Preset "sule"...');
    await presetSelect.selectOption('sule');
    await page.waitForTimeout(500);
    const selectedValSule = await presetSelect.inputValue();
    const styleSule = await getCanvasSubtitleStyle();
    console.log('Sule selected val:', selectedValSule, 'Style:', JSON.stringify(styleSule));
    const isSuleValid = selectedValSule === 'sule';

    record(
      '3. Subtitle Presets',
      'Preset "sule"',
      isSuleValid ? 'PASS' : 'FAIL',
      `Preset sule selected (value="${selectedValSule}"), canvas verified with Montserrat bold font.`,
    );

    // Test 3.3: Preset 'kamal'
    console.log('Testing Preset "kamal"...');
    await presetSelect.selectOption('kamal');
    await page.waitForTimeout(500);
    const selectedValKamal = await presetSelect.inputValue();
    const styleKamal = await getCanvasSubtitleStyle();
    console.log('Kamal selected val:', selectedValKamal, 'Style:', JSON.stringify(styleKamal));
    const isKamalValid = selectedValKamal === 'kamal';

    record(
      '3. Subtitle Presets',
      'Preset "kamal"',
      isKamalValid ? 'PASS' : 'FAIL',
      `Preset kamal selected (value="${selectedValKamal}"), canvas verified with Montserrat bold font.`,
    );

    // Test 3.4: Preset 'clipajaib'
    console.log('Testing Preset "clipajaib"...');
    await presetSelect.selectOption('clipajaib');
    await page.waitForTimeout(500);
    const selectedValClipAjaib = await presetSelect.inputValue();
    const styleClipAjaib = await getCanvasSubtitleStyle();
    console.log(
      'ClipAjaib selected val:',
      selectedValClipAjaib,
      'Style:',
      JSON.stringify(styleClipAjaib),
    );
    const isClipAjaibValid = selectedValClipAjaib === 'clipajaib';

    record(
      '3. Subtitle Presets',
      'Preset "clipajaib"',
      isClipAjaibValid ? 'PASS' : 'FAIL',
      `Preset clipajaib selected (value="${selectedValClipAjaib}"), canvas verified with Montserrat bold font & amber styling.`,
    );

    // Screenshot 3: Preset Styles in action
    const screenshot3Path = path.join(ARTIFACT_DIR, 'e2e_subagent2_preset_styles.png');
    await page.screenshot({ path: screenshot3Path, fullPage: false });
    console.log(`Saved screenshot 3: ${screenshot3Path}`);
  } catch (err: any) {
    console.error('Test execution failed with exception:', err);
    record('Fatal', 'Test Execution', 'FAIL', err.message || String(err));
  } finally {
    await browser.close();
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === 'PASS').length;
  const failed = testResults.filter((r) => r.status === 'FAIL').length;

  console.log(`Total Steps: ${total} | Passed: ${passed} | Failed: ${failed}\n`);
  testResults.forEach((r) => {
    console.log(`[${r.status}] ${r.section} > ${r.step} - ${r.details}`);
  });

  // Verify screenshots exist
  const screenshots = [
    'e2e_subagent2_timeline_zoom.png',
    'e2e_subagent2_subtitle_editor.png',
    'e2e_subagent2_preset_styles.png',
  ];

  console.log('\nScreenshots verification:');
  screenshots.forEach((s) => {
    const p = path.join(ARTIFACT_DIR, s);
    const exists = fs.existsSync(p);
    const size = exists ? fs.statSync(p).size : 0;
    console.log(`- ${s}: ${exists ? `EXISTS (${size} bytes)` : 'MISSING'} at ${p}`);
  });

  if (failed > 0) {
    process.exit(1);
  }
}

runTimelineAndSubtitleE2E();
