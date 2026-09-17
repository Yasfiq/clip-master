/**
 * Pure Framing & Layout Engine for 9:16 Shorts/Reels/TikTok.
 *
 * Supports 3 distinct framing strategies:
 * 1. 'auto-face': Dynamic pan-and-scan camera that tracks active speaker face.
 * 2. 'center': Classic fixed center crop.
 * 3. 'blur-fill': Blurred widescreen backdrop with original 16:9 in center.
 *
 * All functions are pure, deterministic, and testable without spawning processes.
 */

import { FramingMode } from '../../types/clipStudio';
import {
  FaceBox,
  DEFAULT_FACE_CROP,
  computeDynamicCropSegments,
  buildFfmpegCropFilter,
} from './faceCrop';
import { DEFAULT_KEN_BURNS, buildKenBurnsFilter } from './kenBurns';

export interface FramingInputOptions {
  srcW: number;
  srcH: number;
  srcFps?: number;
  duration: number;
  targetW?: number;
  targetH?: number;
  framingMode?: FramingMode;
  detections?: FaceBox[];
  kenBurnsEnabled?: boolean;
}

export interface FramingFilterResult {
  /** FFmpeg filter expression string */
  filter: string;
  /** Effective framing mode applied */
  effectiveMode: FramingMode;
  /** Whether the result uses a complex filter graph vs simple chain */
  isComplexGraph: boolean;
  /** Debug / inspection details */
  details: {
    sourceCropW?: number;
    sourceCropH?: number;
    facesCount: number;
  };
}

/**
 * Generate FFmpeg filter graph for Blur-Fill (16:9 video centered with blurred 9:16 background).
 */
export function buildBlurFillFilter(targetW: number, targetH: number): string {
  return (
    `split=2[bf_bg_raw][bf_fg_raw];` +
    `[bf_bg_raw]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=25:15[bf_bg];` +
    `[bf_fg_raw]scale=${targetW}:-1[bf_fg];` +
    `[bf_bg][bf_fg]overlay=0:(H-h)/2`
  );
}

/**
 * Main Pure Builder: Converts framing strategy and options into production FFmpeg filter graph.
 */
export function buildFramingFilterGraph(options: FramingInputOptions): FramingFilterResult {
  const {
    srcW,
    srcH,
    srcFps = 30,
    duration,
    targetW = 1080,
    targetH = 1920,
    framingMode = 'auto-face',
    detections = [],
    kenBurnsEnabled = true,
  } = options;

  const targetAspect = targetW / targetH;
  const portrait = targetH > targetW;

  // If already portrait or square, use simple scale/crop without re-framing
  if (!portrait || srcW <= srcH) {
    return {
      filter: `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      effectiveMode: 'center',
      isComplexGraph: false,
      details: { facesCount: detections.length },
    };
  }

  // 1. BLUR-FILL MODE
  if (framingMode === 'blur-fill') {
    const filter = buildBlurFillFilter(targetW, targetH);
    return {
      filter,
      effectiveMode: 'blur-fill',
      isComplexGraph: true,
      details: { facesCount: detections.length },
    };
  }

  // 2. AUTO-FACE TRACKING MODE
  if (framingMode === 'auto-face') {
    const validDetections = detections.filter((d) => d.score >= DEFAULT_FACE_CROP.minScore);

    if (validDetections.length > 0) {
      const segments = computeDynamicCropSegments(
        validDetections,
        duration,
        srcW,
        srcH,
        targetAspect,
        DEFAULT_FACE_CROP,
      );

      const scaledH = targetH;
      const scaledSrcW = Math.round((srcW * scaledH) / srcH);
      const rawCropW = Math.round(Math.round(srcH * targetAspect) * (scaledSrcW / srcW));
      const cropW = Math.floor(rawCropW / 2) * 2;

      const cropResult = buildFfmpegCropFilter(segments, srcW, scaledSrcW, cropW, scaledH);
      let faceFilter = `scale=-1:${scaledH},${cropResult.filter}`;

      if (kenBurnsEnabled) {
        const kbConfig = {
          ...DEFAULT_KEN_BURNS,
          outWidth: targetW,
          outHeight: targetH,
          duration: duration || 10,
          zoomStart: 1.0,
          zoomEnd: 1.08,
          fps: srcFps,
        };
        const kb = buildKenBurnsFilter(kbConfig);
        faceFilter += ',' + kb;
      }

      return {
        filter: faceFilter,
        effectiveMode: 'auto-face',
        isComplexGraph: false,
        details: {
          sourceCropW: cropW,
          sourceCropH: scaledH,
          facesCount: validDetections.length,
        },
      };
    }
  }

  // 3. CENTER CROP (Fallback or Explicit)
  const defaultCropW = Math.floor(Math.round(srcH * targetAspect) / 2) * 2;
  const centerFilter = `scale=-1:${targetH},crop=${targetW}:${targetH}:(iw-${targetW})/2:0`;

  return {
    filter: centerFilter,
    effectiveMode: 'center',
    isComplexGraph: false,
    details: {
      sourceCropW: defaultCropW,
      sourceCropH: srcH,
      facesCount: 0,
    },
  };
}
