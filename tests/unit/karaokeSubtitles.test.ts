import { describe, it, expect } from 'vitest';
import {
  groupWordsIntoPhrases,
  generateKaraokeAssEvents,
  generateKaraokeAssDocument,
} from '../../src/pipeline/logic/karaokeSubtitles';
import { WordTiming } from '../../src/pipeline/logic/wordChunker';

describe('karaokeSubtitles', () => {
  const sampleWords: WordTiming[] = [
    { text: 'Saya', start: 0.2, end: 0.5 },
    { text: 'suka', start: 0.5, end: 0.8 },
    { text: 'makan', start: 0.8, end: 1.2 },
    { text: 'nasi', start: 1.3, end: 1.6 },
    { text: 'goreng.', start: 1.6, end: 2.1 },
  ];

  it('groups words into natural phrases breaking on punctuation or word limit', () => {
    const phrases = groupWordsIntoPhrases(sampleWords, 3);
    expect(phrases.length).toBeGreaterThanOrEqual(2);
    expect(phrases[0]!.words.map((w) => w.text)).toEqual(['Saya', 'suka', 'makan']);
    expect(phrases[0]!.start).toBe(0.2);
    expect(phrases[0]!.end).toBe(1.2);
  });

  it('generates sequential ASS events highlighting active word in yellow and others in white', () => {
    const phrases = groupWordsIntoPhrases(sampleWords.slice(0, 3), 5);
    const events = generateKaraokeAssEvents(phrases, '&H0000EEFF', '&H00FFFFFF');

    expect(events.length).toBe(3);
    // First word "Saya" active in yellow
    expect(events[0]).toContain('{\\c&H0000EEFF&}Saya{\\c&H00FFFFFF&}');
    expect(events[0]).toContain('suka makan');

    // Second word "suka" active in yellow
    expect(events[1]).toContain('{\\c&H0000EEFF&}suka{\\c&H00FFFFFF&}');

    // Third word "makan" active in yellow
    expect(events[2]).toContain('{\\c&H0000EEFF&}makan{\\c&H00FFFFFF&}');
  });

  it('generates a complete ASS document with white HookStyle and KaraokeStyle', () => {
    const doc = generateKaraokeAssDocument({
      width: 1080,
      height: 1920,
      hookText: 'Gak Naik Kelas Bisa Jadi Bos',
      hookDuration: 2.5,
      words: sampleWords,
    });

    expect(doc).toContain('Style: HookStyle');
    expect(doc).toContain('Style: KaraokeStyle');
    // HookStyle primary colour is white (&H00FFFFFF)
    expect(doc).toContain('&H00FFFFFF');
    // Hook event is included
    expect(doc).toContain('HookStyle');
    expect(doc).toContain('Gak Naik Kelas\\NBisa Jadi Bos');
    // Dialogue events contain active yellow color tag
    expect(doc).toContain('&H0000EEFF&');
  });
});
