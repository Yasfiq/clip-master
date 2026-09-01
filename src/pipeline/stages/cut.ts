import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
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

    ctx.stageData.clips = [];

    const totalSegments = segments.length;
    let completed = 0;

    for (const [idx, seg] of segments.entries()) {
      const clipId = `clip_${safeJobId}_${String(idx).padStart(3, '0')}`;
      const cutPath = path.join(cutDir, `${clipId}_raw.mp4`);

      await onProgress(
        completed / totalSegments,
        `Cutting segment ${idx + 1}/${totalSegments} (${seg.startTime.toFixed(1)}s–${seg.endTime.toFixed(1)}s)`,
      );

      // Build FFmpeg cut command
      const duration = seg.endTime - seg.startTime;
      const args = [
        '-i',
        ctx.sourcePath,
        '-ss',
        seg.startTime.toString(),
        '-t',
        duration.toString(),
        '-c:v',
        'copy', // Stream copy for speed (no re-encode)
        '-c:a',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        '-y', // Overwrite output file if exists
        cutPath,
      ];

      try {
        await runBinaryChecked('ffmpeg', args, { timeoutMs: 30000 });
      } catch (err: any) {
        // If copy fails due to codec mismatch, fall back to re-encode
        if (err.message.includes('copy') || err.message.includes('codec')) {
          logger.warn(`Stream copy failed for segment ${idx}, falling back to re-encode`);
          const fallbackArgs = [
            '-i',
            ctx.sourcePath,
            '-ss',
            seg.startTime.toString(),
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
          ];
          await runBinaryChecked('ffmpeg', fallbackArgs, { timeoutMs: 45000 });
        } else {
          throw err;
        }
      }

      // Verify cut file exists and has reasonable size
      const stat = await fs.stat(cutPath);
      if (stat.size < 1024) {
        throw new Error(`Cut file too small (${stat.size} bytes) — likely cut error`);
      }

      // Register clip in context
      ctx.stageData.clips.push({
        id: clipId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        duration,
        cutPath,
      });

      completed++;
    }

    await onProgress(1.0, `CUT stage completed: ${totalSegments} raw clips saved`);
    logger.info(`CUT stage produced ${totalSegments} clips in ${cutDir}`);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
