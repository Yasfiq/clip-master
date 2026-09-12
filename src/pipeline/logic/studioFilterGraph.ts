/**
 * Pure multi-layer filter graph generator for Clip Master Studio.
 *
 * Combines freeze frame, fade in/out, logo watermark, headline hook text,
 * source credit badge, and dynamic subtitle burning into a single-pass
 * FFmpeg filter graph without filesystem side effects or process spawning.
 */

import { StudioConfig } from '../../types/clipStudio';

export interface BuildStudioFilterGraphOptions {
  inputVideoDuration: number;
  width?: number;
  height?: number;
  config: StudioConfig;
  subtitlePath?: string;
  logoResolvedPath?: string;
  subtitleForceStyle?: string;
  baseVideoFilter?: string;
}

export interface StudioFilterGraphResult {
  filterComplex: string;
  hasLogoInput: boolean;
  effectiveDuration: number;
}

/**
 * Escape text safely for FFmpeg drawtext filter:
 * - Backslashes: \ -> \\
 * - Single quotes: ' -> \'
 * - Colons: : -> \:
 * - Line breaks normalized to spaces
 */
export function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\r?\n/g, ' ');
}

/**
 * Escape file path for FFmpeg subtitles filter.
 */
export function escapeSubtitlesPath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
}

/**
 * Get safe-zone coordinates for logo overlay based on position name.
 */
export function getLogoOverlayCoordinates(
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | string,
): string {
  switch (position) {
    case 'top-left':
      return '40:50';
    case 'bottom-right':
      return 'W-w-40:H-h-140';
    case 'bottom-left':
      return '40:H-h-140';
    case 'top-right':
    default:
      return 'W-w-40:50';
  }
}

/**
 * Build a pure single-pass FFmpeg filter complex string from studio configuration.
 */
export function buildStudioFilterGraph(
  options: BuildStudioFilterGraphOptions,
): StudioFilterGraphResult {
  const {
    inputVideoDuration,
    config,
    subtitlePath,
    logoResolvedPath,
    subtitleForceStyle,
    baseVideoFilter,
  } = options;

  const freezeDuration =
    typeof config.freezeDuration === 'number' && config.freezeDuration > 0
      ? Number(config.freezeDuration.toFixed(3))
      : 0;

  const effectiveDuration = Number((inputVideoDuration + freezeDuration).toFixed(3));

  const fadeInDuration =
    typeof config.fadeInDuration === 'number' && config.fadeInDuration > 0
      ? Number(config.fadeInDuration.toFixed(3))
      : 0;

  const fadeOutDuration =
    typeof config.fadeOutDuration === 'number' && config.fadeOutDuration > 0
      ? Number(config.fadeOutDuration.toFixed(3))
      : 0;

  const fadeOutStart =
    fadeOutDuration > 0 ? Number(Math.max(0, effectiveDuration - fadeOutDuration).toFixed(3)) : 0;

  const hasLogoInput = Boolean(config.logoEnabled && logoResolvedPath);

  // 1. Initial video transformations: base filter, freeze frame, video fades
  const preLogoFilters: string[] = [];

  if (baseVideoFilter && baseVideoFilter.trim()) {
    preLogoFilters.push(baseVideoFilter.trim());
  }

  if (freezeDuration > 0) {
    preLogoFilters.push(`tpad=start_mode=clone:start_duration=${freezeDuration}`);
  }

  if (fadeInDuration > 0) {
    preLogoFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
  }

  if (fadeOutDuration > 0) {
    preLogoFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`);
  }

  // 2. Post-logo transformations: hook text, source credit, subtitles
  const postLogoFilters: string[] = [];

  if (config.hookText && config.hookText.trim()) {
    const escapedHook = escapeDrawText(config.hookText.trim());
    postLogoFilters.push(
      `drawtext=text='${escapedHook}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=16:x=(w-text_w)/2:y=140`,
    );
  }

  if (config.sourceEnabled && config.sourceText && config.sourceText.trim()) {
    const escapedSource = escapeDrawText(config.sourceText.trim());
    postLogoFilters.push(
      `drawtext=text='${escapedSource}':fontcolor=white@0.8:fontsize=22:x=(w-text_w)/2:y=h-140`,
    );
  }

  if (subtitlePath) {
    const escSub = escapeSubtitlesPath(subtitlePath);
    const styleParam = subtitleForceStyle ? `:force_style='${subtitleForceStyle}'` : '';
    postLogoFilters.push(`subtitles='${escSub}'${styleParam}`);
  }

  // 3. Assemble video filter chain(s)
  const chains: string[] = [];

  if (hasLogoInput) {
    const opacity =
      typeof config.logoOpacity === 'number'
        ? Math.max(0.1, Math.min(1.0, config.logoOpacity))
        : 0.8;

    const overlayCoords = getLogoOverlayCoordinates(config.logoPosition);

    // Format logo stream [1:v] with opacity
    chains.push(`[1:v]format=rgba,colorchannelmixer=aa=${opacity}[logo]`);

    // Prepare video stream before overlay
    if (preLogoFilters.length > 0) {
      chains.push(`[0:v]${preLogoFilters.join(',')}[v_faded]`);
    } else {
      chains.push(`[0:v]null[v_faded]`);
    }

    // Overlay logo
    chains.push(`[v_faded][logo]overlay=${overlayCoords}:format=auto[v_logo]`);

    // Post-logo filters
    if (postLogoFilters.length > 0) {
      chains.push(`[v_logo]${postLogoFilters.join(',')}[v_out]`);
    } else {
      chains.push(`[v_logo]null[v_out]`);
    }
  } else {
    // Single linear video filter chain
    const allVideoFilters = [...preLogoFilters, ...postLogoFilters];
    if (allVideoFilters.length > 0) {
      chains.push(`[0:v]${allVideoFilters.join(',')}[v_out]`);
    } else {
      chains.push(`[0:v]null[v_out]`);
    }
  }

  // 4. Audio filter chain
  const audioFilters: string[] = [];

  if (fadeInDuration > 0) {
    audioFilters.push(`afade=t=in:st=0:d=${fadeInDuration}`);
  }

  if (fadeOutDuration > 0) {
    audioFilters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`);
  }

  if (audioFilters.length > 0) {
    chains.push(`[0:a]${audioFilters.join(',')}[a_out]`);
  } else {
    chains.push(`[0:a]anull[a_out]`);
  }

  const filterComplex = chains.join(';');

  return {
    filterComplex,
    hasLogoInput,
    effectiveDuration,
  };
}
