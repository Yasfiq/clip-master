/**
 * Pure multi-layer filter graph generator for Clip Master Studio.
 *
 * Implements the "Formula Standar Baku Produksi Clip Ajaib":
 * - Layer 0: Warm flash fade-in at t=0-0.4s
 * - Layer 1: Audio ducking on background podcast during hook TTS voiceover (t=0-2.2s)
 * - Layer 2: Center Headline Hook Banner (CapCut bold yellow #FFE600 with black border)
 * - Layer 3: Persistent Header Kiri Atas: Logo badge @ClipAjaib (x=32, y=34) + Source Pill (x=145, y=48)
 * - Layer 4: Subtitle Dialog Kuning CapCut (synchronized after hook)
 * - Layer 5: Smooth video & audio fade-out outro in final 1.0s
 */

import { StudioConfig } from '../../types/clipStudio';

export const SYSTEM_BOLD_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export interface BuildStudioFilterGraphOptions {
  inputVideoDuration: number;
  width?: number;
  height?: number;
  config: StudioConfig;
  subtitlePath?: string;
  logoResolvedPath?: string;
  subtitleForceStyle?: string;
  baseVideoFilter?: string;
  ttsAudioPath?: string;
  ttsAudioDuration?: number;
}

export interface StudioFilterGraphResult {
  filterComplex: string;
  hasLogoInput: boolean;
  hasTtsInput: boolean;
  effectiveDuration: number;
}

/**
 * Escape text safely for FFmpeg drawtext filter:
 * - Backslashes: \ -> \\
 * - Single quotes: ' -> \'
 * - Colons: : -> \:
 * - Percentage: % -> \%
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
    ttsAudioPath,
    ttsAudioDuration,
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

  const hookDuration =
    typeof config.hookDuration === 'number' && config.hookDuration > 0
      ? Number(config.hookDuration.toFixed(3))
      : ttsAudioDuration && ttsAudioDuration > 0
        ? Number(ttsAudioDuration.toFixed(3))
        : 2.2;

  const hasLogoInput = Boolean(config.logoEnabled && logoResolvedPath);
  const hasTtsInput = Boolean(config.hookTtsEnabled && ttsAudioPath);

  // 1. Initial video transformations: base filter, freeze frame, video fades
  const preLogoFilters: string[] = [];

  if (baseVideoFilter && baseVideoFilter.trim()) {
    preLogoFilters.push(baseVideoFilter.trim());
  }

  if (freezeDuration > 0) {
    preLogoFilters.push(`tpad=start_mode=clone:start_duration=${freezeDuration}`);
  }

  // Layer 0: Warm flash fade-in
  if (fadeInDuration > 0) {
    preLogoFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
  }

  // Layer 5: Video outro fade-out
  if (fadeOutDuration > 0) {
    preLogoFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`);
  }

  // 2. Post-logo transformations: hook text, source credit, subtitles
  const postLogoFilters: string[] = [];

  // Layer 2: Headline Hook Banner
  if (config.hookText && config.hookText.trim()) {
    const escapedHook = escapeDrawText(config.hookText.trim());
    const isCenter = config.hookPosition === 'center';

    if (isCenter) {
      // Formula Standard: Bold Yellow (#FFE600), thick black outline & box centered in 9:16 frame
      postLogoFilters.push(
        `drawtext=text='${escapedHook}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=56:fontcolor='#FFE600':box=1:boxcolor=black@0.75:boxborderw=18:bordercolor=black:borderw=4:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,${hookDuration})'`,
      );
    } else {
      // Top position default/fallback
      postLogoFilters.push(
        `drawtext=text='${escapedHook}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=16:x=(w-text_w)/2:y=140`,
      );
    }
  }

  // Layer 3: Source Credit Badge / Pill
  if (config.sourceEnabled && config.sourceText && config.sourceText.trim()) {
    const escapedSource = escapeDrawText(config.sourceText.trim());
    if (config.logoPosition === 'top-left') {
      // Positioned immediately next to the 98x98 logo badge at x=145, y=48
      postLogoFilters.push(
        `drawtext=text='${escapedSource}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=24:fontcolor='#222222':box=1:boxcolor='white@0.85':boxborderw=10:x=145:y=48`,
      );
    } else {
      postLogoFilters.push(
        `drawtext=text='${escapedSource}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=22:fontcolor=white@0.8:x=(w-text_w)/2:y=h-140`,
      );
    }
  }

  // Layer 4: Subtitles
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
        : 1.0;

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

  // 4. Audio filter chain with Layer 1 (Audio ducking + TTS mix) and Layer 5 (Audio fade-out)
  const fadeOutAudioPart =
    fadeOutDuration > 0 ? `,afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}` : '';

  if (hasTtsInput) {
    const ttsInputIdx = hasLogoInput ? 2 : 1;
    // Duck background podcast audio to 0.2 during intro hook, then restore to 1.0
    chains.push(
      `[0:a]volume=enable='between(t,0,${hookDuration})':volume=0.2,volume=enable='gte(t,${hookDuration})':volume=1.0${fadeOutAudioPart}[a_bg]`,
    );
    chains.push(
      `[${ttsInputIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0[a_tts]`,
    );
    chains.push(`[a_bg][a_tts]amix=inputs=2:duration=first:dropout_transition=2[a_out]`);
  } else {
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
  }

  const filterComplex = chains.join(';');

  return {
    filterComplex,
    hasLogoInput,
    hasTtsInput,
    effectiveDuration,
  };
}
