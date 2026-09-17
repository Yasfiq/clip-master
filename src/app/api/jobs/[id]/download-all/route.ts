import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { db } from '@/server/db';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';
import { bundleClipsToZip } from '@/server/zipBundler';

/**
 * GET /api/jobs/[id]/download-all
 *
 * Downloads all clips for a job that have `isExported: true`.
 * Returns a streamed ZIP archive containing:
 * - Each clip's MP4 video file
 * - Each clip's copywriting TXT file (Title, Hook, Hashtags, Attribution, Platform captions)
 * - manifest.json summarizing the metadata of all included clips
 *
 * Headers:
 * Content-Disposition: attachment; filename="Clips_[JobTitle]_[JobId].zip"
 * Content-Type: application/zip
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const job = await db.job.findUnique({
      where: { id },
      include: {
        clips: {
          where: { isExported: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!job) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} tidak ditemukan`);
    }

    if (!job.clips || job.clips.length === 0) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        `Tidak ada klip yang berstatus diekspor (isExported: true) pada job ${id}`,
      );
    }

    const safeJobTitle = (job.sourceTitle || job.sourceFilename || 'Job')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    let bundle;
    try {
      bundle = await bundleClipsToZip(
        job.clips.map((c) => ({ ...c, job })),
        {
          identifier: job.id,
          jobTitle: job.sourceTitle || undefined,
        },
      );
    } catch (err: any) {
      logger.error(`Failed to bundle clips for job ${id}: ${err.message}`);
      return apiError(ErrorCode.INTERNAL, `Gagal membuat arsip ZIP: ${err.message}`);
    }

    const filename = `Clips_${safeJobTitle}_${job.id}.zip`;
    const stream = fs.createReadStream(bundle.zipPath);

    stream.on('close', async () => {
      await bundle.cleanup();
    });
    stream.on('error', async (err) => {
      logger.warn(`Stream read error for job zip ${id}: ${err.message}`);
      await bundle.cleanup();
    });
    req.signal.addEventListener('abort', async () => {
      stream.destroy();
      await bundle.cleanup();
    });

    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Content-Length', String(bundle.zipSize));
    headers.set('Cache-Control', 'no-cache');

    return new NextResponse(stream as any, {
      status: 200,
      headers,
    });
  }, req);
}
