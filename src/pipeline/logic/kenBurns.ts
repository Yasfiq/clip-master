/**
 * Pure Ken Burns (slow zoom/pan) filter logic for Shorts clips.
 *
 * Why: raw cuts are landscape (e.g. 1280x720); exports are portrait
 * (1080x1920). Without motion the portrait window is a static center column
 * — visually dead. zoompan slowly zooms (or pans) the crop window across the
 * clip so the frame has motion even when the speaker is still.
 *
 * Filter order applied by the caller (compress stage):
 *   scale (height = outHeight) → zoompan (zoom window) → crop (guard)
 *
 * Because the pre-zoom stream is WIDER than outWidth, zooming up to
 * `maxZoom` still keeps the output fully covered at 1080x1920.
 *
 * No filesystem or process spawning — unit-testable.
 */

export interface KenBurnsConfig {
  /** Output frame width (px). */
  outWidth: number;
  /** Output frame height (px). */
  outHeight: number;
  /** Clip duration in seconds — drives the zoom ramp length. */
  duration: number;
  /** Zoom factor at the first frame (1.0 = none). */
  zoomStart: number;
  /** Zoom factor at the last frame (>= zoomStart). */
  zoomEnd: number;
  /** Output frame rate. */
  fps: number;
  /** Horizontal focus 0..1 (0 = left, 1 = right). Default 0.5 center. */
  panX?: number;
  /** Vertical focus 0..1 (0 = top, 1 = bottom). Default 0.5 center. */
  panY?: number;
  /** Cap on zoom so we never window beyond the source width. */
  maxZoom?: number;
}

/** Default: gentle 1.0 → 1.12 push-in over the clip, centered. */
export const DEFAULT_KEN_BURNS: Omit<KenBurnsConfig, 'duration'> = {
  outWidth: 1080,
  outHeight: 1920,
  zoomStart: 1.0,
  zoomEnd: 1.12,
  fps: 30,
  panX: 0.5,
  panY: 0.5,
};

/**
 * Build the zoompan filter string for a clip of `config.duration` seconds.
 *
 * Pre-scale is NOT included here: the caller scales the raw source to
 * `outHeight` tall first (landscape, wider than outWidth). This function
 * returns the zoompan + guard-crop half of the chain.
 */
export function buildKenBurnsFilter(config: KenBurnsConfig): string {
  const { outWidth, outHeight, duration, zoomStart, zoomEnd, fps } = config;
  const panX = clamp01(config.panX ?? 0.5);
  const panY = clamp01(config.panY ?? 0.5);
  const maxZoom = config.maxZoom ?? Math.max(zoomStart, zoomEnd);

  const totalFrames = Math.max(1, Math.round(duration * fps));
  const zEnd = Math.min(maxZoom, Math.max(zoomEnd, zoomStart));
  const zStart = Math.min(zoomStart, zEnd);

  // Linear ramp over output frames. zoompan keeps `zoom` across frames; we
  // recompute each frame from `on` (0-based output frame counter) so the
  // motion is deterministic and duration-aware.
  const zoomExpr = buildZoomExpr(zStart, zEnd, totalFrames);

  // Window position: keep the focus point centered under the zoom window.
  const x = `${round3(panX)}*(iw-iw/zoom)`;
  const y = `${round3(panY)}*(ih-ih/zoom)`;

  const zoompan =
    `zoompan=z='${zoomExpr}':x='${x}':y='${y}':d=1:` + `s=${outWidth}x${outHeight}:fps=${fps}`;

  // After zoompan the stream is already outWidth x outHeight; the final crop
  // is a no-op guard against rounding.
  const crop = `crop=${outWidth}:${outHeight}:0:0`;

  return `${zoompan},${crop}`;
}

/**
 * Linear zoom ramp: z(on) = zStart + (zEnd - zStart) * on/(frames-1).
 * For a static zoom (start == end) returns the constant.
 */
export function buildZoomExpr(start: number, end: number, totalFrames: number): string {
  if (Math.abs(start - end) < 0.001 || totalFrames <= 1) {
    return end.toFixed(3);
  }
  const denom = totalFrames - 1;
  const delta = round3(end - start);
  return `${round3(start)}+${delta}*on/${denom}`;
}

/**
 * Validate a Ken Burns config. Returns error message or null if valid.
 */
export function validateKenBurnsConfig(config: KenBurnsConfig): string | null {
  if (config.outWidth <= 0 || config.outHeight <= 0) {
    return 'outWidth and outHeight must be positive';
  }
  if (config.duration <= 0) {
    return 'duration must be positive';
  }
  if (config.zoomStart < 1 || config.zoomEnd < config.zoomStart) {
    return 'zoomStart >= 1 and zoomEnd >= zoomStart required';
  }
  if (config.zoomEnd > 2) {
    return 'zoomEnd above 2.0 crops too aggressively';
  }
  if (config.fps <= 0) {
    return 'fps must be positive';
  }
  const panX = config.panX ?? 0.5;
  const panY = config.panY ?? 0.5;
  if (panX < 0 || panX > 1 || panY < 0 || panY > 1) {
    return 'panX and panY must be within [0, 1]';
  }
  return null;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Round to 3 decimals (zoompan parses floats). */
export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
