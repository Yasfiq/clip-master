/**
 * Pure ad-detection logic. No filesystem, no process spawning — unit-testable
 * without media files.
 *
 * Rule owned by @pipeline-agent: reject whole-video advertisements only.
 * Videos that merely *contain* embedded/mid-roll ads (iklan sisipan) are accepted.
 * Ambiguous signals fail toward acceptance.
 */

export interface AdSignals {
  /** Title + description text of the source. */
  title: string;
  description?: string;
  /** Total source duration in seconds. */
  durationSec: number;
  /** Fraction 0..1 — how visually uniform the video is (scene similarity). */
  sceneUniformity?: number;
  /** Fraction 0..1 — proportion of frames carrying a static overlay/logo. */
  staticOverlayRatio?: number;
  /** Transcript text, when available. */
  transcript?: string;
}

export interface AdVerdict {
  isAd: boolean;
  score: number;
  /** Per-signal contribution, for log transparency. */
  breakdown: Record<string, number>;
  reason: string;
}

/** Signal weights — sum to 1.0. Confirmed in ARCHITECTURE.md. */
export const AD_WEIGHTS = {
  metadata: 0.3,
  temporal: 0.25,
  visual: 0.25,
  audio: 0.2,
} as const;

/** Default rejection cutoff. Overridable via PipelineConfig.adScoreThreshold. */
export const DEFAULT_AD_THRESHOLD = 0.75;

const AD_TITLE_PATTERNS = [
  'sponsored',
  '#ad',
  'promo',
  'iklan',
  'advertisement',
  'paid partnership',
  'brand deal',
];

const CTA_TERMS = [
  'buy now',
  'order now',
  'klik link',
  'link di bio',
  'beli sekarang',
  'kode promo',
  'discount code',
  'limited offer',
  'subscribe now',
  'daftar sekarang',
];

/** Whole-video ads are short. Above this, treat temporal signal as clean. */
const SHORT_VIDEO_SEC = 30;
/** Videos this long are practically never a pure ad. */
const LONG_VIDEO_SEC = 300;

function scoreMetadata(signals: AdSignals): number {
  const haystack = `${signals.title} ${signals.description ?? ''}`.toLowerCase();
  const hits = AD_TITLE_PATTERNS.filter((p) => haystack.includes(p)).length;
  if (hits === 0) return 0;
  return Math.min(1, 0.5 + 0.25 * (hits - 1));
}

function scoreTemporal(signals: AdSignals): number {
  const d = signals.durationSec;
  if (d <= 0) return 0; // unknown duration → fail toward acceptance
  if (d < SHORT_VIDEO_SEC) return 1;
  if (d >= LONG_VIDEO_SEC) return 0;
  // Linear decay between the short and long bounds.
  return 1 - (d - SHORT_VIDEO_SEC) / (LONG_VIDEO_SEC - SHORT_VIDEO_SEC);
}

function scoreVisual(signals: AdSignals): number {
  const uniformity = signals.sceneUniformity;
  const overlay = signals.staticOverlayRatio;
  if (uniformity === undefined && overlay === undefined) return 0;
  const parts: number[] = [];
  if (uniformity !== undefined) parts.push(clamp01(uniformity));
  if (overlay !== undefined) parts.push(clamp01(overlay));
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function scoreAudio(signals: AdSignals): number {
  const text = signals.transcript?.toLowerCase();
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const ctaHits = CTA_TERMS.filter((t) => text.includes(t)).length;
  if (ctaHits === 0) return 0;
  // Density of CTA phrases relative to transcript length, capped at 1.
  const density = (ctaHits * 100) / words.length;
  return clamp01(0.4 + density);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function evaluateAd(
  signals: AdSignals,
  threshold: number = DEFAULT_AD_THRESHOLD,
): AdVerdict {
  const breakdown = {
    metadata: scoreMetadata(signals) * AD_WEIGHTS.metadata,
    temporal: scoreTemporal(signals) * AD_WEIGHTS.temporal,
    visual: scoreVisual(signals) * AD_WEIGHTS.visual,
    audio: scoreAudio(signals) * AD_WEIGHTS.audio,
  };

  const score = Number(
    Object.values(breakdown)
      .reduce((a, b) => a + b, 0)
      .toFixed(4),
  );

  const isAd = score >= threshold;

  return {
    isAd,
    score,
    breakdown,
    reason: isAd
      ? `Pure advertisement: weighted score ${score} >= threshold ${threshold}`
      : `Accepted: weighted score ${score} < threshold ${threshold}`,
  };
}
