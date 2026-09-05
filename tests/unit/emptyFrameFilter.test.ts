import { describe, it, expect } from 'vitest';
import {
  detectEmptyRanges,
  subtractEmpty,
  dropTooShort,
  DEFAULT_EMPTY_FILTER,
  type FrameFeature,
} from '@/pipeline/logic/emptyFrameFilter';

const FRAME_DT = 0.2; // 200ms per frame
function framesFromWindows(
  windows: Array<{ start: number; end: number; audio: number; visual: number }>,
): FrameFeature[] {
  const out: FrameFeature[] = [];
  for (const w of windows) {
    for (let t = w.start; t < w.end; t += FRAME_DT) {
      out.push({ t, audioEnergy: w.audio, visualMotion: w.visual });
    }
  }
  return out;
}

describe('emptyFrameFilter', () => {
  describe('detectEmptyRanges', () => {
    it('returns empty when no frames', () => {
      expect(detectEmptyRanges([])).toEqual([]);
    });

    it('trims a silent-and-static window (no subject on screen AND no audio)', () => {
      const frames = framesFromWindows([
        { start: 0, end: 5, audio: 0, visual: 0.0 },
        { start: 5, end: 10, audio: 0.6, visual: 0.5 },
      ]);
      const ranges = detectEmptyRanges(frames);
      expect(ranges.some((r) => r.reason === 'both')).toBe(true);
    });

    it('keeps a silent window with motion (camera moving, no audio yet)', () => {
      // No meja-only scene here — camera is active (B-roll, intro/outro fade).
      const frames = framesFromWindows([
        { start: 0, end: 5, audio: 0, visual: 0.5 },
        { start: 5, end: 10, audio: 0.6, visual: 0.5 },
      ]);
      expect(detectEmptyRanges(frames)).toEqual([]);
    });

    it('keeps a still-but-talking window (subject present, speech on, low motion)', () => {
      // The user requirement: meja-only = no subject speaking. If speech
      // is present, the subject is likely on screen even if the camera is
      // static, so we must NOT trim it.
      const frames = framesFromWindows([
        { start: 0, end: 5, audio: 0.6, visual: 0.02 }, // speech, camera static (talking head)
        { start: 5, end: 10, audio: 0.6, visual: 0.5 },
      ]);
      expect(detectEmptyRanges(frames)).toEqual([]);
    });

    it('marks reason as both when silent AND static', () => {
      const frames = framesFromWindows([
        { start: 0, end: 3, audio: 0, visual: 0.0 },
        { start: 3, end: 6, audio: 0.5, visual: 0.5 },
      ]);
      const ranges = detectEmptyRanges(frames);
      expect(ranges.some((r) => r.reason === 'both')).toBe(true);
    });

    it('does not mark as empty when audio + motion both present', () => {
      const frames = framesFromWindows([{ start: 0, end: 5, audio: 0.6, visual: 0.4 }]);
      expect(detectEmptyRanges(frames)).toEqual([]);
    });

    it('merges overlapping empty ranges', () => {
      const frames = framesFromWindows([
        { start: 0, end: 3, audio: 0, visual: 0.5 },
        { start: 1, end: 4, audio: 0, visual: 0.5 },
        { start: 5, end: 10, audio: 0.5, visual: 0.5 },
      ]);
      const ranges = detectEmptyRanges(frames);
      // Two overlapping windows should merge into one
      const overlappingCount = ranges.filter((r) => r.startTime <= 1 && r.endTime >= 3).length;
      expect(overlappingCount).toBeLessThanOrEqual(1);
    });

    it('returns ranges in ascending order', () => {
      const frames = framesFromWindows([
        { start: 0, end: 3, audio: 0.5, visual: 0.5 },
        { start: 5, end: 8, audio: 0, visual: 0 },
        { start: 10, end: 13, audio: 0, visual: 0 },
      ]);
      const ranges = detectEmptyRanges(frames);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i]!.startTime).toBeGreaterThanOrEqual(ranges[i - 1]!.endTime);
      }
    });
  });

  describe('subtractEmpty', () => {
    it('returns full range when no empty ranges', () => {
      const kept = subtractEmpty(0, 10, []);
      expect(kept).toEqual([{ start: 0, end: 10 }]);
    });

    it('cuts a hole in the middle', () => {
      const kept = subtractEmpty(0, 10, [{ startTime: 3, endTime: 5, reason: 'both' }]);
      expect(kept).toEqual([
        { start: 0, end: 3 },
        { start: 5, end: 10 },
      ]);
    });

    it('cuts at the start', () => {
      const kept = subtractEmpty(0, 10, [{ startTime: 0, endTime: 2, reason: 'silence' }]);
      expect(kept).toEqual([{ start: 2, end: 10 }]);
    });

    it('cuts at the end', () => {
      const kept = subtractEmpty(0, 10, [{ startTime: 8, endTime: 10, reason: 'silence' }]);
      expect(kept).toEqual([{ start: 0, end: 8 }]);
    });

    it('handles multiple non-overlapping empty ranges', () => {
      const kept = subtractEmpty(0, 20, [
        { startTime: 3, endTime: 5, reason: 'both' },
        { startTime: 10, endTime: 12, reason: 'both' },
      ]);
      expect(kept).toEqual([
        { start: 0, end: 3 },
        { start: 5, end: 10 },
        { start: 12, end: 20 },
      ]);
    });

    it('clamps empty ranges to clip bounds', () => {
      const kept = subtractEmpty(5, 15, [{ startTime: 0, endTime: 20, reason: 'both' }]);
      expect(kept).toEqual([]);
    });
  });

  describe('dropTooShort', () => {
    it('keeps ranges >= minSeconds', () => {
      const out = dropTooShort(
        [
          { start: 0, end: 5 },
          { start: 6, end: 6.2 },
        ],
        0.5,
      );
      expect(out).toEqual([{ start: 0, end: 5 }]);
    });

    it('uses 0.5s default', () => {
      const out = dropTooShort([
        { start: 0, end: 0.3 },
        { start: 0.5, end: 2 },
      ]);
      expect(out).toEqual([{ start: 0.5, end: 2 }]);
    });

    it('keeps empty list when all are too short', () => {
      const out = dropTooShort([
        { start: 0, end: 0.1 },
        { start: 0.2, end: 0.3 },
      ]);
      expect(out).toEqual([]);
    });
  });

  describe('DEFAULT_EMPTY_FILTER', () => {
    it('has expected thresholds', () => {
      expect(DEFAULT_EMPTY_FILTER.audioSilenceThreshold).toBe(0.05);
      expect(DEFAULT_EMPTY_FILTER.visualStaticThreshold).toBe(0.1);
      expect(DEFAULT_EMPTY_FILTER.windowSeconds).toBe(1.5);
    });
  });
});
