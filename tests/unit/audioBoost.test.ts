import { describe, it, expect } from 'vitest';
import {
  buildAudioBoostFilter,
  validateAudioBoostConfig,
  DEFAULT_AUDIO_BOOST,
} from '@/pipeline/logic/audioBoost';

describe('audioBoost', () => {
  describe('buildAudioBoostFilter', () => {
    it('builds a filter chain with loudnorm + volume + aformat', () => {
      const f = buildAudioBoostFilter();
      expect(f).toContain('loudnorm=');
      expect(f).toContain('volume=3');
      expect(f).toContain('aformat=');
    });

    it('places loudnorm BEFORE volume (boost after normalize)', () => {
      const f = buildAudioBoostFilter();
      const loudIdx = f.indexOf('loudnorm=');
      const volIdx = f.indexOf('volume=');
      expect(loudIdx).toBeGreaterThanOrEqual(0);
      expect(volIdx).toBeGreaterThan(loudIdx);
    });

    it('uses 16kHz mono by default for whisper', () => {
      const f = buildAudioBoostFilter();
      expect(f).toContain('sample_rates=16000');
      expect(f).toContain('channel_layouts=mono');
      expect(f).toContain('sample_fmts=s16');
    });

    it('uses user-configured boost factor', () => {
      const f = buildAudioBoostFilter({ ...DEFAULT_AUDIO_BOOST, boostFactor: 2.5 });
      expect(f).toContain('volume=2.5');
    });

    it('uses user-configured LUFS target', () => {
      const f = buildAudioBoostFilter({ ...DEFAULT_AUDIO_BOOST, targetLufs: -16 });
      expect(f).toContain('I=-16');
    });

    it('uses user-configured LRA and TP', () => {
      const f = buildAudioBoostFilter({
        ...DEFAULT_AUDIO_BOOST,
        targetLra: 11,
        targetTruePeak: -1,
      });
      expect(f).toContain('LRA=11');
      expect(f).toContain('TP=-1');
    });
  });

  describe('validateAudioBoostConfig', () => {
    it('accepts default config', () => {
      expect(validateAudioBoostConfig(DEFAULT_AUDIO_BOOST)).toBeNull();
    });

    it('rejects boostFactor <= 0', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, boostFactor: 0 })).toContain(
        'boostFactor must be > 0',
      );
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, boostFactor: -1 })).toContain(
        'boostFactor must be > 0',
      );
    });

    it('rejects boostFactor > 10 (clipping risk)', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, boostFactor: 15 })).toContain(
        'clipping',
      );
    });

    it('rejects invalid sample rates', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, sampleRate: 8000 })).toContain(
        'sampleRate',
      );
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, sampleRate: 11025 })).toContain(
        'sampleRate',
      );
    });

    it('accepts 22050, 44100, 48000 sample rates', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, sampleRate: 22050 })).toBeNull();
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, sampleRate: 44100 })).toBeNull();
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, sampleRate: 48000 })).toBeNull();
    });

    it('rejects invalid channel counts', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, channels: 0 })).toContain(
        'channels',
      );
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, channels: 6 })).toContain(
        'channels',
      );
    });

    it('rejects out-of-range LUFS', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, targetLufs: 5 })).toContain(
        'targetLufs',
      );
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, targetLufs: -80 })).toContain(
        'targetLufs',
      );
    });

    it('rejects out-of-range TP', () => {
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, targetTruePeak: 1 })).toContain(
        'targetTruePeak',
      );
      expect(validateAudioBoostConfig({ ...DEFAULT_AUDIO_BOOST, targetTruePeak: -15 })).toContain(
        'targetTruePeak',
      );
    });
  });

  describe('DEFAULT_AUDIO_BOOST', () => {
    it('uses 3.0x boost per user spec', () => {
      expect(DEFAULT_AUDIO_BOOST.boostFactor).toBe(3.0);
    });
    it('uses 16kHz mono for whisper', () => {
      expect(DEFAULT_AUDIO_BOOST.sampleRate).toBe(16000);
      expect(DEFAULT_AUDIO_BOOST.channels).toBe(1);
    });
  });
});
