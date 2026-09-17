import { describe, it, expect } from 'vitest';
import {
  buildFramingFilterGraph,
  buildBlurFillFilter,
} from '../../src/pipeline/logic/framingLayout';
import { FaceBox } from '../../src/pipeline/logic/faceCrop';

describe('Framing Layout Engine: Unit Tests', () => {
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
    });

    it('buildBlurFillFilter generates expected split and overlay chain', () => {
      const filter = buildBlurFillFilter(1080, 1920);
      expect(filter).toContain('split=2[bf_bg_raw][bf_fg_raw]');
      expect(filter).toContain('scale=1080:1920:force_original_aspect_ratio=increase');
      expect(filter).toContain('overlay=0:(H-h)/2');
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

    it('handles videos that are already portrait or square without re-cropping', () => {
      const result = buildFramingFilterGraph({
        srcW: 1080,
        srcH: 1920,
        duration: 10,
        targetW: 1080,
        targetH: 1920,
        framingMode: 'auto-face',
      });

      expect(result.effectiveMode).toBe('center');
      expect(result.filter).toContain('scale=1080:1920');
    });
  });
});
