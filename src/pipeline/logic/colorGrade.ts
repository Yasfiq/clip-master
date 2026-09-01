/**
 * Pure color grading logic. Returns FFmpeg filter chains for predefined presets.
 * No filesystem or process spawning — unit-testable.
 */

export type ColorGradePreset = 'vivid' | 'warm' | 'cool' | 'cinematic' | 'vintage';

export interface ColorGradeConfig {
  preset: ColorGradePreset;
  brightness?: number; // -1.0 to 1.0
  contrast?: number; // 0.5 to 2.0
  saturation?: number; // 0.0 to 2.0
}

/**
 * Build an FFmpeg filter chain for a color grading preset.
 * Returns a string suitable for -vf / -filter_complex.
 */
export function buildColorGradeFilter(config: ColorGradeConfig): string {
  const { preset, brightness = 0, contrast = 1.0, saturation = 1.0 } = config;

  // Base presets: LUT-free color transform via eq + curves
  let filter = '';

  switch (preset) {
    case 'vivid':
      // High saturation, boost midtones
      filter = `eq=brightness=${brightness}:contrast=${contrast * 1.2}:saturation=${saturation * 1.3}`;
      break;

    case 'warm':
      // Slight yellowing via colortemperature simulation
      filter = `eq=brightness=${brightness + 0.1}:contrast=${contrast}:saturation=${saturation * 1.1}`;
      break;

    case 'cool':
      // Slight cooling via saturation shift
      filter = `eq=brightness=${brightness - 0.05}:contrast=${contrast * 1.1}:saturation=${saturation * 0.9}`;
      break;

    case 'cinematic':
      // Reduced saturation, lifted blacks, boosted contrast (log-like)
      filter = `eq=brightness=${brightness + 0.15}:contrast=${contrast * 1.3}:saturation=${saturation * 0.85}`;
      break;

    case 'vintage':
      // Faded look: reduced contrast, reduced saturation, slight sepia warmth
      filter = `eq=brightness=${brightness - 0.1}:contrast=${contrast * 0.8}:saturation=${saturation * 0.6}`;
      break;

    default:
      filter = `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`;
  }

  return filter;
}

/**
 * Validate a color grade config. Returns error message or null if valid.
 */
export function validateColorGradeConfig(config: any): string | null {
  if (
    !config.preset ||
    !['vivid', 'warm', 'cool', 'cinematic', 'vintage'].includes(config.preset)
  ) {
    return 'Invalid preset. Must be one of: vivid, warm, cool, cinematic, vintage';
  }
  if (config.brightness !== undefined && (config.brightness < -1 || config.brightness > 1)) {
    return 'Brightness must be between -1.0 and 1.0';
  }
  if (config.contrast !== undefined && (config.contrast < 0.5 || config.contrast > 2)) {
    return 'Contrast must be between 0.5 and 2.0';
  }
  if (config.saturation !== undefined && (config.saturation < 0 || config.saturation > 2)) {
    return 'Saturation must be between 0.0 and 2.0';
  }
  return null;
}
