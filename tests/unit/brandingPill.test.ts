import { describe, it, expect } from 'vitest';
import { generateSourcePillSvg, escapeXml } from '../../src/pipeline/logic/brandingPill';

describe('brandingPill', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml('Tom & Jerry <cartoon> "quotes" \'apostrophe\'')).toBe(
      'Tom &amp; Jerry &lt;cartoon&gt; &quot;quotes&quot; &apos;apostrophe&apos;',
    );
  });

  it('generates valid SVG with rounded rect and text', () => {
    const svg = generateSourcePillSvg({
      sourceText: 'Source: Raditya Dika',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
    expect(svg).toContain('rx="25"');
    expect(svg).toContain('fill-opacity="0.88"');
    expect(svg).toContain('Source: Raditya Dika');
    expect(svg).toContain('</svg>');
  });

  it('handles empty source text gracefully', () => {
    const svg = generateSourcePillSvg({
      sourceText: '',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });

  it('adapts width dynamically for long channel names', () => {
    const shortSvg = generateSourcePillSvg({ sourceText: 'A' });
    const longSvg = generateSourcePillSvg({
      sourceText: 'Source: Channel Nama Yang Sangat Panjang Sekali Sekali Sekali',
    });

    const shortWidthMatch = shortSvg.match(/width="(\d+)"/);
    const longWidthMatch = longSvg.match(/width="(\d+)"/);

    expect(shortWidthMatch).toBeTruthy();
    expect(longWidthMatch).toBeTruthy();
    const shortW = parseInt(shortWidthMatch![1], 10);
    const longW = parseInt(longWidthMatch![1], 10);

    expect(longW).toBeGreaterThan(shortW);
  });
});
