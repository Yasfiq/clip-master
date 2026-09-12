/**
 * Pure silence detection + FFmpeg filter builder.
 *
 * Strategy:
 *   1. Detect silent regions from PCM samples (linear amplitude).
 *   2. Pad each region by `padMs` on both sides to avoid clipping
 *      the leading/trailing consonant of speech.
 *   3. Drop regions shorter than `minSilenceMs` after padding.
 *   4. Build an `aselect=between(t,A,B)+between(t,C,D)+...` filter
 *      that keeps only the voiced segments and resets PTS.
 *
 * Reference levels (from ARCHITECTURE.md):
 *   - Speech: -3 dBFS target (linear 0.708)
 *   - Pause / breath / filler: -40 dBFS or quieter (linear ≤ 0.01)
 *   - Backsound baseline: -18 dBFS (linear 0.125) — must not be cut
 *
 * Because backsound can mask silences, this stage operates on the
 * voice-only audio (input [0:a] before music mix) and runs BEFORE
 * audio ducking. Caller is responsible for piping the right stream.
 */

export interface SilenceDetectConfig {
  /** Silence threshold in dBFS (e.g. -35). Linear amplitude = 10^(db/20). */
  thresholdDb: number;
  /** Minimum silence duration in milliseconds to consider for removal. */
  minSilenceMs: number;
  /** Pad silence edges in milliseconds to avoid clipping speech. */
  padMs?: number;
}

export interface SilenceWindow {
  /** Inclusive start time in source seconds. */
  startSec: number;
  /** Exclusive end time in source seconds. */
  endSec: number;
}

const DEFAULT_PAD_MS = 80;

/**
 * Scan `samples` (mono Float32 in [-1, 1]) and return the silent windows
 * at or below `thresholdDb` lasting at least `minSilenceMs`.
 *
 * No filesystem or process spawning — unit-testable.
 */
export function detectSilenceRegions(
  samples: Float32Array,
  sampleRate: number,
  config: SilenceDetectConfig,
): SilenceWindow[] {
  if (samples.length === 0 || sampleRate <= 0) return [];
  const { thresholdDb, minSilenceMs } = config;
  const padMs = config.padMs ?? DEFAULT_PAD_MS;

  const amplitudeThreshold = Math.pow(10, thresholdDb / 20);
  const hop = Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms hop
  const minSilentHops = Math.max(1, Math.floor(minSilenceMs / 10));

  const regions: SilenceWindow[] = [];
  let runStart = -1;

  for (let i = 0; i < samples.length; i += hop) {
    const end = Math.min(samples.length, i + hop);
    let peak = 0;
    for (let j = i; j < end; j++) {
      const v = samples[j]!;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    const silent = peak <= amplitudeThreshold;
    if (silent) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      regions.push(
        makeWindow(
          runStart,
          i,
          sampleRate,
          padMs,
          ((minSilentHops * hop) / sampleRate) * 1000,
          ((minSilentHops * hop) / sampleRate) * 1000,
        ),
      );
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    regions.push(
      makeWindow(
        runStart,
        samples.length,
        sampleRate,
        padMs,
        ((minSilentHops * hop) / sampleRate) * 1000,
        ((minSilentHops * hop) / sampleRate) * 1000,
      ),
    );
  }

  // Convert sample indices to seconds, apply padding, then drop too-short.
  const minSilenceSec = (minSilentHops * hop) / sampleRate;
  const padSec = padMs / 1000;
  const out: SilenceWindow[] = [];
  for (const r of regions) {
    let start = r.startSec - padSec;
    let end = r.endSec + padSec;
    if (start < 0) start = 0;
    if (end > samples.length / sampleRate) end = samples.length / sampleRate;
    if (end - start >= minSilenceSec) {
      out.push({ startSec: start, endSec: end });
    }
  }
  return mergeAdjacent(out, padSec);
}

function makeWindow(
  startSample: number,
  endSample: number,
  sampleRate: number,
  _padMs: number,
  _minHops: number,
  _minHops2: number,
): SilenceWindow {
  return {
    startSec: startSample / sampleRate,
    endSec: endSample / sampleRate,
  };
}

/** Merge silences whose padded edges overlap into a single window. */
function mergeAdjacent(regions: SilenceWindow[], padSec: number): SilenceWindow[] {
  if (regions.length <= 1) return regions;
  const sorted = [...regions].sort((a, b) => a.startSec - b.startSec);
  const out: SilenceWindow[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]!;
    const cur = sorted[i]!;
    if (cur.startSec <= last.endSec + padSec) {
      last.endSec = Math.max(last.endSec, cur.endSec);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Build the FFmpeg filter that keeps only the voiced segments and concats
 * them with PTS reset.
 *
 * Implementation: atrim per voiced segment -> asetpts -> concat.
 * The first segment is mapped to [a0], the rest to [aN] inputs of concat.
 *
 * Single-stream graph (no input labels — caller composes the surrounding
 * filtergraph, e.g. `[0:a]<this filter>; <next stages>`).
 *
 * `duration` is the source audio length in seconds. Used to construct the
 * final voiced segment after the last silence (and the first before any).
 */
export function buildSilenceRemoveFilter(duration: number, regions: SilenceWindow[]): string {
  if (regions.length === 0 || duration <= 0) {
    return `atrim=start=0:end=${duration},asetpts=PTS-STARTPTS[voiced]`;
  }

  // Compute voiced segments = complement of silent regions.
  const voiced: Array<[number, number]> = [];
  let cursor = 0;
  for (const r of regions) {
    if (r.startSec > cursor) voiced.push([cursor, r.startSec]);
    cursor = Math.max(cursor, r.endSec);
  }
  if (cursor < duration) voiced.push([cursor, duration]);

  // Drop zero-duration segments.
  const real = voiced.filter(([a, b]) => b - a > 0.001);
  if (real.length === 0) {
    return `atrim=start=0:end=${duration},asetpts=PTS-STARTPTS[voiced]`;
  }

  if (real.length === 1) {
    const [a, b] = real[0]!;
    return `[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS[voiced]`;
  }

  // Multi-segment: each segment is atrim + asetpts, then concat.
  const parts: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < real.length; i++) {
    const [a, b] = real[i]!;
    const lbl = `[a${i}]`;
    parts.push(`[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS${lbl}`);
    labels.push(lbl);
  }
  parts.push(`${labels.join('')}concat=n=${real.length}:v=0:a=1[voiced]`);
  return parts.join(';');
}

/**
 * Build a *video* select/setpts filter that removes the same silence
 * windows as the audio trim, so re-encoded video stays aligned with the
 * shortened voice track (prevents audio/video desync during silence
 * removal). Pure logic — no process. Caller must re-encode (not map/copy).
 */
export function buildSilenceRemoveVideoFilter(
  regions: SilenceWindow[],
  frameRate: number = 30,
): string {
  if (regions.length === 0) {
    return 'null';
  }
  // Keep frames whose timestamp is NOT inside any silence window.
  const keep = regions
    .map((r) => `not(between(t,${r.startSec.toFixed(3)},${r.endSec.toFixed(3)}))`)
    .join('*');
  return `select='${keep}',setpts=N/(${frameRate})/TB`;
}

/**
 * Validate a silence-detection config. Returns error string, or null.
 */
export function validateSilenceConfig(config: SilenceDetectConfig): string | null {
  if (
    !Number.isFinite(config.thresholdDb) ||
    config.thresholdDb > -10 ||
    config.thresholdDb < -90
  ) {
    return 'thresholdDb must be in [-90, -10]';
  }
  if (
    !Number.isFinite(config.minSilenceMs) ||
    config.minSilenceMs < 50 ||
    config.minSilenceMs > 5000
  ) {
    return 'minSilenceMs must be in [50, 5000]';
  }
  if (config.padMs !== undefined && (config.padMs < 0 || config.padMs > 500)) {
    return 'padMs must be in [0, 500]';
  }
  return null;
}
