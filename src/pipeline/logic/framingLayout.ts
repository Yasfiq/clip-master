/**
 * Pure Framing & Layout Engine for 9:16 Shorts/Reels/TikTok.
 *
 * Supports 4 distinct framing strategies:
 * 1. 'auto-face': Dynamic pan-and-scan camera that tracks active speaker face.
 * 2. 'split-podcast': Dual-speaker vertical stack (Host top 50%, Guest bottom 50%)
 *    with customizable divider line and center-divider subtitles.
 * 3. 'center': Classic fixed center crop.
 * 4. 'blur-fill': Blurred widescreen backdrop with original 16:9 in center.
 *
 * All functions are pure, deterministic, and testable without spawning processes.
 */

import { FramingMode, SplitPodcastConfig } from '../../types/clipStudio';
import {
  FaceBox,
  FaceCropConfig,
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
  splitConfig?: SplitPodcastConfig;
  detections?: FaceBox[];
  kenBurnsEnabled?: boolean;
}

export interface FramingFilterResult {
  /** FFmpeg filter expression string */
  filter: string;
  /** Effective framing mode applied */
  effectiveMode: FramingMode;
  /** Whether the result uses a complex filter graph (split/vstack) vs simple chain */
  isComplexGraph: boolean;
  /** Recommended ASS subtitle vertical margin (MarginV in pixels) */
  recommendedMarginV: number;
  /** Divider line information if split podcast */
  divider?: {
    color: string;
    thickness: number;
    y: number;
  };
  /** Debug / inspection details */
  details: {
    sourceCropW?: number;
    sourceCropH?: number;
    topCropX?: number;
    bottomCropX?: number;
    facesCount: number;
  };
}

export const DIVIDER_COLORS: Record<string, string> = {
  gold: '#EAB308',
  cyan: '#06B6D4',
  zinc: '#52525B',
  white: '#FFFFFF',
};

/**
 * Validate and sanitize split podcast coordinates.
 */
export function sanitizeSplitConfig(config?: SplitPodcastConfig): Required<SplitPodcastConfig> {
  const topPercent = Math.max(0, Math.min(100, config?.topCropXPercent ?? 25));
  const bottomPercent = Math.max(0, Math.min(100, config?.bottomCropXPercent ?? 75));
  const color = config?.dividerColor || 'gold';
  const thickness = Math.max(0, Math.min(20, config?.dividerThickness ?? 4));
  const subtitlePlacement = config?.subtitlePlacement || 'bottom';

  return {
    topCropXPercent: topPercent,
    bottomCropXPercent: bottomPercent,
    dividerColor: color,
    dividerThickness: thickness,
    subtitlePlacement,
  };
}

/**
 * Compute the crop coordinates for split-podcast top and bottom speakers.
 */
export function computeSplitSpeakerCrops(
  srcW: number,
  srcH: number,
  targetW: number,
  halfTargetH: number,
  splitConfig: Required<SplitPodcastConfig>,
): {
  cropW: number;
  cropH: number;
  topX: number;
  bottomX: number;
} {
  // Target aspect ratio for each half (e.g. 1080 / 960 = 1.125)
  const halfAspect = targetW / halfTargetH;
  const rawCropW = Math.round(srcH * halfAspect);
  // Ensure even dimensions
  const cropW = Math.min(srcW, Math.floor(rawCropW / 2) * 2);
  const cropH = srcH;

  // Calculate top speaker X center (host, default ~25% from left)
  const topCenterX = Math.round(srcW * (splitConfig.topCropXPercent / 100));
  const rawTopX = topCenterX - Math.round(cropW / 2);
  const topX = Math.max(0, Math.min(srcW - cropW, Math.floor(rawTopX / 2) * 2));

  // Calculate bottom speaker X center (guest, default ~75% from left)
  const bottomCenterX = Math.round(srcW * (splitConfig.bottomCropXPercent / 100));
  const rawBottomX = bottomCenterX - Math.round(cropW / 2);
  const bottomX = Math.max(0, Math.min(srcW - cropW, Math.floor(rawBottomX / 2) * 2));

  return { cropW, cropH, topX, bottomX };
}

/**
 * Generate FFmpeg filter graph for Dual-Speaker Split-Screen Podcast layout.
 */
export function buildSplitPodcastFilter(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  splitConfig: Required<SplitPodcastConfig>,
): { filter: string; divider?: { color: string; thickness: number; y: number } } {
  const halfH = Math.floor(targetH / 2);
  const { cropW, cropH, topX, bottomX } = computeSplitSpeakerCrops(
    srcW,
    srcH,
    targetW,
    halfH,
    splitConfig,
  );

  let graph =
    `split=2[sp_top_raw][sp_bot_raw];` +
    `[sp_top_raw]crop=${cropW}:${cropH}:${topX}:0,scale=${targetW}:${halfH}:flags=lanczos[sp_top];` +
    `[sp_bot_raw]crop=${cropW}:${cropH}:${bottomX}:0,scale=${targetW}:${halfH}:flags=lanczos[sp_bot];` +
    `[sp_top][sp_bot]vstack=inputs=2`;

  let dividerInfo: { color: string; thickness: number; y: number } | undefined;

  if (splitConfig.dividerColor !== 'none' && splitConfig.dividerThickness > 0) {
    const hex = DIVIDER_COLORS[splitConfig.dividerColor] || '#EAB308';
    const t = splitConfig.dividerThickness;
    const y = halfH - Math.floor(t / 2);
    graph += `[sp_stacked];[sp_stacked]drawbox=y=${y}:color=${hex}:t=fill:w=${targetW}:h=${t}`;
    dividerInfo = { color: hex, thickness: t, y };
  }

  return { filter: graph, divider: dividerInfo };
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
    splitConfig: rawSplitConfig,
    detections = [],
    kenBurnsEnabled = true,
  } = options;

  const splitConfig = sanitizeSplitConfig(rawSplitConfig);
  const targetAspect = targetW / targetH;
  const portrait = targetH > targetW;

  // If already portrait or square, use simple scale/crop without re-framing
  if (!portrait || srcW <= srcH) {
    return {
      filter: `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      effectiveMode: 'center',
      isComplexGraph: false,
      recommendedMarginV: 120,
      details: { facesCount: detections.length },
    };
  }

  // 1. SPLIT-PODCAST MODE
  if (framingMode === 'split-podcast') {
    const halfH = Math.floor(targetH / 2);
    const { cropW, cropH, topX, bottomX } = computeSplitSpeakerCrops(
      srcW,
      srcH,
      targetW,
      halfH,
      splitConfig,
    );
    const { filter, divider } = buildSplitPodcastFilter(srcW, srcH, targetW, targetH, splitConfig);

    // If center-divider subtitle placement requested, place caption near the 50% split line
    const marginV =
      splitConfig.subtitlePlacement === 'center-divider'
        ? Math.round(targetH / 2) - 40 // ~920px
        : 120; // standard bottom margin

    return {
      filter,
      effectiveMode: 'split-podcast',
      isComplexGraph: true,
      recommendedMarginV: marginV,
      divider,
      details: {
        sourceCropW: cropW,
        sourceCropH: cropH,
        topCropX: topX,
        bottomCropX: bottomX,
        facesCount: detections.length,
      },
    };
  }

  // 2. BLUR-FILL MODE
  if (framingMode === 'blur-fill') {
    const filter = buildBlurFillFilter(targetW, targetH);
    return {
      filter,
      effectiveMode: 'blur-fill',
      isComplexGraph: true,
      recommendedMarginV: 120,
      details: { facesCount: detections.length },
    };
  }

  // 3. AUTO-FACE TRACKING MODE
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
        recommendedMarginV: 120,
        details: {
          sourceCropW: cropW,
          sourceCropH: scaledH,
          facesCount: validDetections.length,
        },
      };
    }
  }

  // 4. CENTER CROP (Fallback or Explicit)
  const defaultCropW = Math.floor(Math.round(srcH * targetAspect) / 2) * 2;
  const defaultCropX = Math.floor((srcW - defaultCropW) / 2);
  const centerFilter = `scale=-1:${targetH},crop=${targetW}:${targetH}:(iw-${targetW})/2:0`;

  return {
    filter: centerFilter,
    effectiveMode: 'center',
    isComplexGraph: false,
    recommendedMarginV: 120,
    details: {
      sourceCropW: defaultCropW,
      sourceCropH: srcH,
      topCropX: defaultCropX,
      facesCount: 0,
    },
  };
}
