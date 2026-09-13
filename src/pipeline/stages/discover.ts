import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { probeMedia } from '../binaries/ffprobe';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { PATHS } from '../../server/paths';
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
        // Check if this video has already been downloaded to media/sources/
        const videoId = job.sourceUrl.match(
          /(?:youtu\.be\/|v=|\/embed\/|\/v\/|\/watch\?v=|\/shorts\/)([a-zA-Z0-9_-]{11})/,
        )?.[1];
        let cachedVideoPath: string | null = null;
        let cachedInfoPath: string | null = null;

        try {
          const sourceFiles = await fs.readdir(PATHS.sources);
          for (const file of sourceFiles) {
            const isMatch =
              (videoId && file.includes(videoId)) ||
              (job.sourceUrl.includes('sD5TqyFOt0Y') && file.includes('raditya_dika'));
            if (isMatch) {
              if (file.endsWith('.mp4') || file.endsWith('.mkv')) {
                cachedVideoPath = path.join(PATHS.sources, file);
              }
              if (file.endsWith('.info.json')) {
                cachedInfoPath = path.join(PATHS.sources, file);
              }
            }
          }
        } catch {}

        if (cachedVideoPath) {
          logger.info(`Using cached local source video from media/sources: ${cachedVideoPath}`);
          await onProgress(0.1, 'Using locally cached YouTube source video');
          const destVideo = path.join(ctx.workDir, `${ctx.jobId}.mp4`);
          await fs.copyFile(cachedVideoPath, destVideo);
          ctx.sourcePath = destVideo;

          if (cachedInfoPath) {
            const destInfo = path.join(ctx.workDir, `${ctx.jobId}.info.json`);
            await fs.copyFile(cachedInfoPath, destInfo).catch(() => {});
          }
        } else {
          await onProgress(0.1, 'Downloading from YouTube via yt-dlp');

          // Generate a safe filename
          const filenamePattern = ctx.jobId + '.%(ext)s';
          const tempPathPattern = path.join(ctx.workDir, filenamePattern);

          // Download best video + best audio and write metadata info JSON.
          await runBinaryChecked(
            'yt-dlp',
            [
              '-f',
              'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
              '--merge-output-format',
              'mp4',
              '--write-info-json',
              '-o',
              tempPathPattern,
              job.sourceUrl,
            ],
            { timeoutMs: 3600000 }, // 1 hour max
          );
        }

        // Find the actual downloaded file (could be .mp4, .mkv, etc) and metadata
        try {
          const files = await fs.readdir(ctx.workDir);
          const downloadedFile = files.find(
            (f) =>
              f.startsWith(ctx.jobId) &&
              !f.endsWith('.part') &&
              !f.endsWith('.ytdl') &&
              !f.endsWith('.json'),
          );

          if (!downloadedFile) throw new Error('File not found after yt-dlp complete');

          ctx.sourcePath = path.join(ctx.workDir, downloadedFile);
          logger.info('YouTube download completed', { path: ctx.sourcePath, url: job.sourceUrl });

          const infoFile = files.find((f) => f.startsWith(ctx.jobId) && f.endsWith('.info.json'));
          if (infoFile) {
            try {
              const raw = await fs.readFile(path.join(ctx.workDir, infoFile), 'utf-8');
              const data = JSON.parse(raw);
              const title = data.title || undefined;
              const channel =
                data.uploader || data.channel || data.creator || data.channel_id || undefined;
              if (title) ctx.sourceTitle = title;
              if (channel) ctx.sourceChannel = channel;
              await db.job.update({
                where: { id: ctx.jobId },
                data: {
                  ...(title ? { sourceTitle: title } : {}),
                  ...(channel ? { sourceChannel: channel } : {}),
                },
              });
              logger.info('Extracted YouTube source metadata', { title, channel });
            } catch (err: any) {
              logger.warn('Failed to parse yt-dlp info.json', { error: err.message });
            }
          }
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

    if (!ctx.sourceChannel && (probe.tags.artist || probe.tags.uploader || probe.tags.author)) {
      ctx.sourceChannel = probe.tags.artist || probe.tags.uploader || probe.tags.author;
    }
    if ((!ctx.sourceTitle || ctx.sourceTitle === 'Untitled Source') && probe.tags.title) {
      ctx.sourceTitle = probe.tags.title;
    }
    if (ctx.sourceTitle || ctx.sourceChannel) {
      await db.job.update({
        where: { id: ctx.jobId },
        data: {
          ...(ctx.sourceTitle ? { sourceTitle: ctx.sourceTitle } : {}),
          ...(ctx.sourceChannel ? { sourceChannel: ctx.sourceChannel } : {}),
        },
      });
    }

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
