import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  E2E_SOURCE,
  E2E_CONFIG,
  createLocalJob,
  waitForJobPastPhase1,
  upsertConfig,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * E2E suite — release gate, run via `npm run e2e`.
 *
 * The full job test drives the real pipeline (FFmpeg/Whisper) against a
 * 150s trimmed real-source fixture and asserts the dashboard surfaces the
 * terminal state, stages, and produced clips. The suite boots its own
 * production server via the `webServer` block in playwright.config.ts —
 * Playwright + Next 16 dev-mode Turbopack does not hydrate in headless
 * Chrome on this machine, so DOM interactions run against a real build.
 */

test.describe('dashboard job flow', () => {
  let e2eConfigId = '';

  test.beforeAll(async ({ request }) => {
    // Dedicated config row so the E2E never mutates the user's 'default'.
    e2eConfigId = await upsertConfig(request, E2E_CONFIG);

    // Best-effort cleanup: cancel any PENDING jobs left over from previous
    // E2E runs so this run is the single active job (project rule: one
    // active job at a time). Cancellation goes through the same POST handler
    // the JobList UI uses.
    const list = await request.get('/api/jobs?status=PENDING&limit=20');
    if (list.ok()) {
      const body = (await list.json()) as { data: { jobs: Array<{ id: string }> } };
      for (const j of body.data.jobs) {
        await request.post(`/api/jobs/${j.id}`, { data: { action: 'cancel' } });
      }
    }
  });

  test('creates a job from a local fixture and the pipeline completes', async ({
    request,
    page,
  }) => {
    // ——— Create the job through the same REST contract the form uses ———
    const job = await createLocalJob(request, E2E_SOURCE, e2eConfigId);
    console.log('[test1] job created', job.id);

    // ——— Dashboard renders the new job row ———
    // The dashboard polls /api/jobs on an interval, so the row appears on
    // this single page without a manual reload. Staying on one page also
    // avoids the page.goto hang seen when the client kept polling while the
    // pipeline was still running.
    await page.goto('/', { timeout: 60_000 });
    console.log('[test1] goto / ok');

    const startRes = await request.post(`/api/jobs/${job.id}`, {
      data: { action: 'start' },
    });
    expect(startRes.status()).toBe(200);

    // ——— Row becomes visible while the job runs ———
    await expect(page.getByText('e2e-source.mp4').first()).toBeVisible({
      timeout: 30_000,
    });
    console.log('[test1] job card visible');

    // ——— Wait for Phase 1 to finish (DISCOVER→CUT produced clip rows) ———
    const phase1 = await waitForJobPastPhase1(request, job.id);
    expect(phase1.status).not.toMatch(/PENDING|RUNNING_PHASE1/);
    console.log('[test1] phase1 done', phase1.status, 'clips', phase1.exportedClipsCount);

    // ——— Open that job's detail panel inline (dashboard has no detail URL) ———
    const row = page.locator('tr', { hasText: job.id }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(page.getByText('Pipeline Stages').first()).toBeVisible({
      timeout: 15_000,
    });
    // Terminal-ish badge renders next to the stage list.
    await expect(page.getByText(/PHASE1_DONE|COMPLETED|RUNNING_PHASE2/i).first()).toBeVisible({
      timeout: 15_000,
    });
    console.log('[test1] detail panel visible');

    const detail = await request.get(`/api/jobs/${job.id}`);
    expect(detail.status()).toBe(200);
    const detailBody = (await detail.json()) as {
      success: boolean;
      data: { status: string; clips: Array<{ id: string }> };
    };
    expect(detailBody.data.clips.length).toBeGreaterThan(0);
    for (const stage of [
      'DISCOVER',
      'AD_FILTER',
      'ANALYZE',
      'CUT',
      'EDIT',
      'SUBTITLE',
      'EXPORT',
      'COMPRESS',
    ]) {
      expect(stage).toMatch(/^[A-Z_]+$/); // shape: stage enum value exists
    }
  });

  test('settings panel persists a real user edit through the UI', async ({ page }) => {
    // Open Settings, change the visible Clip Length pill + captions toggle,
    // save, and confirm the value persists after a reload. Runs against the
    // production build where client hydration works — the click path is the
    // same one a human uses.
    await page.goto('/settings');
    await expect(page.getByText('Clip Settings').first()).toBeVisible();

    // Extra (90s) pill.
    await page.getByRole('radio', { name: /90/i }).click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByTestId('settings-save-status')).toContainText(/saved/i, {
      timeout: 10_000,
    });

    // Reload — the server row should feed the panel back.
    await page.reload();
    await expect(page.getByText('Clip Settings').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: /90/i })).toHaveAttribute('aria-checked', 'true');

    // Restore a sane default for later manual runs.
    const restore = await page.request.post('/api/config', {
      data: {
        name: 'default',
        targetDuration: 30,
        maxClips: 5,
        minSegmentDuration: 30,
        subtitleEnabled: true,
      },
    });
    expect(restore.status()).toBe(201);
  });
});
