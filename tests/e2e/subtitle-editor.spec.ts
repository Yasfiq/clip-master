import { test, expect } from '@playwright/test';

test.describe('Manual Subtitle Editor E2E', () => {
  let testClipId = '';

  test.beforeAll(async ({ request }) => {
    // Find an existing exported clip to test against
    const res = await request.get('/api/clips?limit=10');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const clips = data.data?.clips || [];
    if (clips.length > 0) {
      testClipId = clips[0].id;
    }
  });

  test('REST API: GET and PUT subtitle cues work correctly', async ({ request }) => {
    if (!testClipId) {
      test.skip();
      return;
    }

    // 1. GET current subtitles
    const getRes = await request.get(`/api/clips/${testClipId}/subtitles`);
    expect(getRes.ok()).toBeTruthy();
    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(Array.isArray(getData.data.cues)).toBe(true);

    const originalCues = getData.data.cues;
    expect(originalCues.length).toBeGreaterThan(0);

    // 2. PUT updated subtitle text
    const updatedCues = [...originalCues];
    const originalText = updatedCues[0].text;
    const testMarkerText = `${originalText} (E2E Test Edit)`;
    updatedCues[0] = { ...updatedCues[0], text: testMarkerText };

    const putRes = await request.put(`/api/clips/${testClipId}/subtitles`, {
      data: { cues: updatedCues },
    });
    expect(putRes.ok()).toBeTruthy();
    const putData = await putRes.json();
    expect(putData.success).toBe(true);
    expect(putData.data.updated).toBe(true);

    // 3. GET verify that edit was persisted
    const verifyRes = await request.get(`/api/clips/${testClipId}/subtitles`);
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    expect(verifyData.data.cues[0].text).toBe(testMarkerText);

    // 4. Revert back to original text so test leaves clip clean
    updatedCues[0] = { ...updatedCues[0], text: originalText };
    await request.put(`/api/clips/${testClipId}/subtitles`, {
      data: { cues: updatedCues },
    });
  });

  test('Browser UI: opens modal, edits text, and saves subtitle', async ({ page }) => {
    if (!testClipId) {
      test.skip();
      return;
    }

    // Navigate to clips page
    await page.goto('/clips', { waitUntil: 'domcontentloaded' });

    // Ensure clips are rendered
    await page.waitForSelector('button:has-text("Edit Subtitle")', { timeout: 15_000 });

    // Click the first "Edit Subtitle" button
    const editBtn = page.locator('button:has-text("Edit Subtitle")').first();
    await editBtn.click();

    // Verify modal appears
    await expect(page.locator('h2:has-text("Editor Subtitle Klip")')).toBeVisible({
      timeout: 10_000,
    });

    // Verify video element exists
    const video = page.locator('video');
    await expect(video).toBeVisible();

    // Verify cues are listed
    const firstCueInput = page.locator('input[placeholder="Ketik teks subtitle..."]').first();
    await expect(firstCueInput).toBeVisible({ timeout: 10_000 });

    // Save initial value, then edit
    const currentVal = await firstCueInput.inputValue();
    await firstCueInput.fill(`${currentVal} - Edit UI`);

    // Click "Simpan Subtitle"
    const saveBtn = page.locator('button:has-text("Simpan Subtitle")');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify success banner appears
    await expect(page.locator('text=Subtitle berhasil disimpan ke disk.')).toBeVisible({
      timeout: 10_000,
    });

    // Revert back and save
    await firstCueInput.fill(currentVal);
    await saveBtn.click();
    await expect(page.locator('text=Subtitle berhasil disimpan ke disk.')).toBeVisible({
      timeout: 10_000,
    });

    // Close modal via Escape key (testing keyboard accessibility R-32)
    await page.keyboard.press('Escape');
    await expect(page.locator('h2:has-text("Editor Subtitle Klip")')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('Re-Burn Engine: triggers video re-burn and updates export file', async ({ request }) => {
    if (!testClipId) {
      test.skip();
      return;
    }

    test.setTimeout(180_000); // Allow up to 3 min for real ffmpeg re-encode

    const reBurnRes = await request.post(`/api/clips/${testClipId}/re-burn`, {
      data: { styleId: 'tiktok' },
    });
    expect(reBurnRes.ok()).toBeTruthy();

    const data = await reBurnRes.json();
    expect(data.success).toBe(true);
    expect(data.data.exportPath).toBeDefined();
    expect(data.data.fileSize).toBeGreaterThan(100_000); // Real MP4 is non-empty
    expect(data.data.duration).toBeGreaterThan(0);
  });
});
