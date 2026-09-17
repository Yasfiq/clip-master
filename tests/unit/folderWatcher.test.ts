import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  isVideoFile,
  checkFileStability,
  generateSafeSourceFilename,
  processIncomingFile,
  startFolderWatcher,
  stopFolderWatcher,
  isWatcherActive,
  getWatcherStatus,
  _resetWatcherStateForTesting,
  SUPPORTED_VIDEO_EXTENSIONS,
} from '../../src/server/folderWatcher';
import { parseSourceFileName } from '../../src/pipeline/logic/sourceNaming';
import { db } from '../../src/server/db';
import { JobStatus } from '@prisma/client';

describe('Folder Watcher: File Detection & Filtering', () => {
  it('accepts all supported video extensions regardless of case', () => {
    const validFiles = [
      'video.mp4',
      'VIDEO.MP4',
      'clip.mov',
      'movie.MOV',
      'sample.mkv',
      'recording.webm',
      'test.avi',
      'Video_From_Channel_Title.MKV',
    ];

    for (const f of validFiles) {
      expect(isVideoFile(f)).toBe(true);
    }
  });

  it('rejects unsupported extensions and non-video files', () => {
    const invalidFiles = [
      'image.png',
      'doc.pdf',
      'audio.mp3',
      'notes.txt',
      'data.json',
      'archive.zip',
    ];

    for (const f of invalidFiles) {
      expect(isVideoFile(f)).toBe(false);
    }
  });

  it('rejects temporary, partial, and hidden files', () => {
    const tempFiles = [
      'video.mp4.part',
      'video.mp4.crdownload',
      'video.mp4.tmp',
      'video.mp4.ytdl',
      '.hidden_video.mp4',
      '.DS_Store',
      'video.mp4~',
    ];

    for (const f of tempFiles) {
      expect(isVideoFile(f)).toBe(false);
    }
  });
});

describe('Folder Watcher: Debounce & File Stability Check', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns true when file size is stable and file is readable', async () => {
    const filePath = path.join(tempDir, 'stable_video.mp4');
    await fs.writeFile(filePath, Buffer.from('video-content-bytes-1234567890'));

    const isStable = await checkFileStability(filePath, {
      intervalMs: 25,
      maxAttempts: 5,
    });

    expect(isStable).toBe(true);
  });

  it('returns false when file size is 0 bytes (still empty / creating)', async () => {
    const filePath = path.join(tempDir, 'empty_video.mp4');
    await fs.writeFile(filePath, Buffer.alloc(0));

    const isStable = await checkFileStability(filePath, {
      intervalMs: 20,
      maxAttempts: 3,
    });

    expect(isStable).toBe(false);
  });

  it('returns false for non-existent file without crashing', async () => {
    const filePath = path.join(tempDir, 'non_existent.mp4');

    const isStable = await checkFileStability(filePath, {
      intervalMs: 15,
      maxAttempts: 2,
    });

    expect(isStable).toBe(false);
  });

  it('detects when file finishes copying after size changes', async () => {
    const filePath = path.join(tempDir, 'growing_video.mp4');
    await fs.writeFile(filePath, Buffer.from('chunk1'));

    // Append more data while checking is in progress to simulate ongoing copy
    setTimeout(async () => {
      await fs.appendFile(filePath, Buffer.from('chunk2_finish')).catch(() => {});
    }, 10);

    const isStable = await checkFileStability(filePath, {
      intervalMs: 35,
      maxAttempts: 6,
    });

    expect(isStable).toBe(true);
    const finalStats = await fs.stat(filePath);
    expect(finalStats.size).toBe(Buffer.from('chunk1chunk2_finish').length);
  });
});

describe('Folder Watcher: Video Name Parsing & Safe Naming', () => {
  it('parses Video_From_[Channel]_[Title].mp4 pattern accurately', () => {
    const filename = 'Video_From_Raditya Dika_Podcast Bersama Cania.mp4';
    const parsed = parseSourceFileName(filename);

    expect(parsed.isCustomPattern).toBe(true);
    expect(parsed.sourceChannel).toBe('Raditya Dika');
    expect(parsed.sourceTitle).toBe('Podcast Bersama Cania');
    expect(parsed.attributionText).toBe('Sumber: Raditya Dika');
  });

  it('falls back gracefully on regular video filenames', () => {
    const filename = 'kursus_kilat_ai_coding.mp4';
    const parsed = parseSourceFileName(filename);

    expect(parsed.isCustomPattern).toBe(false);
    expect(parsed.sourceChannel).toBeUndefined();
    expect(parsed.sourceTitle).toBe('Kursus Kilat Ai Coding');
    expect(parsed.attributionText).toBe('Sumber: Kursus Kilat Ai Coding');
  });

  it('generates safe source filename with timestamp and UUID prefix', () => {
    const original = 'Video_From_Curhat Bang_Ivan Tanjaya.mkv';
    const safeName = generateSafeSourceFilename(original);

    expect(safeName).toContain('.mkv');
    expect(safeName).toMatch(/^\d+_[a-f0-9]+_Video_From_Curhat Bang_Ivan Tanjaya\.mkv$/);
  });
});

describe('Folder Watcher: Ingestion & Lifecycle Workflow', () => {
  let tempIncoming: string;
  let tempSources: string;

  beforeEach(async () => {
    await _resetWatcherStateForTesting();
    tempIncoming = await fs.mkdtemp(path.join(os.tmpdir(), 'incoming-test-'));
    tempSources = await fs.mkdtemp(path.join(os.tmpdir(), 'sources-test-'));
  });

  afterEach(async () => {
    await _resetWatcherStateForTesting();
    await fs.rm(tempIncoming, { recursive: true, force: true });
    await fs.rm(tempSources, { recursive: true, force: true });
  });

  it('moves incoming video to sources and creates PENDING job in DB', async () => {
    const filename = 'Video_From_Deddy Corbuzier_Bongkar Kasus Viral.mp4';
    const srcFilePath = path.join(tempIncoming, filename);
    await fs.writeFile(srcFilePath, Buffer.from('fake-video-payload-content-12345'));

    // Process incoming file with autoStartJob disabled so background runner isn't invoked during unit test
    const record = await processIncomingFile(filename, {
      incomingPath: tempIncoming,
      sourcesPath: tempSources,
      stabilityIntervalMs: 25,
      maxStabilityAttempts: 5,
      autoStartJob: false,
    });

    expect(record).not.toBeNull();
    expect(record!.status).toBe('SUCCESS');
    expect(record!.sourceChannel).toBe('Deddy Corbuzier');
    expect(record!.sourceTitle).toBe('Bongkar Kasus Viral');
    expect(record!.jobId).toBeDefined();

    // Verify file moved out of incoming
    const incomingExists = await fs
      .access(srcFilePath)
      .then(() => true)
      .catch(() => false);
    expect(incomingExists).toBe(false);

    // Verify file now exists in sources
    const destFilePath = record!.destinationPath!;
    const sourcesExists = await fs
      .access(destFilePath)
      .then(() => true)
      .catch(() => false);
    expect(sourcesExists).toBe(true);

    // Verify Job in DB
    const dbJob = await db.job.findUnique({ where: { id: record!.jobId! } });
    expect(dbJob).not.toBeNull();
    expect(dbJob!.status).toBe(JobStatus.PENDING);
    expect(dbJob!.sourceTitle).toBe('Bongkar Kasus Viral');
    expect(dbJob!.sourceChannel).toBe('Deddy Corbuzier');
    expect(dbJob!.sourceFilename).toBe(filename);

    // Cleanup created job
    await db.job.delete({ where: { id: record!.jobId! } });
  });

  it('controls watcher daemon lifecycle via start, stop, and status getters', async () => {
    expect(isWatcherActive()).toBe(false);

    await startFolderWatcher({
      incomingPath: tempIncoming,
      sourcesPath: tempSources,
      pollIntervalMs: 5000,
    });

    expect(isWatcherActive()).toBe(true);
    const status = getWatcherStatus();
    expect(status.active).toBe(true);
    expect(status.incomingPath).toBe(tempIncoming);
    expect(status.sourcesPath).toBe(tempSources);
    expect(status.supportedExtensions).toEqual(SUPPORTED_VIDEO_EXTENSIONS);

    await stopFolderWatcher();
    expect(isWatcherActive()).toBe(false);
  });
});

describe('Folder Watcher: API Route Handlers (/api/system/watcher)', () => {
  afterEach(async () => {
    await _resetWatcherStateForTesting();
  });

  it('GET returns valid watcher status payload', async () => {
    const { GET } = await import('../../src/app/api/system/watcher/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://127.0.0.1:3000/api/system/watcher');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.active).toBe(false);
    expect(body.data.supportedExtensions).toEqual(SUPPORTED_VIDEO_EXTENSIONS);
    expect(Array.isArray(body.data.processedFiles)).toBe(true);
  });

  it('POST controls and toggles watcher active state', async () => {
    const { POST } = await import('../../src/app/api/system/watcher/route');
    const { NextRequest } = await import('next/server');

    // 1. Explicit start
    const startReq = new NextRequest('http://127.0.0.1:3000/api/system/watcher', {
      method: 'POST',
      body: JSON.stringify({ active: true }),
    });
    const startRes = await POST(startReq);
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.success).toBe(true);
    expect(startBody.data.active).toBe(true);
    expect(isWatcherActive()).toBe(true);

    // 2. Explicit stop
    const stopReq = new NextRequest('http://127.0.0.1:3000/api/system/watcher', {
      method: 'POST',
      body: JSON.stringify({ action: 'stop' }),
    });
    const stopRes = await POST(stopReq);
    expect(stopRes.status).toBe(200);
    const stopBody = await stopRes.json();
    expect(stopBody.success).toBe(true);
    expect(stopBody.data.active).toBe(false);
    expect(isWatcherActive()).toBe(false);

    // 3. Toggle
    const toggleReq = new NextRequest('http://127.0.0.1:3000/api/system/watcher', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const toggleRes = await POST(toggleReq);
    expect(toggleRes.status).toBe(200);
    const toggleBody = await toggleRes.json();
    expect(toggleBody.success).toBe(true);
    expect(toggleBody.data.active).toBe(true);
    expect(isWatcherActive()).toBe(true);

    await stopFolderWatcher();
  });
});
