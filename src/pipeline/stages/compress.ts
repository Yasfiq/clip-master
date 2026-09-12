import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { db } from '../../server/db';
import { logger } from '../../server/logger';
import { PATHS } from '../../server/paths';
import { pickStyle, buildForceStyle } from '../logic/subtitleStyle';
import { buildKenBurnsFilter, DEFAULT_KEN_BURNS, validateKenBurnsConfig } from '../logic/kenBurns';
import {
  chooseCropX,
  computeDynamicCropSegments,
  buildFfmpegCropFilter,
  DEFAULT_FACE_CROP,
  validateFaceCropConfig,
} from '../logic/faceCrop';
import { detectFacesInVideoSync } from '../binaries/faceDetect';
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
      if ((clip as any).isExported) {
        logger.info(`Clip ${clip.id} already exported, skipping`);
        completed++;
        continue;
      }

      await onProgress(
        completed / totalClips,
        `Compressing clip ${idx + 1}/${totalClips}: ${clip.id}`,
      );

      // Pick a different subtitle style per clip (SULE → TikTok → KAMAL cycle)
      const subtitleStyle = pickStyle(idx);
      logger.info(
        `Clip ${idx + 1}/${totalClips} style: ${subtitleStyle.label} (${subtitleStyle.id})`,
      );

      const exportPath = clip.exportPath;
      if (!exportPath || !(await this.fileExists(exportPath))) {
        logger.warn(`Clip ${clip.id} has no export path, skipping compress`);
        completed++;
        continue;
      }

      // Apply final encoding: scale to target ratio + burn subtitles
      const compressedPath = exportPath.replace('.mp4', '_final.mp4');
      await this.applyFinalCompress(exportPath, compressedPath, ctx, clip, subtitleStyle);

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
        logger.warn(
          `Final export too small (${stat.size} bytes) for clip ${clip.id}, skipping registration`,
        );
        completed++;
        continue;
      }

      // Register Clip record in database
      await this.registerClipInDB(ctx.jobId, clip, exportPath, stat.size, ctx, subtitleStyle);

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
    clip: any,
    subtitleStyle: ReturnType<typeof pickStyle>,
  ): Promise<void> {
    // H.264/libx264, CRF 21, target resolution from config (e.g., "1080x1920" for 9:16)

    // Parse targetResolution from config (format: "widthxheight")
    const targetRes = ctx.config?.targetResolution || '1920x1080';
    const targetW = parseInt(targetRes.split('x')[0], 10) || 1920;
    const targetH = parseInt(targetRes.split('x')[1], 10) || 1080;

    const portrait = targetH > targetW;

    // Pre-scale: height = targetH, width auto (keeps source aspect, no crop yet).
    let filter = 'scale=-1:' + targetH;

    // Face-aware horizontal crop for portrait Shorts: detect faces on the
    // raw cut and slide the vertical slice so the speaker stays centered.
    // Falls back to center when no faces found or detection fails.
    // TBD — requires user confirmation: default face crop padding 15%.
    let faceCropApplied = false;
    if (portrait) {
      try {
        const faceConfig = DEFAULT_FACE_CROP;
        const faceErr = validateFaceCropConfig(faceConfig);
        if (!faceErr) {
          const srcW = ctx.metadata?.width ?? 1280;
          const srcH = ctx.metadata?.height ?? 720;
          const duration = clip?.duration ?? 60;
          // Uniform temporal sampling across the clip (sample every 2s, capped to 36 frames)
          const sampleFps = 0.5;
          const maxFrames = Math.max(8, Math.min(Math.ceil(duration * sampleFps), 36));
          const det = await detectFacesInVideoSync(inputPath, srcW, srcH, faceConfig, {
            sampleFps,
            maxFrames,
          });
          if (det.detections.length > 0) {
            const targetAspect = targetW / targetH;
            const segments = computeDynamicCropSegments(
              det.detections,
              duration,
              srcW,
              srcH,
              targetAspect,
              faceConfig,
            );
            const scaledH = targetH;
            const scaledSrcW = Math.round((srcW * scaledH) / srcH);
            const cropW = Math.round(Math.round(srcH * targetAspect) * (scaledSrcW / srcW));
            const cropResult = buildFfmpegCropFilter(segments, srcW, scaledSrcW, cropW, scaledH);

            filter = `scale=-1:${scaledH},${cropResult.filter}`;
            faceCropApplied = true;
            logger.info(
              `Face crop ${clip.id}: primaryX=${cropResult.primaryX} cropW=${cropW} srcW=${scaledSrcW} dynamic=${cropResult.isDynamic} segments=${segments.length} (${det.detections.length} dets / ${det.framesAnalyzed} frames)`,
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Face detection failed for ${clip.id}: ${msg} (fallback to center crop)`);
      }
    }

    // Ken Burns slow push-in for portrait Shorts exports: zoompan between the
    // pre-scale (wider than target) and the final crop. Gives the static
    // center-column crop gentle motion like reference Shorts.
    // TBD — requires user confirmation: default zoom strength 1.0→1.12.
    let kenBurnsApplied = false;
    if (portrait && faceCropApplied) {
      const kbConfig = {
        ...DEFAULT_KEN_BURNS,
        outWidth: targetW,
        outHeight: targetH,
        duration: clip?.duration ?? 10,
        zoomStart: 1.0,
        zoomEnd: 1.12,
        fps: 30,
      };
      const kbErr = validateKenBurnsConfig(kbConfig);
      if (!kbErr) {
        const kb = buildKenBurnsFilter(kbConfig);
        // kb = zoompan (s=WxH) + guard crop; run before subtitle burn so text
        // burns crisply at final resolution.
        filter += ',' + kb;
        kenBurnsApplied = true;
      }
    }
    if (!kenBurnsApplied) {
      // Fallback / landscape: center-crop to target dimensions.
      filter += ',crop=' + targetW + ':' + targetH + ':(iw-' + targetW + ')/2:0';
    }

    // Burn subtitles into the video if a sidecar SRT exists for this clip.
    // Must run AFTER scale so text stays legible at target resolution.
    if (clip?.subtitlePath && ctx.config?.subtitleEnabled !== false) {
      try {
        await fs.access(clip.subtitlePath);
        // Escape colons in path for ffmpeg filter syntax
        const esc = clip.subtitlePath.replace(/:/g, '\\:');
        // Per-clip style picked by compress caller: SULE / TikTok / KAMAL.
        const styleParams = buildForceStyle(subtitleStyle);
        filter += `,subtitles='${esc}':force_style='${styleParams}'`;
        logger.info(
          `Burning subtitles into ${clip.id} (style=${subtitleStyle.id}): ${clip.subtitlePath}`,
        );
      } catch {
        logger.warn(`Subtitle sidecar missing for ${clip.id}: ${clip.subtitlePath}`);
      }
    }

    const args: string[] = [
      '-i',
      inputPath,
      '-vf',
      filter,
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

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
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
    subtitleStyle?: ReturnType<typeof pickStyle>,
  ): Promise<void> {
    // Store relative path from media/exports
    const relativePath = path.relative(PATHS.exports, finalPath);

    // Update existing Clip row (created by CUT stage in Phase 1)
    await db.clip
      .update({
        where: { id: clip.id },
        data: {
          exportPath: relativePath,
          isExported: true,
          metadata: {
            segmentIndex: ctx.stageData.clips?.indexOf(clip) ?? 0,
            subtitlePath: clip.subtitlePath ? path.relative(PATHS.work, clip.subtitlePath) : null,
            subtitleStyle: subtitleStyle?.id,
            fileSize,
          },
        },
      })
      .catch((err) => {
        logger.warn(`Failed to update Clip ${clip.id} in DB: ${err.message}`);
      });

    logger.info(`Updated clip ${clip.id} in database: ${relativePath}`);
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
