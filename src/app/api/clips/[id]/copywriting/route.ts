import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { db } from '@/server/db';
import { PATHS } from '@/server/paths';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { parseSrt } from '@/pipeline/logic/srtParser';
import { generateClipCopywriting } from '@/pipeline/logic/copywriting';

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
    const exportCandidate = path.isAbsolute(raw) ? raw : path.join(PATHS.exports, raw);
    if (await fileExists(exportCandidate)) {
      return exportCandidate;
    }
  }

  return null;
}

/**
 * GET /api/clips/[id]/copywriting
 * Generate anti-slop, high-CTR copywriting (Title, Hook, Hashtags, Attribution, Platform formats)
 * derived from the clip's spoken transcript, hook headline, and source channel metadata.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan.`);
    }

    let transcriptText = '';
    const srtPath = await resolveSrtReadPath(clip);
    if (srtPath) {
      try {
        const rawSrt = await fs.readFile(srtPath, 'utf8');
        const cues = parseSrt(rawSrt);
        transcriptText = cues
          .map((c) => c.text.trim())
          .filter(Boolean)
          .join(' ');
      } catch (err) {
        console.warn(`[Copywriting API] Gagal membaca transcript SRT dari ${srtPath}:`, err);
      }
    }

    const studioConfig = clip.studioConfig as Record<string, any> | null;
    const hookHeadline =
      (typeof studioConfig?.hookText === 'string' && studioConfig.hookText.trim()) ||
      clip.hookHeadline ||
      undefined;

    const sourceChannel = clip.job?.sourceChannel || undefined;
    const sourceTitle = clip.job?.sourceTitle || clip.job?.sourceFilename || undefined;

    const copywriting = generateClipCopywriting({
      hookHeadline,
      sourceChannel,
      sourceTitle,
      transcriptText,
      duration: clip.duration,
    });

    return apiSuccess({
      clipId: clip.id,
      copywriting,
    });
  }, req);
}
