import { describe, it, expect } from 'vitest';
import { detectHook, positionBias, composeHookAudio } from '@/pipeline/logic/hookDetect';

describe('hookDetect', () => {
  describe('positionBias', () => {
    it('returns 1.0 at start', () => {
      expect(positionBias(0, 600)).toBe(1);
    });

    it('decays to floor by 25% of video', () => {
      expect(positionBias(150, 600)).toBeCloseTo(0.35, 2); // 25% mark
    });

    it('holds floor beyond 25%', () => {
      expect(positionBias(300, 600)).toBeCloseTo(0.35, 2);
      expect(positionBias(550, 600)).toBeCloseTo(0.35, 2);
    });

    it('returns 1.0 when videoDuration is invalid', () => {
      expect(positionBias(30, 0)).toBe(1);
    });

    it('decays linearly in first 25%', () => {
      // At ratio 0.125 (75/600) within 25% window: 1 - (1-0.35)*(0.125/0.25) = 0.675
      expect(positionBias(75, 600)).toBeCloseTo(0.675, 2);
    });
  });

  describe('detectHook — Indonesian', () => {
    it('returns 0 for empty text', () => {
      expect(
        detectHook({ text: '', windowStart: 0, windowEnd: 60, videoDuration: 600 }).score,
      ).toBe(0);
    });

    it('scores a strong Indonesian hook (question + reveal + 2nd person)', () => {
      const result = detectHook({
        text: 'Tau gak? Ternyata rahasia terbesar adalah kamu harus coba ini.',
        windowStart: 0,
        windowEnd: 60,
        videoDuration: 600,
        language: 'id',
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.hits.length).toBeGreaterThan(2);
    });

    it('scores low for bland content', () => {
      const result = detectHook({
        text: 'Hari ini saya makan nasi.',
        windowStart: 200,
        windowEnd: 260,
        videoDuration: 600,
        language: 'id',
      });
      expect(result.score).toBeLessThan(0.3);
    });

    it('boosts first-segment hooks via multiplier', () => {
      const text = 'Tau gak? Ternyata rahasia terbesar adalah kamu harus coba ini.';
      const firstWindow = detectHook({
        text,
        windowStart: 0,
        windowEnd: 60,
        videoDuration: 600,
        language: 'id',
      });
      const lateWindow = detectHook({
        text,
        windowStart: 400,
        windowEnd: 460,
        videoDuration: 600,
        language: 'id',
      });
      expect(firstWindow.score).toBeGreaterThan(lateWindow.score);
    });

    it('caps repeated signal contributions', () => {
      const many = detectHook({
        text: 'tau gak tau gak tau gak tau gak tau gak tau gak',
        windowStart: 0,
        windowEnd: 60,
        videoDuration: 600,
        language: 'id',
      });
      const few = detectHook({
        text: 'tau gak',
        windowStart: 0,
        windowEnd: 60,
        videoDuration: 600,
        language: 'id',
      });
      expect(many.score).toBeLessThan(few.score * 6); // not 6x
    });
  });

  describe('detectHook — English', () => {
    it('scores English hook patterns', () => {
      const result = detectHook({
        text: "You won't believe this shocking secret!",
        windowStart: 0,
        windowEnd: 60,
        videoDuration: 600,
        language: 'en',
      });
      expect(result.score).toBeGreaterThan(0.4);
    });

    it('scores low for plain English content', () => {
      const result = detectHook({
        text: 'Today I went to the store and bought some apples.',
        windowStart: 200,
        windowEnd: 260,
        videoDuration: 600,
        language: 'en',
      });
      expect(result.score).toBeLessThan(0.3);
    });
  });

  describe('composeHookAudio', () => {
    it('blends 0.7 hook + 0.3 audio', () => {
      expect(composeHookAudio(1, 1)).toBe(1);
      expect(composeHookAudio(0, 0)).toBe(0);
      expect(composeHookAudio(1, 0)).toBeCloseTo(0.7);
      expect(composeHookAudio(0, 1)).toBeCloseTo(0.3);
      expect(composeHookAudio(0.5, 0.5)).toBeCloseTo(0.5);
    });

    it('clamps inputs to [0, 1]', () => {
      expect(composeHookAudio(-1, 0.5)).toBeGreaterThanOrEqual(0);
      expect(composeHookAudio(2, 0.5)).toBeLessThanOrEqual(1);
    });
  });
});
