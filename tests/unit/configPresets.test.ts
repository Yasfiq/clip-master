import { describe, it, expect } from 'vitest';
import {
  CLIP_LENGTH_OPTIONS,
  clipLengthToTargetSeconds,
  targetSecondsToClipLength,
  RESOLUTION_OPTIONS,
  resolutionToTarget,
} from '@/pipeline/logic/configPresets';

describe('configPresets', () => {
  describe('CLIP_LENGTH_OPTIONS', () => {
    it('offers Auto plus market-standard shorts durations', () => {
      const ids = CLIP_LENGTH_OPTIONS.map((o) => o.id);
      expect(ids).toEqual(['auto', 's15', 's30', 's60', 's90']);
    });
  });

  describe('clipLengthToTargetSeconds', () => {
    it('maps auto to undefined (pipeline decides)', () => {
      expect(clipLengthToTargetSeconds('auto')).toBeUndefined();
    });

    it('maps each preset to its seconds', () => {
      expect(clipLengthToTargetSeconds('s15')).toBe(15);
      expect(clipLengthToTargetSeconds('s30')).toBe(30);
      expect(clipLengthToTargetSeconds('s60')).toBe(60);
      expect(clipLengthToTargetSeconds('s90')).toBe(90);
    });

    it('falls back to auto for unknown ids', () => {
      expect(clipLengthToTargetSeconds('bogus')).toBeUndefined();
    });
  });

  describe('targetSecondsToClipLength', () => {
    it('round-trips exact durations', () => {
      expect(targetSecondsToClipLength(15)).toBe('s15');
      expect(targetSecondsToClipLength(30)).toBe('s30');
      expect(targetSecondsToClipLength(60)).toBe('s60');
      expect(targetSecondsToClipLength(90)).toBe('s90');
    });

    it('returns auto for anything else (incl. legacy 180)', () => {
      expect(targetSecondsToClipLength(180)).toBe('auto');
      expect(targetSecondsToClipLength(undefined)).toBe('auto');
    });
  });

  describe('RESOLUTION_OPTIONS', () => {
    it('offers portrait-first resolutions for Shorts', () => {
      const ids = RESOLUTION_OPTIONS.map((o) => o.id);
      expect(ids).toEqual(['1080x1920', '720x1280', '480x854']);
    });
  });

  describe('resolutionToTarget', () => {
    it('passes through valid portrait resolutions', () => {
      expect(resolutionToTarget('1080x1920')).toBe('1080x1920');
    });

    it('returns null for unrecognized values', () => {
      expect(resolutionToTarget('1080p')).toBeNull();
      expect(resolutionToTarget('original')).toBeNull();
    });
  });
});
