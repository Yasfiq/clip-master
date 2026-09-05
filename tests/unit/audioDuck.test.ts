import { describe, it, expect } from 'vitest';
import {
  buildAudioDuckFilter,
  validateAudioDuckConfig,
  DEFAULT_AUDIO_CONFIG,
} from '@/pipeline/logic/audioDuck';

describe('audioDuck', () => {
  describe('buildAudioDuckFilter', () => {
    it('builds filter with default config', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('asplit');
      expect(filter).toContain('amix');
      expect(filter).toContain('sidechaincompress');
      expect(filter).toContain('afade');
      expect(filter).toContain('alimiter');
    });

    it('places music as sidechaincompress MAIN input and voice as sidechain', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      // Correct order: [music][vd] — music ducks under voice detection.
      expect(filter).toContain('[music][vd]sidechaincompress');
      // Wrong order would duck the voice instead.
      expect(filter).not.toContain('[vd][music]sidechaincompress');
    });

    it('every asplit output is consumed (no dangling labels)', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      // asplit produces [vd] + [vm]; vd goes to sidechain, vm goes to amix.
      expect(filter).toContain('[voice]asplit[vd][vm]');
      expect(filter).toContain('[vm][duck]amix');
      expect(filter).toContain('[music][vd]sidechaincompress');
    });

    it('applies music baseline gain', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        musicBaselineGain: 0.125,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('[1:a]volume=0.125[music]');
    });

    it('applies speech gain', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        speechGain: 2,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('[0:a]volume=2[voice]');
    });

    it('includes duck depth ratio and thresholds', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        sidechainRatio: 8,
        sidechainThreshold: 0.01,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('ratio=8');
      expect(filter).toContain('threshold=0.01');
    });

    it('includes fade in/out transitions', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        fadeSeconds: 2,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('afade=t=in:st=0:d=2');
      expect(filter).toContain('afade=t=out:st=0:d=2');
    });

    it('includes peak limiter with LINEAR ceiling (not dB)', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        peakLimit: 0.891,
        backsoundPath: '/tmp/music.mp3',
      });
      // -1 dBFS ≈ 0.891 linear. alimiter limit range is 0.0625..1.
      expect(filter).toContain('alimiter=limit=0.891');
      // Must never pass a negative dB value to alimiter.
      expect(filter).not.toContain('alimiter=limit=-1');
    });

    it('uses only supported filter names (FFmpeg 8 validated)', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      // Old implementation used adynamicequalizer with negative range which
      // FFmpeg rejects ("Numerical result out of range"). Must be gone.
      expect(filter).not.toContain('adynamicequalizer');
    });
  });

  describe('validateAudioDuckConfig', () => {
    it('accepts valid default config', () => {
      expect(validateAudioDuckConfig(DEFAULT_AUDIO_CONFIG)).toBeNull();
    });

    it('rejects non-positive speechGain', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, speechGain: 0 })).toContain(
        'speechGain',
      );
    });

    it('rejects speechGain above 8', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, speechGain: 10 })).toContain(
        'speechGain',
      );
    });

    it('rejects musicBaselineGain above 1', () => {
      expect(
        validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, musicBaselineGain: 1.5 }),
      ).toContain('musicBaselineGain');
    });

    it('rejects sidechainRatio below 1', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, sidechainRatio: 0.5 })).toContain(
        'sidechainRatio',
      );
    });

    it('rejects sidechainRatio above 30', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, sidechainRatio: 50 })).toContain(
        'sidechainRatio',
      );
    });

    it('rejects peakLimit below alimiter linear minimum', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, peakLimit: 0.01 })).toContain(
        'peakLimit',
      );
    });

    it('rejects peakLimit above 1', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, peakLimit: 1.5 })).toContain(
        'peakLimit',
      );
    });

    it('rejects negative fadeSeconds', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: -1 })).toContain(
        'fadeSeconds',
      );
    });

    it('rejects fadeSeconds too high', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: 15 })).toContain(
        'fadeSeconds',
      );
    });

    it('rejects attackMs out of range', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, attackMs: 0 })).toContain(
        'attackMs',
      );
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, attackMs: 5000 })).toContain(
        'attackMs',
      );
    });

    it('rejects releaseMs out of range', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, releaseMs: 5 })).toContain(
        'releaseMs',
      );
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, releaseMs: 10000 })).toContain(
        'releaseMs',
      );
    });

    it('accepts boundary values', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: 0 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: 10 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, sidechainRatio: 1 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, sidechainRatio: 30 })).toBeNull();
    });
  });

  describe('DEFAULT_AUDIO_CONFIG', () => {
    it('has architecture-specified values', () => {
      expect(DEFAULT_AUDIO_CONFIG.musicBaselineGain).toBeCloseTo(0.125); // -18 dB
      expect(DEFAULT_AUDIO_CONFIG.peakLimit).toBeCloseTo(0.891); // -1 dBFS
      expect(DEFAULT_AUDIO_CONFIG.fadeSeconds).toBe(2);
    });

    it('passes validation', () => {
      expect(validateAudioDuckConfig(DEFAULT_AUDIO_CONFIG)).toBeNull();
    });
  });
});
