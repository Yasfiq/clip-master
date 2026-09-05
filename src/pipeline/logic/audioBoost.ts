/**
 * Audio boost for transcription: extract audio with loudnorm pre-pass
 * + volume multiplier. Pure filter-builder, no I/O.
 *
 * Workflow:
 *   1. ffmpeg reads source
 *   2. loudnorm normalizes dynamic range (handles quiet dialogue)
 *   3. volume=3.0x amplifies the normalized signal
 *   4. Output: 16kHz mono WAV for whisper
 *
 * The original-volume audio in the final cut is untouched — only the
 * transcription input gets boosted. Whisper text quality improves on
 * quiet Indonesian podcast dialogue.
 */

export interface AudioBoostConfig {
  /** Volume multiplier applied AFTER loudnorm. Must be > 0. */
  boostFactor: number;
  /** Target sample rate (whisper wants 16k). */
  sampleRate: number;
  /** Mono channel count (whisper wants 1). */
  channels: number;
  /** Loudnorm target integrated loudness in LUFS. -23 is broadcast standard. */
  targetLufs: number;
  /** True integrated loudness in LUFS. -23 is broadcast standard. */
  targetLra: number;
  /** True peak in dBTP. -2 leaves headroom. */
  targetTruePeak: number;
}

export const DEFAULT_AUDIO_BOOST: AudioBoostConfig = {
  boostFactor: 3.0,
  sampleRate: 16000,
  channels: 1,
  targetLufs: -23,
  targetLra: 7,
  targetTruePeak: -2,
};

/**
 * Build the ffmpeg `-af` filter string for boosted audio extraction.
 * Filter chain: loudnorm → volume → aformat.
 */
export function buildAudioBoostFilter(cfg: AudioBoostConfig = DEFAULT_AUDIO_BOOST): string {
  validateAudioBoostConfig(cfg);
  // loudnorm pass 1: measure linear normalization.
  // We use a single-pass `loudnorm` (print_format=summary suppresses JSON).
  // For higher accuracy a two-pass would be ideal, but for transcription
  // pre-processing a single pass is fast and good enough.
  const loudnorm = [`I=${cfg.targetLufs}`, `LRA=${cfg.targetLra}`, `TP=${cfg.targetTruePeak}`].join(
    ':',
  );
  const parts: string[] = [
    `loudnorm=${loudnorm}`,
    `volume=${cfg.boostFactor}`,
    `aformat=sample_fmts=s16:channel_layouts=mono:sample_rates=${cfg.sampleRate}`,
  ];
  return parts.join(',');
}

/**
 * Validate a config. Returns error message or null.
 */
export function validateAudioBoostConfig(cfg: AudioBoostConfig): string | null {
  if (!Number.isFinite(cfg.boostFactor) || cfg.boostFactor <= 0) {
    return `boostFactor must be > 0 (got ${cfg.boostFactor})`;
  }
  if (cfg.boostFactor > 10) {
    return `boostFactor > 10 risks clipping (got ${cfg.boostFactor})`;
  }
  if (
    cfg.sampleRate !== 16000 &&
    cfg.sampleRate !== 22050 &&
    cfg.sampleRate !== 44100 &&
    cfg.sampleRate !== 48000
  ) {
    return `sampleRate must be 16k/22k/44.1k/48k (got ${cfg.sampleRate})`;
  }
  if (cfg.channels !== 1 && cfg.channels !== 2) {
    return `channels must be 1 or 2 (got ${cfg.channels})`;
  }
  if (cfg.targetLufs < -70 || cfg.targetLufs > -5) {
    return `targetLufs must be between -70 and -5 (got ${cfg.targetLufs})`;
  }
  if (cfg.targetTruePeak > 0 || cfg.targetTruePeak < -9) {
    return `targetTruePeak must be between -9 and 0 dBTP (got ${cfg.targetTruePeak})`;
  }
  return null;
}
