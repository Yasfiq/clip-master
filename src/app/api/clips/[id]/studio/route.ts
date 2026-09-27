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
      sourcePosition:
        rawConfig.sourcePosition || DEFAULT_STUDIO_CONFIG.sourcePosition || 'top-right',
    };

    const srtReadPath = await resolveSrtReadPath(clip);
    let cues: SubtitleCue[] = [];
    if (srtReadPath) {
      const srtContent = await fs.readFile(srtReadPath, 'utf8');
      cues = parseSrt(srtContent);
    }

    let hasClean = false;
    if (clip.editedPath) {
      const p = path.isAbsolute(clip.editedPath)
        ? clip.editedPath
        : path.resolve(PATHS.work, clip.editedPath);
      hasClean = await fileExists(p);
    }
    if (!hasClean && clip.cutPath) {
      const p = path.isAbsolute(clip.cutPath)
        ? clip.cutPath
        : path.resolve(PATHS.work, clip.cutPath);
      hasClean = await fileExists(p);
    }
    if (!hasClean && (clip.editedPath || clip.cutPath) && !clip.exportPath) {
      hasClean = true;
    }

    return apiSuccess({
      clip,
      studioConfig,
      cues,
      isCleanVideo: hasClean,
      videoUrl: `/api/clips/${id}/file?clean=1`,
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

    // Strip client-supplied logoPath to prevent arbitrary path traversal
    delete incomingStudioConfig.logoPath;

    if (incomingStudioConfig.sourcePosition) {
      const allowedPositions = ['top-right', 'top-left', 'bottom'];
      if (!allowedPositions.includes(incomingStudioConfig.sourcePosition)) {
        return apiError(
          ErrorCode.VALIDATION_FAILED,
          `Invalid sourcePosition: ${incomingStudioConfig.sourcePosition}. Expected 'top-right', 'top-left', or 'bottom'.`,
        );
      }
    }

    const sanitizedIncoming: Partial<StudioConfig> = {};
    if (typeof incomingStudioConfig.hookText === 'string') {
      sanitizedIncoming.hookText = incomingStudioConfig.hookText.slice(0, 150);
    }
    if (typeof incomingStudioConfig.sourceText === 'string') {
      sanitizedIncoming.sourceText = incomingStudioConfig.sourceText.slice(0, 80);
    }
    if (
      typeof incomingStudioConfig.freezeDuration === 'number' &&
      Number.isFinite(incomingStudioConfig.freezeDuration)
    ) {
      sanitizedIncoming.freezeDuration = Math.max(
        0,
        Math.min(10, incomingStudioConfig.freezeDuration),
      );
    }
    if (
      typeof incomingStudioConfig.fadeInDuration === 'number' &&
      Number.isFinite(incomingStudioConfig.fadeInDuration)
    ) {
      sanitizedIncoming.fadeInDuration = Math.max(
        0,
        Math.min(5, incomingStudioConfig.fadeInDuration),
      );
    }
    if (
      typeof incomingStudioConfig.fadeOutDuration === 'number' &&
      Number.isFinite(incomingStudioConfig.fadeOutDuration)
    ) {
      sanitizedIncoming.fadeOutDuration = Math.max(
        0,
        Math.min(5, incomingStudioConfig.fadeOutDuration),
      );
    }
    if (
      typeof incomingStudioConfig.logoOpacity === 'number' &&
      Number.isFinite(incomingStudioConfig.logoOpacity)
    ) {
      sanitizedIncoming.logoOpacity = Math.max(
        0.1,
        Math.min(1.0, incomingStudioConfig.logoOpacity),
      );
    }
    if (typeof incomingStudioConfig.logoEnabled === 'boolean') {
      sanitizedIncoming.logoEnabled = incomingStudioConfig.logoEnabled;
    }
    if (typeof incomingStudioConfig.logoPosition === 'string') {
      sanitizedIncoming.logoPosition = incomingStudioConfig.logoPosition;
    }
    if (typeof incomingStudioConfig.sourceEnabled === 'boolean') {
      sanitizedIncoming.sourceEnabled = incomingStudioConfig.sourceEnabled;
    }
    if (typeof incomingStudioConfig.sourcePosition === 'string') {
      sanitizedIncoming.sourcePosition = incomingStudioConfig.sourcePosition;
    }
    if (typeof incomingStudioConfig.subtitleStyleId === 'string') {
      sanitizedIncoming.subtitleStyleId = incomingStudioConfig.subtitleStyleId;
    }
    if (typeof incomingStudioConfig.hookPosition === 'string') {
      sanitizedIncoming.hookPosition = incomingStudioConfig.hookPosition;
    }
    if (
      typeof incomingStudioConfig.hookDuration === 'number' &&
      Number.isFinite(incomingStudioConfig.hookDuration)
    ) {
      sanitizedIncoming.hookDuration = Math.max(0, Math.min(30, incomingStudioConfig.hookDuration));
    }
    if (
      typeof incomingStudioConfig.subtitleDelay === 'number' &&
      Number.isFinite(incomingStudioConfig.subtitleDelay)
    ) {
      sanitizedIncoming.subtitleDelay = Math.max(
        0,
        Math.min(10, incomingStudioConfig.subtitleDelay),
      );
    }
    if (typeof incomingStudioConfig.hookTtsEnabled === 'boolean') {
      sanitizedIncoming.hookTtsEnabled = incomingStudioConfig.hookTtsEnabled;
    }
    if (typeof incomingStudioConfig.hookTtsVoice === 'string') {
      sanitizedIncoming.hookTtsVoice = incomingStudioConfig.hookTtsVoice;
    }
    if (typeof incomingStudioConfig.filmBurnIntro === 'boolean') {
      sanitizedIncoming.filmBurnIntro = incomingStudioConfig.filmBurnIntro;
    }

    const mergedConfig: StudioConfig = {
      ...DEFAULT_STUDIO_CONFIG,
      hookText: clip.hookHeadline || '',
      sourceText: clip.job?.sourceChannel ? `Sumber: ${clip.job.sourceChannel}` : '',
      ...rawConfig,
      ...sanitizedIncoming,
      sourcePosition:
        sanitizedIncoming.sourcePosition ||
        rawConfig.sourcePosition ||
        DEFAULT_STUDIO_CONFIG.sourcePosition ||
        'top-right',
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
        hookHeadline:
          typeof mergedConfig.hookText === 'string' ? mergedConfig.hookText : clip.hookHeadline,
        ...(relativeWorkPath ? { subtitlePath: relativeWorkPath } : {}),
      },
    });

    return apiSuccess({
      updated: true,
      studioConfig: mergedConfig,
    });
  }, req);
}
