/**
 * Hand-written validation for the pipeline-config REST boundary. The config
 * table is small and the shape is stable; a validation library would be a
 * dependency the project rules forbid. Every field the pipeline actually
 * reads is checked here so a corrupt config row can never reach a stage.
 *
 * Unknown keys are intentionally ignored (never forwarded), per the rule
 * that request bodies may not smuggle arbitrary values into the pipeline.
 */

export type ConfigValue = string | number | boolean | undefined | null;

const COLOR_GRADING_PRESETS: ReadonlySet<string> = new Set([
  'natural',
  'vivid',
  'warm',
  'cool',
  'cinematic',
  'vintage',
]);

/** Resolution strings accepted by the compress stage ("WxH" portrait). */
const RESOLUTION_PATTERN = /^\d{3,4}x\d{3,4}$/;

/** The writable surface of PipelineConfig — keys the REST layer accepts. */
export const CONFIG_KEYS = [
  'adFilterEnabled',
  'adScoreThreshold',
  'minSegmentDuration',
  'targetDuration',
  'maxClips',
  'colorGrading',
  'backsoundEnabled',
  'subtitleEnabled',
  'targetResolution',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Returns a list of human-readable problems. Empty array = valid. */
export function validateConfigValues(values: Record<string, ConfigValue>): string[] {
  const errors: string[] = [];

  for (const key of CONFIG_KEYS) {
    const v = values[key];
    if (v === undefined || v === null) continue; // partial update

    switch (key) {
      case 'adFilterEnabled':
      case 'backsoundEnabled':
      case 'subtitleEnabled':
        if (typeof v !== 'boolean') errors.push(`${key} must be a boolean`);
        break;

      case 'adScoreThreshold':
        if (!isFiniteNumber(v) || v < 0 || v > 1) {
          errors.push('adScoreThreshold must be a number between 0 and 1');
        }
        break;

      case 'minSegmentDuration':
      case 'targetDuration':
        if (!isFiniteNumber(v) || v <= 0) {
          errors.push(`${key} must be a positive number of seconds`);
        }
        break;

      case 'maxClips':
        if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 1 || v > 10) {
          errors.push('maxClips must be an integer between 1 and 10');
        }
        break;

      case 'colorGrading':
        if (typeof v !== 'string' || !COLOR_GRADING_PRESETS.has(v)) {
          errors.push(`colorGrading must be one of: ${[...COLOR_GRADING_PRESETS].join(', ')}`);
        }
        break;

      case 'targetResolution':
        if (typeof v !== 'string' || !RESOLUTION_PATTERN.test(v)) {
          errors.push('targetResolution must be a WxH string like 1080x1920');
        }
        break;
    }
  }

  return errors;
}
