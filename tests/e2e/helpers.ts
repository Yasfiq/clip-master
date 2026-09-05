import { expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Trimmed 150s real-source clip: talk show content with voice + music. */
export const E2E_SOURCE = path.resolve(__dirname, '../fixtures/e2e-source.mp4');

/** Pipeline target config for the E2E run: 150s source / 30s = up to 5 clips. */
export const E2E_CONFIG = {
  name: 'e2e',
  isDefault: false,
  adFilterEnabled: true,
  adScoreThreshold: 0.75,
  minSegmentDuration: 30,
  targetDuration: 30,
  maxClips: 5,
  colorGrading: 'natural',
  backsoundEnabled: true,
  subtitleEnabled: true,
  targetResolution: '1080x1920',
};

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

interface JobRow {
  id: string;
  status: string;
  errorCode: string | null;
  exportedClipsCount: number;
  progress: number;
  [k: string]: unknown;
}

/** POST a local-file job and return the created row. */
export async function createLocalJob(
  api: APIRequestContext,
  sourcePath: string = E2E_SOURCE,
  configId?: string,
): Promise<JobRow> {
  const res = await api.post('/api/jobs', {
    data: { sourcePath, configId },
  });
  expect(res.status(), `POST /api/jobs → ${res.status()}`).toBe(201);
  const body = (await res.json()) as ApiEnvelope<JobRow>;
  expect(body.success).toBeTruthy();
  return body.data;
}

/** Upsert a config row by name and return its id (independent of 'default'). */
export async function upsertConfig(
  api: APIRequestContext,
  values: Record<string, unknown>,
): Promise<string> {
  const res = await api.post('/api/config', { data: values });
  expect(res.status(), `POST /api/config → ${res.status()}`).toBe(201);
  const body = (await res.json()) as ApiEnvelope<{ id: string }>;
  expect(body.success).toBeTruthy();
  return body.data.id;
}

/**
 * Wait for a job to leave RUNNING_PHASE1 or PENDING and return its current row.
 * Polls GET /api/jobs/:id. The full pipeline is split into two phases and
 * each can take many minutes (DISCOVER→CUT is fast; EDIT→COMPRESS is slow
 * because it encodes portrait output and runs Whisper per clip). This helper
 * surfaces progress without forcing the caller to wait for COMPLETED.
 */
export async function waitForJobPastPhase1(
  api: APIRequestContext,
  jobId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<JobRow> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const pollMs = opts.pollMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let last: JobRow | null = null;

  while (Date.now() < deadline) {
    const res = await api.get(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ApiEnvelope<JobRow>;
    last = body.data;
    const status = last.status;
    // Terminal or past phase 1 = the cut stage has produced Clip rows.
    if (
      status === 'COMPLETED' ||
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'REJECTED_AD' ||
      status === 'PHASE1_DONE' ||
      status === 'RUNNING_PHASE2'
    ) {
      return last;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  if (!last) throw new Error(`Job ${jobId}: no response within timeout`);
  throw new Error(`Job ${jobId} stuck at status ${last.status} after ${timeoutMs}ms`);
}

/**
 * Wait for a job to reach a terminal state. Fails the test when the job
 * lands on FAILED or REJECTED_AD — the terminal state itself is the assertion.
 */
export async function waitForJobTerminal(
  api: APIRequestContext,
  jobId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<JobRow> {
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const pollMs = opts.pollMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let last: JobRow | null = null;

  while (Date.now() < deadline) {
    const res = await api.get(`/api/jobs/${jobId}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ApiEnvelope<JobRow>;
    last = body.data;
    const status = last.status;
    if (
      status === 'COMPLETED' ||
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'REJECTED_AD'
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  if (!last) throw new Error(`Job ${jobId}: no response within timeout`);
  expect(last.status, `Job ${jobId} finished ${last.status}`).toBe('COMPLETED');
  return last;
}

/** Read the current e2e config row (default config), tolerating absence. */
export async function getDefaultConfig(
  api: APIRequestContext,
): Promise<Record<string, unknown> | null> {
  const res = await api.get('/api/config');
  if (!res.ok()) return null;
  const body = (await res.json()) as ApiEnvelope<Array<Record<string, unknown>>>;
  if (!body.success || !Array.isArray(body.data)) return null;
  return body.data.find((c) => c.isDefault) ?? body.data[0] ?? null;
}
