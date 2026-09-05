/**
 * Pure empty-frame filter logic. Given per-frame features (audio energy,
 * visual entropy) for a clip window, decide whether the window contains
 * a "table only" / no-subject moment that should be skipped.
 *
 * Hybrid decision (BOTH must hold to flag as empty):
 *   - No audio energy   → likely no one is speaking (silence / ambient)
 *   - Low visual motion → likely no subject in frame (desk only, static camera)
 * If speech is present, the subject is likely on screen and we keep the
 * range even if the camera is still (conversational pauses, talking head).
 */

export interface FrameFeature {
  /** seconds offset within the source video */
  t: number;
  /** 0..1 normalized audio energy (RMS loudness) */
  audioEnergy: number;
  /** 0..1 normalized image entropy delta vs previous frame */
  visualMotion: number;
}

export interface EmptyFilterConfig {
  /** Audio energy below this counts as silence. 0..1. */
  audioSilenceThreshold: number;
  /** Visual motion below this counts as static (desk only). 0..1. */
  visualStaticThreshold: number;
  /** Sliding window size in seconds for aggregation. */
  windowSeconds: number;
  /** If a window has ALL of its frames below thresholds, mark as empty. */
  minFramesInWindow: number;
}

export const DEFAULT_EMPTY_FILTER: EmptyFilterConfig = {
  audioSilenceThreshold: 0.05,
  visualStaticThreshold: 0.1,
  windowSeconds: 1.5,
  minFramesInWindow: 3,
};

/** A contiguous time range that should be skipped. */
export interface EmptyRange {
  startTime: number;
  endTime: number;
  reason: 'silence' | 'static_visual' | 'both';
}

/**
 * Detect empty ranges from per-frame features.
 * Returns ascending non-overlapping ranges.
 */
export function detectEmptyRanges(
  frames: FrameFeature[],
  cfg: EmptyFilterConfig = DEFAULT_EMPTY_FILTER,
): EmptyRange[] {
  if (frames.length < cfg.minFramesInWindow) return [];

  const silence: boolean[] = frames.map((f) => f.audioEnergy < cfg.audioSilenceThreshold);
  const staticVis: boolean[] = frames.map((f) => f.visualMotion < cfg.visualStaticThreshold);

  const windowSize = cfg.windowSeconds;
  const ranges: EmptyRange[] = [];
  let i = 0;
  while (i < frames.length) {
    const winStart = frames[i]!.t;
    const winEnd = winStart + windowSize;
    // Collect frames inside the window
    const inside: number[] = [];
    for (let j = i; j < frames.length && frames[j]!.t < winEnd; j++) {
      inside.push(j);
    }
    if (inside.length < cfg.minFramesInWindow) {
      i += Math.max(1, inside.length);
      continue;
    }
    // Window is "empty" only when EVERY frame is BOTH silent AND static.
    // Speech is the strongest signal that a subject is present somewhere
    // on screen, so a still-but-talking range is kept (talking head shot).
    const allSilent = inside.every((k) => silence[k]);
    const allStatic = inside.every((k) => staticVis[k]);
    if (allSilent && allStatic) {
      const lastFrameT = frames[inside[inside.length - 1]!]!.t;
      ranges.push({
        startTime: winStart,
        endTime: lastFrameT,
        reason: 'both',
      });
      // Skip past the whole window
      i = inside[inside.length - 1]! + 1;
    } else {
      i++;
    }
  }

  return mergeRanges(ranges);
}

function mergeRanges(ranges: EmptyRange[]): EmptyRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.startTime - b.startTime);
  const out: EmptyRange[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]!;
    const cur = sorted[i]!;
    if (cur.startTime <= last.endTime) {
      // Merge; keep the more specific reason
      last.endTime = Math.max(last.endTime, cur.endTime);
      if (cur.reason === 'both') last.reason = 'both';
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Given a list of empty ranges, return the kept (non-empty) ranges.
 * Gaps between empties become the kept ranges. The first/last clip edges
 * are bounded by [clipStart, clipEnd].
 */
export function subtractEmpty(
  clipStart: number,
  clipEnd: number,
  empty: EmptyRange[],
): Array<{ start: number; end: number }> {
  // Filter empty ranges that intersect the clip
  const rel = empty
    .map((r) => ({
      start: Math.max(r.startTime, clipStart),
      end: Math.min(r.endTime, clipEnd),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  if (rel.length === 0) return [{ start: clipStart, end: clipEnd }];

  const out: Array<{ start: number; end: number }> = [];
  let cursor = clipStart;
  for (const r of rel) {
    if (r.start > cursor) out.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < clipEnd) out.push({ start: cursor, end: clipEnd });
  return out;
}

/**
 * If kept ranges are very short, drop them. Default 0.5s minimum.
 */
export function dropTooShort(
  ranges: Array<{ start: number; end: number }>,
  minSeconds: number = 0.5,
): Array<{ start: number; end: number }> {
  return ranges.filter((r) => r.end - r.start >= minSeconds);
}
