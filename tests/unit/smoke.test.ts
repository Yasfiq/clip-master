/**
 * Smoke test: verify pipeline logic without media processing.
 * Tests exactly the exported seams used by the stages.
 */
import { describe, it, expect } from 'vitest';
import { evaluateAd } from '../../src/pipeline/logic/adFilter';
import {
  scoreSegment,
  classifyConfidence,
  selectSegments,
  type SegmentFeatures,
} from '../../src/pipeline/logic/analyze';
import {
  buildAudioDuckFilter,
  validateAudioDuckConfig,
  DEFAULT_AUDIO_CONFIG,
} from '../../src/pipeline/logic/audioDuck';

function makeFeatures(overrides: Partial<SegmentFeatures> = {}): SegmentFeatures {
  return {
    startTime: 0,
    endTime: 180,
    shotChangeRate: 12, // saturates to 1
    visualSaliency: 1,
    colorDynamicRange: 1,
    audioRMSLoudness: 1,
    hookEmbedding: 1,
    bpmAlignment: 1,
    ...overrides,
  };
}

describe('Smoke tests', () => {
  describe('Ad evaluation', () => {
    it('detects high-probability pure ad', () => {
      const verdict = evaluateAd({
        title: 'Sponsored #ad promo',
        description: 'Paid partnership',
        durationSec: 20,
        sceneUniformity: 0.9,
        staticOverlayRatio: 0.9,
        transcript: 'buy now order now klik link kode promo subscribe now',
      });
      expect(verdict.isAd).toBe(true);
      expect(verdict.score).toBeGreaterThanOrEqual(0.75);
    });

    it('accepts normal content', () => {
      const verdict = evaluateAd({
        title: 'My Daily Routine',
        description: 'A look into my day',
        durationSec: 600,
      });
      expect(verdict.isAd).toBe(false);
    });
  });

  describe('Segment scoring', () => {
    it('scores perfect segment at 1.0', () => {
      const score = scoreSegment(makeFeatures());
      expect(score).toBeCloseTo(1.0, 1);
    });

    it('scores low segment near 0', () => {
      const score = scoreSegment(
        makeFeatures({
          shotChangeRate: 0,
          visualSaliency: 0,
          colorDynamicRange: 0,
          audioRMSLoudness: 0,
          hookEmbedding: 0,
          bpmAlignment: 0,
        }),
      );
      expect(score).toBe(0);
    });

    it('selects top segments and caps count', () => {
      const features = [
        makeFeatures({ startTime: 0, endTime: 180 }), // 1.0
        makeFeatures({ startTime: 180, endTime: 360, visualSaliency: 0.5, shotChangeRate: 0 }), // lower
        makeFeatures({ startTime: 360, endTime: 540, visualSaliency: 0, shotChangeRate: 0 }), // lowest
      ];
      // sourceDuration 480 → maxSegments = ceil(480/180) = 3
      const result = selectSegments(features, 480, 0.3);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      expect(result.segments.length).toBeLessThanOrEqual(3);
    });

    it('classifies confidence levels', () => {
      expect(classifyConfidence(0.9)).toBe('HIGH');
      expect(classifyConfidence(0.65)).toBe('MEDIUM');
      expect(classifyConfidence(0.4)).toBe('LOW');
    });
  });

  describe('Audio ducking', () => {
    it('builds valid ffmpeg filter', () => {
      const filter = buildAudioDuckFilter({
        ...DEFAULT_AUDIO_CONFIG,
        backsoundPath: '/media/assets/backsound.mp3',
      });
      expect(filter).toContain('amix');
      expect(filter).toContain('alimiter=limit=-1');
    });

    it('validates config', () => {
      const valid = validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG });
      expect(valid).toBeNull();

      const invalid = validateAudioDuckConfig({ ...DEFAULT_AUDIO_CONFIG, peakLimitDb: 0 });
      expect(invalid).toBeTruthy();
    });
  });
});
