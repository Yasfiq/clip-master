import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db as prisma } from '@/server/db';

describe('API Integration Tests', () => {
  const TEST_JOB_ID = 'test-job-' + Date.now();
  const BASE_URL = 'http://localhost:3000';

  beforeAll(async () => {
    // Clean up test data
    await prisma.job.deleteMany({
      where: { id: { startsWith: 'test-job-' } },
    });
  });

  afterAll(async () => {
    // Clean up after tests
    await prisma.job.deleteMany({
      where: { id: { startsWith: 'test-job-' } },
    });
  });

  describe('POST /api/jobs', () => {
    it('creates job with YouTube URL', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'youtube',
          sourceUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBeDefined();
      expect(data.status).toBe('PENDING');
      expect(data.sourceType).toBe('youtube');
    });

    it('creates job with local file', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sourceType).toBe('local');
    });

    it('rejects invalid sourceType', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'invalid',
          sourceUrl: 'test',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('rejects missing required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/jobs', () => {
    it('returns job list', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('filters by status', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs?status=PENDING`);
      expect(response.status).toBe(200);

      const data = await response.json();
      data.forEach((job: any) => {
        expect(job.status).toBe('PENDING');
      });
    });
  });

  describe('GET /api/jobs/[id]', () => {
    it('returns 404 for non-existent job', async () => {
      const response = await fetch(`${BASE_URL}/api/jobs/non-existent-id`);
      expect(response.status).toBe(404);
    });

    it('returns job details', async () => {
      // Create a test job first
      const createResponse = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });
      const job = await createResponse.json();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(job.id);
      expect(data.status).toBeDefined();
    });
  });

  describe('POST /api/jobs/[id] (start/cancel)', () => {
    it('starts a pending job', async () => {
      // Create a test job
      const createResponse = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });
      const job = await createResponse.json();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('RUNNING');
    });

    it('rejects invalid action', async () => {
      const createResponse = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });
      const job = await createResponse.json();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/jobs/[id]/logs', () => {
    it('returns logs for a job', async () => {
      const createResponse = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });
      const job = await createResponse.json();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}/logs`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('filters logs by level', async () => {
      const createResponse = await fetch(`${BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'local',
          sourcePath: '/tmp/test.mp4',
        }),
      });
      const job = await createResponse.json();

      const response = await fetch(`${BASE_URL}/api/jobs/${job.id}/logs?level=error`);
      expect(response.status).toBe(200);

      const data = await response.json();
      data.forEach((log: any) => {
        expect(log.level).toBe('error');
      });
    });
  });

  describe('GET /api/config', () => {
    it('returns config list', async () => {
      const response = await fetch(`${BASE_URL}/api/config`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('POST /api/config', () => {
    it('upserts config value', async () => {
      const response = await fetch(`${BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'test_config_key',
          value: 'test_value',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.key).toBe('test_config_key');
      expect(data.value).toBe('test_value');
    });

    it('rejects invalid config', async () => {
      const response = await fetch(`${BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });
});
