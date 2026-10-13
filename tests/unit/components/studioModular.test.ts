import { describe, it, expect } from 'vitest';
import { formatTimecode, DEFAULT_STUDIO_CONFIG } from '@/types/clipStudio';
import { SubtitleCue } from '@/pipeline/logic/srtParser';

describe('Studio types and helper functions', () => {
  it('correctly formats timecode into MM:SS.CC', () => {
    expect(formatTimecode(0)).toBe('00:00.00');
    expect(formatTimecode(65.25)).toBe('01:05.25');
    expect(formatTimecode(125.04)).toBe('02:05.04');
    expect(formatTimecode(-5)).toBe('00:00.00');
  });

  it('provides sensible default studio configurations', () => {
    expect(DEFAULT_STUDIO_CONFIG.hookPosition).toBe('center');
    expect(DEFAULT_STUDIO_CONFIG.subtitleStyleId).toBe('clipajaib');
    expect(DEFAULT_STUDIO_CONFIG.logoEnabled).toBe(true);
  });
});
