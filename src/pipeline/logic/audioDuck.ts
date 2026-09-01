/**
 * Pure audio ducking (voice-over) and background music mixing logic.
 * Returns FFmpeg filter_complex strings. No filesystem or process spawning.
 *
 * Reference volumes from ARCHITECTURE.md:
 * - Source speech: -3 dBFS
 * - Background music: -18 dBFS (when no speech)
 * - Duck level (music when speech present): -24 dBFS
 * - Peak limiter: -1 dBFS
 * - Fade in/out: 2 seconds
 * - Duck transition time: 0.5 seconds
 */

export interface AudioDuckConfig {
  /** Target volume for speech segments (dBFS) */
  speechTargetDb: number;
  /** Background music baseline volume (dBFS) */
  musicBaselineDb: number;
  /** Music volume when ducked (during speech) */
  musicDuckedDb: number;
  /** Peak limiter threshold (dBFS) */
  peakLimitDb: number;
  /** Fade in/out duration (seconds) */
  fadeSeconds: number;
  /** Duck transition time (seconds) */
  duckTransitionSeconds: number;
  /** Backsound file path (absolute) */
  backsoundPath: string;
}

/** Default configuration from architecture (locked). */
export const DEFAULT_AUDIO_CONFIG: AudioDuckConfig = {
  speechTargetDb: -3,
  musicBaselineDb: -18,
  musicDuckedDb: -24,
  peakLimitDb: -1,
  fadeSeconds: 2,
  duckTransitionSeconds: 0.5,
  backsoundPath: '', // Must be set by caller
};

/**
 * Build an FFmpeg filter_complex for mixing source audio with background music.
 * Requires:
 *   - input0: source video with audio (stream 0:v, 1:a)
 *   - input1: background music audio file (single audio stream)
 *
 * Returns the full filter_complex string.
 */
export function buildAudioDuckFilter(config: AudioDuckConfig): string {
  const {
    speechTargetDb,
    musicBaselineDb,
    musicDuckedDb,
    peakLimitDb,
    fadeSeconds,
    duckTransitionSeconds,
  } = config;

  // Linear gain multipliers from dBFS
  const speechGain = Math.pow(10, speechTargetDb / 20);
  const musicBaselineGain = Math.pow(10, musicBaselineDb / 20);
  const musicDuckedGain = Math.pow(10, musicDuckedDb / 20);

  // Build filter_complex
  const parts = [
    // Input mapping
    '[1:a] asplit=2 [music] [silence]',
    // Extract voice segments (simple loudness detection)
    '[0:a] asplit=2 [source_voice] [source_fallback]',
    // Detect speech via volume
    `[source_voice] astats=metadata=1, ametadata=lavfi.astats.Overall.RMS_level:key=lavfi.astats.Overall.RMS_level:function=less:value=-25, aselect='selected', volume=volume=${speechGain} [voice_active]`,
    // Music ducking logic
    `[music] adynamicequalizer=range=${musicBaselineDb}:${musicDuckedDb}:threshold=-30:attack=${duckTransitionSeconds / 2}:release=${duckTransitionSeconds * 3} [music_duck]`,
    // Mix voice + music
    `[voice_active] [music_duck] amix=inputs=2:weights=1 0.3:duration=longest [mixed]`,
    // Apply overall fade in/out
    `[mixed] afade=t=in:st=0:d=${fadeSeconds}, afade=t=out:st=0.1:d=${fadeSeconds} [faded]`,
    // Peak limiting to prevent clipping
    `[faded] alimiter=limit=${peakLimitDb}:attack=7:release=100 [limited]`,
    // Final output label
    '[limited]',
  ];

  return parts.join(', ');
}

/**
 * Validate audio ducking config.
 */
export function validateAudioDuckConfig(config: any): string | null {
  if (config.speechTargetDb < -50 || config.speechTargetDb > 0) {
    return 'speechTargetDb must be between -50 and 0 dBFS';
  }
  if (config.musicBaselineDb < -50 || config.musicBaselineDb > 0) {
    return 'musicBaselineDb must be between -50 and 0 dBFS';
  }
  if (config.musicDuckedDb < -50 || config.musicDuckedDb > 0) {
    return 'musicDuckedDb must be between -50 and 0 dBFS';
  }
  if (config.musicBaselineDb <= config.musicDuckedDb) {
    return 'musicBaselineDb must be greater than musicDuckedDb';
  }
  if (config.peakLimitDb >= 0 || config.peakLimitDb < -12) {
    return 'peakLimitDb must be between -12 and -1 dBFS';
  }
  if (config.fadeSeconds < 0 || config.fadeSeconds > 10) {
    return 'fadeSeconds must be between 0 and 10 seconds';
  }
  if (config.duckTransitionSeconds < 0.1 || config.duckTransitionSeconds > 2) {
    return 'duckTransitionSeconds must be between 0.1 and 2 seconds';
  }
  return null;
}
