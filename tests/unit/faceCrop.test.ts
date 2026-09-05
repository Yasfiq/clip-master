import { describe, it, expect } from 'vitest';
import {
  FaceBox,
  FaceCropConfig,
  DEFAULT_FACE_CROP,
  chooseCropX,
  undoLetterbox,
  aggregateCentroid,
  buildLetterboxTransform,
  validateFaceCropConfig,
} from '@/pipeline/logic/faceCrop';

/** Convenience builder so tests stay readable. */
function fb(xmin: number, ymin: number, xmax: number, ymax: number, score = 0.8): FaceBox {
  return { xmin, ymin, xmax, ymax, score };
}

describe('faceCrop', () => {
  describe('validateFaceCropConfig', () => {
    it('accepts the default config', () => {
      expect(validateFaceCropConfig(DEFAULT_FACE_CROP)).toBeNull();
    });

    it('rejects out of range score thresholds', () => {
      expect(validateFaceCropConfig({ ...DEFAULT_FACE_CROP, minScore: -0.1 })).toMatch(/minScore/);
      expect(validateFaceCropConfig({ ...DEFAULT_FACE_CROP, minScore: 1.5 })).toMatch(/minScore/);
    });

    it('rejects non-positive crop padding', () => {
      expect(validateFaceCropConfig({ ...DEFAULT_FACE_CROP, padFraction: 0 })).toMatch(/pad/);
    });

    it('rejects bad sample rate', () => {
      expect(validateFaceCropConfig({ ...DEFAULT_FACE_CROP, sampleFps: 0 })).toMatch(/sampleFps/);
    });
  });

  describe('buildLetterboxTransform', () => {
    it('keeps aspect when source is wider than target', () => {
      const t = buildLetterboxTransform(1280, 720, 128, 128);
      // scale = min(128/1280, 128/720) = 128/1280 = 0.1
      expect(t.scale).toBeCloseTo(0.1, 5);
      // newW = 128, newH = 72, padTop = (128-72)/2 = 28
      expect(t.newW).toBe(128);
      expect(t.newH).toBe(72);
      expect(t.padLeft).toBe(0);
      expect(t.padTop).toBe(28);
    });

    it('keeps aspect when source is taller than target', () => {
      const t = buildLetterboxTransform(360, 640, 128, 128);
      // scale = 128/640 = 0.2
      expect(t.scale).toBeCloseTo(0.2, 5);
      expect(t.newW).toBe(72);
      expect(t.newH).toBe(128);
      expect(t.padLeft).toBe(28);
      expect(t.padTop).toBe(0);
    });

    it('uses zero pad when source already matches', () => {
      const t = buildLetterboxTransform(128, 128, 128, 128);
      expect(t.scale).toBeCloseTo(1, 5);
      expect(t.padLeft).toBe(0);
      expect(t.padTop).toBe(0);
    });
  });

  describe('undoLetterbox', () => {
    it('maps padded box back to source coords', () => {
      // source 1280x720 → 128x128 letterbox: scale=0.1, newW=128, newH=72, padTop=28
      const t = buildLetterboxTransform(1280, 720, 128, 128);
      // Box covering whole padded image (centered)
      const src = undoLetterbox({ xmin: 0, ymin: 0, xmax: 1, ymax: 1 }, t, 1280, 720);
      expect(src.xmin).toBeCloseTo(0, 3);
      expect(src.xmax).toBeCloseTo(1280, 3);
      expect(src.ymin).toBeCloseTo(0, 3);
      expect(src.ymax).toBeCloseTo(720, 3);
    });

    it('shifts box by letterbox padding', () => {
      const t = buildLetterboxTransform(1280, 720, 128, 128);
      const src = undoLetterbox({ xmin: 0.4, ymin: 0.3, xmax: 0.6, ymax: 0.5 }, t, 1280, 720);
      // ymin in padded: 0.3 → padded px 38.4 → subtract padTop=28 → 10.4 px → /scale 0.1 → 104 px src
      expect(src.ymin).toBeCloseTo((0.3 * 128 - 28) / 0.1, 2);
    });
  });

  describe('aggregateCentroid', () => {
    it('returns null on empty detections', () => {
      expect(aggregateCentroid([], 1280, 720)).toBeNull();
    });

    it('weights boxes by score', () => {
      const boxes = [fb(0.0, 0.0, 0.1, 0.1, 0.2), fb(0.9, 0.9, 1.0, 1.0, 0.8)];
      const c = aggregateCentroid(boxes, 1280, 720);
      expect(c).not.toBeNull();
      // score-weighted centroid should lean toward 0.95
      // weighted cx = (0.05*0.2 + 0.95*0.8) / (0.2+0.8) = (0.01+0.76)/1.0 = 0.77
      expect(c!.cx).toBeCloseTo(0.77, 3);
    });

    it('clamps centroid to [0,1]', () => {
      const boxes = [fb(-0.5, 0.0, 1.2, 1.0, 0.9)];
      const c = aggregateCentroid(boxes, 100, 100)!;
      expect(c.cx).toBeGreaterThanOrEqual(0);
      expect(c.cx).toBeLessThanOrEqual(1);
    });
  });

  describe('chooseCropX', () => {
    it('centers fallback when no faces', () => {
      const r = chooseCropX([], 1280, 720, 9 / 16, DEFAULT_FACE_CROP);
      expect(r.source).toBe('center-fallback');
      // crop width for 720 tall at 9:16 = 405, x = (1280-405)/2 = 437.5 → round 438
      expect(r.x).toBe(438);
      expect(r.cropWidth).toBe(405);
    });

    it('returns center when detections all rejected by minScore', () => {
      const r = chooseCropX([fb(0.0, 0.0, 0.1, 0.1, 0.1)], 1280, 720, 9 / 16, {
        ...DEFAULT_FACE_CROP,
        minScore: 0.5,
      });
      expect(r.source).toBe('low-confidence');
    });

    it('shifts crop left when face is left of center', () => {
      // face center x = 0.2 → src cx = 256
      const r = chooseCropX([fb(0.15, 0.3, 0.25, 0.5, 0.9)], 1280, 720, 9 / 16, DEFAULT_FACE_CROP);
      // cropW = 405, ideal x = 256 - 405/2 = 53.5 → clamp ≥ 0
      expect(r.x).toBeLessThan(437);
      expect(r.source).toBe('face');
    });

    it('shifts crop right when face is right of center', () => {
      const r = chooseCropX([fb(0.75, 0.3, 0.85, 0.5, 0.9)], 1280, 720, 9 / 16, DEFAULT_FACE_CROP);
      expect(r.x).toBeGreaterThan(437);
    });

    it('clamps x within source width minus crop width', () => {
      // face at x = 0.99 → src cx ≈ 1267 → ideal x = 1267-202.5 = 1064.5, max = 875
      const r = chooseCropX([fb(0.95, 0.0, 1.0, 0.2, 0.95)], 1280, 720, 9 / 16, DEFAULT_FACE_CROP);
      expect(r.x).toBeLessThanOrEqual(1280 - r.cropWidth);
      expect(r.x).toBeGreaterThanOrEqual(0);
    });

    it('blends multiple faces by score', () => {
      const r = chooseCropX(
        [fb(0.0, 0.0, 0.1, 0.1, 0.2), fb(0.8, 0.3, 0.9, 0.5, 0.9)],
        1280,
        720,
        9 / 16,
        DEFAULT_FACE_CROP,
      );
      // weighted centroid x = 0.77 → src cx ≈ 985 → ideal x ≈ 782.5
      expect(r.x).toBeGreaterThan(437);
      expect(r.x).toBeLessThan(875);
    });
  });
});
