import { describe, it, expect } from 'vitest';
import { isGradedPreset, shouldPassThroughVideo } from '@/pipeline/logic/editWiring';

describe('editWiring', () => {
  describe('shouldPassThroughVideo', () => {
    it('is true when color filter is empty (natural)', () => {
      expect(shouldPassThroughVideo('')).toBe(true);
    });

    it('is true when color filter is whitespace only', () => {
      expect(shouldPassThroughVideo('   ')).toBe(true);
    });

    it('is false when a grading filter is present', () => {
      expect(shouldPassThroughVideo('eq=brightness=0:contrast=1.2')).toBe(false);
    });
  });

  describe('isGradedPreset', () => {
    it('classifies natural as not graded', () => {
      expect(isGradedPreset('natural')).toBe(false);
    });

    it('classifies legacy presets as graded', () => {
      expect(isGradedPreset('vivid')).toBe(true);
      expect(isGradedPreset('cinematic')).toBe(true);
    });

    it('classifies unknown ids as not graded (safe fallback)', () => {
      expect(isGradedPreset('bogus')).toBe(false);
    });
  });
});
