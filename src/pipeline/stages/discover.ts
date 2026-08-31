import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { probeMedia } from '../binaries/ffprobe';
import { logger } from '../../server/logger';

export class DiscoverStage implements PipelineStageHandler {
  stage = PipelineStage.DISCOVER;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.1, 'Starting DISCOVER: probing source metadata');

    // Validate source exists
    if (!ctx.sourcePath) {
      throw new Error('Source path not set in context');
    }

    // Probe media with proper parsing (no eval)
    const probe = await probeMedia(ctx.sourcePath);

    await onProgress(0.4, 'FFprobe completed, validating');

    // Validate minimum requirements
    if (!probe.durationSec || probe.durationSec <= 0) {
      throw new Error('Source has zero or unknown duration');
    }
    if (!probe.width || !probe.height) {
      throw new Error('No video stream or resolution found in source');
    }

    // Store in context for later stages
    ctx.metadata = {
      duration: probe.durationSec,
      width: probe.width,
      height: probe.height,
      format: probe.formatName,
      hasAudio: probe.hasAudio,
      fps: probe.fps,
      codec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      bitRate: probe.bitRate,
      fileSize: probe.fileSizeBytes,
    };

    const sourceMinutes = Math.ceil(probe.durationSec / 60);
    await onProgress(
      0.9,
      `Source analyzed: ${probe.durationSec.toFixed(1)}s (${sourceMinutes}m), ` +
        `${probe.width}x${probe.height}@${probe.fps?.toFixed(2)}fps, audio=${probe.hasAudio}`,
    );

    logger.info(`Discovered source: ${sourceMinutes}m video`, { probe });

    await onProgress(1.0, 'DISCOVER stage completed');
  }
}
