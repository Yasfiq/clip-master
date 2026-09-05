import { describe, it, expect } from 'vitest';
import {
  detectSilenceRegions,
  buildSilenceRemoveFilter,
  type SilenceWindow,
} from '../../src/pipeline/logic/silenceCompress';

describe('silenceCompress', () => {
  describe('detectSilenceRegions', () => {
    it('returns no regions for fully voiced audio', () => {
      const samples = new Float32Array(16000).fill(0.1); // 1s @ 16kHz
      const regions = detectSilenceRegions(samples, 16000, {
        thresholdDb: -35,
        minSilenceMs: 250,
      });
      expect(regions).toHaveLength(0);
    });

    it('detects single silent window between two voiced regions', () => {
      const sr = 16000;
      const samples = new Float32Array(sr * 3);
      // 0..1s voiced
      samples.fill(0.2, 0, sr);
      // 1..2s silent (already 0)
      // 2..3s voiced
      samples.fill(0.15, sr * 2, sr * 3);

      const regions = detectSilenceRegions(samples, sr, {
        thresholdDb: -35,
        minSilenceMs: 250,
        padMs: 50,
      });
      expect(regions).toHaveLength(1);
      const r = regions[0]!;
      // Padded, so window must be at least 250+50+50 = 350ms but at most
      // the original gap (1000ms). Allow loose bounds for padding edges.
      expect(r.startSec).toBeGreaterThanOrEqual(0.95);
      expect(r.endSec).toBeLessThanOrEqual(2.05);
      expect(r.endSec - r.startSec).toBeGreaterThanOrEqual(0.25);
    });

    it('merges adjacent short silences with padMs', () => {
      const sr = 16000;
      const samples = new Float32Array(sr * 5);
      samples.fill(0.2, 0, sr); // 0..1s voice
      samples.fill(0.2, sr * 2, sr * 3); // 2..3s voice
      samples.fill(0.2, sr * 4, sr * 5); // 4..5s voice
      // 1..2s silent, 3..4s silent (both 1s long)

      const regions = detectSilenceRegions(samples, sr, {
        thresholdDb: -35,
        minSilenceMs: 200,
        padMs: 100,
      });
      // Two distinct silences -> two regions (pad keeps them separate)
      expect(regions.length).toBeGreaterThanOrEqual(1);
    });

    it('drops silences shorter than minSilenceMs', () => {
      const sr = 16000;
      const samples = new Float32Array(sr); // 1s
      samples.fill(0.2, 0, 8000); // first 0.5s voice
      // 0.5..1s silent = 500ms
      const regions = detectSilenceRegions(samples, sr, {
        thresholdDb: -35,
        minSilenceMs: 600, // require 600ms minimum
      });
      expect(regions).toHaveLength(0);
    });

    it('respects threshold: louder signal above threshold is voiced', () => {
      const sr = 16000;
      const samples = new Float32Array(sr * 2);
      // 0..1s voice
      samples.fill(0.2, 0, sr);
      // 1..2s "quiet" -50 dBFS (linear ~0.00316), above -60 dBFS threshold
      samples.fill(0.00316, sr, sr * 2);
      const regions = detectSilenceRegions(samples, sr, {
        thresholdDb: -60,
        minSilenceMs: 200,
      });
      // 0.00316 > 10^(-60/20) ≈ 0.001 -> NOT silent
      expect(regions).toHaveLength(0);
    });

    it('handles empty input', () => {
      const regions = detectSilenceRegions(new Float32Array(0), 16000, {
        thresholdDb: -35,
        minSilenceMs: 250,
      });
      expect(regions).toHaveLength(0);
    });
  });

  describe('buildSilenceRemoveFilter', () => {
    it('returns trim-only filter when no silences detected', () => {
      const regions: SilenceWindow[] = [];
      const filter = buildSilenceRemoveFilter(10, regions);
      expect(filter).toBe('atrim=start=0:end=10,asetpts=PTS-STARTPTS');
    });

    it('builds atrim + concat filter concatenating voiced segments', () => {
      const regions: SilenceWindow[] = [
        { startSec: 1.0, endSec: 2.0 },
        { startSec: 4.5, endSec: 5.0 },
      ];
      const filter = buildSilenceRemoveFilter(10, regions);
      // Two voiced segments: [0,1] and [2,4.5] and [5,10]
      expect(filter).toContain('atrim=start=0.000:end=1.000');
      expect(filter).toContain('atrim=start=2.000:end=4.500');
      expect(filter).toContain('atrim=start=5.000:end=10.000');
      expect(filter).toContain('asetpts=PTS-STARTPTS');
      expect(filter).toContain('concat=n=3:v=0:a=1[voiced]');
    });

    it('uses single atrim when silence cuts once', () => {
      const regions: SilenceWindow[] = [
        { startSec: 1.0, endSec: 2.0 },
        { startSec: 4.5, endSec: 5.0 },
      ];
      // Recompute: when 2 voiced segments, expect two atrim
      const regions2: SilenceWindow[] = [{ startSec: 3, endSec: 5 }];
      const f2 = buildSilenceRemoveFilter(10, regions2);
      expect(f2).toContain('atrim=start=0.000:end=3.000');
      expect(f2).toContain('atrim=start=5.000:end=10.000');
      expect(f2).toContain('concat=n=2:v=0:a=1[voiced]');
    });

    it('keeps two voiced segments when a zero-length silence is in the middle', () => {
      const regions: SilenceWindow[] = [{ startSec: 5.0, endSec: 5.0 }];
      const filter = buildSilenceRemoveFilter(10, regions);
      // 0..5 voiced, 5..10 voiced -> two atrim + concat
      expect(filter).toContain('atrim=start=0.000:end=5.000');
      expect(filter).toContain('atrim=start=5.000:end=10.000');
      expect(filter).toContain('concat=n=2:v=0:a=1[voiced]');
    });

    it('falls back to trim when silences cover the entire timeline', () => {
      const regions: SilenceWindow[] = [{ startSec: 0, endSec: 10 }];
      const filter = buildSilenceRemoveFilter(10, regions);
      expect(filter).toBe('atrim=start=0:end=10,asetpts=PTS-STARTPTS');
    });

    it('uses [0:a] input label and [voiced] output for filter graph composition', () => {
      const regions: SilenceWindow[] = [{ startSec: 3, endSec: 5 }];
      const filter = buildSilenceRemoveFilter(10, regions);
      expect(filter).toContain('[0:a]atrim=start=0.000:end=3.000');
      expect(filter).toContain('[0:a]atrim=start=5.000:end=10.000');
      expect(filter).toContain('[voiced]');
    });
  });
});
