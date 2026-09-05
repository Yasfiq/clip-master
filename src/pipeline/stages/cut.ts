import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { PATHS } from '../../server/paths';
import {
  detectEmptyRanges,
  subtractEmpty,
  dropTooShort,
  type FrameFeature,
} from '../logic/emptyFrameFilter';
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
      throw new Error('No qualifying segments found from ANALYZE stage');
    }

    if (!ctx.sourcePath || !(await this.fileExists(ctx.sourcePath))) {
      throw new Error(`Source video not found at ${ctx.sourcePath}`);
    }

    // Clean and sanitize jobId for filenames
    const safeJobId = ctx.jobId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Prepare output directory
    const cutDir = path.join(ctx.workDir, 'cuts');
    await fs.mkdir(cutDir, { recursive: true });

    // Sample hybrid audio + visual features across the source to detect
    // "table only" / "no subject" empty ranges. Used downstream to trim
    // dead time out of each selected segment.
    await onProgress(0.02, 'Sampling audio + visual features for empty-frame filter');
    const features = await this.sampleHybridFeatures(ctx.sourcePath!);

    ctx.stageData.clips = [];

    const totalSegments = segments.length;
    let completed = 0;

    for (const [idx, seg] of segments.entries()) {
      await onProgress(
        completed / totalSegments,
        `Cutting segment ${idx + 1}/${totalSegments} (${seg.startTime.toFixed(1)}s–${seg.endTime.toFixed(1)}s)`,
      );

      // Subtract empty ranges from the segment window. If everything is
      // empty, skip; if partially empty, the segment becomes multiple
      // sub-clips (suffixed _a, _b, …).
      const segFeatures = features.filter((f) => f.t >= seg.startTime && f.t <= seg.endTime);
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

    await onProgress(1.0, `CUT stage completed: ${totalSegments} raw clips saved`);
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

    const args = [
      '-i',
      ctx.sourcePath!,
      '-ss',
      rangeStart.toString(),
      '-t',
      duration.toString(),
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-y',
      cutPath,
    ];

    try {
      await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
    } catch (err: any) {
      if (err.message.includes('copy') || err.message.includes('codec')) {
        logger.warn(`Stream copy failed for ${clipId}, falling back to re-encode`);
        await runBinaryChecked(
          'ffmpeg',
          [
            '-i',
            ctx.sourcePath!,
            '-ss',
            rangeStart.toString(),
            '-t',
            duration.toString(),
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-avoid_negative_ts',
            'make_zero',
            '-y',
            cutPath,
          ],
          { timeoutMs: 1800000 },
        );
      } else {
        throw err;
      }
    }

    const stat = await fs.stat(cutPath);
    if (stat.size < 1024) {
      throw new Error(`Cut file too small (${stat.size} bytes) — likely cut error`);
    }

    ctx.stageData.clips!.push({
      id: clipId,
      startTime: rangeStart,
      endTime: rangeEnd,
      duration,
      cutPath,
      viralScore: seg.viralScore,
      confidence: seg.confidence,
    });

    const relativeCutPath = path.relative(PATHS.work, cutPath);
    await db.clip.create({
      data: {
        id: clipId,
        jobId: ctx.jobId,
        startTime: rangeStart,
        endTime: rangeEnd,
        duration,
        cutPath: relativeCutPath,
        viralScore: seg.viralScore,
        confidence: seg.confidence,
      },
    });
  }

  /**
   * Sample hybrid audio + visual features for empty-frame detection.
   * Two-pass approach for clean timestamp alignment:
   *   Pass 1: signalstats YDIF per frame (visual motion)
   *   Pass 2: astats RMS per frame (audio energy)
   * Both at 5 fps (0.2s intervals).
   */
  private async sampleHybridFeatures(sourcePath: string): Promise<FrameFeature[]> {
    // Single FFmpeg pass. Both filter chains dump per-frame metadata to
    // stdout via metadata=print:file=-. Each metadata block is preceded by a
    // `frame:` header carrying the frame's absolute pts_time, so visual and
    // audio samples can be paired by timestamp exactly.
    //   Video: fps=5,signalstats=stat=tout  -> lavfi.signalstats.YDIF
    //   Audio: astats=metadata=1:reset=1    -> lavfi.astats.<ch>.RMS_level
    const out: FrameFeature[] = [];
    const visual: Array<{ t: number; v: number }> = [];
    const audio: Array<{ t: number; v: number }> = [];
    let stdoutText = '';
    let currentPts = 0;

    await runBinaryChecked(
      'ffmpeg',
      [
        '-i',
        sourcePath,
        '-vf',
        'fps=5,signalstats=stat=tout,metadata=print:file=-',
        '-af',
        'astats=metadata=1:reset=1,ametadata=print:file=-',
        '-f',
        'null',
        '-',
      ],
      {
        timeoutMs: 1800000,
        // metadata=print:file=- writes to STDOUT, not stderr
        onStdoutLine: (line) => {
          stdoutText += line + '\n';
        },
      },
    ).catch((err: any) => {
      logger.warn(`Hybrid feature sampling failed; empty-frame filter disabled: ${err.message}`);
    });

    const mFrame = /^frame:\d+\s+pts:\d+\s+pts_time:([0-9.]+)/;
    const mYdif = /^lavfi\.signalstats\.YDIF=(-?[0-9.]+)/;
    const mRms = /^lavfi\.astats\.\d+\.RMS_level=(-?[0-9.]+)/;
    for (const line of stdoutText.split('\n')) {
      const f = line.match(mFrame);
      if (f) {
        currentPts = parseFloat(f[1]!);
        continue;
      }
      const yd = line.match(mYdif);
      if (yd) {
        visual.push({ t: currentPts, v: parseFloat(yd[1]!) });
        continue;
      }
      const rms = line.match(mRms);
      if (rms) {
        const v = parseFloat(rms[1]!);
        if (isFinite(v)) audio.push({ t: currentPts, v });
      }
    }

    // Bucket both streams into 0.2s windows aligned to video samples
    // (5 fps). YDIF is already a per-video-frame motion value; RMS is
    // averaged per window and per channel.
    if (visual.length === 0) {
      logger.warn('No visual features sampled; empty-frame filter disabled');
      return out;
    }
    const maxT = Math.max(...visual.map((s) => s.t), 0);
    for (let i = 0; i < visual.length; i++) {
      const s = visual[i]!;
      const t = i * 0.2;
      const win = audio.filter((a) => a.t >= t && a.t < t + 0.2);
      const rms = win.length
        ? win.reduce((sum, a) => sum + Math.max(0, (a.v + 60) / 60), 0) / win.length
        : 0;
      out.push({
        t,
        audioEnergy: Math.min(1, Math.max(0, rms)),
        // YDIF = inter-frame luma difference. Normalize: near 0 = static.
        visualMotion: s.v < 0.01 ? 0 : Math.min(1, s.v / 10),
      });
    }
    logger.info(
      `Sampled ${out.length} hybrid frames (${visual.length} visual, ${audio.length} audio) up to ${maxT}s for empty-frame filter`,
    );
    return out;
  }
}
