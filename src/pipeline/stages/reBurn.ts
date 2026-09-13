import path from 'path';
import fs from 'fs/promises';
import { db } from '../../server/db';
import { logger } from '../../server/logger';
import { PATHS, BINARIES } from '../../server/paths';
import { runBinaryChecked } from '../binaries/spawn';
import { probeMedia } from '../binaries/ffprobe';
import { detectFacesInVideoSync } from '../binaries/faceDetect';
import {
  computeDynamicCropSegments,
  buildFfmpegCropFilter,
  DEFAULT_FACE_CROP,
  validateFaceCropConfig,
} from '../logic/faceCrop';
import { buildKenBurnsFilter, DEFAULT_KEN_BURNS, validateKenBurnsConfig } from '../logic/kenBurns';
import {
  getStyleById,
  buildForceStyle,
  TIKTOK_STYLE,
  pickStyle,
  SubtitleStyle,
} from '../logic/subtitleStyle';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '../../types/clipStudio';
import { buildStudioFilterGraph } from '../logic/studioFilterGraph';
import { generateHookTtsAudio } from '../logic/ttsVoiceover';
import { parseSrt, serializeSrt, delaySubtitleCues } from '../logic/srtParser';
import { writeSourcePillSvg } from '../logic/brandingPill';
import { WordTiming, SrtCueInput } from '../logic/wordChunker';
import { generateUnifiedAssDocument } from '../logic/conversationalCaptions';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function reBurnClipSubtitles(
  clipId: string,
  styleIdOrConfig?: string | Partial<StudioConfig>,
  studioConfigInput?: Partial<StudioConfig>,
): Promise<{ exportPath: string; fileSize: number; duration: number }> {
  let styleId: string | undefined;
  let studioConfigParam: Partial<StudioConfig> | undefined;

  if (typeof styleIdOrConfig === 'string') {
    styleId = styleIdOrConfig;
    studioConfigParam = studioConfigInput;
  } else if (typeof styleIdOrConfig === 'object' && styleIdOrConfig !== null) {
    studioConfigParam = styleIdOrConfig;
    styleId = studioConfigParam.subtitleStyleId;
  }

  const clip = await db.clip.findUnique({
    where: { id: clipId },
    include: { job: { include: { config: true } } },
  });

  if (!clip) {
    throw new Error(`Clip ${clipId} not found`);
  }

  const existingConfig =
    typeof clip.studioConfig === 'object' && clip.studioConfig !== null
      ? (clip.studioConfig as unknown as StudioConfig)
      : null;

  const baseConfig: StudioConfig = {
    ...DEFAULT_STUDIO_CONFIG,
    hookText: clip.hookHeadline || '',
    sourceText: clip.job?.sourceChannel ? `Sumber: ${clip.job.sourceChannel}` : '',
    ...(existingConfig || {}),
  };

  const finalStudioConfig: StudioConfig = {
    ...baseConfig,
    ...(studioConfigParam || {}),
  };

  if (styleId) {
    finalStudioConfig.subtitleStyleId = styleId;
  }

  let videoInputPath: string | null = null;
  if (clip.editedPath) {
    const candidate1 = path.isAbsolute(clip.editedPath)
      ? clip.editedPath
      : path.join(PATHS.work, clip.editedPath);
    if (await fileExists(candidate1)) {
      videoInputPath = candidate1;
    } else {
      const candidate2 = path.join(
        PATHS.work,
        clip.jobId,
        'edited',
        path.basename(clip.editedPath),
      );
      if (await fileExists(candidate2)) {
        videoInputPath = candidate2;
      }
    }
  }

  if (!videoInputPath) {
    const defaultEditedPath = path.join(PATHS.work, clip.jobId, 'edited', `${clip.id}_edited.mp4`);
    if (await fileExists(defaultEditedPath)) {
      videoInputPath = defaultEditedPath;
    }
  }

  // Fallback to cutPath if editedPath is not present (similar to export stage)
  if (!videoInputPath && clip.cutPath) {
    const cutCandidate1 = path.isAbsolute(clip.cutPath)
      ? clip.cutPath
      : path.join(PATHS.work, clip.cutPath);
    if (await fileExists(cutCandidate1)) {
      videoInputPath = cutCandidate1;
    } else {
      const cutCandidate2 = path.join(PATHS.work, clip.jobId, 'cuts', path.basename(clip.cutPath));
      if (await fileExists(cutCandidate2)) {
        videoInputPath = cutCandidate2;
      }
    }
  }

  // Fallback to exportPath if work files were cleaned up
  if (!videoInputPath && clip.exportPath) {
    const expCandidate1 = path.isAbsolute(clip.exportPath)
      ? clip.exportPath
      : path.join(PATHS.exports, clip.exportPath);
    if (await fileExists(expCandidate1)) {
      videoInputPath = expCandidate1;
    } else {
      const expCandidate2 = path.join(PATHS.exports, path.basename(clip.exportPath));
      if (await fileExists(expCandidate2)) {
        videoInputPath = expCandidate2;
      }
    }
  }

  if (!videoInputPath) {
    throw new Error(`Clip ${clipId} has no valid video file (edited, cut, or exported) to re-burn`);
  }

  let srtPath: string | null = null;
  if (clip.subtitlePath) {
    const subCandidate = path.isAbsolute(clip.subtitlePath)
      ? clip.subtitlePath
      : path.join(PATHS.work, clip.subtitlePath);
    if (await fileExists(subCandidate)) {
      srtPath = subCandidate;
    }
  }

  if (!srtPath) {
    const workSrt = path.join(PATHS.work, clip.jobId, 'subtitles', `${clip.id}.srt`);
    if (await fileExists(workSrt)) {
      srtPath = workSrt;
    }
  }

  if (!srtPath && clip.exportPath) {
    const exportBase = path.isAbsolute(clip.exportPath)
      ? clip.exportPath.replace(/\.mp4$/i, '.srt')
      : path.join(PATHS.exports, clip.exportPath.replace(/\.mp4$/i, '.srt'));
    if (await fileExists(exportBase)) {
      srtPath = exportBase;
    }
  }

  if (!srtPath) {
    const exportSrt = path.join(PATHS.exports, `${clip.id}.srt`);
    if (await fileExists(exportSrt)) {
      srtPath = exportSrt;
    }
  }

  let style: SubtitleStyle | undefined;
  if (finalStudioConfig.subtitleStyleId) {
    style = getStyleById(finalStudioConfig.subtitleStyleId);
  } else if (
    typeof clip.metadata === 'object' &&
    clip.metadata !== null &&
    (clip.metadata as any).subtitleStyle
  ) {
    style = getStyleById((clip.metadata as any).subtitleStyle);
  } else if (
    typeof clip.metadata === 'object' &&
    clip.metadata !== null &&
    typeof (clip.metadata as any).segmentIndex === 'number'
  ) {
    style = pickStyle((clip.metadata as any).segmentIndex);
  }
  if (!style) {
    style = pickStyle(0);
  }

  let logoResolvedPath: string | undefined;
  if (finalStudioConfig.logoEnabled) {
    // Prevent path traversal: only resolve strictly within PATHS.assets
    const defaultAssetLogo = path.join(PATHS.assets, 'logo.png');
    if (await fileExists(defaultAssetLogo)) {
      logoResolvedPath = defaultAssetLogo;
    } else if (finalStudioConfig.logoPath) {
      const safeAssetPath = path.join(PATHS.assets, path.basename(finalStudioConfig.logoPath));
      if (await fileExists(safeAssetPath)) {
        logoResolvedPath = safeAssetPath;
      } else {
        logger.warn(`Logo path not found at ${safeAssetPath}, omitting logo layer`);
      }
    }
  }

  const targetRes = clip.job?.config?.targetResolution || '1080x1920';
  const [wStr, hStr] = targetRes.split('x');
  const targetW = parseInt(wStr, 10) || 1080;
  const targetH = parseInt(hStr, 10) || 1920;
  const targetAspect = targetW / targetH;
  const portrait = targetH > targetW;

  const probe = await probeMedia(videoInputPath);
  const srcW = probe.width ?? 1280;
  const srcH = probe.height ?? 720;
  const srcFps = probe.fps || 30;
  const duration = probe.durationSec || clip.duration || 60;

  let baseFilter = `scale=-1:${targetH}`;
  let faceCropApplied = false;

  if (portrait) {
    try {
      const faceConfig = DEFAULT_FACE_CROP;
      const faceErr = validateFaceCropConfig(faceConfig);
      if (!faceErr) {
        const sampleFps = 0.5;
        const maxFrames = Math.max(8, Math.min(Math.ceil(duration * sampleFps), 36));
        const det = await detectFacesInVideoSync(videoInputPath, srcW, srcH, faceConfig, {
          sampleFps,
          maxFrames,
        });

        if (det.detections.length > 0) {
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

          baseFilter = `scale=-1:${scaledH},${cropResult.filter}`;
          faceCropApplied = true;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Face detection failed during reBurn for clip ${clip.id}: ${msg}`);
    }
  }

  let kenBurnsApplied = false;
  if (portrait && faceCropApplied) {
    const kbConfig = {
      ...DEFAULT_KEN_BURNS,
      outWidth: targetW,
      outHeight: targetH,
      duration: duration,
      zoomStart: 1.0,
      zoomEnd: 1.12,
      fps: srcFps,
    };
    const kbErr = validateKenBurnsConfig(kbConfig);
    if (!kbErr) {
      const kb = buildKenBurnsFilter(kbConfig);
      baseFilter += ',' + kb;
      kenBurnsApplied = true;
    }
  }

  if (!kenBurnsApplied && !faceCropApplied) {
    baseFilter += `,crop=${targetW}:${targetH}:(iw-${targetW})/2:0`;
  }

  const forceStyle = buildForceStyle(style);
  const renderTag = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. Generate hook TTS voiceover if enabled and hook text exists
  let ttsAudioPath: string | undefined;
  let ttsAudioDuration: number | undefined;

  if (finalStudioConfig.hookTtsEnabled !== false && finalStudioConfig.hookText?.trim()) {
    try {
      const ttsDestPath = path.join(
        PATHS.work,
        clip.jobId,
        'tts',
        `${clip.id}_${renderTag}_hook.mp3`,
      );
      const voice = finalStudioConfig.hookTtsVoice || 'id-ID-GadisNeural';
      const ttsResult = await generateHookTtsAudio({
        text: finalStudioConfig.hookText.trim(),
        outputPath: ttsDestPath,
        voice,
        rate: '+20%',
      });
      ttsAudioPath = ttsResult.audioPath;
      ttsAudioDuration = ttsResult.duration;

      if (!finalStudioConfig.hookDuration || finalStudioConfig.hookDuration <= 0) {
        finalStudioConfig.hookDuration = Number(Math.max(2.0, ttsResult.duration).toFixed(2));
      }
    } catch (ttsErr) {
      logger.warn(
        `Failed to generate TTS hook audio for clip ${clip.id}: ${ttsErr instanceof Error ? ttsErr.message : String(ttsErr)}`,
      );
    }
  }

  // 2. Generate vector SVG source pill if source attribution is enabled
  let pillResolvedPath: string | undefined;
  if (finalStudioConfig.sourceEnabled && finalStudioConfig.sourceText?.trim()) {
    try {
      const pillDestPath = path.join(
        PATHS.work,
        clip.jobId,
        'branding',
        `${clip.id}_${renderTag}_pill.svg`,
      );
      await writeSourcePillSvg(pillDestPath, {
        sourceText: finalStudioConfig.sourceText.trim(),
        fontSize: portrait ? 20 : 18,
        height: 50,
        fillColor: 'white',
        fillOpacity: 0.88,
        textColor: '#1a1a1a',
        fontFamily: 'Montserrat, DejaVu Sans, sans-serif',
      });
      pillResolvedPath = pillDestPath;
    } catch (pillErr) {
      logger.warn(`Failed to generate SVG pill for clip ${clip.id}: ${pillErr}`);
    }
  }

  // 3. Generate unified ASS subtitle file (Floating Typography Hook + Conversational Subtitles)
  let activeSubtitlePath = srtPath;
  let isAssSubtitle = false;

  if (srtPath) {
    try {
      const rawSrt = await fs.readFile(srtPath, 'utf8');
      const parsedCues = parseSrt(rawSrt);

      const isConversationalStyle =
        !finalStudioConfig.subtitleStyleId ||
        finalStudioConfig.subtitleStyleId === 'clipajaib' ||
        finalStudioConfig.subtitleStyleId === 'tiktok' ||
        finalStudioConfig.subtitleStyleId === 'sule' ||
        finalStudioConfig.subtitleStyleId === 'kamal' ||
        Boolean(finalStudioConfig.hookText?.trim());

      if (isConversationalStyle) {
        const assContent = generateUnifiedAssDocument({
          width: targetW,
          height: targetH,
          hookText: finalStudioConfig.hookText?.trim() || '',
          hookDuration: finalStudioConfig.hookDuration || 3.1,
          dialogueCues: parsedCues,
          fontName: 'Montserrat',
          dialogueFontSize: style.fontSize || 62,
          dialogueOutline: style.outline || 4.5,
          dialogueMarginV: style.marginV || 420,
          primaryColorHex: style.primaryColour,
          outlineColorHex: style.outlineColour,
        });

        const assDestPath = path.join(
          PATHS.work,
          clip.jobId,
          'subtitles',
          `${clip.id}_${renderTag}_studio.ass`,
        );
        await fs.mkdir(path.dirname(assDestPath), { recursive: true });
        await fs.writeFile(assDestPath, assContent, 'utf8');
        activeSubtitlePath = assDestPath;
        isAssSubtitle = true;
      }
    } catch (assErr) {
      logger.warn(`Failed to generate unified ASS for clip ${clip.id}: ${assErr}`);
    }
  }

  // Fallback: Synchronize subtitles with hook delay if using standard SRT
  if (!isAssSubtitle && srtPath) {
    const subDelay =
      typeof finalStudioConfig.subtitleDelay === 'number' ? finalStudioConfig.subtitleDelay : 0;

    if (subDelay > 0) {
      try {
        const rawSrt = await fs.readFile(srtPath, 'utf8');
        const parsedCues = parseSrt(rawSrt);
        const delayedCues = delaySubtitleCues(parsedCues, subDelay);
        const delayedSrtPath = path.join(
          PATHS.work,
          clip.jobId,
          'subtitles',
          `${clip.id}_${renderTag}_delayed.srt`,
        );
        await fs.mkdir(path.dirname(delayedSrtPath), { recursive: true });
        await fs.writeFile(delayedSrtPath, serializeSrt(delayedCues), 'utf8');
        activeSubtitlePath = delayedSrtPath;
      } catch (delayErr) {
        logger.warn(`Failed to delay subtitle cues for clip ${clip.id}: ${delayErr}`);
      }
    }
  }

  const { filterComplex, hasLogoInput, hasPillInput, hasTtsInput, effectiveDuration } =
    buildStudioFilterGraph({
      inputVideoDuration: duration,
      width: targetW,
      height: targetH,
      config: finalStudioConfig,
      subtitlePath: activeSubtitlePath || undefined,
      logoResolvedPath,
      pillResolvedPath,
      isAssSubtitle,
      filmBurnIntro: finalStudioConfig.filmBurnIntro !== false,
      subtitleForceStyle: isAssSubtitle ? undefined : forceStyle,
      baseVideoFilter: baseFilter,
      ttsAudioPath,
      ttsAudioDuration,
      hasAudio: probe.hasAudio ?? true,
    });

  let finalExportPath: string;
  if (clip.exportPath) {
    finalExportPath = path.isAbsolute(clip.exportPath)
      ? clip.exportPath
      : path.join(PATHS.exports, clip.exportPath);
  } else {
    finalExportPath = path.join(PATHS.exports, clip.jobId, `${clip.id}_final.mp4`);
  }

  await fs.mkdir(path.dirname(finalExportPath), { recursive: true });
  const tempExportPath = `${finalExportPath}.${Date.now()}.${process.pid}.tmp.mp4`;

  const ffmpegArgs: string[] = [
    '-i',
    videoInputPath,
    ...(hasLogoInput && logoResolvedPath ? ['-i', logoResolvedPath] : []),
    ...(hasPillInput && pillResolvedPath ? ['-i', pillResolvedPath] : []),
    ...(hasTtsInput && ttsAudioPath ? ['-i', ttsAudioPath] : []),
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
    '20',
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
    tempExportPath,
  ];

  try {
    await runBinaryChecked(BINARIES.ffmpeg, ffmpegArgs, { timeoutMs: 1800000 });
    await fs.rename(tempExportPath, finalExportPath);
  } catch (err) {
    await fs.unlink(tempExportPath).catch(() => {});
    throw err;
  }

  const stat = await fs.stat(finalExportPath);
  const fileSize = stat.size;
  const finalProbe = await probeMedia(finalExportPath).catch(() => null);
  const finalDuration = finalProbe?.durationSec || effectiveDuration;

  const relativeExportPath = path.relative(PATHS.exports, finalExportPath);
  const existingMetadata =
    typeof clip.metadata === 'object' && clip.metadata !== null
      ? (clip.metadata as Record<string, any>)
      : {};

  await db.clip.update({
    where: { id: clip.id },
    data: {
      exportPath: relativeExportPath,
      isExported: true,
      duration: finalDuration,
      hookHeadline: finalStudioConfig.hookText || clip.hookHeadline,
      studioConfig: finalStudioConfig as any,
      metadata: {
        ...existingMetadata,
        fileSize,
        reburnAt: new Date().toISOString(),
        subtitleStyle: style.id,
      },
    },
  });

  await db.jobLog.create({
    data: {
      jobId: clip.jobId,
      stage: 'COMPRESS',
      level: 'info',
      message: `Re-burned subtitles and studio layers for clip ${clip.id} (style=${style.id})`,
      metadata: {
        clipId: clip.id,
        styleId: style.id,
        hookText: finalStudioConfig.hookText,
        fileSize,
        duration: finalDuration,
      },
    },
  });

  logger.info(`Re-burned subtitles for clip ${clip.id} saved to ${finalExportPath}`);

  return {
    exportPath: finalExportPath,
    fileSize,
    duration: finalDuration,
  };
}
