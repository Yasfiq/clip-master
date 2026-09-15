import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinary, runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { PATHS } from '../../server/paths';
import {
  detectEmptyRanges,
  subtractEmpty,
  dropTooShort,
  type FrameFeature,
} from '../logic/emptyFrameFilter';
import { createClipRecord } from './analyze';
import fs from 'fs/promises';
import path from 'path';

export class CutStage implements PipelineStageHandler {
  stage = PipelineStage.CUT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting CUT stage');

    const segments = ctx.stageData.segments;
    if (!segments || segments.length === 0) {
      throw new Error('NO_QUALIFYING_SEGMENTS: no qualifying segments found from ANALYZE stage');
    }

    if (!ctx.sourcePath || !(await this.fileExists(ctx.sourcePath))) {
      throw new Error(`Source video not found at ${ctx.sourcePath}`);
    }

    // Clean and sanitize jobId for filenames
    const safeJobId = ctx.jobId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Prepare output directory
    const cutDir = path.join(ctx.workDir, 'cuts');
    await fs.mkdir(cutDir, { recursive: true });

    ctx.stageData.clips = [];

    const totalSegments = segments.length;
    let completed = 0;

    for (const [idx, seg] of segments.entries()) {
      await onProgress(
        completed / totalSegments,
        `Cutting segment ${idx + 1}/${totalSegments} (${seg.startTime.toFixed(1)}s–${seg.endTime.toFixed(1)}s)`,
      );

      // Sample hybrid audio + visual features for THIS segment (fast seek)
      const segFeatures = await this.sampleSegmentFeatures(
        ctx.sourcePath!,
        seg.startTime,
        seg.endTime,
      );
      const empty = detectEmptyRanges(segFeatures);
      const keptRanges = dropTooShort(subtractEmpty(seg.startTime, seg.endTime, empty));
      if (keptRanges.length === 0) {
        logger.warn(`Segment ${idx + 1}/${totalSegments} is entirely empty after filter, skipping`);
        completed++;
        continue;
      }

      if (keptRanges.length === 1) {
        await this.cutOneRange(
          ctx,
          seg,
          keptRanges[0]!.start,
          keptRanges[0]!.end,
          idx,
          safeJobId,
          cutDir,
        );
      } else {
        for (const [subIdx, r] of keptRanges.entries()) {
          const suffix = '_' + String.fromCharCode(97 + subIdx);
          await this.cutOneRange(ctx, seg, r.start, r.end, idx, safeJobId, cutDir, suffix);
        }
        logger.info(
          `Segment ${idx + 1} split into ${keptRanges.length} sub-clips after empty-frame filter`,
        );
      }

      completed++;
    }

    await onProgress(
      1.0,
      `CUT stage completed: ${ctx.stageData.clips.length} raw clips saved (${totalSegments} segment${totalSegments === 1 ? '' : 's'} processed)`,
    );
    logger.info(`CUT stage produced ${ctx.stageData.clips.length} clips in ${cutDir}`);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cut a single time range from the source. The cut file is registered
   * both in context and in the database. Extracted as a helper so the
   * multi-range empty-filter path can reuse it.
   */
  private async cutOneRange(
    ctx: StageContext,
    seg: {
      startTime: number;
      endTime: number;
      duration: number;
      viralScore: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    },
    rangeStart: number,
    rangeEnd: number,
    segIndex: number,
    safeJobId: string,
    cutDir: string,
    suffix: string = '',
  ): Promise<void> {
    const clipId = `clip_${safeJobId}_${String(segIndex).padStart(3, '0')}${suffix}`;
    const cutPath = path.join(cutDir, `${clipId}_raw.mp4`);
    const duration = rangeEnd - rangeStart;

    // Cut segment with frame-accurate input seeking (-ss before -i) and ultrafast H.264 + AAC encode.
    // Input-seeking before -i ensures exact frame decoding at rangeStart,
    // guaranteeing sample-perfect audio-video synchronization (start_time=0.000000 on both streams)
    // and exact alignment with Whisper subtitle timestamps.
    const cutArgs = [
      '-ss',
      rangeStart.toString(),
      '-i',
      ctx.sourcePath!,
      '-t',
      duration.toString(),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-avoid_negative_ts',
      'make_zero',
      '-y',
      cutPath,
    ];

    await runBinaryChecked('ffmpeg', cutArgs, { timeoutMs: 1800000 });

    const stat = await fs.stat(cutPath);
    if (stat.size < 1024) {
      // A single corrupt/empty cut should not fail the whole job: skip it
      // and let the remaining segments proceed. Zero surviving clips is
      // handled explicitly upstream (NO_QUALIFYING_SEGMENTS).
      logger.warn(`Cut file too small (${stat.size} bytes), skipping ${clipId}`);
      await fs.unlink(cutPath).catch(() => {});
      return;
    }

    ctx.stageData.clips!.push({
      id: clipId,
      startTime: rangeStart,
      endTime: rangeEnd,
      duration,
      cutPath,
      viralScore: seg.viralScore,
      confidence: seg.confidence,
      hookHeadline: (seg as any).hookHeadline,
      sourceChannel: ctx.sourceChannel,
    });

    const relativeCutPath = path.relative(PATHS.work, cutPath);
    let sourceChannel = ctx.sourceChannel;
    if (!sourceChannel) {
      const job = await db.job.findUnique({
        where: { id: ctx.jobId },
        select: { sourceChannel: true },
      });
      sourceChannel = job?.sourceChannel || undefined;
    }

    await createClipRecord({
      clipId,
      jobId: ctx.jobId,
      startTime: rangeStart,
      endTime: rangeEnd,
      duration,
      cutPath: relativeCutPath,
      viralScore: seg.viralScore,
      confidence: seg.confidence,
      hookHeadline: (seg as any).hookHeadline,
      sourceChannel,
    });
  }

  /**
   * Sample hybrid audio + visual features for empty-frame detection on a specific segment.
   * Uses input seeking to only decode the segment's duration at 5 fps (~0.2s intervals),
   * completing in ~0.5s instead of scanning the entire source video.
   */
  private async sampleSegmentFeatures(
    sourcePath: string,
    segmentStart: number,
    segmentEnd: number,
  ): Promise<FrameFeature[]> {
    const out: FrameFeature[] = [];
    interface WindowBucket {
      visualSum: number;
      visualCount: number;
      audioSum: number;
      audioCount: number;
    }
    const windowMap = new Map<number, WindowBucket>();
    let currentRelPts = 0;
    let maxVisualWinIdx = -1;
    let totalVisualSamples = 0;
    let totalAudioSamples = 0;

    const mFrame = /^frame:\d+\s+pts:\d+\s+pts_time:([0-9.]+)/;
    const mYdif = /^lavfi\.signalstats\.YDIF=(-?[0-9.]+)/;
    const mRms = /^lavfi\.astats\.\d+\.RMS_level=(-?[0-9.]+)/;

    const getOrCreateBucket = (winIdx: number): WindowBucket => {
      let bucket = windowMap.get(winIdx);
      if (!bucket) {
        bucket = { visualSum: 0, visualCount: 0, audioSum: 0, audioCount: 0 };
        windowMap.set(winIdx, bucket);
      }
      return bucket;
    };

    const duration = Math.max(1, segmentEnd - segmentStart);

    await runBinaryChecked(
      'ffmpeg',
      [
        '-ss',
        String(segmentStart),
        '-i',
        sourcePath,
        '-t',
        String(duration),
        '-vf',
        'fps=5,signalstats=stat=tout,metadata=print:file=-',
        '-af',
        'astats=metadata=1:reset=1,ametadata=print:file=-',
        '-f',
        'null',
        '-',
      ],
      {
        timeoutMs: 60000,
        bufferStdout: false,
        onStdoutLine: (line) => {
          const f = mFrame.exec(line);
          if (f) {
            currentRelPts = parseFloat(f[1]!);
            return;
          }
          const yd = mYdif.exec(line);
          if (yd) {
            const v = parseFloat(yd[1]!);
            if (isFinite(v)) {
              const winIdx = Math.round(currentRelPts / 0.2);
              const bucket = getOrCreateBucket(winIdx);
              bucket.visualSum += v;
              bucket.visualCount += 1;
              if (winIdx > maxVisualWinIdx) {
                maxVisualWinIdx = winIdx;
              }
              totalVisualSamples++;
            }
            return;
          }
          const rms = mRms.exec(line);
          if (rms) {
            const v = parseFloat(rms[1]!);
            if (isFinite(v)) {
              const winIdx = Math.floor((currentRelPts + 0.0001) / 0.2);
              const bucket = getOrCreateBucket(winIdx);
              bucket.audioSum += Math.max(0, (v + 60) / 60);
              bucket.audioCount += 1;
              totalAudioSamples++;
            }
          }
        },
      },
    ).catch((err: any) => {
      logger.warn(
        `Segment feature sampling failed for [${segmentStart}-${segmentEnd}]; skipping empty-frame filter: ${err.message}`,
      );
    });

    if (totalVisualSamples === 0 || maxVisualWinIdx < 0) {
      return out;
    }

    for (let i = 0; i <= maxVisualWinIdx; i++) {
      const absT = segmentStart + i * 0.2;
      const bucket = windowMap.get(i);
      const avgVisual =
        bucket && bucket.visualCount > 0 ? bucket.visualSum / bucket.visualCount : 0;
      const avgAudio = bucket && bucket.audioCount > 0 ? bucket.audioSum / bucket.audioCount : 0;

      out.push({
        t: Number(absT.toFixed(3)),
        audioEnergy: Math.min(1, Math.max(0, avgAudio)),
        visualMotion: avgVisual < 0.01 ? 0 : Math.min(1, avgVisual / 10),
      });
    }

    return out;
  }
}
