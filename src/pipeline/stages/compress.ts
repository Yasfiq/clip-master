import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { probeMedia } from '../binaries/ffprobe';
import { db } from '../../server/db';
import { logger } from '../../server/logger';
import { PATHS } from '../../server/paths';
import { pickStyle, getStyleById, buildForceStyle, CLIPAJAIB_STYLE } from '../logic/subtitleStyle';
import { buildKenBurnsFilter, DEFAULT_KEN_BURNS, validateKenBurnsConfig } from '../logic/kenBurns';
import {
  computeDynamicCropSegments,
  buildFfmpegCropFilter,
  DEFAULT_FACE_CROP,
  validateFaceCropConfig,
} from '../logic/faceCrop';
import { detectFacesInVideoSync } from '../binaries/faceDetect';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '../../types/clipStudio';
import { buildStudioFilterGraph } from '../logic/studioFilterGraph';
import { writeSourcePillSvg } from '../logic/brandingPill';
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

      try {
        // Pick a different subtitle style per clip (SULE → TikTok → KAMAL cycle)
        const subtitleStyle = pickStyle(idx);
        logger.info(
          `Clip ${idx + 1}/${totalClips} style: ${subtitleStyle.label} (${subtitleStyle.id})`,
        );

        const exportPath = clip.exportPath;
        if (!exportPath || !(await this.fileExists(exportPath))) {
          logger.warn(`Clip ${clip.id} has no export path, skipping compress`);
          continue;
        }

        // Apply final encoding: scale to target ratio + studio filters / subtitles
        const compressedPath = exportPath.replace('.mp4', '_final.mp4');
        const appliedStudioConfig = await this.applyFinalCompress(
          exportPath,
          compressedPath,
          ctx,
          clip,
          subtitleStyle,
        );

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
          continue;
        }

        // Register Clip record in database
        await this.registerClipInDB(
          ctx.jobId,
          clip,
          exportPath,
          stat.size,
          ctx,
          appliedStudioConfig
            ? getStyleById(appliedStudioConfig.subtitleStyleId || 'clipajaib') || CLIPAJAIB_STYLE
            : subtitleStyle,
          appliedStudioConfig,
        );
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Encoding failed for clip ${clip.id}: ${errMsg}`, { error: err });
        clip.error = errMsg;
      } finally {
        completed++;
      }
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
  ): Promise<StudioConfig | undefined> {
    // Parse targetResolution from config (format: "widthxheight")
    const targetRes = ctx.config?.targetResolution || '1080x1920';
    const targetW = parseInt(targetRes.split('x')[0], 10) || 1080;
    const targetH = parseInt(targetRes.split('x')[1], 10) || 1920;

    const portrait = targetH > targetW;
    const probe = await probeMedia(inputPath).catch(() => null);
    const srcFps = probe?.fps || ctx.metadata?.fps || 30;

    // Base video scaling: ensure video covers target dimensions with even numbers
    let baseVideoFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,scale=trunc(iw/2)*2:trunc(ih/2)*2`;

    // Face-aware horizontal crop for portrait Shorts: detect faces on the
    // raw cut and slide the vertical slice so the speaker stays centered.
    // Falls back to center when no faces found or detection fails.
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
            const rawCropW = Math.round(Math.round(srcH * targetAspect) * (scaledSrcW / srcW));
            const cropW = Math.floor(rawCropW / 2) * 2;
            const cropResult = buildFfmpegCropFilter(segments, srcW, scaledSrcW, cropW, scaledH);

            baseVideoFilter = `scale=-1:${scaledH},${cropResult.filter}`;
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
    let kenBurnsApplied = false;
    if (portrait && faceCropApplied) {
      const kbConfig = {
        ...DEFAULT_KEN_BURNS,
        outWidth: targetW,
        outHeight: targetH,
        duration: clip?.duration ?? 10,
        zoomStart: 1.0,
        zoomEnd: 1.12,
        fps: srcFps,
      };
      const kbErr = validateKenBurnsConfig(kbConfig);
      if (!kbErr) {
        const kb = buildKenBurnsFilter(kbConfig);
        baseVideoFilter += ',' + kb;
        kenBurnsApplied = true;
      }
    }
    if (!kenBurnsApplied && !faceCropApplied) {
      // Fallback / landscape: center-crop to target dimensions.
      baseVideoFilter += ',crop=' + targetW + ':' + targetH + ':(iw-' + targetW + ')/2:0';
    }

    if (portrait) {
      // Formula Standar Baku via buildStudioFilterGraph
      const sourceChannel = clip.sourceChannel || ctx.sourceChannel || '';
      const sourceText = sourceChannel ? `Sumber: ${sourceChannel}` : '';
      const defaultStudioConfig: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        hookText: clip.hookHeadline || '',
        hookPosition: 'top',
        sourceText,
        sourceEnabled: Boolean(sourceText),
        logoEnabled: true,
        logoPath: 'media/assets/logo.png',
        logoPosition: 'top-left',
        subtitleStyleId: 'clipajaib',
        fadeInDuration: 0.4,
        fadeOutDuration: 0.6,
        freezeDuration: 0,
      };

      const clipStudioRaw =
        clip.studioConfig && typeof clip.studioConfig === 'object' ? clip.studioConfig : {};
      const studioConfig: StudioConfig = {
        ...defaultStudioConfig,
        ...clipStudioRaw,
      };

      // Check if media/assets/logo.png exists
      let logoResolvedPath: string | undefined;
      if (studioConfig.logoEnabled && studioConfig.logoPath) {
        const candidatePaths = [
          path.isAbsolute(studioConfig.logoPath)
            ? studioConfig.logoPath
            : path.join(PATHS.root, studioConfig.logoPath),
          path.join(PATHS.assets, 'logo.png'),
          path.join(PATHS.root, 'media/assets/logo.png'),
        ];
        for (const cp of candidatePaths) {
          if (await this.fileExists(cp)) {
            logoResolvedPath = cp;
            break;
          }
        }
        if (!logoResolvedPath) {
          logger.warn(`Logo file not found at candidate paths for clip ${clip.id}`);
        }
      }

      // Generate vector SVG source pill if source attribution is enabled
      let pillResolvedPath: string | undefined;
      if (studioConfig.sourceEnabled && studioConfig.sourceText?.trim()) {
        try {
          const brandingDir = path.join(ctx.workDir, 'branding');
          await fs.mkdir(brandingDir, { recursive: true });
          const pillDestPath = path.join(brandingDir, `${clip.id}_pill.svg`);
          await writeSourcePillSvg(pillDestPath, {
            sourceText: studioConfig.sourceText.trim(),
            fontSize: 20,
            height: 50,
            fillColor: 'white',
            fillOpacity: 0.88,
            textColor: '#1a1a1a',
            fontFamily: 'Montserrat, DejaVu Sans, sans-serif',
          });
          pillResolvedPath = pillDestPath;
        } catch (pillErr: any) {
          logger.warn(`Failed to generate SVG pill for clip ${clip.id}: ${pillErr.message}`);
        }
      }

      // Subtitle sidecar check
      let activeSubtitlePath: string | undefined;
      if (clip?.subtitlePath && ctx.config?.subtitleEnabled !== false) {
        if (await this.fileExists(clip.subtitlePath)) {
          const stat = await fs.stat(clip.subtitlePath).catch(() => null);
          if (stat && stat.size > 0) {
            activeSubtitlePath = clip.subtitlePath;
          }
        } else {
          logger.warn(`Subtitle sidecar missing for ${clip.id}: ${clip.subtitlePath}`);
        }
      }

      // Burn TikTok yellow subtitles
      const style = getStyleById(studioConfig.subtitleStyleId || 'clipajaib') || CLIPAJAIB_STYLE;
      const subtitleForceStyle = buildForceStyle(style);

      const duration = clip?.duration ?? 60;
      const { filterComplex, hasLogoInput, hasPillInput } = buildStudioFilterGraph({
        inputVideoDuration: duration,
        width: targetW,
        height: targetH,
        config: studioConfig,
        subtitlePath: activeSubtitlePath,
        logoResolvedPath,
        pillResolvedPath,
        isAssSubtitle: false,
        filmBurnIntro: Boolean(studioConfig.filmBurnIntro),
        subtitleForceStyle,
        baseVideoFilter,
        hasAudio: ctx.metadata?.hasAudio ?? true,
      });

      const args: string[] = [
        '-i',
        inputPath,
        ...(hasLogoInput && logoResolvedPath ? ['-i', logoResolvedPath] : []),
        ...(hasPillInput && pillResolvedPath ? ['-i', pillResolvedPath] : []),
        '-filter_complex',
        filterComplex,
        '-map',
        '[v_out]',
        '-map',
        '[a_out]',
        '-r',
        String(srcFps),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '21',
        '-g',
        '48',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ];

      await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
      return studioConfig;
    } else {
      // Fallback / landscape: burn subtitles into video if sidecar SRT exists
      let filter = baseVideoFilter;
      if (clip?.subtitlePath && ctx.config?.subtitleEnabled !== false) {
        try {
          const stat = await fs.stat(clip.subtitlePath).catch(() => null);
          if (stat && stat.size > 0) {
            const esc = clip.subtitlePath
              .replace(/\\/g, '/')
              .replace(/'/g, "\\'")
              .replace(/:/g, '\\:');
            const styleParams = buildForceStyle(subtitleStyle);
            filter += `,subtitles='${esc}':force_style='${styleParams}'`;
            logger.info(
              `Burning subtitles into ${clip.id} (style=${subtitleStyle.id}): ${clip.subtitlePath}`,
            );
          }
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
        '48',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ];

      await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
      return undefined;
    }
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
    studioConfig?: StudioConfig,
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
          ...(studioConfig ? { studioConfig: studioConfig as any } : {}),
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
