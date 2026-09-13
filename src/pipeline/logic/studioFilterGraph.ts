/**
 * Pure multi-layer filter graph generator for Clip Master Studio.
 *
 * Implements the "Formula Standar Baku Produksi Clip Ajaib":
 * - Layer 0: Film burn warm light leak transition (or smooth fade-in) at t=0-0.55s
 * - Layer 1: Audio ducking on background podcast during hook TTS voiceover (t=0-hookDuration)
 * - Layer 2: Center Headline Hook Banner (CapCut bold yellow #FFE600 floating typography via ASS or drawtext)
 * - Layer 3: Persistent Header Kiri Atas: Logo circular badge @ClipAjaib (x=32, y=34) + Rounded Pill (x=142, y=50)
 * - Layer 4: Subtitle Dialog Kuning CapCut (conversational phrases with dialogue indicator)
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
  pillResolvedPath?: string;
  isAssSubtitle?: boolean;
  filmBurnIntro?: boolean;
  subtitleForceStyle?: string;
  baseVideoFilter?: string;
  ttsAudioPath?: string;
  ttsAudioDuration?: number;
  hasAudio?: boolean;
}

export interface StudioFilterGraphResult {
  filterComplex: string;
  hasLogoInput: boolean;
  hasPillInput: boolean;
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
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, ' ');
}

/**
 * Escape file path for FFmpeg subtitles filter.
 */
export function escapeSubtitlesPath(pathStr: string): string {
  return pathStr.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
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
 * Get safe-zone coordinates for source pill SVG overlay based on position name.
 */
export function getPillOverlayCoordinates(
  position?: 'top-right' | 'top-left' | 'bottom' | 'bottom-right' | 'bottom-left' | string,
  hasLogoInSameCorner?: boolean,
): string {
  switch (position) {
    case 'top-left':
      return hasLogoInSameCorner ? '140:50' : '40:50';
    case 'bottom':
      return '(W-w)/2:H-h-120';
    case 'bottom-right':
      return 'W-w-40:H-h-135';
    case 'bottom-left':
      return '40:H-h-135';
    case 'top-right':
    default:
      return hasLogoInSameCorner ? 'W-w-140:50' : 'W-w-40:50';
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
    pillResolvedPath,
    isAssSubtitle = false,
    filmBurnIntro = false,
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
  const hasPillInput = Boolean(config.sourceEnabled && pillResolvedPath);
  const hasTtsInput = Boolean(config.hookTtsEnabled && ttsAudioPath);

  let nextInputIdx = 1;
  const logoInputIdx = hasLogoInput ? nextInputIdx++ : 0;
  const pillInputIdx = hasPillInput ? nextInputIdx++ : 0;
  const ttsInputIdx = hasTtsInput ? nextInputIdx++ : 0;

  const chains: string[] = [];

  // 1. Initial video transformations: base filter, freeze frame, video fades
  const preFilters: string[] = [];

  if (baseVideoFilter && baseVideoFilter.trim()) {
    preFilters.push(baseVideoFilter.trim());
  }

  if (freezeDuration > 0) {
    preFilters.push(`tpad=start_mode=clone:start_duration=${freezeDuration}`);
  }

  const useFilmBurn = Boolean(filmBurnIntro || config.filmBurnIntro);
  const targetW = options.width || 1080;
  const targetH = options.height || 1920;

  if (useFilmBurn && fadeInDuration > 0) {
    // Cinematic warm red-to-gold light leak intro with explicit RGBA format for alpha fade
    chains.push(`color=c='#B41400':s=${targetW}x${targetH}:d=0.25:format=rgba[burn_red]`);
    chains.push(`color=c='#FFE580':s=${targetW}x${targetH}:d=0.35:format=rgba[burn_yel]`);
    chains.push(`[burn_red][burn_yel]xfade=transition=fade:duration=0.12:offset=0.15[burn_seq]`);
    chains.push(`[burn_seq]fade=t=out:st=0.30:d=0.25:alpha=1[burn_alpha]`);
  } else if (fadeInDuration > 0) {
    preFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
  }

  if (fadeOutDuration > 0) {
    preFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`);
  }

  // 2. Post-overlay filters: drawtext hook (if not ASS), drawtext source (if not SVG pill), subtitles
  const postFilters: string[] = [];

  // Headline Hook via drawtext (only if NOT using ASS subtitles, where hook is already inside ASS)
  if (!isAssSubtitle && config.hookText && config.hookText.trim()) {
    const escapedHook = escapeDrawText(config.hookText.trim());
    const isCenter = config.hookPosition === 'center';

    if (isCenter) {
      postFilters.push(
        `drawtext=expansion=none:text='${escapedHook}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=56:fontcolor='#FFE600':box=1:boxcolor=black@0.75:boxborderw=18:bordercolor=black:borderw=4:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,${hookDuration})'`,
      );
    } else {
      postFilters.push(
        `drawtext=expansion=none:text='${escapedHook}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=16:x=(w-text_w)/2:y=140`,
      );
    }
  }

  // Source Credit via drawtext (only as fallback when SVG pill is not used)
  if (!hasPillInput && config.sourceEnabled && config.sourceText && config.sourceText.trim()) {
    const escapedSource = escapeDrawText(config.sourceText.trim());
    if (config.sourcePosition === 'bottom') {
      postFilters.push(
        `drawtext=expansion=none:text='${escapedSource}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=22:fontcolor=white@0.8:x=(w-text_w)/2:y=h-140`,
      );
    } else if (config.sourcePosition === 'top-left') {
      postFilters.push(
        `drawtext=expansion=none:text='${escapedSource}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=24:fontcolor='#222222':box=1:boxcolor='white@0.85':boxborderw=10:x=145:y=48`,
      );
    } else {
      // Default top-right safe zone
      postFilters.push(
        `drawtext=expansion=none:text='${escapedSource}':fontfile=${SYSTEM_BOLD_FONT}:fontsize=24:fontcolor='#222222':box=1:boxcolor='white@0.85':boxborderw=10:x=w-text_w-40:y=50`,
      );
    }
  }

  // Subtitles filter
  if (subtitlePath) {
    const escSub = escapeSubtitlesPath(subtitlePath);
    const styleParam = subtitleForceStyle ? `:force_style='${subtitleForceStyle}'` : '';
    postFilters.push(`subtitles='${escSub}'${styleParam}`);
  }

  // 3. Assemble video filter chain(s)
  const hasOverlays = hasLogoInput || hasPillInput || (useFilmBurn && fadeInDuration > 0);

  if (hasOverlays) {
    let currentVideoLabel = 'v_faded';
    if (preFilters.length > 0) {
      chains.push(`[0:v]${preFilters.join(',')}[${currentVideoLabel}]`);
    } else {
      chains.push(`[0:v]null[${currentVideoLabel}]`);
    }

    // Film burn overlay
    if (useFilmBurn && fadeInDuration > 0) {
      chains.push(
        `[${currentVideoLabel}][burn_alpha]overlay=0:0:enable='between(t,0,0.55)'[v_burned]`,
      );
      currentVideoLabel = 'v_burned';
    }

    // Overlay logo
    if (hasLogoInput) {
      const opacity =
        typeof config.logoOpacity === 'number'
          ? Math.max(0.1, Math.min(1.0, config.logoOpacity))
          : 1.0;
      const overlayCoords = getLogoOverlayCoordinates(config.logoPosition);

      chains.push(`[${logoInputIdx}:v]format=rgba,colorchannelmixer=aa=${opacity}[logo]`);
      chains.push(`[${currentVideoLabel}][logo]overlay=${overlayCoords}:format=auto[v_logo]`);
      currentVideoLabel = 'v_logo';
    }

    // Overlay source pill (Default position: top-right)
    if (hasPillInput) {
      const sameCorner =
        hasLogoInput &&
        (config.logoPosition || 'top-left') === (config.sourcePosition || 'top-right');
      const pillCoords = getPillOverlayCoordinates(
        config.sourcePosition || 'top-right',
        sameCorner,
      );
      chains.push(`[${pillInputIdx}:v]format=rgba[pill]`);
      chains.push(`[${currentVideoLabel}][pill]overlay=${pillCoords}:format=auto[v_pill]`);
      currentVideoLabel = 'v_pill';
    }

    // Post-overlay filters
    if (postFilters.length > 0) {
      chains.push(`[${currentVideoLabel}]${postFilters.join(',')}[v_out]`);
    } else {
      chains.push(`[${currentVideoLabel}]null[v_out]`);
    }
  } else {
    // Single linear video filter chain
    const allVideoFilters = [...preFilters, ...postFilters];
    if (allVideoFilters.length > 0) {
      chains.push(`[0:v]${allVideoFilters.join(',')}[v_out]`);
    } else {
      chains.push(`[0:v]null[v_out]`);
    }
  }

  // 4. Audio filter chain with Layer 1 (Audio ducking + TTS mix) and Layer 5 (Audio fade-out)
  const fadeOutAudioPart =
    fadeOutDuration > 0 ? `,afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}` : '';

  // If freezeDuration > 0, the video was extended at start by freezeDuration (tpad).
  // Delay the audio stream by the exact same duration in ms to keep video and audio in perfect lip-sync.
  const freezeAudioFilter =
    freezeDuration > 0
      ? `adelay=${Math.round(freezeDuration * 1000)}|${Math.round(freezeDuration * 1000)}`
      : '';

  if (options.hasAudio === false) {
    // Media has no audio stream — generate silent audio track to guarantee filtergraph output map
    chains.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${effectiveDuration}[a_out]`);
  } else if (hasTtsInput) {
    // Duck background podcast audio to 0.2 during intro hook, then restore to 1.0
    const delayPrefix = freezeAudioFilter ? `${freezeAudioFilter},` : '';
    chains.push(
      `[0:a]${delayPrefix}volume=enable='between(t,0,${hookDuration})':volume=0.2,volume=enable='gte(t,${hookDuration})':volume=1.0${fadeOutAudioPart}[a_bg]`,
    );
    chains.push(
      `[${ttsInputIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.0[a_tts]`,
    );
    // amix with normalize=0 to preserve calibrated volume levels without sudden surges
    chains.push(
      `[a_bg][a_tts]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a_out]`,
    );
  } else {
    const audioFilters: string[] = [];

    if (freezeAudioFilter) {
      audioFilters.push(freezeAudioFilter);
    }

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
    hasPillInput,
    hasTtsInput,
    effectiveDuration,
  };
}
