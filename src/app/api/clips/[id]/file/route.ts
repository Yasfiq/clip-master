import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { PATHS } from '@/server/paths';
import path from 'path';
import fs from 'fs';
import { stat } from 'fs/promises';

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

    const rel = clip.exportPath || clip.editedPath || clip.cutPath;
    if (!rel) {
      return apiError(ErrorCode.INTERNAL, `Clip ${id} has no media file on disk`);
    }

    const base = clip.exportPath ? PATHS.exports : PATHS.work;
    const absolute = path.resolve(base, rel);
    // Guard: resolved path must stay inside the base directory.
    if (!absolute.startsWith(base + path.sep)) {
      return apiError(ErrorCode.INTERNAL, 'Refusing to serve path outside media directory');
    }

    let size: number;
    try {
      const st = await stat(absolute);
      size = st.size;
    } catch {
      // Preferred file missing — try the next fallback (cut/edited not present
      // in the same order). exportPath present but file gone -> error.
      return apiError(ErrorCode.INTERNAL, `Clip media file missing on disk: ${rel}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Cache-Control': 'no-cache, must-revalidate',
    };
    const rangeHeader = req.headers.get('range');

    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (m) {
        // bytes=START-END | bytes=START- | bytes=-SUFFIX
        const rawStart = m[1];
        const rawEnd = m[2];
        let start: number;
        let end: number;
        if (rawStart === '') {
          // Suffix byte range: "bytes=-N" means the LAST N bytes.
          const suffix = rawEnd ? parseInt(rawEnd, 10) : 0;
          start = Math.max(0, size - suffix);
          end = size - 1;
        } else {
          start = parseInt(rawStart, 10);
          end = rawEnd ? parseInt(rawEnd, 10) : size - 1;
        }
        if (start >= size || end < start) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          });
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        headers['Content-Length'] = String(end - start + 1);
        const stream = fs.createReadStream(absolute, { start, end });
        return new NextResponse(stream as any, { status: 206, headers });
      }
    }

    const full = fs.createReadStream(absolute);
    return new NextResponse(full as any, { status: 200, headers });
  }, req);
}
