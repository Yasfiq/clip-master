/**
 * Pure viral-segment selection. No filesystem, no process spawning.
 *
 * Feature values are supplied by the ANALYZE stage after it has probed the
 * source with FFmpeg. This module only decides which windows win.
 */

export interface SegmentFeatures {
  startTime: number;
  endTime: number;
  /** Shot changes per minute in the window. */
  shotChangeRate: number;
  /** 0..1 normalized visual saliency (motion energy proxy). */
  visualSaliency: number;
  /** 0..1 normalized color dynamic range. */
  colorDynamicRange: number;
  /** 0..1 normalized audio RMS loudness. */
  audioRMSLoudness: number;
  /** 0..1 keyword-based hook strength (MVP: lexical, not embeddings). */
  hookEmbedding: number;
  /** 0..1 alignment of cuts with detected BPM. */
  bpmAlignment: number;
}

export interface ScoredSegment {
  startTime: number;
  endTime: number;
  duration: number;
  viralScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SelectionResult {
  segments: ScoredSegment[];
  /** True when the threshold matched nothing and top-1 was force-selected. */
  fallbackApplied: boolean;
}

/** Confirmed weights from ARCHITECTURE.md — sum to 1.0. */
export const VIRAL_WEIGHTS = {
  shotChangeRate: 0.25,
  visualSaliency: 0.2,
  colorDynamicRange: 0.15,
  audioRMSLoudness: 0.15,
  hookEmbedding: 0.15,
  bpmAlignment: 0.1,
} as const;

export const CONFIDENCE_HIGH = 0.75;
export const CONFIDENCE_MEDIUM = 0.6;

/** Normalize shot-change rate: 12+ cuts/min saturates the signal. */
const SHOT_RATE_SATURATION = 12;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function scoreSegment(f: SegmentFeatures): number {
  const normalizedShotRate = clamp01(f.shotChangeRate / SHOT_RATE_SATURATION);
  const score =
    normalizedShotRate * VIRAL_WEIGHTS.shotChangeRate +
    clamp01(f.visualSaliency) * VIRAL_WEIGHTS.visualSaliency +
    clamp01(f.colorDynamicRange) * VIRAL_WEIGHTS.colorDynamicRange +
    clamp01(f.audioRMSLoudness) * VIRAL_WEIGHTS.audioRMSLoudness +
    clamp01(f.hookEmbedding) * VIRAL_WEIGHTS.hookEmbedding +
    clamp01(f.bpmAlignment) * VIRAL_WEIGHTS.bpmAlignment;
  return Number(score.toFixed(4));
}

export function classifyConfidence(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score > CONFIDENCE_HIGH) return 'HIGH';
  if (score > CONFIDENCE_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Adaptive segment count:
 *   max = ceil(sourceDurationMinutes / 3), min = 1
 * Segments scoring at or above `threshold` win. When none do, the single
 * highest scorer is returned with `fallbackApplied: true` so no job silently
 * succeeds with zero clips.
 */
export function selectSegments(
  features: SegmentFeatures[],
  sourceDurationSec: number,
  threshold: number,
): SelectionResult {
  if (features.length === 0) {
    return { segments: [], fallbackApplied: false };
  }

  const scored: ScoredSegment[] = features.map((f) => {
    const viralScore = scoreSegment(f);
    return {
      startTime: f.startTime,
      endTime: f.endTime,
      duration: Number((f.endTime - f.startTime).toFixed(3)),
      viralScore,
      confidence: classifyConfidence(viralScore),
    };
  });

  // Deterministic ordering: score descending, then earliest start as tiebreak.
  const ranked = [...scored].sort(
    (a, b) => b.viralScore - a.viralScore || a.startTime - b.startTime,
  );

  // Calculate max segments based on source duration: max = ceil(sourceDurationMinutes / 3), min = 1
  const maxSegments = Math.max(1, Math.ceil(sourceDurationSec / 180)); // 180s = 3 minutes

  // Filter segments scoring at or above threshold
  const qualifying = ranked.filter((s) => s.viralScore >= threshold);

  if (qualifying.length === 0) {
    return { segments: [ranked[0]!], fallbackApplied: true };
  }

  const selected = qualifying.slice(0, maxSegments);
  // Emit in timeline order so downstream cutting is sequential.
  selected.sort((a, b) => a.startTime - b.startTime);
  return { segments: selected, fallbackApplied: false };
}
