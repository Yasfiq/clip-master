import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db as prisma } from '@/server/db';

/**
 * Integration tests against the live Next.js dev server (127.0.0.1:3000).
 * These assert the REST contract that src/types/ DTOs and the dashboard
 * components consume: a uniform { success: true, data } envelope on success
 * and { error: { code, message } } on failure.
 *
 * Run with the dev server up: npm run dev  (binds 127.0.0.1:3000)
 */
describe('API Integration Tests', () => {
  const TEST_PREFIX = 'test-job-';
  const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
  const FIXTURE_PATH = decodeURIComponent(
    new URL('../fixtures/test-source.mp4', import.meta.url).pathname,
  );

  /** POST a job and return the unwrapped job record. */
  async function createJob(body: Record<string, unknown> = {}) {
    const response = await fetch(`${BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: FIXTURE_PATH,
        ...body,
      }),
    });
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    return payload.data;
  }

  /** Unwrap an envelope response, asserting success flag. */
  async function unwrap(response: Response) {
    const payload = await response.json();
    expect(payload.success).toBe(true);
    return payload.data;
  }

  beforeAll(async () => {
    // Clean up test data
    await prisma.job.deleteMany({
      where: { id: { startsWith: TEST_PREFIX } },
    });
  });

  afterAll(async () => {
    // Clean up after tests
    await prisma.job.deleteMany({
      where: { id: { startsWith: TEST_PREFIX } },
    });
  });

  describe('POST /api/jobs', () => {
    it('creates job with URL (no sourceType field in DTO)', async () => {
      const job = await createJob({
        sourceUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('PENDING');
      expect(job.sourceUrl).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('rejects missing required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/jobs', () => {
    it('returns job list with envelope', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`);
      expect(response.status).toBe(200);

      const data = await unwrap(response);
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(typeof data.total).toBe('number');
    });

    it('filters by status', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs?status=PENDING`);
      const data = await unwrap(response);
      data.jobs.forEach((job: any) => {
        expect(job.status).toBe('PENDING');
      });
    });
  });

  describe('GET /api/jobs/[id]', () => {
    it('returns 404 for non-existent job', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs/non-existent-id`);
      expect(response.status).toBe(404);
      const payload = await response.json();
      expect(payload.error.code).toBe('JOB_NOT_FOUND');
    });

    it('returns job details', async () => {
      const job = await createJob();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`);
      expect(response.status).toBe(200);

      const data = await unwrap(response);
      expect(data.id).toBe(job.id);
      expect(data.status).toBeDefined();
    });
  });

  describe('POST /api/jobs/[id] (start/cancel)', () => {
    it('starts a pending job', async () => {
      const job = await createJob();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });

      expect(response.status).toBe(200);
      const data = await unwrap(response);
      expect(data.status).toBe('RUNNING_PHASE1');
    });

    it('rejects invalid action', async () => {
      const job = await createJob();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid' }),
      });

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /api/jobs/[id]/logs', () => {
    it('returns logs for a job', async () => {
      const job = await createJob();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}/logs`);
      expect(response.status).toBe(200);

      const data = await unwrap(response);
      expect(Array.isArray(data.logs)).toBe(true);
      expect(data.status).toBeDefined();
    });

    it('filters logs by level', async () => {
      const job = await createJob();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}/logs?level=error`);
      const data = await unwrap(response);
      data.logs.forEach((log: any) => {
        expect(log.level).toBe('error');
      });
    });
  });

  describe('GET /api/config', () => {
    it('returns config list', async () => {
      const response = await fetch(`${BASE_URL}/api/config`);
      expect(response.status).toBe(200);

      const data = await unwrap(response);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('POST /api/config', () => {
    it('upserts config by name', async () => {
      const name = `test-config-${Date.now()}`;
      const response = await fetch(`${BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: 'integration test config',
          targetDuration: 45,
        }),
      });

      expect(response.status).toBe(201);
      const data = await unwrap(response);
      expect(data.name).toBe(name);

      // Cleanup created config
      await prisma.pipelineConfig.deleteMany({ where: { name } });
    });

    it('rejects config without name', async () => {
      const response = await fetch(`${BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
