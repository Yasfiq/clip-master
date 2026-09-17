import { describe, it, expect } from 'vitest';
import {
  buildFramingFilterGraph,
  computeSplitSpeakerCrops,
  sanitizeSplitConfig,
  buildSplitPodcastFilter,
  buildBlurFillFilter,
  DIVIDER_COLORS,
} from '../../src/pipeline/logic/framingLayout';
import { FaceBox } from '../../src/pipeline/logic/faceCrop';

describe('Framing Layout Engine: Unit Tests', () => {
  describe('Config Sanitization', () => {
    it('applies standard defaults when split config is undefined', () => {
      const sanitized = sanitizeSplitConfig();
      expect(sanitized.topCropXPercent).toBe(25);
      expect(sanitized.bottomCropXPercent).toBe(75);
      expect(sanitized.dividerColor).toBe('gold');
      expect(sanitized.dividerThickness).toBe(4);
      expect(sanitized.subtitlePlacement).toBe('bottom');
    });

    it('clamps out-of-range percentage values safely between 0 and 100', () => {
      const sanitized = sanitizeSplitConfig({
        topCropXPercent: -50,
        bottomCropXPercent: 150,
        dividerThickness: 50,
      });
      expect(sanitized.topCropXPercent).toBe(0);
      expect(sanitized.bottomCropXPercent).toBe(100);
      expect(sanitized.dividerThickness).toBe(20);
    });
  });

  describe('Split Podcast Speaker Crop Math', () => {
    it('calculates even-dimension crop coordinates for 1920x1080 source into 1080x960 halves', () => {
      const splitConfig = sanitizeSplitConfig({
        topCropXPercent: 25,
        bottomCropXPercent: 75,
      });

      const { cropW, cropH, topX, bottomX } = computeSplitSpeakerCrops(
        1920,
        1080,
        1080,
        960,
        splitConfig,
      );

      // cropW = Math.round(1080 * (1080 / 960)) = 1214 or 1215 even = 1214
      expect(cropW % 2).toBe(0);
      expect(cropH).toBe(1080);
      expect(topX % 2).toBe(0);
      expect(bottomX % 2).toBe(0);

      // Host (25%) should be shifted to the left compared to guest (75%)
      expect(topX).toBeLessThan(bottomX);
      expect(topX).toBeGreaterThanOrEqual(0);
      expect(bottomX + cropW).toBeLessThanOrEqual(1920);
    });

    it('handles edge case when top and bottom percentages are at extreme edges (0% and 100%)', () => {
      const splitConfig = sanitizeSplitConfig({
        topCropXPercent: 0,
        bottomCropXPercent: 100,
      });

      const { cropW, topX, bottomX } = computeSplitSpeakerCrops(1920, 1080, 1080, 960, splitConfig);

      expect(topX).toBe(0);
      expect(bottomX + cropW).toBe(1920);
    });
  });

  describe('Split Podcast Filter Graph Generation', () => {
    it('produces valid FFmpeg split, crop, scale, vstack and drawbox divider graph', () => {
      const splitConfig = sanitizeSplitConfig({
        dividerColor: 'gold',
        dividerThickness: 4,
        subtitlePlacement: 'center-divider',
      });

      const result = buildFramingFilterGraph({
        srcW: 1920,
        srcH: 1080,
        duration: 30,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'split-podcast',
        splitConfig,
      });

      expect(result.effectiveMode).toBe('split-podcast');
      expect(result.isComplexGraph).toBe(true);
      expect(result.filter).toContain('split=2[sp_top_raw][sp_bot_raw]');
      expect(result.filter).toContain('vstack=inputs=2');
      expect(result.filter).toContain('drawbox=y=958:color=#EAB308');
      expect(result.divider?.color).toBe('#EAB308');
      expect(result.divider?.thickness).toBe(4);
      // Subtitle offset adjusted to center line (~920px)
      expect(result.recommendedMarginV).toBe(920);
    });

    it('supports custom divider colors and "none" without drawbox', () => {
      const cyanConfig = sanitizeSplitConfig({ dividerColor: 'cyan', dividerThickness: 6 });
      const cyanRes = buildSplitPodcastFilter(1920, 1080, 1080, 1920, cyanConfig);
      expect(cyanRes.filter).toContain(DIVIDER_COLORS.cyan);

      const noneConfig = sanitizeSplitConfig({ dividerColor: 'none' });
      const noneRes = buildSplitPodcastFilter(1920, 1080, 1080, 1920, noneConfig);
      expect(noneRes.filter).not.toContain('drawbox');
      expect(noneRes.divider).toBeUndefined();
    });
  });

  describe('Blur-Fill Filter Graph Generation', () => {
    it('produces background blur and foreground centered overlay', () => {
      const result = buildFramingFilterGraph({
        srcW: 1920,
        srcH: 1080,
        duration: 20,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'blur-fill',
      });

      expect(result.effectiveMode).toBe('blur-fill');
      expect(result.isComplexGraph).toBe(true);
      expect(result.filter).toContain('boxblur=25:15');
      expect(result.filter).toContain('overlay=0:(H-h)/2');
      expect(result.recommendedMarginV).toBe(120);
    });
  });

  describe('Auto-Face Tracking & Center Fallback', () => {
    it('generates dynamic crop filter when face detections are present', () => {
      const mockDetections: FaceBox[] = [
        {
          xmin: 0.2,
          ymin: 0.2,
          xmax: 0.4,
          ymax: 0.4,
          score: 0.95,
          timestamp: 0,
        },
        {
          xmin: 0.25,
          ymin: 0.2,
          xmax: 0.45,
          ymax: 0.4,
          score: 0.92,
          timestamp: 5,
        },
      ];

      const result = buildFramingFilterGraph({
        srcW: 1920,
        srcH: 1080,
        duration: 10,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'auto-face',
        detections: mockDetections,
        kenBurnsEnabled: true,
      });

      expect(result.effectiveMode).toBe('auto-face');
      expect(result.isComplexGraph).toBe(false);
      expect(result.filter).toContain('scale=-1:1920');
      expect(result.filter).toContain('crop=');
      expect(result.filter).toContain('zoompan');
      expect(result.details.facesCount).toBe(2);
    });

    it('gracefully falls back to center crop when no faces are detected in auto-face mode', () => {
      const result = buildFramingFilterGraph({
        srcW: 1920,
        srcH: 1080,
        duration: 15,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'auto-face',
        detections: [],
      });

      expect(result.effectiveMode).toBe('center');
      expect(result.filter).toContain('crop=1080:1920:(iw-1080)/2:0');
      expect(result.details.facesCount).toBe(0);
    });

    it('generates explicit center crop when framingMode is center', () => {
      const result = buildFramingFilterGraph({
        srcW: 1920,
        srcH: 1080,
        duration: 10,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'center',
      });

      expect(result.effectiveMode).toBe('center');
      expect(result.filter).toContain('crop=1080:1920:(iw-1080)/2:0');
    });
  });
});
