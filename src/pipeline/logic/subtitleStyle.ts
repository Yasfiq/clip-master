/**
 * Subtitle style picker. Pure config builder — no I/O.
 *
 * Per user spec (Option A), each of the 3 produced clips gets a different
 * style so the three Shorts look visually distinct:
 *
 *   clip 0 → SULE  style: yellow + thick black outline, no shadow, chest height
 *   clip 1 → TikTok default: white + black outline, no shadow
 *   clip 2 → KAMAL style: yellow + red shadow, lower third
 *
 * All styles use sentence-case text (handled upstream in subtitle.ts).
 */

export interface SubtitleStyle {
  id: string;
  label: string;
  /** ASS force_style PrimaryColour (ABGR hex with alpha). */
  primaryColour: string;
  outlineColour: string;
  backColour: string;
  outline: number;
  shadow: number;
  bold: number;
  italic: number;
  marginV: number;
  alignment: number;
  fontSize: number;
}

export const SULE_STYLE: SubtitleStyle = {
  id: 'sule',
  label: 'SULE (yellow + thick black outline)',
  primaryColour: '&H0000FFFF',
  outlineColour: '&H00000000',
  backColour: '&H00000000',
  outline: 3,
  shadow: 0,
  bold: -1,
  italic: 0,
  marginV: 450,
  alignment: 2,
  fontSize: 52,
};

export const TIKTOK_STYLE: SubtitleStyle = {
  id: 'tiktok',
  label: 'TikTok default (white + black outline)',
  primaryColour: '&H00FFFFFF',
  outlineColour: '&H00000000',
  backColour: '&H00000000',
  outline: 2,
  shadow: 0,
  bold: -1,
  italic: 0,
  marginV: 250,
  alignment: 2,
  fontSize: 52,
};

export const KAMAL_STYLE: SubtitleStyle = {
  id: 'kamal',
  label: 'KAMAL (yellow + red shadow)',
  primaryColour: '&H0000FFFF',
  outlineColour: '&H00000000',
  backColour: '&H000000FF',
  outline: 2,
  shadow: 2,
  bold: -1,
  italic: 0,
  marginV: 250,
  alignment: 2,
  fontSize: 52,
};

/** Ordered list of styles for the 3 produced clips. */
export const CLIP_STYLE_POOL: SubtitleStyle[] = [SULE_STYLE, TIKTOK_STYLE, KAMAL_STYLE];

/**
 * Pick a style for a clip by its zero-based index. Cycles through the pool
 * so the first 3 clips always get distinct styles; additional clips wrap.
 */
export function pickStyle(clipIndex: number): SubtitleStyle {
  if (!Number.isFinite(clipIndex) || clipIndex < 0) {
    throw new Error(`clipIndex must be a non-negative integer (got ${clipIndex})`);
  }
  return CLIP_STYLE_POOL[clipIndex % CLIP_STYLE_POOL.length]!;
}

/**
 * Build an ASS `force_style=...` string from a SubtitleStyle.
 * Handles escaping of values that contain special chars (e.g. `=`).
 */
export function buildForceStyle(style: SubtitleStyle): string {
  return [
    `FontName=DejaVu Sans`,
    `FontSize=${style.fontSize}`,
    `PrimaryColour=${style.primaryColour}`,
    `OutlineColour=${style.outlineColour}`,
    `BackColour=${style.backColour}`,
    `Outline=${style.outline}`,
    `Shadow=${style.shadow}`,
    `Bold=${style.bold}`,
    `Italic=${style.italic}`,
    `MarginV=${style.marginV}`,
    `Alignment=${style.alignment}`,
    `PlayResX=1080`,
    `PlayResY=1920`,
  ].join(',');
}
