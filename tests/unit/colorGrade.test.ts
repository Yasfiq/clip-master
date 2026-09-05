import { describe, it, expect } from 'vitest';
import { buildColorGradeFilter, validateColorGradeConfig } from '@/pipeline/logic/colorGrade';

describe('colorGrade', () => {
  describe('buildColorGradeFilter', () => {
    it('returns empty string for natural preset (no color grading)', () => {
      const filter = buildColorGradeFilter({ preset: 'natural' });
      expect(filter).toBe('');
    });

    it('returns empty string for natural with brightness/contrast overrides', () => {
      const filter = buildColorGradeFilter({
        preset: 'natural',
        brightness: 0.3,
        contrast: 1.5,
        saturation: 0.8,
      });
      expect(filter).toBe('');
    });

    it('applies vivid preset (legacy filter presets still buildable)', () => {
      const filter = buildColorGradeFilter({ preset: 'vivid' });
      expect(filter).toContain('eq=');
      expect(filter).toContain('saturation');
    });
  });
});
describe('validateColorGradeConfig', () => {
  it('accepts natural preset', () => {
    expect(validateColorGradeConfig({ preset: 'natural' })).toBeNull();
  });
});
