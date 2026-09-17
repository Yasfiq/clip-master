import path from 'path';
import fs from 'fs/promises';
import { db } from './db';
import { PATHS } from './paths';
import { parseSrt } from '@/pipeline/logic/srtParser';
import {
  scheduleClips,
  buildStructuredSchedule,
  generateScheduleCsv,
  generateScheduleJson,
  ScheduleClipInput,
  ScheduleOptions,
  SocialPlatform,
  ScheduledClip,
  StructuredSchedule,
} from '@/pipeline/logic/dripScheduler';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate and resolve existing SRT file for a clip across work or export paths.
 */
export async function resolveSrtReadPath(clip: {
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
 * Read and concatenate spoken transcript from an SRT file.
 */
export async function readClipTranscript(clip: {
  id: string;
  jobId: string;
  subtitlePath: string | null;
  exportPath: string | null;
}): Promise<string> {
  const srtPath = await resolveSrtReadPath(clip);
  if (!srtPath) return '';

  try {
    const rawSrt = await fs.readFile(srtPath, 'utf8');
    const cues = parseSrt(rawSrt);
    return cues
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(' ');
  } catch {
    return '';
  }
}

/**
 * Parse platform query parameter into typed SocialPlatform array.
 * Accepts: 'youtube', 'tiktok', 'reels', 'shorts', 'all', or comma-separated list.
 */
export function parsePlatformsParam(param: string | null): SocialPlatform[] | undefined {
  if (!param || param.trim() === '' || param.toLowerCase() === 'all') {
    return undefined;
  }

  const parts = param.split(',').map((p) => p.trim().toLowerCase());
  const selected = new Set<SocialPlatform>();

  for (const p of parts) {
    if (p === 'youtube' || p === 'shorts' || p === 'youtube shorts') {
      selected.add('YouTube Shorts');
    } else if (p === 'tiktok') {
      selected.add('TikTok');
    } else if (p === 'reels' || p === 'instagram' || p === 'instagram reels') {
      selected.add('Instagram Reels');
    }
  }

  return selected.size > 0 ? Array.from(selected) : undefined;
}

export interface JobScheduleResult {
  jobId: string;
  jobTitle: string;
  totalClips: number;
  totalScheduledEntries: number;
  schedule: ScheduledClip[];
  structured: StructuredSchedule;
}

export interface AggregatedClipsScheduleResult {
  totalClips: number;
  totalScheduledEntries: number;
  schedule: ScheduledClip[];
  structured: StructuredSchedule;
}

/**
 * Retrieve clips for a specific job and generate the drip schedule.
 */
export async function getJobSchedule(
  jobId: string,
  options?: ScheduleOptions & { exportedOnly?: boolean },
): Promise<JobScheduleResult | null> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      clips: {
        orderBy: { viralScore: 'desc' },
      },
    },
  });

  if (!job) {
    return null;
  }

  let clipsToSchedule = job.clips;
  if (options?.exportedOnly) {
    clipsToSchedule = clipsToSchedule.filter((c) => c.isExported);
  }

  const inputs: ScheduleClipInput[] = await Promise.all(
    clipsToSchedule.map(async (clip) => {
      const transcriptText = await readClipTranscript(clip);
      const studioConfig = clip.studioConfig as Record<string, any> | null;
      const hookHeadline =
        (typeof studioConfig?.hookText === 'string' && studioConfig.hookText.trim()) ||
        clip.hookHeadline ||
        undefined;

      return {
        id: clip.id,
        jobId: clip.jobId,
        duration: clip.duration,
        viralScore: clip.viralScore,
        exportPath: clip.exportPath,
        editedPath: clip.editedPath,
        cutPath: clip.cutPath,
        videoPath: clip.exportPath || clip.editedPath || clip.cutPath || undefined,
        hookHeadline,
        sourceTitle: job.sourceTitle || job.sourceFilename || undefined,
        sourceChannel: job.sourceChannel || undefined,
        transcriptText,
      };
    }),
  );

  const schedule = scheduleClips(inputs, options);
  const structured = buildStructuredSchedule(schedule);

  return {
    jobId: job.id,
    jobTitle: job.sourceTitle || job.sourceFilename || job.id,
    totalClips: inputs.length,
    totalScheduledEntries: schedule.length,
    schedule,
    structured,
  };
}

/**
 * Retrieve all exported clips (isExported: true) across all jobs and generate aggregate schedule.
 */
export async function getAggregatedClipsSchedule(
  options?: ScheduleOptions,
): Promise<AggregatedClipsScheduleResult> {
  const clips = await db.clip.findMany({
    where: { isExported: true },
    include: {
      job: {
        select: {
          id: true,
          sourceTitle: true,
          sourceFilename: true,
          sourceChannel: true,
        },
      },
    },
    orderBy: { viralScore: 'desc' },
  });

  const inputs: ScheduleClipInput[] = await Promise.all(
    clips.map(async (clip) => {
      const transcriptText = await readClipTranscript(clip);
      const studioConfig = clip.studioConfig as Record<string, any> | null;
      const hookHeadline =
        (typeof studioConfig?.hookText === 'string' && studioConfig.hookText.trim()) ||
        clip.hookHeadline ||
        undefined;

      return {
        id: clip.id,
        jobId: clip.jobId,
        duration: clip.duration,
        viralScore: clip.viralScore,
        exportPath: clip.exportPath,
        editedPath: clip.editedPath,
        cutPath: clip.cutPath,
        videoPath: clip.exportPath || clip.editedPath || clip.cutPath || undefined,
        hookHeadline,
        sourceTitle: clip.job?.sourceTitle || clip.job?.sourceFilename || undefined,
        sourceChannel: clip.job?.sourceChannel || undefined,
        transcriptText,
      };
    }),
  );

  const schedule = scheduleClips(inputs, options);
  const structured = buildStructuredSchedule(schedule);

  return {
    totalClips: inputs.length,
    totalScheduledEntries: schedule.length,
    schedule,
    structured,
  };
}
