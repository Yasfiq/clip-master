import { test, expect } from '@playwright/test';

test.describe('ClipStudioModal E2E Regression in Real Browser', () => {
  test('Open ClipStudioModal, navigate all tabs, edit subtitles, nudge timings, and change configs', async ({
    page,
  }) => {
    console.log('[Studio E2E] 1. Visit /clips');
    await page.goto('/clips');
    await expect(page.locator('article').first()).toBeVisible();

    console.log('[Studio E2E] 2. Click Studio Editor button');
    const editBtn = page.getByRole('button', { name: /Studio Editor/i }).first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    console.log('[Studio E2E] 3. Modal shell visible');
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(page.getByText('Editor Subtitle Klip & Studio Workspace')).toBeVisible();

    console.log('[Studio E2E] 4. Hook tab interactions (initial tab)');
    await expect(page.getByText('Teks Headline Hook')).toBeVisible();
    const hookInput = page.getByPlaceholder(/Contoh: KEBEBASAN ADALAH SEGALANYA/i);
    await hookInput.fill('REGRESSION TEST HOOK TEXT');
    await expect(hookInput).toHaveValue('REGRESSION TEST HOOK TEXT');

    console.log('[Studio E2E] 5. Switch hook position to Atas Layar');
    const topPosBtn = page.getByRole('button', { name: 'Atas Layar' });
    await topPosBtn.click();

    console.log('[Studio E2E] 6. Navigate to Subtitle tab');
    const subTabBtn = modal.getByTitle('Subtitle & Auto Captions');
    await subTabBtn.click();
    await expect(modal.getByText('Gaya Subtitle (CapCut Preset)')).toBeVisible();

    console.log('[Studio E2E] 7. Edit first cue textarea');
    const firstTextarea = modal.locator('textarea').first();
    await expect(firstTextarea).toBeVisible();
    const originalText = await firstTextarea.inputValue();
    await firstTextarea.fill('Teks subtitle berhasil diubah melalui Playwright browser!');
    await expect(firstTextarea).toHaveValue(
      'Teks subtitle berhasil diubah melalui Playwright browser!',
    );

    console.log('[Studio E2E] 8. Test Nudge All Timing (+0.10s)');
    const nudgePlusBtn = modal.getByRole('button', { name: '+0.10s' }).first();
    await nudgePlusBtn.click();

    console.log('[Studio E2E] 9. Navigate to Brand tab');
    const brandTabBtn = modal.getByTitle('Branding & Sumber');
    await brandTabBtn.click();
    await expect(modal.getByText('Logo Channel', { exact: true })).toBeVisible();
    await expect(modal.getByText('Sumber Video Asli', { exact: true })).toBeVisible();

    console.log('[Studio E2E] 10. Navigate to Transisi tab');
    const transTabBtn = modal.getByTitle('Transisi & Fade');
    await transTabBtn.click();
    await expect(modal.getByText('Fade In (Pembuka)', { exact: true })).toBeVisible();

    console.log('[Studio E2E] 11. Navigate to Audio tab');
    const audioTabBtn = modal.getByTitle('Audio & Narator AI');
    await audioTabBtn.click();
    await expect(modal.getByText('Voiceover Narator AI (Edge-TTS)', { exact: true })).toBeVisible();

    console.log('[Studio E2E] 12. Save Draft');
    const saveDraftBtn = modal.getByRole('button', { name: 'Simpan Draf' });
    await saveDraftBtn.click();
    await expect(modal.getByText('Subtitle berhasil disimpan ke disk.')).toBeVisible();

    console.log('[Studio E2E] 13. Restore original text');
    await subTabBtn.click();
    await firstTextarea.fill(originalText);
    await saveDraftBtn.click();
    await expect(modal.getByText('Subtitle berhasil disimpan ke disk.')).toBeVisible();

    console.log('[Studio E2E] 14. Close Modal');
    const closeBtn = page.getByTitle('Batal / Tutup');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    console.log('[Studio E2E] Regression test passed successfully!');
  });
});
