import { describe, it, expect } from 'vitest';
import { validateConfigValues } from '@/app/api/config/validate';

describe('validateConfigValues', () => {
  it('accepts a valid full payload', () => {
    const errors = validateConfigValues({
      adFilterEnabled: true,
      adScoreThreshold: 0.8,
      minSegmentDuration: 120,
      targetDuration: 60,
      maxClips: 5,
      colorGrading: 'natural',
      backsoundEnabled: true,
      subtitleEnabled: true,
      targetResolution: '1080x1920',
    });
    expect(errors).toEqual([]);
  });

  it('rejects adScoreThreshold outside 0..1', () => {
    expect(validateConfigValues({ adScoreThreshold: 1.5 })).not.toEqual([]);
    expect(validateConfigValues({ adScoreThreshold: -0.1 })).not.toEqual([]);
  });

  it('rejects non-numeric durations', () => {
    expect(validateConfigValues({ targetDuration: 'fast' })).not.toEqual([]);
  });

  it('rejects negative or zero durations', () => {
    expect(validateConfigValues({ targetDuration: 0 })).not.toEqual([]);
    expect(validateConfigValues({ minSegmentDuration: -5 })).not.toEqual([]);
  });

  it('rejects maxClips out of 1..50', () => {
    expect(validateConfigValues({ maxClips: 0 })).not.toEqual([]);
    expect(validateConfigValues({ maxClips: 51 })).not.toEqual([]);
    expect(validateConfigValues({ maxClips: 50 })).toEqual([]);
  });

  it('rejects unknown colorGrading presets', () => {
    expect(validateConfigValues({ colorGrading: 'sepia' })).not.toEqual([]);
  });

  it('accepts every EDIT-stage grading preset (validation must not block the pipeline)', () => {
    for (const preset of ['natural', 'vivid', 'warm', 'cool', 'cinematic', 'vintage']) {
      expect(validateConfigValues({ colorGrading: preset })).toEqual([]);
    }
  });

  it('rejects malformed targetResolution', () => {
    expect(validateConfigValues({ targetResolution: '1080p' })).not.toEqual([]);
    expect(validateConfigValues({ targetResolution: '1080x1920' })).toEqual([]);
  });

  it('ignores unknown keys instead of failing', () => {
    const errors = validateConfigValues({ gradingPreset: 'vivid' } as any);
    expect(errors).toEqual([]);
  });

  it('accepts undefined values (partial update)', () => {
    expect(validateConfigValues({ maxClips: undefined })).toEqual([]);
  });
});
