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
  clusterFaceDetections,
  selectDominantCluster,
  scoreFaceCluster,
  computeDynamicCropSegments,
  buildFfmpegCropFilter,
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

    it('centers crop on a single centered face', () => {
      // face center at 0.50
      const r = chooseCropX([fb(0.45, 0.3, 0.55, 0.5, 0.9)], 1280, 720, 9 / 16, {
        ...DEFAULT_FACE_CROP,
        padFraction: 0,
      });
      expect(r.source).toBe('face');
      // srcCx = 640, cropWidth = 405, ideal x = 640 - 202.5 = 437.5 → 438
      expect(r.x).toBe(438);
    });

    it('multi-person podcast scene: focuses on dominant speaker, NOT the empty center', () => {
      // Host at x=0.25 (5 detections) vs Guest at x=0.75 (2 detections)
      // Empty center between them is x=0.50 (crop offset 438)
      const hostDetections = [
        fb(0.2, 0.3, 0.3, 0.5, 0.9),
        fb(0.21, 0.31, 0.31, 0.51, 0.9),
        fb(0.19, 0.29, 0.29, 0.49, 0.9),
        fb(0.2, 0.3, 0.3, 0.5, 0.85),
        fb(0.22, 0.3, 0.32, 0.5, 0.92),
      ];
      const guestDetections = [fb(0.7, 0.3, 0.8, 0.5, 0.85), fb(0.71, 0.31, 0.81, 0.51, 0.88)];
      const allDetections = [...hostDetections, ...guestDetections];

      const r = chooseCropX(allDetections, 1280, 720, 9 / 16, DEFAULT_FACE_CROP);

      expect(r.source).toBe('face');
      // Center fallback / naive average would crop around 438 (empty center)
      const emptyCenter = 438;
      expect(Math.abs(r.x - emptyCenter)).toBeGreaterThan(100);
      // Since Host had 5 detections vs 2, the crop must frame the Host on the left (x < 300)
      expect(r.x).toBeLessThan(300);
    });

    it('multi-person podcast scene: switches to guest when guest is dominant', () => {
      // Host at x=0.25 (2 detections, small face) vs Guest at x=0.75 (6 detections, large face)
      const hostDetections = [
        fb(0.22, 0.3, 0.28, 0.4, 0.8), // area 0.006
        fb(0.23, 0.31, 0.27, 0.41, 0.8),
      ];
      const guestDetections = [
        fb(0.68, 0.2, 0.82, 0.55, 0.95), // area 0.049
        fb(0.69, 0.21, 0.81, 0.54, 0.95),
        fb(0.7, 0.2, 0.8, 0.55, 0.95),
        fb(0.68, 0.22, 0.82, 0.56, 0.92),
        fb(0.69, 0.2, 0.81, 0.55, 0.94),
        fb(0.7, 0.21, 0.8, 0.54, 0.93),
      ];
      const allDetections = [...hostDetections, ...guestDetections];

      const r = chooseCropX(allDetections, 1280, 720, 9 / 16, DEFAULT_FACE_CROP);

      expect(r.source).toBe('face');
      // Must frame Guest on the right (x > 500) rather than empty center (438)
      expect(r.x).toBeGreaterThan(500);
    });
  });

  describe('spatial clustering & dominant speaker selection', () => {
    it('returns empty clusters for empty detections', () => {
      expect(clusterFaceDetections([])).toEqual([]);
      expect(selectDominantCluster([])).toBeNull();
    });

    it('clusters detections that are horizontally close into the same cluster', () => {
      const faces = [
        fb(0.24, 0.3, 0.26, 0.5, 0.9),
        fb(0.25, 0.3, 0.27, 0.5, 0.9),
        fb(0.23, 0.3, 0.25, 0.5, 0.85),
      ];
      const clusters = clusterFaceDetections(faces, 0.18);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].faces).toHaveLength(3);
      expect(clusters[0].centroid.cx).toBeCloseTo(0.25, 2);
    });

    it('separates two distant speakers into distinct clusters', () => {
      const faces = [
        fb(0.2, 0.3, 0.3, 0.5, 0.9), // cx = 0.25
        fb(0.7, 0.3, 0.8, 0.5, 0.9), // cx = 0.75
      ];
      const clusters = clusterFaceDetections(faces, 0.18);
      expect(clusters).toHaveLength(2);
      expect(clusters[0].centroid.cx).toBeCloseTo(0.25, 2);
      expect(clusters[1].centroid.cx).toBeCloseTo(0.75, 2);
    });

    it('ranks cluster with larger face higher when detection count is equal', () => {
      const smallFaceCluster = [fb(0.2, 0.3, 0.24, 0.36, 0.9)]; // area = 0.04 * 0.06 = 0.0024
      const largeFaceCluster = [fb(0.7, 0.2, 0.85, 0.6, 0.9)]; // area = 0.15 * 0.40 = 0.06

      const scoreSmall = scoreFaceCluster(smallFaceCluster);
      const scoreLarge = scoreFaceCluster(largeFaceCluster);

      expect(scoreLarge).toBeGreaterThan(scoreSmall);
    });

    it('selects dominant cluster with highest score', () => {
      const faces = [
        fb(0.2, 0.3, 0.3, 0.5, 0.9),
        fb(0.21, 0.3, 0.31, 0.5, 0.9),
        fb(0.7, 0.3, 0.8, 0.5, 0.9),
      ];
      const clusters = clusterFaceDetections(faces, 0.18);
      const dominant = selectDominantCluster(clusters);
      expect(dominant).not.toBeNull();
      // The left cluster with 2 detections should be selected over the right with 1
      expect(dominant!.centroid.cx).toBeCloseTo(0.255, 2);
    });
  });

  describe('computeDynamicCropSegments & buildFfmpegCropFilter', () => {
    it('returns center fallback for empty detections', () => {
      const segments = computeDynamicCropSegments([], 60, 1280, 720, 9 / 16, DEFAULT_FACE_CROP);
      expect(segments).toHaveLength(1);
      expect(segments[0].source).toBe('center-fallback');
      expect(segments[0].start).toBe(0);
      expect(segments[0].end).toBe(60);

      const filter = buildFfmpegCropFilter(segments, 1280, 3413, 1080, 1920);
      expect(filter.isDynamic).toBe(false);
      expect(filter.filter).toMatch(/crop=1080:1920:116[78]:0/);
    });

    it('returns single static segment for consistent single speaker', () => {
      const detections = [
        { ...fb(0.44, 0.3, 0.5, 0.5, 0.85), timestamp: 1.0 },
        { ...fb(0.45, 0.3, 0.51, 0.5, 0.85), timestamp: 2.0 },
        { ...fb(0.46, 0.3, 0.52, 0.5, 0.85), timestamp: 3.0 },
      ];
      const segments = computeDynamicCropSegments(
        detections,
        10,
        1280,
        720,
        9 / 16,
        DEFAULT_FACE_CROP,
      );
      expect(segments).toHaveLength(1);
      expect(segments[0].source).toBe('face');

      const filter = buildFfmpegCropFilter(segments, 1280, 3413, 1080, 1920);
      expect(filter.isDynamic).toBe(false);
      expect(filter.filter).toMatch(/^crop=1080:1920:\d+:0$/);
    });

    it('creates dynamic shot segments when camera cuts between wide shot and close-up', () => {
      // 0s-8s: Wide shot with speaker on right (cx = 0.70)
      // 9s-20s: Close up with speaker centered (cx = 0.46)
      const detections: FaceBox[] = [
        { ...fb(0.68, 0.3, 0.74, 0.5, 0.85), timestamp: 0.0 },
        { ...fb(0.69, 0.3, 0.75, 0.5, 0.85), timestamp: 2.0 },
        { ...fb(0.68, 0.3, 0.74, 0.5, 0.85), timestamp: 4.0 },
        { ...fb(0.69, 0.3, 0.75, 0.5, 0.85), timestamp: 6.0 },
        { ...fb(0.44, 0.2, 0.52, 0.6, 0.95), timestamp: 9.0 },
        { ...fb(0.45, 0.2, 0.53, 0.6, 0.95), timestamp: 11.0 },
        { ...fb(0.44, 0.2, 0.52, 0.6, 0.95), timestamp: 13.0 },
        { ...fb(0.45, 0.2, 0.53, 0.6, 0.95), timestamp: 15.0 },
      ];

      const segments = computeDynamicCropSegments(
        detections,
        20,
        1280,
        720,
        9 / 16,
        DEFAULT_FACE_CROP,
      );
      expect(segments.length).toBeGreaterThanOrEqual(2);

      // Wide shot segment frames the right speaker (cx > 0.6)
      expect(segments[0].cx).toBeGreaterThan(0.6);

      // Close-up segment frames the center speaker (cx ~ 0.48)
      const lastSeg = segments[segments.length - 1];
      expect(lastSeg.cx).toBeLessThan(0.55);

      const filter = buildFfmpegCropFilter(segments, 1280, 3413, 1080, 1920);
      expect(filter.isDynamic).toBe(true);
      expect(filter.filter).toContain('if(lt(t,');
    });
  });
});
