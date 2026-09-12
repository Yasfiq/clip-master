import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { db } from '@/server/db';
import { PATHS } from '@/server/paths';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { parseSrt, serializeSrt, validateCues, SubtitleCue } from '@/pipeline/logic/srtParser';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '@/types/clipStudio';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSrtReadPath(clip: {
  id: string;
  jobId: string;
  subtitlePath: string | null;
  exportPath: string | null;
}): Promise<string | null> {
  if (clip.subtitlePath) {
    const candidate = path.isAbsolute(clip.subtitlePath)
      ? clip.subtitlePath
      : path.join(PATHS.work, clip.subtitlePath);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const workPath = path.join(PATHS.work, clip.jobId, 'subtitles', `${clip.id}.srt`);
  if (await fileExists(workPath)) {
    return workPath;
  }

  if (clip.exportPath) {
    const raw = clip.exportPath.replace(/\.mp4$/i, '.srt');
    const exportPath = path.isAbsolute(raw) ? raw : path.join(PATHS.exports, raw);
    if (await fileExists(exportPath)) {
      return exportPath;
    }
  }

  return null;
}

/**
 * GET /api/clips/[id]/studio
 * Retrieve clip data, studioConfig, subtitle cues, and video stream URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const rawConfig =
      clip.studioConfig && typeof clip.studioConfig === 'object'
        ? (clip.studioConfig as Record<string, any>)
        : {};

    const defaultSourceText = clip.job?.sourceChannel ? `Sumber: ${clip.job.sourceChannel}` : '';
    const studioConfig: StudioConfig = {
      ...DEFAULT_STUDIO_CONFIG,
      hookText: clip.hookHeadline || DEFAULT_STUDIO_CONFIG.hookText,
      sourceText: defaultSourceText || DEFAULT_STUDIO_CONFIG.sourceText,
      ...rawConfig,
    };

    const srtReadPath = await resolveSrtReadPath(clip);
    let cues: SubtitleCue[] = [];
    if (srtReadPath) {
      const srtContent = await fs.readFile(srtReadPath, 'utf8');
      cues = parseSrt(srtContent);
    }

    return apiSuccess({
      clip,
      studioConfig,
      cues,
      videoUrl: `/api/clips/${id}/file`,
    });
  }, req);
}

/**
 * PUT /api/clips/[id]/studio
 * Save updated studio configuration and subtitle cues to disk and database.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const body = await req.json().catch(() => ({}));
    const rawConfig =
      clip.studioConfig && typeof clip.studioConfig === 'object'
        ? (clip.studioConfig as Record<string, any>)
        : {};

    const incomingStudioConfig =
      body.studioConfig && typeof body.studioConfig === 'object' ? body.studioConfig : {};

    const mergedConfig: StudioConfig = {
      ...DEFAULT_STUDIO_CONFIG,
      hookText: clip.hookHeadline || '',
      sourceText: clip.job?.sourceChannel ? `Sumber: ${clip.job.sourceChannel}` : '',
      ...rawConfig,
      ...incomingStudioConfig,
    };

    const workPath = path.join(PATHS.work, clip.jobId, 'subtitles', `${clip.id}.srt`);
    let relativeWorkPath: string | undefined;

    if (Array.isArray(body.cues)) {
      const cues: SubtitleCue[] = body.cues;
      const validationError = validateCues(cues);
      if (validationError) {
        return apiError(ErrorCode.VALIDATION_FAILED, validationError);
      }

      const srtContent = serializeSrt(cues);
      await fs.mkdir(path.dirname(workPath), { recursive: true });
      await fs.writeFile(workPath, srtContent, 'utf8');

      if (clip.exportPath) {
        const raw = clip.exportPath.replace(/\.mp4$/i, '.srt');
        const exportSrtPath = path.isAbsolute(raw) ? raw : path.join(PATHS.exports, raw);
        await fs.mkdir(path.dirname(exportSrtPath), { recursive: true });
        await fs.writeFile(exportSrtPath, srtContent, 'utf8');
      }

      relativeWorkPath = path.relative(PATHS.work, workPath);
    }

    await db.clip.update({
      where: { id },
      data: {
        studioConfig: mergedConfig as any,
        hookHeadline: mergedConfig.hookText || clip.hookHeadline,
        ...(relativeWorkPath ? { subtitlePath: relativeWorkPath } : {}),
      },
    });

    return apiSuccess({
      updated: true,
      studioConfig: mergedConfig,
    });
  }, req);
}
