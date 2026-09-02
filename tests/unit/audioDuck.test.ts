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
      expect(filter).toContain('afade');
      expect(filter).toContain('alimiter');
    });

    it('includes speech target volume adjustment', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        speechTargetDb: -3,
        backsoundPath: '/tmp/music.mp3',
      });
      // -3dB = 10^(-3/20) ≈ 0.7079
      expect(filter).toContain('volume=volume=');
    });

    it('includes music ducking logic', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('adynamicequalizer');
    });

    it('includes fade in/out transitions', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        fadeSeconds: 2,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('afade=t=in');
      expect(filter).toContain('afade=t=out');
      expect(filter).toContain('d=2');
    });

    it('includes peak limiter', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        peakLimitDb: -1,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('alimiter=limit=-1');
    });

    it('adjusts duck transition time', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        duckTransitionSeconds: 0.5,
        backsoundPath: '/tmp/music.mp3',
      });
      expect(filter).toContain('attack=0.25');
      expect(filter).toContain('release=1.5');
    });

    it('returns valid FFmpeg filter_complex syntax', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/tmp/music.mp3',
      });
      // Should have proper structure
      expect(filter).toMatch(/\[.*\]/); // Contains stream labels
      expect(filter.split(',').length).toBeGreaterThan(5); // Multiple filter stages
    });
  });

  describe('validateAudioDuckConfig', () => {
    it('accepts valid default config', () => {
      const error = validateAudioDuckConfig(DEFAULT_AUDIO_CONFIG);
      expect(error).toBeNull();
    });

    it('rejects speechTargetDb out of range (too high)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        speechTargetDb: 5,
      });
      expect(error).toContain('speechTargetDb must be between -50 and 0');
    });

    it('rejects speechTargetDb out of range (too low)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        speechTargetDb: -60,
      });
      expect(error).toContain('speechTargetDb must be between -50 and 0');
    });

    it('rejects musicBaselineDb out of range', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        musicBaselineDb: 10,
      });
      expect(error).toContain('musicBaselineDb must be between -50 and 0');
    });

    it('rejects musicDuckedDb out of range', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        musicDuckedDb: -60,
      });
      expect(error).toContain('musicDuckedDb must be between -50 and 0');
    });

    it('rejects when musicBaselineDb <= musicDuckedDb', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        musicBaselineDb: -24,
        musicDuckedDb: -18,
      });
      expect(error).toContain('musicBaselineDb must be greater than musicDuckedDb');
    });

    it('rejects peakLimitDb out of range (too high)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        peakLimitDb: 5,
      });
      expect(error).toContain('peakLimitDb must be between -12 and -1');
    });

    it('rejects peakLimitDb out of range (too low)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        peakLimitDb: -15,
      });
      expect(error).toContain('peakLimitDb must be between -12 and -1');
    });

    it('rejects fadeSeconds out of range (negative)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        fadeSeconds: -1,
      });
      expect(error).toContain('fadeSeconds must be between 0 and 10');
    });

    it('rejects fadeSeconds out of range (too high)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        fadeSeconds: 15,
      });
      expect(error).toContain('fadeSeconds must be between 0 and 10');
    });

    it('rejects duckTransitionSeconds out of range (too low)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        duckTransitionSeconds: 0.05,
      });
      expect(error).toContain('duckTransitionSeconds must be between 0.1 and 2');
    });

    it('rejects duckTransitionSeconds out of range (too high)', () => {
      const error = validateAudioDuckConfig({
        ...DEFAULT_AUDIO_CONFIG,
        duckTransitionSeconds: 3,
      });
      expect(error).toContain('duckTransitionSeconds must be between 0.1 and 2');
    });

    it('accepts edge values', () => {
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, speechTargetDb: -50 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, speechTargetDb: 0 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, peakLimitDb: -12 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, peakLimitDb: -1 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: 0 })).toBeNull();
      expect(validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, fadeSeconds: 10 })).toBeNull();
      expect(
        validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, duckTransitionSeconds: 0.1 }),
      ).toBeNull();
      expect(
        validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, duckTransitionSeconds: 2 }),
      ).toBeNull();
    });
  });

  describe('DEFAULT_AUDIO_CONFIG', () => {
    it('has correct architecture-specified values', () => {
      expect(DEFAULT_AUDIO_CONFIG.speechTargetDb).toBe(-3);
      expect(DEFAULT_AUDIO_CONFIG.musicBaselineDb).toBe(-18);
      expect(DEFAULT_AUDIO_CONFIG.musicDuckedDb).toBe(-24);
      expect(DEFAULT_AUDIO_CONFIG.peakLimitDb).toBe(-1);
      expect(DEFAULT_AUDIO_CONFIG.fadeSeconds).toBe(2);
      expect(DEFAULT_AUDIO_CONFIG.duckTransitionSeconds).toBe(0.5);
    });

    it('passes validation', () => {
      expect(validateAudioDuckConfig(DEFAULT_AUDIO_CONFIG)).toBeNull();
    });
  });
});
