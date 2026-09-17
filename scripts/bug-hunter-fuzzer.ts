import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';

interface TestResult {
  id: string;
  category: string;
  endpoint: string;
  method: string;
  description: string;
  status: number;
  expectedStatus?: number | number[];
  contentType: string;
  body: any;
  rawBody: string;
  envelopeConforms: boolean;
  issues: string[];
}

const results: TestResult[] = [];

function checkEnvelope(body: any, status: number): { conforms: boolean; issues: string[] } {
  const issues: string[] = [];
  if (status >= 200 && status < 300) {
    // For successful responses, many endpoints return { success: true, data: ... }
    return { conforms: true, issues };
  }

  // For errors (4xx / 5xx):
  if (!body || typeof body !== 'object') {
    issues.push(`Response body is not a JSON object (type: ${typeof body})`);
    return { conforms: false, issues };
  }

  if (body.success !== false) {
    issues.push(`Expected 'success: false', got: ${JSON.stringify(body.success)}`);
  }

  if (!body.error || typeof body.error !== 'object') {
    issues.push(`Expected 'error' object, got: ${JSON.stringify(body.error)}`);
  } else {
    if (typeof body.error.code !== 'string' || !body.error.code) {
      issues.push(
        `Expected 'error.code' to be a non-empty string, got: ${JSON.stringify(body.error.code)}`,
      );
    }
    if (typeof body.error.message !== 'string' || !body.error.message) {
      issues.push(
        `Expected 'error.message' to be a non-empty string, got: ${JSON.stringify(body.error.message)}`,
      );
    }
    // Check for stack trace leak
    if (
      body.error.stack ||
      JSON.stringify(body).includes(' at ') ||
      JSON.stringify(body).includes('node_modules')
    ) {
      issues.push(`Potential stack trace or internal path leaked in error response`);
    }
  }

  return { conforms: issues.length === 0, issues };
}

async function runTest(opts: {
  id: string;
  category: string;
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  rawPayload?: string;
  expectedStatus?: number | number[];
  description: string;
}) {
  const method = opts.method || 'GET';
  const url = `${BASE_URL}${opts.endpoint}`;
  const headers: Record<string, string> = { ...opts.headers };

  let reqBody: any = undefined;
  if (opts.rawPayload !== undefined) {
    reqBody = opts.rawPayload;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    reqBody = JSON.stringify(opts.body);
  }

  let status = 0;
  let contentType = '';
  let rawBody = '';
  let parsedBody: any = null;
  const issues: string[] = [];

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: reqBody,
    });
    status = res.status;
    contentType = res.headers.get('content-type') || '';
    rawBody = await res.text();

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }

    if (opts.expectedStatus) {
      const expected = Array.isArray(opts.expectedStatus)
        ? opts.expectedStatus
        : [opts.expectedStatus];
      if (!expected.includes(status)) {
        issues.push(`HTTP status ${status} not in expected [${expected.join(', ')}]`);
      }
    }

    if (contentType.includes('text/html') && status >= 400) {
      issues.push(`Returned HTML instead of JSON for API route error (${status})`);
    }

    if (status >= 400 && parsedBody) {
      const envCheck = checkEnvelope(parsedBody, status);
      if (!envCheck.conforms) {
        issues.push(...envCheck.issues);
      }
    } else if (status >= 400 && !parsedBody) {
      issues.push(`Non-JSON response for error ${status}: "${rawBody.slice(0, 100)}..."`);
    }

    const envelopeConforms = status < 400 ? true : checkEnvelope(parsedBody, status).conforms;

    const result: TestResult = {
      id: opts.id,
      category: opts.category,
      endpoint: opts.endpoint,
      method,
      description: opts.description,
      status,
      expectedStatus: opts.expectedStatus,
      contentType,
      body: parsedBody,
      rawBody: rawBody.slice(0, 300),
      envelopeConforms,
      issues,
    };

    results.push(result);
    const mark = issues.length === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(
      `[${mark}] ${opts.id}: ${method} ${opts.endpoint} -> ${status} ${issues.length ? `(${issues.join('; ')})` : ''}`,
    );
  } catch (err: any) {
    const result: TestResult = {
      id: opts.id,
      category: opts.category,
      endpoint: opts.endpoint,
      method,
      description: opts.description,
      status: 0,
      expectedStatus: opts.expectedStatus,
      contentType: '',
      body: null,
      rawBody: err.message,
      envelopeConforms: false,
      issues: [`Fetch failed: ${err.message}`],
    };
    results.push(result);
    console.log(`[✗ CRASH] ${opts.id}: ${method} ${opts.endpoint} -> ${err.message}`);
  }
}

async function main() {
  console.log(`=== Starting Systematic API Bug Hunting on ${BASE_URL} ===\n`);

  // ==========================================
  // SECTION 1: Invalid or Malformed IDs
  // ==========================================
  console.log('--- 1. Testing Invalid / Non-Existent IDs ---');
  await runTest({
    id: 'ID-01',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET non-existent job ID',
  });

  await runTest({
    id: 'ID-02',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id',
    method: 'DELETE',
    expectedStatus: 404,
    description: 'DELETE non-existent job ID',
  });

  await runTest({
    id: 'ID-03',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id/cancel',
    method: 'POST',
    expectedStatus: 404,
    description: 'POST cancel on non-existent job ID',
  });

  await runTest({
    id: 'ID-04',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id/logs',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET logs on non-existent job ID',
  });

  await runTest({
    id: 'ID-05',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/file',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET file on non-existent clip ID',
  });

  await runTest({
    id: 'ID-06A',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/reburn',
    method: 'POST',
    expectedStatus: 404,
    description: 'POST reburn (without hyphen) on non-existent clip ID',
  });

  await runTest({
    id: 'ID-06B',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/re-burn',
    method: 'POST',
    expectedStatus: 404,
    description: 'POST re-burn (with hyphen) on non-existent clip ID',
  });

  await runTest({
    id: 'ID-07',
    category: 'Invalid IDs',
    endpoint: '/api/campaigns/non-existent-id',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET non-existent campaign ID (non-existent route)',
  });

  await runTest({
    id: 'ID-08',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET non-existent clip ID directly',
  });

  await runTest({
    id: 'ID-09',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id/phase2',
    method: 'POST',
    expectedStatus: 404,
    description: 'POST phase2 on non-existent job ID',
  });

  await runTest({
    id: 'ID-10',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id/download-all',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET download-all on non-existent job ID',
  });

  await runTest({
    id: 'ID-11',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/non-existent-id/schedule',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET schedule on non-existent job ID',
  });

  await runTest({
    id: 'ID-12',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/copywriting',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET copywriting on non-existent clip ID',
  });

  await runTest({
    id: 'ID-13',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/studio',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET studio on non-existent clip ID',
  });

  await runTest({
    id: 'ID-14',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/subtitles',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET subtitles on non-existent clip ID',
  });

  await runTest({
    id: 'ID-15',
    category: 'Invalid IDs',
    endpoint: '/api/clips/non-existent-id/tts',
    method: 'GET',
    expectedStatus: 404,
    description: 'GET tts on non-existent clip ID',
  });

  // Malformed ID strings (SQL injection / path traversal attempts)
  await runTest({
    id: 'ID-16',
    category: 'Invalid IDs',
    endpoint: '/api/jobs/../../../etc/passwd',
    method: 'GET',
    expectedStatus: [400, 404],
    description: 'GET job with path traversal in ID',
  });

  await runTest({
    id: 'ID-17',
    category: 'Invalid IDs',
    endpoint: "/api/jobs/' OR '1'='1",
    method: 'GET',
    expectedStatus: [400, 404],
    description: 'GET job with SQL injection syntax in ID',
  });

  // ==========================================
  // SECTION 2: Malformed JSON Payloads & Missing Fields
  // ==========================================
  console.log('\n--- 2. Testing Malformed JSON Payloads & Missing Fields ---');

  await runTest({
    id: 'JSON-01',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'POST /api/jobs with empty payload {}',
  });

  await runTest({
    id: 'JSON-02',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourceUrl: 'ftp://ftp.example.com/movie.mp4' },
    expectedStatus: 400,
    description: 'POST /api/jobs with invalid URL scheme (ftp://)',
  });

  await runTest({
    id: 'JSON-03',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourceUrl: 'not_a_valid_url' },
    expectedStatus: 400,
    description: 'POST /api/jobs with malformed URL string',
  });

  await runTest({
    id: 'JSON-04',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourceUrl: 12345 },
    expectedStatus: 400,
    description: 'POST /api/jobs with numeric sourceUrl',
  });

  await runTest({
    id: 'JSON-05',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourceUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ', sourcePath: '/tmp/test.mp4' },
    expectedStatus: 400,
    description: 'POST /api/jobs with both sourceUrl and sourcePath',
  });

  await runTest({
    id: 'JSON-06',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourcePath: 'relative/path/test.mp4' },
    expectedStatus: 400,
    description: 'POST /api/jobs with relative filesystem sourcePath',
  });

  await runTest({
    id: 'JSON-07',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourcePath: '/tmp/non_existent_file_xyz_12345.mp4' },
    expectedStatus: [400, 500],
    description: 'POST /api/jobs with non-existent sourcePath',
  });

  await runTest({
    id: 'JSON-08',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    rawPayload: '{"sourceUrl": "https://example.com',
    headers: { 'Content-Type': 'application/json' },
    expectedStatus: 400,
    description: 'POST /api/jobs with malformed JSON syntax',
  });

  // Excessive payload test (5MB of JSON padding)
  await runTest({
    id: 'JSON-09',
    category: 'Payload Validation',
    endpoint: '/api/jobs',
    method: 'POST',
    body: { sourceUrl: 'https://example.com', junk: 'A'.repeat(5 * 1024 * 1024) },
    expectedStatus: [400, 413, 500],
    description: 'POST /api/jobs with excessive payload (5MB)',
  });

  // Batch download validation
  await runTest({
    id: 'JSON-10',
    category: 'Payload Validation',
    endpoint: '/api/clips/batch-download',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'POST /api/clips/batch-download with empty body',
  });

  await runTest({
    id: 'JSON-11',
    category: 'Payload Validation',
    endpoint: '/api/clips/batch-download',
    method: 'POST',
    body: { clipIds: [] },
    expectedStatus: 400,
    description: 'POST /api/clips/batch-download with empty array clipIds',
  });

  await runTest({
    id: 'JSON-12',
    category: 'Payload Validation',
    endpoint: '/api/clips/batch-download',
    method: 'POST',
    body: { clipIds: 'not-an-array' },
    expectedStatus: 400,
    description: 'POST /api/clips/batch-download with string clipIds',
  });

  await runTest({
    id: 'JSON-13',
    category: 'Payload Validation',
    endpoint: '/api/clips/batch-download',
    method: 'POST',
    body: { clipIds: ['fake-id-1', 'fake-id-2'] },
    expectedStatus: 404,
    description: 'POST /api/clips/batch-download with non-existent clip IDs',
  });

  await runTest({
    id: 'JSON-14',
    category: 'Payload Validation',
    endpoint: '/api/clips/batch-download',
    method: 'POST',
    rawPayload: '{"clipIds": [',
    headers: { 'Content-Type': 'application/json' },
    expectedStatus: 400,
    description: 'POST /api/clips/batch-download with malformed JSON',
  });

  // Campaigns endpoint fuzzing
  await runTest({
    id: 'JSON-15',
    category: 'Payload Validation',
    endpoint: '/api/campaigns',
    method: 'POST',
    body: { title: '', payout: -100, platform: 'invalid_platform' },
    expectedStatus: [400, 404],
    description: 'POST /api/campaigns with empty title, negative payout, invalid platform',
  });

  await runTest({
    id: 'JSON-16',
    category: 'Payload Validation',
    endpoint: '/api/campaigns',
    method: 'POST',
    rawPayload: '{ invalid_json',
    headers: { 'Content-Type': 'application/json' },
    expectedStatus: [400, 404],
    description: 'POST /api/campaigns with malformed JSON syntax',
  });

  // Watcher system endpoints
  await runTest({
    id: 'JSON-17',
    category: 'Payload Validation',
    endpoint: '/api/system/watcher',
    method: 'POST',
    body: { action: 'unknown_invalid_action' },
    expectedStatus: 400,
    description: 'POST /api/system/watcher with unknown action',
  });

  await runTest({
    id: 'JSON-18',
    category: 'Payload Validation',
    endpoint: '/api/system/watcher',
    method: 'POST',
    body: { action: 12345 },
    expectedStatus: 400,
    description: 'POST /api/system/watcher with non-string action',
  });

  await runTest({
    id: 'JSON-19',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: { action: 'unknown_action' },
    expectedStatus: 400,
    description: 'POST /api/system/youtube-watcher with unknown action',
  });

  await runTest({
    id: 'JSON-20',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: { action: 'add_channel' },
    expectedStatus: 400,
    description: 'POST /api/system/youtube-watcher with missing channel URL/handle',
  });

  await runTest({
    id: 'JSON-21',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: { action: 'add_channel', channel: '   ' },
    expectedStatus: 400,
    description: 'POST /api/system/youtube-watcher with whitespace channel',
  });

  await runTest({
    id: 'JSON-22',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: {
      action: 'add_channel',
      channel: 'https://youtube.com/@this_channel_definitely_does_not_exist_999999',
    },
    expectedStatus: 400,
    description: 'POST /api/system/youtube-watcher with non-existent channel URL',
  });

  await runTest({
    id: 'JSON-23',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: { action: 'remove_channel' },
    expectedStatus: 400,
    description: 'POST /api/system/youtube-watcher remove_channel without ID',
  });

  await runTest({
    id: 'JSON-24',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher',
    method: 'POST',
    body: { action: 'remove_channel', id: 'fake_channel_id' },
    expectedStatus: [400, 404],
    description: 'POST /api/system/youtube-watcher remove_channel with non-existent ID',
  });

  await runTest({
    id: 'JSON-25',
    category: 'Payload Validation',
    endpoint: '/api/system/youtube-watcher?id=non_existent_id',
    method: 'DELETE',
    expectedStatus: [400, 404],
    description: 'DELETE /api/system/youtube-watcher with non-existent ID',
  });

  // Config validation
  await runTest({
    id: 'JSON-26',
    category: 'Payload Validation',
    endpoint: '/api/config',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'POST /api/config with empty payload (missing name)',
  });

  await runTest({
    id: 'JSON-27',
    category: 'Payload Validation',
    endpoint: '/api/config',
    method: 'POST',
    body: { name: 'TestConfig', adScoreThreshold: 9999 },
    expectedStatus: 400,
    description: 'POST /api/config with adScoreThreshold out of range (>1.0)',
  });

  // Subtitles update validation
  await runTest({
    id: 'JSON-28',
    category: 'Payload Validation',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/subtitles',
    method: 'PUT',
    body: { cues: 'not-an-array' },
    expectedStatus: 400,
    description: 'PUT /api/clips/:id/subtitles with cues as string',
  });

  // ==========================================
  // SECTION 3: Boundary Query Parameters
  // ==========================================
  console.log('\n--- 3. Testing Boundary Query Parameters ---');

  await runTest({
    id: 'QUERY-01',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?maxClipsPerDay=0',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with maxClipsPerDay=0',
  });

  await runTest({
    id: 'QUERY-02',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?maxClipsPerDay=-5',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with negative maxClipsPerDay',
  });

  await runTest({
    id: 'QUERY-03',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?maxClipsPerDay=999999999',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with huge maxClipsPerDay',
  });

  await runTest({
    id: 'QUERY-04',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?maxClipsPerDay=abc',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with non-numeric maxClipsPerDay',
  });

  await runTest({
    id: 'QUERY-05',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?platform=myspace,friendster',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with invalid platforms',
  });

  await runTest({
    id: 'QUERY-06',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?startDate=not-a-date',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with malformed startDate',
  });

  await runTest({
    id: 'QUERY-07',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule?startDate=2025-02-31',
    method: 'GET',
    expectedStatus: [200, 400],
    description: 'GET /api/clips/schedule with impossible calendar date (Feb 31)',
  });

  await runTest({
    id: 'QUERY-08',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule/export?format=unsupported_format',
    method: 'GET',
    expectedStatus: 400,
    description: 'GET /api/clips/schedule/export with unsupported format',
  });

  await runTest({
    id: 'QUERY-09',
    category: 'Query Parameters',
    endpoint: '/api/clips/schedule/export?format=xml',
    method: 'GET',
    expectedStatus: 400,
    description: 'GET /api/clips/schedule/export with xml format',
  });

  await runTest({
    id: 'QUERY-10',
    category: 'Query Parameters',
    endpoint: '/api/campaigns?status=invalid_status',
    method: 'GET',
    expectedStatus: [400, 404],
    description: 'GET /api/campaigns?status=invalid_status',
  });

  await runTest({
    id: 'QUERY-11',
    category: 'Query Parameters',
    endpoint: '/api/jobs?status=INVALID_STATUS',
    method: 'GET',
    expectedStatus: 400,
    description: 'GET /api/jobs?status=INVALID_STATUS',
  });

  await runTest({
    id: 'QUERY-12',
    category: 'Query Parameters',
    endpoint: '/api/jobs?limit=-10&offset=-5',
    method: 'GET',
    expectedStatus: 200,
    description: 'GET /api/jobs with negative limit and offset (boundary clamping test)',
  });

  await runTest({
    id: 'QUERY-13',
    category: 'Query Parameters',
    endpoint: '/api/jobs?limit=999999999',
    method: 'GET',
    expectedStatus: 200,
    description: 'GET /api/jobs with huge limit (boundary clamping test)',
  });

  await runTest({
    id: 'QUERY-14',
    category: 'Query Parameters',
    endpoint: '/api/jobs/cmu5mcfm20000vk81anykdr2m/logs?since=invalid-date',
    method: 'GET',
    expectedStatus: 400,
    description: 'GET /api/jobs/:id/logs with invalid since timestamp',
  });

  await runTest({
    id: 'QUERY-15',
    category: 'Query Parameters',
    endpoint: '/api/clips?exported=not_a_boolean',
    method: 'GET',
    expectedStatus: 200,
    description: 'GET /api/clips with invalid exported boolean query param',
  });

  // ==========================================
  // SECTION 4: Missing Files, Range Headers & Media Streaming
  // ==========================================
  console.log('\n--- 4. Testing File Streaming & Range Boundary Edge Cases ---');

  await runTest({
    id: 'MEDIA-01',
    category: 'Media Streaming',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/file',
    method: 'GET',
    headers: { Range: 'bytes=0-1023' },
    expectedStatus: 206,
    description: 'GET /api/clips/:id/file with valid partial range (0-1023)',
  });

  await runTest({
    id: 'MEDIA-02',
    category: 'Media Streaming',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/file',
    method: 'GET',
    headers: { Range: 'bytes=5000-1000' }, // end < start
    expectedStatus: 416,
    description: 'GET /api/clips/:id/file with invalid range where start > end',
  });

  await runTest({
    id: 'MEDIA-03',
    category: 'Media Streaming',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/file',
    method: 'GET',
    headers: { Range: 'bytes=9999999999-' }, // start >= size
    expectedStatus: 416,
    description: 'GET /api/clips/:id/file with out-of-bounds start range',
  });

  await runTest({
    id: 'MEDIA-04',
    category: 'Media Streaming',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/file',
    method: 'GET',
    headers: { Range: 'bytes=-500' }, // suffix range
    expectedStatus: 206,
    description: 'GET /api/clips/:id/file with suffix range (last 500 bytes)',
  });

  await runTest({
    id: 'MEDIA-05',
    category: 'Media Streaming',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/file',
    method: 'GET',
    headers: { Range: 'bytes=malformed_range' },
    expectedStatus: 200, // Should ignore invalid header and return full file or 416
    description: 'GET /api/clips/:id/file with completely malformed Range header',
  });

  await runTest({
    id: 'MEDIA-06',
    category: 'Media Streaming',
    endpoint: '/api/settings/logo/file',
    method: 'GET',
    expectedStatus: [200, 404],
    description: 'GET /api/settings/logo/file when logo does not exist or exists',
  });

  // Re-burn concurrency / job running state
  await runTest({
    id: 'MEDIA-07',
    category: 'Media Processing',
    endpoint: '/api/clips/clip_cmu5mcfm20000vk81anykdr2m_000/re-burn',
    method: 'POST',
    body: {},
    expectedStatus: 409,
    description: 'POST /api/clips/:id/re-burn while job is RUNNING_PHASE2 (conflict guard)',
  });

  // ==========================================
  // SECTION 5: Method Not Allowed (405) Testing
  // ==========================================
  console.log('\n--- 5. Testing Method Not Allowed (405) ---');

  await runTest({
    id: 'METHOD-01',
    category: 'HTTP Methods',
    endpoint: '/api/jobs',
    method: 'PUT',
    expectedStatus: 405,
    description: 'PUT /api/jobs (endpoint only allows GET, POST)',
  });

  await runTest({
    id: 'METHOD-02',
    category: 'HTTP Methods',
    endpoint: '/api/jobs',
    method: 'DELETE',
    expectedStatus: 405,
    description: 'DELETE /api/jobs (collection deletion not allowed)',
  });

  await runTest({
    id: 'METHOD-03',
    category: 'HTTP Methods',
    endpoint: '/api/clips/batch-download',
    method: 'GET',
    expectedStatus: 405,
    description: 'GET /api/clips/batch-download (only allows POST)',
  });

  await runTest({
    id: 'METHOD-04',
    category: 'HTTP Methods',
    endpoint: '/api/clips/schedule',
    method: 'POST',
    expectedStatus: 405,
    description: 'POST /api/clips/schedule (only allows GET)',
  });

  await runTest({
    id: 'METHOD-05',
    category: 'HTTP Methods',
    endpoint: '/api/system/status',
    method: 'POST',
    expectedStatus: 405,
    description: 'POST /api/system/status (only allows GET)',
  });

  await runTest({
    id: 'METHOD-06',
    category: 'HTTP Methods',
    endpoint: '/api/jobs/cmu5mcfm20000vk81anykdr2m/cancel',
    method: 'GET',
    expectedStatus: 405,
    description: 'GET /api/jobs/:id/cancel (only allows POST)',
  });

  await runTest({
    id: 'METHOD-07',
    category: 'HTTP Methods',
    endpoint: '/api/config',
    method: 'DELETE',
    expectedStatus: 405,
    description: 'DELETE /api/config (only allows GET, POST)',
  });

  console.log('\n==========================================');
  console.log('=== TEST SUITE EXECUTION FINISHED ===');
  console.log('==========================================');

  const failedTests = results.filter((r) => r.issues.length > 0);
  const passedTests = results.filter((r) => r.issues.length === 0);

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passedTests.length}`);
  console.log(`Failed / Issues Discovered: ${failedTests.length}\n`);

  fs.writeFileSync(
    path.join(process.cwd(), 'test-results-fuzzer.json'),
    JSON.stringify(
      {
        results,
        summary: { total: results.length, passed: passedTests.length, failed: failedTests.length },
      },
      null,
      2,
    ),
  );

  console.log('Full results written to test-results-fuzzer.json');
}

main().catch(console.error);
