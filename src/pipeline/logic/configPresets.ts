/**
 * Pure config presentation helpers: map user-facing preset options to the
 * pipeline config values they control. No filesystem, no process spawning —
 * unit-testable.
 *
 * The UI speaks the user's language (clip length presets, resolution labels);
 * the pipeline speaks seconds and "WxH" strings. These functions are the only
 * place the two vocabularies meet, so a UI choice can never corrupt a config
 * row the way free-form number inputs used to.
 */

export interface PresetOption {
  id: string;
  label: string;
}

/** Clip Length presets, market-standard Shorts durations. Auto lets the
 *  pipeline decide from source length. */
export const CLIP_LENGTH_OPTIONS: PresetOption[] = [
  { id: 'auto', label: 'Auto (recommended)' },
  { id: 's15', label: 'Short (15s)' },
  { id: 's30', label: 'Medium (30s)' },
  { id: 's60', label: 'Long (60s)' },
  { id: 's90', label: 'Extra (90s)' },
];

/** Convert a Clip Length option id to a targetDuration in seconds.
 *  Auto returns undefined so the pipeline keeps its source-driven default. */
export function clipLengthToTargetSeconds(id: string): number | undefined {
  switch (id) {
    case 's15':
      return 15;
    case 's30':
      return 30;
    case 's60':
      return 60;
    case 's90':
      return 90;
    default:
      return undefined; // auto
  }
}

/** Inverse of clipLengthToTargetSeconds: which option owns this duration? */
export function targetSecondsToClipLength(seconds: number | undefined | null): string {
  if (seconds === 15) return 's15';
  if (seconds === 30) return 's30';
  if (seconds === 60) return 's60';
  if (seconds === 90) return 's90';
  return 'auto';
}

/** Output resolutions, portrait-first for Shorts/TikTok/Reels. */
export const RESOLUTION_OPTIONS: PresetOption[] = [
  { id: '1080x1920', label: '1080p (9:16 portrait)' },
  { id: '720x1280', label: '720p (9:16 portrait)' },
  { id: '480x854', label: '480p (9:16 portrait)' },
];

/** Validate/normalize a resolution string into pipeline "WxH" form.
 *  Returns null when the value is not a known portrait resolution, so the
 *  UI can fall back instead of persisting a corrupt row. */
export function resolutionToTarget(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (RESOLUTION_OPTIONS.some((o) => o.id === normalized)) return normalized;
  return null;
}
