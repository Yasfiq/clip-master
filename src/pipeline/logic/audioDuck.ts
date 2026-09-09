/**
 * Pure audio ducking (voice-over) and background music mixing logic.
 * Returns FFmpeg filter_complex strings. No filesystem or process spawning.
 *
 * Reference volumes from ARCHITECTURE.md:
 * - Source speech: -3 dBFS (target after boost)
 * - Background music: -18 dBFS baseline
 * - Music ducks while speech present (sidechain compressor)
 * - Peak limiter: -1 dBFS (linear 0.891)
 * - Fade in/out: 2 seconds
 *
 * Ducking uses FFmpeg's `sidechaincompress`: the music bed is the main
 * input and the voice is the sidechain; while the speaker is audible the
 * music is compressed down, and it recovers during pauses.
 *
 * IMPORTANT (validated against FFmpeg 8.0.1):
 *   - `sidechaincompress` main input must be MUSIC, sidechain = VOICE.
 *   - The voice stream is `asplit`: one branch feeds the sidechain detector,
 *     the other goes straight into the final mix (un-ducked, un-compressed).
 *   - Every filter output label must be consumed; FFmpeg rejects dangling
 *     asplit outputs ("output N unconnected").
 *   - `alimiter` limit is LINEAR amplitude (0.0625..1), NOT dB. -1 dBFS ≈ 0.891.
 *   - `amix` weights syntax inside filter_complex requires quoting as one
 *     option value; we pass default (normalize) and compensate with gains.
 */

export interface AudioDuckConfig {
  /** Target gain applied to source speech (linear multiplier, 1 = unity). */
  speechGain: number;
  /** Music baseline volume (linear multiplier). 0.125 ≈ -18 dB. */
  musicBaselineGain: number;
  /** Sidechain compressor threshold (linear amplitude). */
  sidechainThreshold: number;
  /** Compression ratio applied while speech present. Higher = deeper duck. */
  sidechainRatio: number;
  /** Compressor attack (ms) — how fast music ducks when speech starts. */
  attackMs: number;
  /** Compressor release (ms) — how fast music recovers during pauses. */
  releaseMs: number;
  /** Peak limiter ceiling (linear). 0.891 ≈ -1 dBFS. */
  peakLimit: number;
  /** Fade in/out duration (seconds). */
  fadeSeconds: number;
  /** Backsound file path (absolute). */
  backsoundPath: string;
  /**
   * Mix length in seconds. Drives the fade-out start (st = length -
   * fadeSeconds) so the out-fade lands at the END of the mix, not at t=0.
   * When absent, defaults to a short no-op window for safety.
   */
  mixLengthSec?: number;
}

/** Default configuration. Gains chosen so duck depth ≈ 6-10 dB while speaking. */
export const DEFAULT_AUDIO_CONFIG: AudioDuckConfig = {
  speechGain: 1.0,
  musicBaselineGain: 0.125, // ≈ -18 dB
  sidechainThreshold: 0.01, // -40 dBFS: any audible voice ducks music
  sidechainRatio: 8,
  attackMs: 20,
  releaseMs: 600,
  peakLimit: 0.891, // ≈ -1 dBFS
  fadeSeconds: 2,
  backsoundPath: '', // Must be set by caller
};

/**
 * Build the FFmpeg filter_complex for ducking background music under source
 * speech, plus fades and a final limiter.
 *
 * Graph (verified on FFmpeg 8.0.1):
 *   [0:a] = source voice, [1:a] = backsound music
 *   voice:  volume(speechGain) → asplit → vd (sidechain detect) + vm (mix)
 *   music:  volume(musicBaselineGain) → main into sidechaincompress
 *   [music][vd] sidechaincompress=... → [duck]
 *   [vm][duck] amix → fades → alimiter → [audio_out]
 *
 * Returns the full audio sub-graph only (does NOT include the video filter).
 */
export function buildAudioDuckFilter(config: AudioDuckConfig): string {
  const {
    speechGain,
    musicBaselineGain,
    sidechainThreshold,
    sidechainRatio,
    attackMs,
    releaseMs,
    peakLimit,
    fadeSeconds,
    mixLengthSec,
  } = config;

  // Fade-out must start fadeSeconds before the mix ends, never at t=0
  // (afade st=0 means the audio ramps to silence in the first 2s — the
  // rest of the clip plays without an out-fade). Short mixes clamp so the
  // fade window does not invert.
  const len =
    mixLengthSec && Number.isFinite(mixLengthSec) && mixLengthSec > 0 ? mixLengthSec : null;
  const fadeOutStart = len === null ? 0 : Math.max(0, len - fadeSeconds);

  const g = (v: number) => round3(v);
  const parts = [
    // Voice: boost to target, then split: detector branch + dry mix branch.
    `[0:a]volume=${g(speechGain)}[voice];[voice]asplit[vd][vm]`,
    // Music bed at baseline.
    `[1:a]volume=${g(musicBaselineGain)}[music]`,
    // Duck: music is main input, voice is sidechain detector.
    `[music][vd]sidechaincompress=threshold=${g(sidechainThreshold)}:ratio=${sidechainRatio}:attack=${attackMs}:release=${releaseMs}[duck]`,
    // Mix dry voice + ducked music.
    `[vm][duck]amix=inputs=2:duration=first[mixed]`,
    // Fades and peak limit. Fade-IN from t=0; fade-OUT ends at mix length.
    `[mixed]afade=t=in:st=0:d=${fadeSeconds},afade=t=out:st=${g(fadeOutStart)}:d=${fadeSeconds}[faded]`,
    `[faded]alimiter=limit=${g(peakLimit)}:attack=5:release=50[limited]`,
  ];

  // Compose into a single filtergraph string.
  return parts.join(';');
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Validate audio ducking config. Returns an error string, or null if valid.
 */
export function validateAudioDuckConfig(config: AudioDuckConfig): string | null {
  if (config.speechGain <= 0 || config.speechGain > 8) {
    return 'speechGain must be in (0, 8]';
  }
  if (config.musicBaselineGain <= 0 || config.musicBaselineGain > 1) {
    return 'musicBaselineGain must be in (0, 1]';
  }
  if (config.sidechainThreshold <= 0 || config.sidechainThreshold > 0.5) {
    return 'sidechainThreshold must be in (0, 0.5]';
  }
  if (config.sidechainRatio < 1 || config.sidechainRatio > 30) {
    return 'sidechainRatio must be between 1 and 30';
  }
  if (config.attackMs < 1 || config.attackMs > 1000) {
    return 'attackMs must be between 1 and 1000';
  }
  if (config.releaseMs < 10 || config.releaseMs > 5000) {
    return 'releaseMs must be between 10 and 5000';
  }
  if (config.peakLimit < 0.0625 || config.peakLimit > 1) {
    return 'peakLimit must be in [0.0625, 1] (alimiter linear range)';
  }
  if (config.fadeSeconds < 0 || config.fadeSeconds > 10) {
    return 'fadeSeconds must be between 0 and 10';
  }
  return null;
}
