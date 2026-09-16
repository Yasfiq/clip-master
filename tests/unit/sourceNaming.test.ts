import { describe, it, expect } from 'vitest';
import { parseLocalSourceFilename } from '../../src/pipeline/logic/sourceNaming';

describe('sourceNaming: parseLocalSourceFilename', () => {
  it('parses Video_From_[Channel]_[Title].mp4 correctly', () => {
    const meta = parseLocalSourceFilename(
      '/path/to/media/sources/Video_From_Raditya Dika_Podcast Bersama Cania.mp4',
    );
    expect(meta.isCustomPattern).toBe(true);
    expect(meta.sourceChannel).toBe('Raditya Dika');
    expect(meta.sourceTitle).toBe('Podcast Bersama Cania');
    expect(meta.attributionText).toBe('Sumber: Raditya Dika');
  });

  it('handles case-insensitivity: video_from_Curhat Bang_Ivan Tanjaya.mkv', () => {
    const meta = parseLocalSourceFilename('video_from_Curhat Bang_Ivan Tanjaya.mkv');
    expect(meta.isCustomPattern).toBe(true);
    expect(meta.sourceChannel).toBe('Curhat Bang');
    expect(meta.sourceTitle).toBe('Ivan Tanjaya');
    expect(meta.attributionText).toBe('Sumber: Curhat Bang');
  });

  it('falls back cleanly for regular filenames without pattern', () => {
    const meta = parseLocalSourceFilename('ivan_tanjaya_interview.mp4');
    expect(meta.isCustomPattern).toBe(false);
    expect(meta.sourceChannel).toBeUndefined();
    expect(meta.sourceTitle).toBe('Ivan Tanjaya Interview');
    expect(meta.attributionText).toBe('Sumber: Ivan Tanjaya Interview');
  });

  it('handles empty or blank input gracefully', () => {
    const meta = parseLocalSourceFilename('');
    expect(meta.isCustomPattern).toBe(false);
    expect(meta.sourceTitle).toBe('Untitled Video');
    expect(meta.attributionText).toBe('Sumber: Video');
  });
});
