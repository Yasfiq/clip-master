import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  createZipArchive,
  bundleClipsToZip,
  cleanupZipFile,
  cleanupTempDir,
  formatCopywritingText,
  resolveClipVideoPath,
  ClipWithJobDetails,
} from '@/server/zipBundler';
import { generateClipCopywriting } from '@/pipeline/logic/copywriting';

const execFileAsync = promisify(execFile);

// Helper to list filenames inside a zip archive using unzip -l
async function listZipContents(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('/usr/bin/unzip', ['-l', zipPath]);
  const lines = stdout.split('\n');
  const files: string[] = [];
  let recording = false;

  for (const line of lines) {
    if (line.includes('----')) {
      if (!recording) {
        recording = true;
      } else {
        break; // End of file table
      }
      continue;
    }
    if (recording) {
      const match = line.trim().match(/\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/);
      if (match && match[1]) {
        files.push(match[1].trim());
      }
    }
  }

  return files;
}

// Helper to read a specific file from zip archive
async function readZipEntry(zipPath: string, entryName: string): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/unzip', ['-p', zipPath, entryName]);
  return stdout;
}

describe('zipBundler module', () => {
  const tempDirsToClean: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirsToClean) {
      await cleanupTempDir(dir);
    }
    tempDirsToClean.length = 0;
  });

  describe('createZipArchive', () => {
    it('creates a valid zip archive containing dummy files and in-memory content', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip_test_'));
      tempDirsToClean.push(tempDir);

      const dummyFile = path.join(tempDir, 'sample_dummy.mp4');
      await fs.writeFile(dummyFile, 'dummy video byte stream content');

      const bundle = await createZipArchive(
        [
          {
            sourcePath: dummyFile,
            archiveName: 'video_1.mp4',
          },
          {
            content: 'Title: Great Clip\nCaption: Awesome content',
            archiveName: 'video_1_copywriting.txt',
          },
          {
            content: JSON.stringify({ version: '1.0', total: 1 }),
            archiveName: 'manifest.json',
          },
        ],
        {
          outputDir: tempDir,
          identifier: 'test_job_123',
        },
      );

      // Verify ZIP file exists and has size
      const st = await fs.stat(bundle.zipPath);
      expect(st.size).toBeGreaterThan(0);
      expect(bundle.zipSize).toBe(st.size);

      // Verify files inside ZIP archive
      const contents = await listZipContents(bundle.zipPath);
      expect(contents).toContain('video_1.mp4');
      expect(contents).toContain('video_1_copywriting.txt');
      expect(contents).toContain('manifest.json');

      // Verify content of entries
      const txtContent = await readZipEntry(bundle.zipPath, 'video_1_copywriting.txt');
      expect(txtContent).toContain('Title: Great Clip');

      const manifestContent = JSON.parse(await readZipEntry(bundle.zipPath, 'manifest.json'));
      expect(manifestContent.total).toBe(1);

      // Verify cleanup
      await bundle.cleanup();
      await expect(fs.access(bundle.zipPath)).rejects.toThrow();
    });

    it('throws an error if entries array is empty', async () => {
      await expect(createZipArchive([])).rejects.toThrow(/Tidak ada file/);
    });

    it('throws an error if a source file does not exist', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip_test_'));
      tempDirsToClean.push(tempDir);

      await expect(
        createZipArchive(
          [
            {
              sourcePath: path.join(tempDir, 'non_existent_file.mp4'),
              archiveName: 'missing.mp4',
            },
          ],
          { outputDir: tempDir },
        ),
      ).rejects.toThrow(/File sumber tidak ditemukan/);
    });

    it('rejects directory traversal in archiveName', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip_test_'));
      tempDirsToClean.push(tempDir);

      await expect(
        createZipArchive(
          [
            {
              content: 'exploit',
              archiveName: '../outside.txt',
            },
          ],
          { outputDir: tempDir },
        ),
      ).rejects.toThrow(/path traversal/);
    });
  });

  describe('bundleClipsToZip', () => {
    it('bundles clips with mp4, copywriting txt, and manifest.json correctly', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip_bundle_test_'));
      tempDirsToClean.push(tempDir);

      const dummyVideo1 = path.join(tempDir, 'clip_01.mp4');
      await fs.writeFile(dummyVideo1, 'fake mp4 bytes for clip 1');

      const dummyClips: ClipWithJobDetails[] = [
        {
          id: 'clip_abc123',
          jobId: 'job_xyz789',
          isExported: true,
          exportPath: dummyVideo1,
          startTime: 10.5,
          endTime: 40.5,
          duration: 30.0,
          viralScore: 0.92,
          hookHeadline: 'Kisah Inspiratif Sukses',
          job: {
            id: 'job_xyz789',
            sourceTitle: 'Podcast Bisnis Anak Muda',
            sourceChannel: 'Kanal Inspirasi',
          },
        },
      ];

      const bundle = await bundleClipsToZip(dummyClips, {
        outputDir: tempDir,
        identifier: 'job_xyz789',
      });

      const contents = await listZipContents(bundle.zipPath);
      expect(contents.some((c) => c.endsWith('.mp4'))).toBe(true);
      expect(contents.some((c) => c.endsWith('_copywriting.txt'))).toBe(true);
      expect(contents).toContain('manifest.json');

      // Verify manifest content
      const manifestStr = await readZipEntry(bundle.zipPath, 'manifest.json');
      const manifest = JSON.parse(manifestStr);
      expect(manifest.totalClips).toBe(1);
      expect(manifest.clips[0].clipId).toBe('clip_abc123');
      expect(manifest.clips[0].viralScore).toBe(0.92);
      expect(manifest.clips[0].hashtags).toBeInstanceOf(Array);

      // Verify copywriting content
      const copyFileName = contents.find((c) => c.endsWith('_copywriting.txt'))!;
      const copyContent = await readZipEntry(bundle.zipPath, copyFileName);
      expect(copyContent).toContain('JUDUL:');
      expect(copyContent).toContain('YOUTUBE SHORTS');
      expect(copyContent).toContain('TIKTOK');
      expect(copyContent).toContain('INSTAGRAM REELS');
      expect(copyContent).toContain('HASHTAGS');
      expect(copyContent).toContain('ATRIBUSI');

      await bundle.cleanup();
    });

    it('throws an error if clips list is empty', async () => {
      await expect(bundleClipsToZip([])).rejects.toThrow(/Tidak ada klip/);
    });

    it('throws an error if no clips have a valid video file on disk', async () => {
      const dummyClips: ClipWithJobDetails[] = [
        {
          id: 'clip_missing',
          jobId: 'job_xyz789',
          isExported: true,
          exportPath: '/path/does/not/exist/missing.mp4',
          duration: 30.0,
          startTime: 0,
          endTime: 30,
        },
      ];

      await expect(bundleClipsToZip(dummyClips)).rejects.toThrow(/Tidak ada file video klip/);
    });
  });

  describe('formatCopywritingText', () => {
    it('generates structured copywriting text covering title, captions, hashtags, and attribution', () => {
      const copy = generateClipCopywriting({
        hookHeadline: 'Pelajaran Hidup Berharga',
        sourceTitle: 'Podcast Eksklusif',
        sourceChannel: 'Dedy Corbuzier',
        transcriptText:
          'Ketika gagal jangan langsung putus asa, belajar dari kesalahan itu kuncinya.',
        duration: 45,
      });

      const formatted = formatCopywritingText(copy);
      expect(formatted).toContain('JUDUL: Pelajaran Hidup Berharga');
      expect(formatted).toContain('--- YOUTUBE SHORTS ---');
      expect(formatted).toContain('--- TIKTOK ---');
      expect(formatted).toContain('--- INSTAGRAM REELS ---');
      expect(formatted).toContain('--- HASHTAGS ---');
      expect(formatted).toContain('--- ATRIBUSI ---');
      expect(formatted).toContain('Credit: Dedy Corbuzier');
    });
  });

  describe('resolveClipVideoPath', () => {
    it('resolves exportPath when it exists', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolve_test_'));
      tempDirsToClean.push(tempDir);

      const testFile = path.join(tempDir, 'export.mp4');
      await fs.writeFile(testFile, 'mp4 content');

      const resolved = await resolveClipVideoPath({ exportPath: testFile });
      expect(resolved).toBe(testFile);
    });

    it('returns null when no candidate files exist on disk', async () => {
      const resolved = await resolveClipVideoPath({
        exportPath: '/nowhere/none.mp4',
        editedPath: '/nowhere/none_edit.mp4',
        cutPath: '/nowhere/none_cut.mp4',
      });
      expect(resolved).toBeNull();
    });
  });

  describe('cleanupZipFile', () => {
    it('deletes an existing file and ignores missing file gracefully', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup_test_'));
      tempDirsToClean.push(tempDir);

      const target = path.join(tempDir, 'to_delete.zip');
      await fs.writeFile(target, 'zip data');

      await cleanupZipFile(target);
      await expect(fs.access(target)).rejects.toThrow();

      // Running again on non-existent file should not throw
      await expect(cleanupZipFile(target)).resolves.not.toThrow();
    });
  });

  describe('API Route Handlers', () => {
    it('GET /api/jobs/[id]/download-all returns 404 if job not found', async () => {
      const { GET } = await import('@/app/api/jobs/[id]/download-all/route');
      const req = new (await import('next/server')).NextRequest(
        'http://127.0.0.1:3000/api/jobs/job_does_not_exist/download-all',
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: 'job_does_not_exist' }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('JOB_NOT_FOUND');
    });

    it('GET /api/jobs/[id]/download-all returns 400 if job has no exported clips', async () => {
      const { db } = await import('@/server/db');
      const config = await db.pipelineConfig.findFirst();
      if (!config) return;

      const testJob = await db.job.create({
        data: {
          configId: config.id,
          sourceTitle: 'Job Tanpa Klip Ekspor',
          clips: {
            create: [
              {
                startTime: 0,
                endTime: 30,
                duration: 30,
                isExported: false, // Not exported!
              },
            ],
          },
        },
      });

      try {
        const { GET } = await import('@/app/api/jobs/[id]/download-all/route');
        const req = new (await import('next/server')).NextRequest(
          `http://127.0.0.1:3000/api/jobs/${testJob.id}/download-all`,
        );
        const res = await GET(req, {
          params: Promise.resolve({ id: testJob.id }),
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('VALIDATION_FAILED');
        expect(json.error.message).toContain('isExported: true');
      } finally {
        await db.clip.deleteMany({ where: { jobId: testJob.id } });
        await db.job.delete({ where: { id: testJob.id } });
      }
    });

    it('POST /api/clips/batch-download returns 400 if clipIds is empty or invalid', async () => {
      const { POST } = await import('@/app/api/clips/batch-download/route');
      const req = new (await import('next/server')).NextRequest(
        'http://127.0.0.1:3000/api/clips/batch-download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipIds: [] }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_FAILED');
    });

    it('POST /api/clips/batch-download returns 404 if requested clips are not in database', async () => {
      const { POST } = await import('@/app/api/clips/batch-download/route');
      const req = new (await import('next/server')).NextRequest(
        'http://127.0.0.1:3000/api/clips/batch-download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipIds: ['clip_not_found_123'] }),
        },
      );
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('JOB_NOT_FOUND');
    });
  });
});
