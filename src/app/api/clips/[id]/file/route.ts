import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { PATHS } from '@/server/paths';
import { logger } from '@/server/logger';
import path from 'path';
import fs from 'fs';
import fsPromises, { stat } from 'fs/promises';

/**
 * GET /api/clips/[id]/file
 * Stream a clip's media bytes with HTTP Range support (video seeking).
 *
 * Resolution order (all stored as server-relative paths, never client input):
 *   1. exportPath  -> media/exports/<exportPath>
 *   2. editedPath  -> media/work/<editedPath>
 *   3. cutPath     -> media/work/<cutPath>
 * Falls back in that order so Phase-1-only clips (cut but not exported) can
 * still be previewed. The path comes from the Clip row, never from the client.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({ where: { id } });
    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Clip ${id} not found`, null);
    }

    const { searchParams } = new URL(req.url);
    const isClean =
      searchParams.get('clean') === '1' ||
      searchParams.get('clean') === 'true' ||
      searchParams.get('type') === 'clean' ||
      searchParams.get('mode') === 'studio';

    let rel = isClean
      ? clip.editedPath || clip.cutPath || clip.exportPath
      : clip.exportPath || clip.editedPath || clip.cutPath;
    if (!rel) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Clip ${id} has no media file on disk`);
    }

    let base =
      isClean && (clip.editedPath || clip.cutPath)
        ? PATHS.work
        : clip.exportPath
          ? PATHS.exports
          : PATHS.work;
    let absolute = path.resolve(base, rel);
    // Guard: resolved path must stay inside the base directory.
    // Resolve real paths to prevent symlink traversal
    try {
      const realBase = await fsPromises.realpath(base);
      const realAbsolute = await fsPromises.realpath(absolute);
      if (!realAbsolute.startsWith(realBase + path.sep) && realAbsolute !== realBase) {
        return apiError(ErrorCode.INTERNAL, 'Refusing to serve path outside media directory');
      }
    } catch {
      // If file doesn't exist yet, it will be handled by stat below
    }

    let size: number;
    let isCleanServed = Boolean(isClean && (clip.editedPath || clip.cutPath));
    try {
      const st = await stat(absolute);
      size = st.size;
    } catch {
      // If clean file missing on disk but exportPath exists, try falling back to exportPath
      if (isClean && clip.exportPath && rel !== clip.exportPath) {
        const fallbackBase = PATHS.exports;
        const fallbackRel = clip.exportPath;
        const fallbackAbs = path.resolve(fallbackBase, fallbackRel);
        if (fallbackAbs.startsWith(fallbackBase + path.sep)) {
          try {
            const fallbackSt = await stat(fallbackAbs);
            rel = fallbackRel;
            base = fallbackBase;
            absolute = fallbackAbs;
            size = fallbackSt.size;
            isCleanServed = false;
          } catch {
            return apiError(ErrorCode.JOB_NOT_FOUND, `Clip media file missing on disk: ${rel}`);
          }
        } else {
          return apiError(ErrorCode.JOB_NOT_FOUND, `Clip media file missing on disk: ${rel}`);
        }
      } else {
        return apiError(ErrorCode.JOB_NOT_FOUND, `Clip media file missing on disk: ${rel}`);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Cache-Control': 'no-cache, must-revalidate',
      'x-clean-video': isCleanServed ? '1' : '0',
    };

    if (searchParams.get('download') === 'true' || searchParams.get('download') === '1') {
      const filename = path.basename(rel);
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    const rangeHeader = req.headers.get('range');

    if (rangeHeader) {
      const m = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(rangeHeader);
      if (m) {
        // bytes=START-END | bytes=START- | bytes=-SUFFIX
        const rawStart = m[1];
        const rawEnd = m[2];
        const rawSuffix = m[3];
        let start: number;
        let end: number;
        if (rawSuffix !== undefined) {
          // Suffix byte range: "bytes=-N" means the LAST N bytes.
          const suffix = parseInt(rawSuffix, 10) || 0;
          start = Math.max(0, size - suffix);
          end = size - 1;
        } else {
          start = parseInt(rawStart, 10);
          end = rawEnd ? Math.min(parseInt(rawEnd, 10), size - 1) : size - 1;
        }
        if (start >= size || end < start) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'RANGE_NOT_SATISFIABLE',
                message: 'Requested range not satisfiable',
              },
            },
            {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}` },
            },
          );
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        headers['Content-Length'] = String(end - start + 1);
        const stream = fs.createReadStream(absolute, { start, end });
        stream.on('error', (err) => {
          logger.warn(`Stream read error for clip ${id}: ${err.message}`);
        });
        req.signal.addEventListener('abort', () => stream.destroy());
        return new NextResponse(stream as any, { status: 206, headers });
      }
    }

    const full = fs.createReadStream(absolute);
    full.on('error', (err) => {
      logger.warn(`Stream read error for clip ${id}: ${err.message}`);
    });
    req.signal.addEventListener('abort', () => full.destroy());
    return new NextResponse(full as any, { status: 200, headers });
  }, req);
}
