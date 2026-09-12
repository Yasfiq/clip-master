import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { db } from '@/server/db';
import { PATHS } from '@/server/paths';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { parseSrt, serializeSrt, validateCues, SubtitleCue } from '@/pipeline/logic/srtParser';
import { pickStyle } from '@/pipeline/logic/subtitleStyle';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSrtPath(clip: {
  id: string;
  jobId: string;
  subtitlePath: string | null;
  exportPath: string | null;
}): Promise<{ readPath: string; workPath: string; exportPath: string | null } | null> {
  const workPath = path.join(PATHS.work, clip.jobId, 'subtitles', `${clip.id}.srt`);

  let exportPath: string | null = null;
  if (clip.exportPath) {
    const raw = clip.exportPath.replace(/\.mp4$/i, '.srt');
    exportPath = path.isAbsolute(raw) ? raw : path.join(PATHS.exports, raw);
  } else {
    const candidate = path.join(PATHS.exports, `${clip.id}.srt`);
    if (await fileExists(candidate)) {
      exportPath = candidate;
    }
  }

  // Determine which file to read from
  if (clip.subtitlePath) {
    const cand = path.isAbsolute(clip.subtitlePath)
      ? clip.subtitlePath
      : path.join(PATHS.work, clip.subtitlePath);
    if (await fileExists(cand)) {
      return { readPath: cand, workPath, exportPath };
    }
  }

  if (await fileExists(workPath)) {
    return { readPath: workPath, workPath, exportPath };
  }

  if (exportPath && (await fileExists(exportPath))) {
    return { readPath: exportPath, workPath, exportPath };
  }

  return { readPath: workPath, workPath, exportPath };
}

/**
 * GET /api/clips/[id]/subtitles
 * Return parsed subtitle cues and raw SRT content.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({ where: { id } });
    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const paths = await resolveSrtPath(clip);
    let srtContent = '';
    if (paths && (await fileExists(paths.readPath))) {
      srtContent = await fs.readFile(paths.readPath, 'utf8');
    }

    const cues = parseSrt(srtContent);
    const meta = (clip.metadata as any) || {};
    let subtitleStyle: string = meta.subtitleStyle;
    if (!subtitleStyle) {
      const idx = typeof meta.segmentIndex === 'number' ? meta.segmentIndex : 0;
      subtitleStyle = pickStyle(idx).id;
    }

    return apiSuccess({
      clipId: clip.id,
      cues,
      srtContent,
      subtitleStyle,
    });
  }, req);
}

/**
 * PUT /api/clips/[id]/subtitles
 * Update subtitle cues and sync to disk.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({ where: { id } });
    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const body = await req.json().catch(() => ({}));
    let cues: SubtitleCue[];
    let srtContent: string;

    if (Array.isArray(body.cues)) {
      const validationError = validateCues(body.cues);
      if (validationError) {
        return apiError(ErrorCode.VALIDATION_FAILED, validationError);
      }
      cues = body.cues;
      srtContent = serializeSrt(cues);
    } else if (typeof body.srtContent === 'string') {
      srtContent = body.srtContent;
      cues = parseSrt(srtContent);
      const validationError = validateCues(cues);
      if (validationError) {
        return apiError(ErrorCode.VALIDATION_FAILED, validationError);
      }
    } else {
      return apiError(ErrorCode.VALIDATION_FAILED, 'Harus menyediakan cues atau srtContent');
    }

    const paths = await resolveSrtPath(clip);
    if (!paths) {
      return apiError(ErrorCode.INTERNAL, 'Gagal menentukan jalur berkas subtitle');
    }

    // Write to work subtitle path
    await fs.mkdir(path.dirname(paths.workPath), { recursive: true });
    await fs.writeFile(paths.workPath, srtContent, 'utf8');

    // Also write to export subtitle path if available
    if (paths.exportPath) {
      await fs.mkdir(path.dirname(paths.exportPath), { recursive: true });
      await fs.writeFile(paths.exportPath, srtContent, 'utf8');
    }

    // Ensure DB subtitlePath is updated
    const relativeWorkPath = path.relative(PATHS.work, paths.workPath);
    if (clip.subtitlePath !== relativeWorkPath) {
      await db.clip.update({
        where: { id: clip.id },
        data: { subtitlePath: relativeWorkPath },
      });
    }

    return apiSuccess({
      updated: true,
      count: cues.length,
      srtContent,
    });
  }, req);
}
