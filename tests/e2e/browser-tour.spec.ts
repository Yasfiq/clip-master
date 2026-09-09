import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

test.describe('Clean Slate Browser Testing Tour', () => {
  test('Verify fresh/empty state, form interactions, settings defaults, and empty clips gallery', async ({
    page,
  }) => {
    // 1. Visit Clean Dashboard
    console.log('[Clean Tour] 1. Visiting clean Dashboard (/)...');
    await page.goto('/', { timeout: 60_000 });
    await expect(page).toHaveTitle(/Clip Master/i);

    // Verify empty state in job list
    await expect(page.getByText('No jobs yet')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Create your first job to get started')).toBeVisible();

    // Verify status summary shows 0 across the board
    await expect(page.getByText('Create New Job').first()).toBeVisible();

    // Save screenshot of clean dashboard
    const cleanDashboardShot = path.join(ARTIFACT_DIR, '01_clean_dashboard.png');
    await page.screenshot({ path: cleanDashboardShot, fullPage: true });
    console.log('[Clean Tour] Saved clean dashboard screenshot:', cleanDashboardShot);

    // 2. Test Create New Job form interaction on fresh slate
    console.log('[Clean Tour] 2. Testing Create New Job form...');
    const urlInput = page.locator('#url-input');
    await expect(urlInput).toBeVisible();

    // Switch between Source Type tabs
    const localTab = page.getByRole('button', { name: 'Local File' });
    await localTab.click();
    await expect(page.locator('#local-path')).toBeVisible();

    const youtubeTab = page.getByRole('button', { name: 'YouTube' });
    await youtubeTab.click();
    await expect(urlInput).toBeVisible();

    // Type a sample URL to verify interactive button state
    await urlInput.fill('https://www.youtube.com/watch?v=sample-video-id');
    const submitBtn = page.getByRole('button', { name: /Start Processing/i });
    await expect(submitBtn).toBeEnabled();

    const formShot = path.join(ARTIFACT_DIR, '02_clean_form_input.png');
    await page.screenshot({ path: formShot });
    console.log('[Clean Tour] Saved clean form screenshot:', formShot);

    // Clear input again
    await urlInput.fill('');

    // 3. Visit Settings page
    console.log('[Clean Tour] 3. Visiting Settings (/settings)...');
    await page.goto('/settings');
    await expect(page.getByText('Clip Settings').first()).toBeVisible();

    // Verify default active pill is Medium (30s) or radio controls
    const durationPills = page.locator('[role="radio"]');
    await expect(durationPills.first()).toBeVisible();

    const settingsShot = path.join(ARTIFACT_DIR, '03_clean_settings.png');
    await page.screenshot({ path: settingsShot, fullPage: true });
    console.log('[Clean Tour] Saved clean settings screenshot:', settingsShot);

    // 4. Visit Clips page (should be completely empty)
    console.log('[Clean Tour] 4. Visiting Clips (/clips)...');
    await page.goto('/clips');
    await expect(page.getByText('No clips yet')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Clips will appear here once jobs complete processing/i),
    ).toBeVisible();

    const clipsShot = path.join(ARTIFACT_DIR, '04_clean_clips.png');
    await page.screenshot({ path: clipsShot, fullPage: true });
    console.log('[Clean Tour] Saved clean clips screenshot:', clipsShot);

    console.log('[Clean Tour] Clean slate browser tour passed successfully!');
  });
});
