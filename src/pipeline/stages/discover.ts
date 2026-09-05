import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { probeMedia } from '../binaries/ffprobe';
import { runBinary } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import path from 'path';
import fs from 'fs/promises';

export class DiscoverStage implements PipelineStageHandler {
  stage = PipelineStage.DISCOVER;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting DISCOVER');

    // Handle YouTube download if sourcePath is missing but sourceUrl exists
    if (!ctx.sourcePath) {
      const job = await db.job.findUnique({ where: { id: ctx.jobId } });
      if (!job) throw new Error('Job not found in DISCOVER stage');

      if (job.sourceUrl && job.sourceUrl.startsWith('file://')) {
        // Local file via file:// URL — resolve path and validate
        const filePath = decodeURIComponent(job.sourceUrl.replace(/^file:\/\//, '/'));
        try {
          await fs.access(filePath);
        } catch {
          throw new Error(`file:// path not found: ${filePath}`);
        }
        ctx.sourcePath = filePath;
        logger.info('Local file resolved from file:// URL', { path: filePath });
      } else if (
        job.sourceUrl &&
        (job.sourceUrl.includes('youtube.com') || job.sourceUrl.includes('youtu.be'))
      ) {
        await onProgress(0.1, 'Downloading from YouTube via yt-dlp');

        // Generate a safe filename
        const filenamePattern = ctx.jobId + '.%(ext)s';
        const tempPathPattern = path.join(ctx.workDir, filenamePattern);

        // Download best video + best audio
        await runBinary(
          'yt-dlp',
          [
            '-f',
            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format',
            'mp4',
            '-o',
            tempPathPattern,
            job.sourceUrl,
          ],
          { timeoutMs: 3600000 }, // 1 hour max
        );

        // Find the actual downloaded file (could be .mp4, .mkv, etc)
        try {
          const files = await fs.readdir(ctx.workDir);
          const downloadedFile = files.find(
            (f) => f.startsWith(ctx.jobId) && !f.endsWith('.part') && !f.endsWith('.ytdl'),
          );

          if (!downloadedFile) throw new Error('File not found after yt-dlp complete');

          ctx.sourcePath = path.join(ctx.workDir, downloadedFile);
          logger.info('YouTube download completed', { path: ctx.sourcePath, url: job.sourceUrl });
        } catch (e) {
          throw new Error('yt-dlp download failed, output file not found');
        }
      } else {
        throw new Error('Source path not set in context and no valid YouTube URL found');
      }
    }

    await onProgress(0.2, 'Probing source metadata');

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
