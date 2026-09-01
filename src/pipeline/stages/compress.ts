import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { db } from '../../server/db';
import { logger } from '../../server/logger';
import fs from 'fs/promises';
import path from 'path';

export class CompressStage implements PipelineStageHandler {
  stage = PipelineStage.COMPRESS;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting COMPRESS stage: final encoding + DB registration');

    const clips = ctx.stageData.clips;
    if (!clips || clips.length === 0) {
      throw new Error('No clips to compress');
    }

    const totalClips = clips.length;
    let completed = 0;

    for (const [idx, clip] of clips.entries()) {
      await onProgress(
        completed / totalClips,
        `Compressing clip ${idx + 1}/${totalClips}: ${clip.id}`,
      );

      const exportPath = clip.exportPath;
      if (!exportPath || !(await this.fileExists(exportPath))) {
        logger.warn(`Clip ${clip.id} has no export path, skipping compress`);
        completed++;
        continue;
      }

      // Apply final CRF 21 encoding (architecture spec)
      const compressedPath = exportPath.replace('.mp4', '_final.mp4');
      await this.applyFinalCompress(exportPath, compressedPath, ctx);

      // Replace export path with compressed final
      try {
        await fs.unlink(exportPath); // Remove uncompressed version
        await fs.rename(compressedPath, exportPath); // Rename compressed to final
      } catch (err: any) {
        logger.warn(`Failed to replace ${exportPath} with compressed: ${err.message}`);
        // If rename fails, keep both versions (non-fatal)
      }

      // Verify final file
      const stat = await fs.stat(exportPath);
      if (stat.size < 1024) {
        throw new Error(`Final export too small (${stat.size} bytes) for clip ${clip.id}`);
      }

      // Register Clip record in database
      await this.registerClipInDB(ctx.jobId, clip, exportPath, stat.size, ctx);

      completed++;
    }

    await onProgress(1.0, `COMPRESS stage completed: ${totalClips} clips finalized`);
    logger.info(`All ${totalClips} clips compressed and registered in database`);
  }

  /**
   * Apply final CRF 21 H.264 encoding per architecture spec.
   */
  private async applyFinalCompress(
    inputPath: string,
    outputPath: string,
    ctx: StageContext,
  ): Promise<void> {
    // Architecture spec from summary:
    // H.264/libx264, CRF 21, -preset medium, max 1920x1080 lanczos, never upscale,
    // AAC 192k 48kHz stereo, faststart, keyframeInterval 48

    const width = ctx.metadata?.width || 1920;
    const height = ctx.metadata?.height || 1080;

    // Scale filter: never upscale, max 1920x1080, pad with black bars if needed
    const scaleFilter =
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";

    const args = [
      '-i',
      inputPath,
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '21',
      '-g',
      '48', // keyframe interval
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2', // stereo
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ];

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 120000 });
  }

  /**
   * Register final Clip record in database with metadata.
   */
  private async registerClipInDB(
    jobId: string,
    clip: any,
    finalPath: string,
    fileSize: number,
    ctx: StageContext,
  ): Promise<void> {
    // Store relative path from project root
    const relativePath = path.relative(process.cwd(), finalPath);

    await db.clip.create({
      data: {
        jobId,
        segmentIndex: ctx.stageData.clips?.indexOf(clip) ?? 0, // Preserve order
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
        viralScore: 0.0, // TODO: retrieve from segment metadata
        confidence: 'MEDIUM', // TODO: retrieve from segment metadata
        exportPath: relativePath,
        subtitlePath: clip.subtitlePath ? path.relative(process.cwd(), clip.subtitlePath) : null,
        fileSize,
      },
    });

    logger.info(`Registered clip ${clip.id} in database: ${relativePath}`);
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
