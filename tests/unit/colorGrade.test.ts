'use client';

import { describe, it, expect } from 'vitest';
import {
  buildColorGradeFilter,
  validateColorGradeConfig,
  type ColorGradePreset,
} from '@/pipeline/logic/colorGrade';

describe('colorGrade', () => {
  describe('buildColorGradeFilter', () => {
    it('builds vivid preset with saturation boost', () => {
      const filter = buildColorGradeFilter({ preset: 'vivid' });
      expect(filter).toContain('saturation=1.30');
      expect(filter).toContain('contrast=1.20');
    });

    it('builds warm preset with brightness increase', () => {
      const filter = buildColorGradeFilter({ preset: 'warm' });
      expect(filter).toContain('brightness=0.10');
      expect(filter).toContain('saturation=1.10');
    });

    it('builds cool preset with reduced saturation', () => {
      const filter = buildColorGradeFilter({ preset: 'cool' });
      expect(filter).toContain('saturation=0.90');
      expect(filter).toContain('brightness=-0.05');
    });

    it('builds cinematic preset with lifted blacks', () => {
      const filter = buildColorGradeFilter({ preset: 'cinematic' });
      expect(filter).toContain('brightness=0.15');
      expect(filter).toContain('saturation=0.85');
      expect(filter).toContain('contrast=1.30');
    });

    it('builds vintage preset with faded look', () => {
      const filter = buildColorGradeFilter({ preset: 'vintage' });
      expect(filter).toContain('contrast=0.80');
      expect(filter).toContain('saturation=0.60');
    });

    it('applies custom brightness adjustment', () => {
      const filter = buildColorGradeFilter({ preset: 'vivid', brightness: 0.3 });
      expect(filter).toContain('brightness=0.30');
    });

    it('applies custom contrast adjustment', () => {
      const filter = buildColorGradeFilter({ preset: 'vivid', contrast: 1.5 });
      expect(filter).toContain('contrast=1.80');
    });

    it('applies custom saturation adjustment', () => {
      const filter = buildColorGradeFilter({ preset: 'vivid', saturation: 0.8 });
      expect(filter).toContain('saturation=1.04');
    });

    it('returns valid FFmpeg eq filter syntax', () => {
      const presets: ColorGradePreset[] = ['vivid', 'warm', 'cool', 'cinematic', 'vintage'];
      presets.forEach((preset) => {
        const filter = buildColorGradeFilter({ preset });
        expect(filter).toMatch(/^eq=/);
        expect(filter).toMatch(/brightness=/);
        expect(filter).toMatch(/contrast=/);
        expect(filter).toMatch(/saturation=/);
      });
    });
  });

  describe('validateColorGradeConfig', () => {
    it('accepts valid vivid preset', () => {
      const error = validateColorGradeConfig({ preset: 'vivid' });
      expect(error).toBeNull();
    });

    it('rejects invalid preset', () => {
      const error = validateColorGradeConfig({ preset: 'invalid' });
      expect(error).toContain('Invalid preset');
    });

    it('rejects brightness out of range', () => {
      const error = validateColorGradeConfig({ preset: 'vivid', brightness: 1.5 });
      expect(error).toContain('Brightness must be between -1.0 and 1.0');
    });

    it('rejects negative brightness beyond -1', () => {
      const error = validateColorGradeConfig({ preset: 'vivid', brightness: -1.5 });
      expect(error).toContain('Brightness must be between -1.0 and 1.0');
    });

    it('rejects contrast out of range', () => {
      const error = validateColorGradeConfig({ preset: 'vivid', contrast: 3.0 });
      expect(error).toContain('Contrast must be between 0.5 and 2.0');
    });

    it('rejects saturation out of range', () => {
      const error = validateColorGradeConfig({ preset: 'vivid', saturation: 2.5 });
      expect(error).toContain('Saturation must be between 0.0 and 2.0');
    });

    it('accepts valid config with all parameters', () => {
      const error = validateColorGradeConfig({
        preset: 'cinematic',
        brightness: 0.2,
        contrast: 1.1,
        saturation: 0.9,
      });
      expect(error).toBeNull();
    });

    it('accepts edge values', () => {
      expect(validateColorGradeConfig({ preset: 'vivid', brightness: -1 })).toBeNull();
      expect(validateColorGradeConfig({ preset: 'vivid', brightness: 1 })).toBeNull();
      expect(validateColorGradeConfig({ preset: 'vivid', contrast: 0.5 })).toBeNull();
      expect(validateColorGradeConfig({ preset: 'vivid', contrast: 2.0 })).toBeNull();
      expect(validateColorGradeConfig({ preset: 'vivid', saturation: 0 })).toBeNull();
      expect(validateColorGradeConfig({ preset: 'vivid', saturation: 2.0 })).toBeNull();
    });
  });
});
