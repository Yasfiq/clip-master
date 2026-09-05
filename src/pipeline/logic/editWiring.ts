/**
 * Pure decision helpers for the edit stage's ffmpeg wiring. When color
 * grading is "natural" the video stream must pass through untouched: an
 * empty filter string would corrupt an ffmpeg filter graph, so callers use
 * shouldPassThroughVideo to branch into a plain stream copy instead.
 *
 * Kept out of the stage module so the ffmpeg invocation stays effectful
 * while the branch logic stays unit-testable.
 */

/** Color presets that actually alter the image. Anything other than these
 *  (including 'natural' and any unknown id) passes through untouched —
 *  a stale config row degrades to the original image, never a broken encode. */
const GRADED_PRESETS: ReadonlySet<string> = new Set([
  'vivid',
  'warm',
  'cool',
  'cinematic',
  'vintage',
]);

export function isGradedPreset(preset: string): boolean {
  return GRADED_PRESETS.has(preset);
}

/** True when the computed color filter is empty — caller should copy the
 *  video stream instead of feeding '' to ffmpeg. */
export function shouldPassThroughVideo(colorFilter: string): boolean {
  return colorFilter.trim() === '';
}
