import { describe, it, expect } from 'vitest';
import {
  buildKenBurnsFilter,
  buildZoomExpr,
  validateKenBurnsConfig,
  DEFAULT_KEN_BURNS,
} from '@/pipeline/logic/kenBurns';

describe('kenBurns', () => {
  describe('buildZoomExpr', () => {
    it('returns constant when start == end', () => {
      expect(buildZoomExpr(1.0, 1.0, 300)).toBe('1.000');
    });

    it('returns constant when single frame', () => {
      expect(buildZoomExpr(1.0, 1.2, 1)).toBe('1.200');
    });

    it('builds linear ramp over total frames', () => {
      // 30fps * 10s = 300 frames. z = 1.0 + 0.12*on/299
      const expr = buildZoomExpr(1.0, 1.12, 300);
      expect(expr).toBe('1+0.12*on/299');
    });
  });

  describe('buildKenBurnsFilter', () => {
    it('produces zoompan + crop', () => {
      const filter = buildKenBurnsFilter({
        ...DEFAULT_KEN_BURNS,
        duration: 10,
      } as any);
      expect(filter).toContain('zoompan');
      expect(filter).toContain('crop=1080:1920:0:0');
    });

    it('outputs target resolution size', () => {
      const filter = buildKenBurnsFilter({
        outWidth: 1080,
        outHeight: 1920,
        duration: 5,
        zoomStart: 1,
        zoomEnd: 1.12,
        fps: 30,
      });
      expect(filter).toContain('s=1080x1920');
    });

    it('uses d=1 (one output frame per input frame)', () => {
      const filter = buildKenBurnsFilter({
        ...DEFAULT_KEN_BURNS,
        duration: 5,
      } as any);
      expect(filter).toContain('d=1');
    });

    it('uses duration-aware frame count in zoom expression', () => {
      // 5s @ 30fps = 150 frames → denom 149
      const filter = buildKenBurnsFilter({
        outWidth: 1080,
        outHeight: 1920,
        duration: 5,
        zoomStart: 1.0,
        zoomEnd: 1.12,
        fps: 30,
      });
      expect(filter).toContain('*on/149');
    });

    it('uses focus point for window position', () => {
      const filter = buildKenBurnsFilter({
        outWidth: 1080,
        outHeight: 1920,
        duration: 5,
        zoomStart: 1.0,
        zoomEnd: 1.12,
        fps: 30,
        panX: 0.3,
        panY: 0.7,
      });
      expect(filter).toContain("x='0.3*(iw-iw/zoom)'");
      expect(filter).toContain("y='0.7*(ih-ih/zoom)'");
    });

    it('defaults pan to center (0.5)', () => {
      const filter = buildKenBurnsFilter({
        outWidth: 1080,
        outHeight: 1920,
        duration: 5,
        zoomStart: 1.0,
        zoomEnd: 1.12,
        fps: 30,
      });
      expect(filter).toContain("x='0.5*(iw-iw/zoom)'");
      expect(filter).toContain("y='0.5*(ih-ih/zoom)'");
    });

    it('caps zoomEnd by maxZoom', () => {
      const filter = buildKenBurnsFilter({
        outWidth: 1080,
        outHeight: 1920,
        duration: 5,
        zoomStart: 1.0,
        zoomEnd: 1.5,
        fps: 30,
        maxZoom: 1.3,
      });
      // zStart + capped delta: 1 + 0.3*on/149 → ends at 1.3, never 1.5.
      expect(filter).toContain("z='1+0.3*on/149'");
      expect(filter).not.toContain('1.5');
    });
  });

  describe('validateKenBurnsConfig', () => {
    it('accepts valid config', () => {
      expect(
        validateKenBurnsConfig({
          outWidth: 1080,
          outHeight: 1920,
          duration: 10,
          zoomStart: 1.0,
          zoomEnd: 1.12,
          fps: 30,
        }),
      ).toBeNull();
    });

    it('rejects negative duration', () => {
      const err = validateKenBurnsConfig({
        outWidth: 1080,
        outHeight: 1920,
        duration: -1,
        zoomStart: 1,
        zoomEnd: 1.1,
        fps: 30,
      });
      expect(err).toContain('duration');
    });

    it('rejects zoomEnd < zoomStart', () => {
      const err = validateKenBurnsConfig({
        outWidth: 1080,
        outHeight: 1920,
        duration: 10,
        zoomStart: 1.2,
        zoomEnd: 1.1,
        fps: 30,
      });
      expect(err).toContain('zoomEnd');
    });

    it('rejects zoomStart < 1', () => {
      const err = validateKenBurnsConfig({
        outWidth: 1080,
        outHeight: 1920,
        duration: 10,
        zoomStart: 0.8,
        zoomEnd: 1.1,
        fps: 30,
      });
      expect(err).toContain('zoomStart');
    });

    it('rejects excessive zoomEnd', () => {
      const err = validateKenBurnsConfig({
        outWidth: 1080,
        outHeight: 1920,
        duration: 10,
        zoomStart: 1,
        zoomEnd: 3,
        fps: 30,
      });
      expect(err).toContain('zoomEnd');
    });

    it('rejects out-of-range pan', () => {
      expect(
        validateKenBurnsConfig({
          outWidth: 1080,
          outHeight: 1920,
          duration: 10,
          zoomStart: 1,
          zoomEnd: 1.1,
          fps: 30,
          panX: 1.5,
        }),
      ).toContain('pan');
    });

    it('rejects non-positive fps', () => {
      expect(
        validateKenBurnsConfig({
          outWidth: 1080,
          outHeight: 1920,
          duration: 10,
          zoomStart: 1,
          zoomEnd: 1.1,
          fps: 0,
        }),
      ).toContain('fps');
    });
  });

  describe('DEFAULT_KEN_BURNS', () => {
    it('defaults are gentle and centered', () => {
      expect(DEFAULT_KEN_BURNS.zoomStart).toBe(1.0);
      expect(DEFAULT_KEN_BURNS.zoomEnd).toBe(1.12);
      expect(DEFAULT_KEN_BURNS.outWidth).toBe(1080);
      expect(DEFAULT_KEN_BURNS.outHeight).toBe(1920);
    });
  });
});
