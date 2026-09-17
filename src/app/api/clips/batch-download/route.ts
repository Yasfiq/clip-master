import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { db } from '@/server/db';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';
import { bundleClipsToZip } from '@/server/zipBundler';

/**
 * POST /api/clips/batch-download
 *
 * Receives `{ clipIds: string[] }` to download user-selected clips in a single batch ZIP archive.
 * Includes for each clip:
 * - The MP4 video file
 * - The anti-slop copywriting TXT file
 * - manifest.json summarizing the selected clips
 *
 * Headers:
 * Content-Disposition: attachment; filename="Clips_Batch_[timestamp].zip"
 * Content-Type: application/zip
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Request body must be valid JSON');
    }

    const { clipIds } = body || {};
    if (!Array.isArray(clipIds) || clipIds.length === 0) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'clipIds must be a non-empty array of clip ID strings',
      );
    }

    const clips = await db.clip.findMany({
      where: {
        id: { in: clipIds },
      },
      include: {
        job: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!clips || clips.length === 0) {
      return apiError(ErrorCode.JOB_NOT_FOUND, 'Klip yang diminta tidak ditemukan di database');
    }

    const timestamp = Date.now();
    let bundle;
    try {
      bundle = await bundleClipsToZip(clips, {
        identifier: `batch_${timestamp}`,
      });
    } catch (err: any) {
      logger.error(`Failed to bundle selected clips: ${err.message}`);
      return apiError(ErrorCode.VALIDATION_FAILED, `Gagal membuat bundel ZIP klip: ${err.message}`);
    }

    const filename = `Clips_Batch_${timestamp}.zip`;
    const stream = fs.createReadStream(bundle.zipPath);

    stream.on('close', async () => {
      await bundle.cleanup();
    });
    stream.on('error', async (err) => {
      logger.warn(`Stream read error for batch zip: ${err.message}`);
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
