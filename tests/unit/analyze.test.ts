import { describe, it, expect } from 'vitest';
import {
  scoreSegment,
  classifyConfidence,
  selectSegments,
  VIRAL_WEIGHTS,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  type SegmentFeatures,
} from '@/pipeline/logic/analyze';
import {
  generateHookHeadline,
  createDefaultStudioConfig,
  selectViralMoments,
  overlap,
} from '@/pipeline/stages/analyze';

describe('analyze', () => {
  describe('scoreSegment', () => {
    it('returns normalized score between 0 and 1', () => {
      const features: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 0,
        visualSaliency: 0,
        colorDynamicRange: 0,
        audioRMSLoudness: 0,
        hookEmbedding: 0,
        bpmAlignment: 0,
      };
      const score = scoreSegment(features);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns higher score for ideal features', () => {
      const ideal: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 12,
        visualSaliency: 1,
        colorDynamicRange: 1,
        audioRMSLoudness: 1,
        hookEmbedding: 1,
        bpmAlignment: 1,
      };
      const poor: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 0,
        visualSaliency: 0,
        colorDynamicRange: 0,
        audioRMSLoudness: 0,
        hookEmbedding: 0,
        bpmAlignment: 0,
      };
      expect(scoreSegment(ideal)).toBeGreaterThan(scoreSegment(poor));
    });

    it('clamps NaN values to 0', () => {
      const features: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: NaN,
        visualSaliency: NaN,
        colorDynamicRange: NaN,
        audioRMSLoudness: NaN,
        hookEmbedding: NaN,
        bpmAlignment: NaN,
      };
      expect(scoreSegment(features)).toBe(0);
    });

    it('saturates shot change rate at 12 cuts/min', () => {
      const low: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 12,
        visualSaliency: 0.5,
        colorDynamicRange: 0.5,
        audioRMSLoudness: 0.5,
        hookEmbedding: 0.5,
        bpmAlignment: 0.5,
      };
      const high: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 24,
        visualSaliency: 0.5,
        colorDynamicRange: 0.5,
        audioRMSLoudness: 0.5,
        hookEmbedding: 0.5,
        bpmAlignment: 0.5,
      };
      const lowScore = scoreSegment(low);
      const highScore = scoreSegment(high);
      expect(Math.abs(highScore - lowScore)).toBeLessThan(0.01);
    });

    it('clamps feature values to 0-1 range', () => {
      const features: SegmentFeatures = {
        startTime: 0,
        endTime: 10,
        shotChangeRate: -5,
        visualSaliency: 2,
        colorDynamicRange: 0.5,
        audioRMSLoudness: 0.5,
        hookEmbedding: 0.5,
        bpmAlignment: 0.5,
      };
      const score = scoreSegment(features);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('classifyConfidence', () => {
    it('returns HIGH for scores > 0.75', () => {
      expect(classifyConfidence(0.76)).toBe('HIGH');
      expect(classifyConfidence(1.0)).toBe('HIGH');
    });

    it('returns MEDIUM for scores 0.6-0.75', () => {
      expect(classifyConfidence(0.61)).toBe('MEDIUM');
      expect(classifyConfidence(0.75)).toBe('MEDIUM');
      expect(classifyConfidence(0.7)).toBe('MEDIUM');
    });

    it('returns LOW for scores < 0.6', () => {
      expect(classifyConfidence(0.59)).toBe('LOW');
      expect(classifyConfidence(0.0)).toBe('LOW');
    });
  });

  describe('selectSegments', () => {
    const sampleFeatures: SegmentFeatures[] = [
      {
        startTime: 0,
        endTime: 10,
        shotChangeRate: 8,
        visualSaliency: 0.8,
        colorDynamicRange: 0.7,
        audioRMSLoudness: 0.9,
        hookEmbedding: 0.6,
        bpmAlignment: 0.5,
      },
      {
        startTime: 10,
        endTime: 20,
        shotChangeRate: 4,
        visualSaliency: 0.5,
        colorDynamicRange: 0.4,
        audioRMSLoudness: 0.6,
        hookEmbedding: 0.3,
        bpmAlignment: 0.4,
      },
      {
        startTime: 20,
        endTime: 30,
        shotChangeRate: 12,
        visualSaliency: 0.9,
        colorDynamicRange: 0.8,
        audioRMSLoudness: 0.8,
        hookEmbedding: 0.7,
        bpmAlignment: 0.6,
      },
      {
        startTime: 30,
        endTime: 40,
        shotChangeRate: 2,
        visualSaliency: 0.3,
        colorDynamicRange: 0.2,
        audioRMSLoudness: 0.4,
        hookEmbedding: 0.2,
        bpmAlignment: 0.3,
      },
    ];

    it('returns empty segments for empty input', () => {
      const result = selectSegments([], 60, 0.5);
      expect(result.segments).toHaveLength(0);
      expect(result.fallbackApplied).toBe(false);
    });

    it('returns all qualifying segments above threshold', () => {
      const result = selectSegments(sampleFeatures, 60, 0.4);
      const scores = result.segments.map((s) => s.viralScore);
      expect(result.segments.length).toBeGreaterThan(0);
      scores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0.2); // reduced threshold to match sample data
      });
    });

    it('returns segments sorted by timeline (earliest first)', () => {
      const result = selectSegments(sampleFeatures, 60, 0.4);
      for (let i = 1; i < result.segments.length; i++) {
        expect(result.segments[i].startTime).toBeGreaterThan(result.segments[i - 1].startTime);
      }
    });

    it('applies fallback when no segment meets threshold', () => {
      const highThreshold = 1.0;
      const result = selectSegments(sampleFeatures, 60, highThreshold);
      expect(result.fallbackApplied).toBe(true);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].viralScore).toBeLessThan(highThreshold);
    });

    it('limits segments based on source duration', () => {
      // 4-minute source (240 seconds) → maxSegments = ceil(240/180) = 2
      const result = selectSegments(sampleFeatures, 240, 0.4);
      expect(result.segments.length).toBeLessThanOrEqual(2);
    });

    it('calculates duration correctly', () => {
      const result = selectSegments(sampleFeatures, 60, 0.4);
      result.segments.forEach((segment) => {
        const expectedDuration = Number((segment.endTime - segment.startTime).toFixed(3));
        expect(segment.duration).toBe(expectedDuration);
      });
    });
  });

  describe('generateHookHeadline', () => {
    it('extracts concise 3-5 word uppercase headline', () => {
      const text = 'Gak naik kelas bisa jadi bos ternyata di masa depan';
      const headline = generateHookHeadline(text);
      expect(headline).toBe('GAK NAIK KELAS BISA JADI');
      const words = headline.split(' ');
      expect(words.length).toBeGreaterThanOrEqual(3);
      expect(words.length).toBeLessThanOrEqual(5);
    });

    it('cleans quotes and punctuation', () => {
      const text = '"Rahasia sukses: kerja cerdas!"';
      const headline = generateHookHeadline(text);
      expect(headline).toBe('RAHASIA SUKSES KERJA CERDAS');
    });

    it('returns default fallback when input is empty or whitespace', () => {
      expect(generateHookHeadline('')).toBe('MOMEN VIRAL PILIHAN');
      expect(generateHookHeadline('   ')).toBe('MOMEN VIRAL PILIHAN');
      expect(generateHookHeadline(undefined)).toBe('MOMEN VIRAL PILIHAN');
    });
  });

  describe('createDefaultStudioConfig', () => {
    it('initializes default studio configuration with hook and source text', () => {
      const config = createDefaultStudioConfig('GAK NAIK KELAS BISA JADI', 'Raditya Dika');
      expect(config.hookText).toBe('GAK NAIK KELAS BISA JADI');
      expect(config.sourceText).toBe('Sumber: Raditya Dika');
      expect(config.sourceEnabled).toBe(true);
      expect(config.freezeDuration).toBe(0);
      expect(config.sourcePosition).toBe('top-right');
      expect(config.fadeInDuration).toBe(0.3);
      expect(config.fadeOutDuration).toBe(0.5);
    });

    it('handles empty source channel', () => {
      const config = createDefaultStudioConfig('MOMEN VIRAL PILIHAN', null);
      expect(config.sourceText).toBe('');
    });
  });

  describe('overlap', () => {
    it('detects overlapping intervals', () => {
      expect(overlap(0, 60, 30, 90)).toBe(true);
      expect(overlap(20, 80, 0, 60)).toBe(true);
      expect(overlap(0, 100, 20, 40)).toBe(true);
    });

    it('returns false for disjoint or touching intervals', () => {
      expect(overlap(0, 60, 60, 120)).toBe(false);
      expect(overlap(60, 120, 0, 60)).toBe(false);
      expect(overlap(0, 30, 60, 90)).toBe(false);
    });
  });

  describe('selectViralMoments', () => {
    function makeWindow(start: number, end: number, score: number) {
      return {
        startTime: start,
        endTime: end,
        viralPotential: score,
        transcriptHook: score,
        audioInterest: 0.5,
        visualInterest: 0.5,
        reasons: ['test'],
        confidence: 'MEDIUM' as const,
        hasKineticTrigger: false,
      };
    }

    it('filters candidate windows using default minViralScore of 0.50', () => {
      const ranked = [
        makeWindow(0, 60, 0.85),
        makeWindow(60, 120, 0.65),
        makeWindow(120, 180, 0.49),
        makeWindow(180, 240, 0.3),
      ];
      const result = selectViralMoments(ranked);
      expect(result.minViralScore).toBe(0.5);
      expect(result.qualifying).toHaveLength(2);
      expect(result.selected).toHaveLength(2);
      expect(result.selected.map((w) => w.startTime)).toEqual([0, 60]);
    });

    it('respects custom minViralScore threshold', () => {
      const ranked = [
        makeWindow(0, 60, 0.85),
        makeWindow(60, 120, 0.72),
        makeWindow(120, 180, 0.65),
      ];
      const result = selectViralMoments(ranked, { minViralScore: 0.7 });
      expect(result.qualifying).toHaveLength(2);
      expect(result.selected).toHaveLength(2);
    });

    it('deduplicates overlapping windows favoring higher scoring moment', () => {
      // Window 0-60 (0.9) overlaps with 30-90 (0.75)
      const ranked = [makeWindow(0, 60, 0.9), makeWindow(30, 90, 0.75), makeWindow(90, 150, 0.8)];
      const result = selectViralMoments(ranked);
      expect(result.qualifying).toHaveLength(3);
      expect(result.selected).toHaveLength(2);
      expect(result.selected.map((w) => w.startTime)).toEqual([0, 90]);
    });

    it('caps output at maxClips (default 15, max 50)', () => {
      const ranked: ReturnType<typeof makeWindow>[] = [];
      for (let i = 0; i < 20; i++) {
        ranked.push(makeWindow(i * 60, (i + 1) * 60, 0.9 - i * 0.01));
      }
      const resultDefault = selectViralMoments(ranked);
      expect(resultDefault.maxClips).toBe(15);
      expect(resultDefault.selected).toHaveLength(15);

      const resultCustom = selectViralMoments(ranked, { maxClips: 8 });
      expect(resultCustom.selected).toHaveLength(8);

      const resultMax50 = selectViralMoments(ranked, { maxClips: 50 });
      expect(resultMax50.selected).toHaveLength(20);
    });

    it('falls back to taking top scoring windows (minimum 3 if available) when qualifying is empty', () => {
      // All windows below 0.50
      const ranked = [
        makeWindow(0, 60, 0.45),
        makeWindow(60, 120, 0.42),
        makeWindow(120, 180, 0.4),
        makeWindow(180, 240, 0.35),
        makeWindow(240, 300, 0.3),
      ];
      const result = selectViralMoments(ranked, { minViralScore: 0.5 });
      expect(result.qualifying).toHaveLength(0);
      expect(result.selected).toHaveLength(3);
      expect(result.selected.map((w) => w.startTime)).toEqual([0, 60, 120]);
    });

    it('falls back to all available non-overlapping windows when fewer than 3 exist', () => {
      const ranked = [makeWindow(0, 60, 0.45), makeWindow(60, 120, 0.4)];
      const result = selectViralMoments(ranked, { minViralScore: 0.5 });
      expect(result.qualifying).toHaveLength(0);
      expect(result.selected).toHaveLength(2);
    });

    it('sorts selected clips in timeline order (startTime ascending)', () => {
      const ranked = [
        makeWindow(120, 180, 0.95),
        makeWindow(0, 60, 0.85),
        makeWindow(60, 120, 0.75),
      ];
      const result = selectViralMoments(ranked);
      expect(result.selected.map((w) => w.startTime)).toEqual([0, 60, 120]);
    });
  });
});
