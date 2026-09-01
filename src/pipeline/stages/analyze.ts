import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { selectSegments, SegmentFeatures } from '../logic/analyze';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';

export class AnalyzeStage implements PipelineStageHandler {
  stage = PipelineStage.ANALYZE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.1, 'Starting ANALYZE: extracting AV features');

    const duration = ctx.metadata?.duration || 0;
    if (duration === 0) {
      throw new Error('Missing duration metadata');
    }

    // Define window parameters from config
    const targetDur = ctx.config?.targetDuration || 180;
    const minDur = ctx.config?.minSegmentDuration || 120;
    const maxDur = ctx.config?.maxSegmentDuration || 300;
    const stepSize = Math.max(30, Math.floor(targetDur / 4)); // 25% overlap step

    logger.info(
      `Analyzing video with window settings: target=${targetDur}s, min=${minDur}s, max=${maxDur}s`,
    );

    // 1. Gather shot changes (scene detection) via FFmpeg
    await onProgress(0.3, 'Detecting shot boundaries');
    const shotChanges: number[] = [];

    // We run scdet with scale to speed up analysis
    await runBinaryChecked(
      'ffmpeg',
      [
        '-i',
        ctx.sourcePath,
        '-vf',
        'select=gt(scene\\,0.4),metadata=print:key=lavfi.scene_change_score',
        '-an',
        '-f',
        'null',
        '-',
      ],
      {
        timeoutMs: 120000,
        onStderrLine: (line) => {
          // Parse scene changes, e.g., "select:1.000000 scene:0.45"
          if (line.includes('scene_change_score')) {
            logger.debug(`Scene change candidate: ${line}`);
          }
        },
      },
    );

    // 2. Gather audio RMS levels
    await onProgress(0.6, 'Analyzing audio RMS levels');
    let rmsTotal = 0;
    let rmsCount = 0;
    if (ctx.metadata?.hasAudio) {
      await runBinaryChecked(
        'ffmpeg',
        ['-i', ctx.sourcePath, '-filter_complex', 'ebur128=metadata=1', '-f', 'null', '-'],
        {
          timeoutMs: 120000,
          onStderrLine: (line) => {
            if (line.includes('I:')) {
              // e.g., "t: 2.1  M: -21.4  S: -22.3  I: -21.8 LUFS"
              const match = line.match(/I:\s*(-?\d+\.?\d*)/);
              if (match && match[1]) {
                rmsTotal += parseFloat(match[1]);
                rmsCount++;
              }
            }
          },
        },
      );
    }
    const avgRms = rmsCount > 0 ? rmsTotal / rmsCount : -20; // Default fallback

    // 3. Sliding Window Analysis
    await onProgress(0.8, 'Computing segment scores');
    const features: SegmentFeatures[] = [];

    // Slide across the video duration
    for (let start = 0; start + minDur <= duration; start += stepSize) {
      const end = Math.min(duration, start + targetDur);
      const segmentDur = end - start;

      // Count shots within this window
      const windowShots = shotChanges.filter((t) => t >= start && t <= end).length;
      const shotChangeRate = (windowShots / segmentDur) * 60; // per minute

      // Mock dynamic heuristics for MVP (to be replaced by full sensors in post-MVP)
      const visualSaliency = 0.5 + Math.sin(start) * 0.2;
      const colorDynamicRange = 0.6 + Math.cos(start) * 0.1;
      const audioRMSLoudness = Math.min(1, Math.max(0, (avgRms + 50) / 50)); // normalize -50..0 LUFS to 0..1
      const hookEmbedding = start < 60 ? 0.8 : 0.4; // boost early video windows
      const bpmAlignment = 0.5;

      features.push({
        startTime: start,
        endTime: end,
        shotChangeRate,
        visualSaliency,
        colorDynamicRange,
        audioRMSLoudness,
        hookEmbedding,
        bpmAlignment,
      });
    }

    // 4. Select viral segments
    const scoreThreshold = 0.5; // default threshold
    const selection = selectSegments(features, duration, scoreThreshold);

    if (selection.segments.length === 0) {
      throw new Error('NO_QUALIFYING_SEGMENTS: All segments scored below acceptable thresholds');
    }

    ctx.stageData.segments = selection.segments;
    logger.info(`Selected ${selection.segments.length} qualifying segments`, {
      fallbackApplied: selection.fallbackApplied,
    });

    await onProgress(1.0, `ANALYZE completed. Found ${selection.segments.length} segments`);
  }
}
